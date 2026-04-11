# lottery-generator-worker

Cloudflare Worker API for storing generated lottery ticket batches, exposing read endpoints for the latest draw and weights, and importing batch result checks into a D1 database. Includes a Python bridge CLI for syncing data, generating tickets, and checking results.

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
- Python 3.x (for bridge CLI)

## Required configuration

`wrangler.jsonc` currently binds one D1 database as `DB`.

You also need an `ADMIN_KEY` Worker secret for admin routes:

```bash
npx wrangler secret put ADMIN_KEY
```

For the Python bridge CLI, you can set environment variables:

```bash
export WORKER_BASE_URL="https://lottery-generator-worker.ushakov-ma.workers.dev"
export WORKER_ADMIN_KEY="your-admin-key"
```

Or pass them via command-line flags: `--base-url` and `--admin-key`.

## Expected database tables

This worker assumes these tables already exist:

### `draws`
```sql
CREATE TABLE draws (
  id INTEGER PRIMARY KEY,
  draw_id TEXT,
  draw_date TEXT,
  numbers_json TEXT,
  strong_number INTEGER,
  raw_json TEXT,
  pais_id INTEGER
);
```

### `weights`
```sql
CREATE TABLE weights (
  id INTEGER PRIMARY KEY,
  version_key TEXT,
  weights_json TEXT,
  source_draw_count INTEGER,
  is_current INTEGER,
  created_at TEXT
);
```

### `ticket_batches`
```sql
CREATE TABLE ticket_batches (
  id INTEGER PRIMARY KEY,
  batch_key TEXT,
  status TEXT, -- 'generated', 'checked', 'archived'
  target_draw_id TEXT,
  target_pais_id INTEGER,
  target_draw_at TEXT,
  target_draw_snapshot_json TEXT,
  generator_version TEXT,
  weights_version_key TEXT,
  ticket_count INTEGER,
  created_at TEXT,
  checked_at TEXT,
  archived_at TEXT,
  deleted_at TEXT
);
```

### `tickets`
```sql
CREATE TABLE tickets (
  id INTEGER PRIMARY KEY,
  batch_id INTEGER,
  ticket_index INTEGER,
  numbers_json TEXT,
  strong_number INTEGER,
  created_at TEXT
);
```

### `ticket_results`
```sql
CREATE TABLE ticket_results (
  id INTEGER PRIMARY KEY,
  ticket_id INTEGER,
  draw_id INTEGER,
  match_count INTEGER,
  matched_numbers_json TEXT,
  strong_match INTEGER,
  qualifies_3plus INTEGER,
  prize REAL,
  prize_table TEXT,
  checked_at TEXT
);
```

## Local development

Install TypeScript dependencies:

```bash
npm install
```

Install Python dependencies for the bridge CLI:

```bash
# The bridge uses only standard library modules (json, csv, urllib, uuid, etc.)
# No additional pip packages required
```

Run locally:

```bash
npm run dev
```

Deploy:

```bash
npm run deploy
```

## Python bridge CLI

`bridge.py` supports the following workflow commands:

```bash
python bridge.py sync
python bridge.py generate
python bridge.py generate --batch-key batch-2026-04-10
python bridge.py generate --cluster-target 1
python bridge.py check
python bridge.py check --batch-id 123
python bridge.py summary
python bridge.py summary --batch-id 123
python bridge.py full-cycle
python bridge.py full-cycle --batch-key batch-2026-04-10
```

### Command options

**sync**:
- `--auth-path`: Path to auth.json (default: auth.json)
- `--token-path`: Path to token.json (default: token.json)
- `--history-path`: Path to draw_history.jsonl (default: draw_history.jsonl)
- `--weights-path`: Path to weights.json (default: weights.json)

**generate**:
- `--count`: Number of tickets to generate (default: 10)
- `--max-common`: Maximum common numbers with history (default: 3)
- `--seed`: Random seed for reproducibility
- `--weights-path`: Path to weights.json (default: weights.json)
- `--history-path`: Path to tickets.csv history (default: tickets.csv)
- `--cluster-target`: Target cluster (1-4) for ticket distribution
- `--batch-key`: Custom batch key (auto-generated UUID if omitted)
- `--generator-version`: Generator version tag (default: python-v1)

**check**:
- `--batch-id`: Specific batch ID to check (defaults to latest generated)
- `--draw-history-path`: Path to draw_history.jsonl (default: draw_history.jsonl)
- `--prize-table`: Prize table identifier (default: regular)

**summary**:
- `--batch-id`: Specific batch ID (defaults to latest batch)

**full-cycle**:
- Combines generate + check + summary
- Accepts all generate and check options

### Notes

- `generate` generates tickets and immediately saves the batch in the Worker.
- `generate` automatically fetches the next open draw from pais.co.il and includes:
  - `LotteryNumber` as both `targetDrawId` and `targetPaisId`
  - `nextLottoryDate` as `targetDrawAt`
  - the entire draw object as `targetDrawSnapshotJson`
- `--cluster-target` targets a specific cluster centroid from weights.json for ticket distribution.
- if `--batch-key` is omitted, `generate` and `full-cycle` create a UUID batch key automatically.
- `sync` updates local `draw_history.jsonl` and `weights.json`, then imports draws into the Worker DB via `/admin/import/draws`.
- `sync` also backfills `paisId` values in existing history records when new data includes them.
- `check` validates the latest generated batch by default; `--batch-id` can be used to override the batch selection.
- `check` uses the latest draw currently stored in the Worker DB and matches it against the same draw inside local `draw_history.jsonl`.
- `summary` retrieves batch summary statistics from the Worker.
- `full-cycle` runs generate + check + summary in sequence.

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
- total batch count
- latest batch status
- latest batch id and target draw info

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

#### `POST /admin/import/draws`

Imports or updates draw data from the local bridge sync. This endpoint is idempotent - calling it multiple times with the same `draw_id` will replace the existing record.

Request body:

```json
{
  "draws": [
    {
      "drawId": "1234",
      "drawDate": "2026-04-10T20:00:00Z",
      "numbersJson": "[1, 5, 9, 12, 26, 37]",
      "strongNumber": 4,
      "rawJson": "{\"LotteryNumber\":1234,...}",
      "paisId": 1234
    }
  ]
}
```

Response:

```json
{
  "ok": true,
  "count": 1,
  "draws": [...]
}
```

This endpoint is used by the `bridge.py sync` command to keep the Worker DB in sync with local `draw_history.jsonl`.

#### `POST /admin/batches/create`

Creates a batch and inserts its tickets.

Request body:

```json
{
  "batchKey": "batch-2026-04-09",
  "targetDrawId": "1234",
  "targetPaisId": 1234,
  "targetDrawAt": "2026-04-10T20:00:00Z",
  "targetDrawSnapshotJson": "{\"LotteryNumber\":1234,\"nextLottoryDate\":\"2026-04-10T20:00:00Z\",...}",
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

Note: `targetPaisId` is a number, not a string.

Validation rules:

- `batchKey` is required
- `tickets` must not be empty
- each `ticketIndex` must be a positive integer
- each ticket must contain exactly 6 unique numbers in range `1..37`
- `strong`, when provided, must be in range `1..7`

#### `GET /admin/batches/latest`

Returns the latest batch and its tickets.

#### `GET /admin/batches/latest-generated`

Returns the latest generated batch (status='generated') and its tickets.

#### `GET /admin/batches`

Query parameters:
- `limit`: Maximum number of batches to return
- `status`: Filter by batch status ('generated', 'checked', 'archived')

Returns a list of batches matching the criteria.

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
- `prize` can be null or a number

#### `GET /admin/batches/{id}/results`

Returns imported result rows for a batch.

#### `POST /admin/batches/{id}/archive`

Archives a batch by setting its status to 'archived' and recording the archive timestamp.

## Project structure

```
src/
├── index.ts              # Main Worker entry point
├── config.ts              # Configuration constants
├── types.ts               # TypeScript type definitions
├── routes/                # HTTP route handlers
│   ├── admin.ts          # Admin-only endpoints
│   ├── batches.ts        # Public batch endpoints
│   ├── health.ts         # Health check
│   └── stats.ts          # Statistics endpoints
├── services/              # Business logic layer
│   ├── batchService.ts   # Batch operations
│   ├── resultService.ts  # Result checking/import
│   └── overviewService.ts # Overview statistics
├── repositories/          # Data access layer
│   ├── batchesRepo.ts    # Batch CRUD
│   ├── drawsRepo.ts      # Draw queries
│   ├── weightsRepo.ts    # Weight queries
│   ├── ticketsRepo.ts    # Ticket CRUD
│   └── resultsRepo.ts    # Result CRUD
└── utils/                 # Utility functions
    ├── json.ts           # JSON body parsing
    └── response.ts       # Response helpers
```

## Notes

- The scheduled Worker handler is still a placeholder and does not run any jobs yet.
- Batch archiving is now exposed via the `/admin/batches/{id}/archive` endpoint.
- Result imports always attach to the latest draw in the database.
