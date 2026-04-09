# lottery-generator-worker

Cloudflare Worker API for storing generated lottery ticket batches, exposing read endpoints for the latest draw and weights, and importing batch result checks into a D1 database.

## What it does

- Stores generated ticket batches and their tickets.
- Exposes public read endpoints for health, stats, latest draw, latest weights, and batch data.
- Exposes admin-only endpoints for creating batches and importing checked results.
- Marks a batch as `checked` after results are imported.

## Runtime

- Cloudflare Workers
- Cloudflare D1
- TypeScript
- Wrangler

## Required configuration

`wrangler.jsonc` currently binds one D1 database as `DB`.

You also need an `ADMIN_KEY` Worker secret for admin routes:

```bash
npx wrangler secret put ADMIN_KEY
```

## Expected database tables

This worker assumes these tables already exist:

- `draws`
- `weights`
- `ticket_batches`
- `tickets`
- `ticket_results`

The code reads and writes fields such as `draw_id`, `draw_date`, `weights_json`, `batch_key`, `status`, `ticket_count`, `numbers_json`, `strong_number`, `match_count`, `matched_numbers_json`, `qualifies_3plus`, `prize`, and `prize_table`.

## Local development

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Deploy:

```bash
npm run deploy
```

## API

All responses are JSON. Common error responses:

- `400` for invalid request bodies
- `401` for missing or invalid `x-admin-key`
- `404` for unknown routes or missing batch resources

### Public endpoints

#### `GET /health`

Basic liveness response.

#### `GET /stats/overview`

Returns:

- total draw count
- latest draw id/date
- whether a current weights row exists
- current weights version metadata

#### `GET /draws/latest`

Returns the latest row from `draws`, ordered by `draw_date DESC, draw_id DESC`.

#### `GET /weights/current`

Returns the latest row where `is_current = 1`.

#### `GET /batches/latest`

Returns the latest batch and all of its tickets.

#### `GET /batches/{id}`

Returns one batch by numeric id.

#### `GET /batches/{id}/tickets`

Returns one batch and all of its tickets.

#### `GET /batches/{id}/results`

Returns one batch and all imported result rows for its tickets.

#### `GET /batches/latest/summary`

Returns an aggregate summary for the latest batch:

- batch status
- ticket count
- checked result count
- number of tickets with `3+` matches
- total prize
- latest linked draw db id

#### `GET /batches/{id}/summary`

Returns the same aggregate summary for a specific batch.

### Admin endpoints

Admin routes require header:

```http
x-admin-key: <ADMIN_KEY>
```

#### `POST /admin/batches/create`

Creates a batch and inserts its tickets.

Request body:

```json
{
  "batchKey": "batch-2026-04-09",
  "targetDrawId": "1234",
  "generatorVersion": "v1",
  "weightsVersionKey": "weights-2026-04-08",
  "tickets": [
    {
      "ticketIndex": 1,
      "numbers": [1, 5, 9, 12, 26, 37],
      "strong": 4
    }
  ]
}
```

Validation rules:

- `batchKey` is required
- `tickets` must not be empty
- each `ticketIndex` must be a positive integer
- each ticket must contain exactly 6 unique numbers in range `1..37`
- `strong`, when provided, must be in range `1..7`

#### `GET /admin/batches/latest`

Returns the latest batch and its tickets.

#### `GET /admin/batches/{id}/tickets`

Returns one batch and its tickets.

#### `POST /admin/batches/{id}/results/import`

Imports checked results for a batch and marks the batch as `checked`.

Request body:

```json
{
  "drawId": "1234",
  "prizeTable": "2026-week-14",
  "results": [
    {
      "ticketIndex": 1,
      "matchCount": 3,
      "matchedNumbers": [5, 9, 26],
      "strongMatch": false,
      "qualifies3Plus": true,
      "prize": 12.5
    }
  ]
}
```

Validation rules:

- `results` must not be empty
- each `ticketIndex` must exist in the target batch
- `matchCount` must be in range `0..6`
- `matchedNumbers` must be unique integers in range `1..37`
- `qualifies3Plus` must exactly match `matchCount >= 3`
- if `drawId` is sent, it must match the latest draw stored in `draws`

#### `GET /admin/batches/{id}/results`

Returns imported result rows for a batch.

## Notes

- The scheduled Worker handler is still a placeholder and does not run any jobs yet.
- Batch archiving exists in repository/service code, but no HTTP route exposes it right now.
- Result imports always attach to the latest draw in the database.
