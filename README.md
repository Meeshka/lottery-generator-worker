# Lottery-generator-worker

Cloudflare Worker API for storing generated lottery ticket batches, exposing read endpoints for the latest draw and weights, and importing batch result checks into a D1 database. Includes a Python bridge CLI for syncing data, generating tickets, and checking results.

## What it does
- Stores generated ticket batches and their tickets.
- Exposes public read endpoints for health, stats, latest draw, open draw, latest weights, and batch data.
- Exposes admin-only endpoints for creating batches, importing checked results, and syncing with external Lotto API.
- Supports batch lifecycle: generated → checked → submitted → confirmed → archived.
- Syncs batch confirmation with external Lotto API to verify purchased tickets.

## Runtime

- Cloudflare Workers (TypeScript + Python Workers)
- Cloudflare D1
- TypeScript
- Python 3.12+ (for Python Worker engine and bridge CLI)
- Wrangler

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
  status TEXT, -- 'generated', 'checked', 'submitted', 'confirmed', 'archived'
  target_draw_id TEXT,
  target_pais_id INTEGER,
  target_draw_at TEXT,
  target_draw_snapshot_json TEXT,
  generator_version TEXT,
  weights_version_key TEXT,
  ticket_count INTEGER,
  created_at TEXT,
  checked_at TEXT,
  submitted_at TEXT,
  confirmed_at TEXT,
  external_ticket_id TEXT,
  last_sync_attempt_at TEXT,
  last_sync_error TEXT,
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

For the Python Worker engine, install dependencies:

```bash
cd py-engine
uv sync
```

Run locally:

```bash
npm run dev
```

Deploy:

```bash
npm run deploy
```

Deploy Python Worker:

```bash
cd py-engine
npx wrangler deploy
```

### Mobile app

The project includes an Expo React Native mobile app that connects to the Worker API.

Setup:

```bash
cd mobile
npm install
```

Configure the API base URL and admin key in `.env`:

```bash
EXPO_PUBLIC_API_BASE=https://lottery-generator-worker.ushakov-ma.workers.dev
EXPO_PUBLIC_ADMIN_KEY=your-admin-key-here
```

Run the app:

```bash
npx expo start
```

The mobile app uses the Worker as its API gateway. OTP generation and OTP validation are proxied through the Worker, so the app no longer calls LottoSheli directly from the client.

Current mobile functionality includes:

- health checks against the Worker
- Lotto OTP login through Worker proxy routes
- **Generate tickets** - Ticket generation via the main Worker proxy route (`/tickets/generate`) which forwards to the Python Worker engine. Configurable parameters include count (dropdown: 2, 4, 6, 8, 10, 12, 14), max common, seed, and cluster target. Cluster target selection includes dynamic descriptions fetched from current weights (e.g., S3-heavy, balanced, low+S3 mix, high-heavy patterns). Tickets are generated locally first, then saved to the database when the user clicks "Accept". On save, the app attempts to fetch open draw information from `/draws/open` and includes it with the batch.
- **Update draws** - Fetches draws from Lotto Sheli API and imports them to the Worker DB. Shows the count of new draws added and total draws in the database.
- **Recalculate weights** - Triggers weight recalculation via the Python Worker engine. Fetches draws from Lotto API, recalculates weights with clustering analysis, and imports both draws and weights to the Worker DB. This provides full weight recalculation functionality without requiring the bridge CLI.
- **Batches tab** - Displays batches with status filtering tabs (All, generated, submitted, confirmed, checked, archived, etc.). Each tab shows batches filtered by that status. Batches with "generated" status show an "Apply to Lotto" button on the right side of the card. Batches with "checked" status show an "Archive" button on the right side of the card. Batches with "generated" or "archived" status show a "Delete" button on the right side of the card.
- **Apply to Lotto** - For batches with "generated" status, allows applying the batch to Lotto Sheli. This triggers a multi-step flow: calculate price, check duplicate combinations, process payment, and mark the batch as "submitted" on success.
- **Archive** - For batches with "checked" status, allows archiving the batch. This calls the `/admin/batches/{id}/archive-checked` endpoint which validates the batch status is "checked" before changing it to "archived". The batch must be in "checked" status to be archived.
- **Delete** - For batches with "generated" or "archived" status, allows deleting the batch. This calls the `DELETE /admin/batches/{id}` endpoint which performs a soft delete by setting the `deleted_at` timestamp. Deleted batches are hidden from the UI by default but remain in the database.
- **Refresh Statuses** - Fetches all active tickets from Lotto Sheli API and syncs batch statuses. Matches local batches with remote tickets, confirms submitted batches, and creates missing batches for tickets purchased outside the app. Shows summary with remote tickets count, retargeted generated, matched existing, confirmed existing, created missing, and checked now. Also automatically checks results for confirmed batches linked to the latest draw.
- **Check Missing Results** - Scans all confirmed and archived batches to find those without calculated results and automatically calculates them using their linked draw data. Shows summary with scanned count, eligible count, checked now count, skipped counts (already has results, draw not available), and failed count. Useful for backfilling results for batches that were confirmed before result checking was automated.
- **Batch detail view** - Comprehensive batch information including:
  - Batch metadata (ID, key, status, created/checked dates)
  - Linked draw information with draw numbers and strong number
  - Summary metrics (ticket count, checked results, 3+ hits, total prize)
  - Results overview (winning tickets, prize winners, strong matches, best match count)
  - Winning tickets section with matched numbers highlighted in green
  - All results section showing match details for each ticket
  - All tickets section with draw number matching visualization (green = matched)

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
- Requires `--admin-key` or `WORKER_ADMIN_KEY` environment variable

**generate**:
- `--count`: Number of tickets to generate (default: 10)
- `--max-common`: Maximum common numbers with history (default: 3)
- `--seed`: Random seed for reproducibility
- `--weights-path`: Path to weights.json (default: weights.json)
- `--history-path`: Path to draw_history.jsonl (default: draw_history.jsonl)
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
  - `LotteryNumber` as `targetPaisId`
  - `nextLottoryDate` as `targetDrawAt`
  - the entire draw object as `targetDrawSnapshotJson`
  - `targetDrawId` is left null until confirmation from Lotto Sheli or result appearance
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

#### `POST /tickets/generate`

Proxies ticket generation requests to the Python Worker engine. Reads current weights from the database and confirmed tickets from confirmed batches, then passes them to the Python Worker for direct application.

Request body:

```json
{
  "count": 10,
  "maxCommon": 3,
  "seed": "optional-seed",
  "clusterTarget": 1
}
```

Response (success):

```json
{
  "ok": true,
  "tickets": [
    {
      "ticketIndex": 1,
      "numbers": [1, 5, 9, 12, 26, 37],
      "strong": 4
    }
  ],
  "count": 1
}
```

Response (error):

```json
{
  "ok": false,
  "error": "error message"
}
```

- `count`: Number of tickets to generate (default: 10, must be >= 1)
- `maxCommon`: Maximum allowed common numbers with history/current batch (default: 3)
- `seed`: Optional random seed for reproducibility
- `clusterTarget`: Optional target cluster ID (1-4) for distribution-based generation

This endpoint:
- Reads current weights from the database (`weights` table where `is_current = 1`)
- Reads confirmed tickets from confirmed batches (batches with status='confirmed' and not deleted)
- Normalizes and validates confirmed tickets (6 unique numbers in range 1-37)
- Sends both weights and history tickets to the Python Worker
- The Python Worker uses confirmed tickets as history for avoiding duplicates and respecting max_common limits
- The Python Worker enriches history with tickets generated in the current batch to ensure uniqueness within the batch

#### `POST /`

Python Worker entry point for generating lottery tickets. Accepts optional weights and history tickets from the main Worker.

Request body:

```json
{
  "count": 10,
  "maxCommon": 3,
  "seed": "optional-seed",
  "clusterTarget": 1,
  "weights": {
    "SEG_WEIGHTS": [0.25, 0.25, 0.25, 0.25],
    "ALPHA_OVERFLOW": 0.1,
    "BETA_ZERO_BY_SEGMENT": [0.1, 0.1, 0.1, 0.1],
    "clustering": {...}
  },
  "historyTickets": [[1, 5, 9, 12, 26, 37], [2, 6, 10, 15, 20, 35]]
}
```

Response (success):

```json
{
  "ok": true,
  "tickets": [
    {
      "ticketIndex": 1,
      "numbers": [1, 5, 9, 12, 26, 37],
      "strong": 4
    }
  ],
  "count": 1
}
```

Response (error):

```json
{
  "ok": false,
  "error": "error message"
}
```

- `count`: Number of tickets to generate (default: 10, must be >= 1)
- `maxCommon`: Maximum allowed common numbers with history/current batch (default: 3)
- `seed`: Optional random seed for reproducibility
- `clusterTarget`: Optional target cluster ID (1-4) for distribution-based generation
- `weights`: Optional weights object to apply directly (SEG_WEIGHTS, ALPHA_OVERFLOW, BETA_ZERO_BY_SEGMENT, clustering). If not provided, falls back to loading from weights.json
- `historyTickets`: Optional array of confirmed ticket arrays (each with 6 numbers) to use as history. If not provided, falls back to draw_history.jsonl. The generator enriches this history with tickets generated in the current batch to ensure uniqueness within the batch

#### `POST /recalculate-weights`

Recalculates weights using the Python engine's weight calculation logic. Used by the main Worker to trigger weight recalculation.

Request body:

```json
{
  "accessToken": "lotto-access-token"
}
```

Response (success):

```json
{
  "ok": true,
  "weights": {
    "segments": {...},
    "clustering": {...},
    "n_draws_used": 47
  }
}
```

Response (error):

```json
{
  "ok": false,
  "error": "error message"
}
```

This endpoint:
- Fetches draws from Lotto API using the provided access token
- Updates local draw history with new draws
- Recalculates weights using the Python engine's weight calculation logic
- Performs clustering analysis on the draw history
- Returns the recalculated weights with clustering data

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

#### `GET /draws/open`

Returns the next open lottery draw information from pais.co.il.

Response:

```json
{
  "ok": true,
  "draw": {
    "LotteryNumber": 3916,
    "nextLottoryDate": "2026-04-14T20:00:00",
    "displayDate": "...",
    "displayTime": "...",
    "firstPrize": 12345678,
    "secondPrize": 123456
  }
}
```

This endpoint is used for generating batches targeting the next upcoming draw:
- `LotteryNumber` maps to `targetPaisId`
- `nextLottoryDate` maps to `targetDrawAt`
- the entire `draw` object maps to `targetDrawSnapshotJson`
- `targetDrawId` should remain null until confirmation from Lotto Sheli or result appearance

#### `GET /weights/current`

Returns the latest row where `is_current = 1`. Used by the mobile app to fetch cluster descriptions for the generate tickets screen.

Response:

```json
{
  "ok": true,
  "weights": {
    "id": 2,
    "version_key": "2026-04-15T00:00:00.000Z",
    "weights_json": "{\"segments\":{...},\"clustering\":{...}}",
    "source_draw_count": 47,
    "is_current": 1,
    "created_at": "2026-04-15 00:00:00"
  }
}
```

#### `GET /batches/latest`

Returns the latest batch and all of its tickets. Includes linked draw information if available.

#### `GET /batches/{id}`

Returns one batch by numeric id. Includes linked draw information if available.

#### `GET /batches/{id}/tickets`

Returns one batch and all of its tickets. Includes linked draw information if available.

#### `GET /batches/{id}/results`

Returns one batch and all imported result rows for its tickets. Includes linked draw information if available.

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

#### `POST /lotto/otp/generate`

Public Worker proxy for requesting an OTP code from LottoSheli.

Request body:

```json
{
  "idNumber": "123456789",
  "phoneNumber": "0501234567"
}
```

Response:

```json
{
  "ok": true
}
```

#### `POST /lotto/otp/validate`

Public Worker proxy for validating an OTP code and returning Lotto access tokens.

Request body:

```json
{
  "idNumber": "123456789",
  "phoneNumber": "0501234567",
  "otpCode": "123456"
}
```

Response:

```json
{
  "ok": true,
  "accessToken": "token",
  "refreshToken": "token"
}
```

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

- `count`: Number of new draws that were inserted (does not count updates to existing draws)
- `draws`: Array of all upserted draw records

This endpoint is used by the `bridge.py sync` command to keep the Worker DB in sync with local `draw_history.jsonl`.

#### `POST /admin/import/weights`

Imports weight data into the Worker DB. This endpoint marks all existing weights as not current and inserts the new weights as current.

Request body:

```json
{
  "versionKey": "2026-04-15T00:00:00.000Z",
  "weightsJson": "{\"segments\":{...},\"clustering\":{...}}",
  "sourceDrawCount": 47
}
```

Response:

```json
{
  "ok": true,
  "weights": {
    "id": 2,
    "version_key": "2026-04-15T00:00:00.000Z",
    "weights_json": "...",
    "source_draw_count": 47,
    "is_current": 1,
    "created_at": "2026-04-15 00:00:00"
  }
}
```

This endpoint is used by the `bridge.py sync` command to keep the Worker DB weights in sync with local `weights.json`.

#### `POST /admin/update-draws`

Fetches draws from the Lotto Sheli API using an access token and imports them into the Worker DB. Used by the mobile app to update draw data.

Request body:

```json
{
  "accessToken": "lotto-access-token"
}
```

Response:

```json
{
  "ok": true,
  "importedCount": 5,
  "totalDraws": 47
}
```

- `importedCount`: Number of new draws that were inserted (does not count updates to existing draws)
- `totalDraws`: Total number of draws in the database after the import

This endpoint:
- Fetches draws from `https://api.lottosheli.com/api/v1/client/draws/DRAW_LOTTO` using the provided access token
- Transforms the API response to match the import format
- Calls `/admin/import/draws` internally to upsert the draws
- Returns the count of new draws and the total draw count in the database

#### `POST /admin/recalculate-weights`

Recalculates weights using the Python Worker and imports them to the Worker DB. Used by the mobile app to trigger weight recalculation without using the bridge CLI.

Request body:

```json
{
  "accessToken": "lotto-access-token"
}
```

Response:

```json
{
  "ok": true,
  "message": "Weights recalculated and imported successfully",
  "weights": {
    "segments": {...},
    "clustering": {...},
    "n_draws_used": 47
  },
  "importedDraws": 5,
  "totalDraws": 47
}
```

This endpoint:
- Proxies the request to the Python Worker's `/recalculate-weights` endpoint
- Python Worker fetches draws from Lotto API using the access token
- Python Worker recalculates weights with clustering analysis
- Imports the recalculated weights to the Worker DB via `/admin/import/weights`
- Imports draws from the weights data via `/admin/import/draws`
- Returns the recalculated weights, import counts, and total draw count

#### `POST /admin/batches/create`

Creates a batch and inserts its tickets.

Request body:

```json
{
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

The `batchKey` is automatically generated as a UUID on the server and returned in the response.

Validation rules:

- `batchKey` is not accepted from the client; always generated as UUID on server
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
- `status`: Filter by batch status ('generated', 'submitted', 'confirmed', 'checked', 'archived')

Returns a list of batches with linked draw information if available.

#### `GET /admin/batches/{id}/tickets`

Returns one batch and its tickets.

#### `POST /admin/batches/{id}/results/import`

Imports checked results for a batch and marks the batch as `checked`. Supports two modes: explicit result import and automatic calculation.

**Explicit import mode** - when `results` array is provided:

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

Response:

```json
{
  "ok": true,
  "batchId": 123,
  "drawDbId": 456,
  "inserted": 10,
  "mode": "imported"
}
```

**Auto-calculation mode** - when `results` array is empty or omitted:

Request body:

```json
{
  "prizeTable": "regular",
  "auto": true
}
```

Response:

```json
{
  "ok": true,
  "batchId": 123,
  "drawDbId": 456,
  "inserted": 10,
  "mode": "calculated"
}
```

In auto-calculation mode:
- Fetches the latest draw from the database (or uses `drawDbId` if provided)
- Parses ticket numbers from the batch
- Calculates match counts, matched numbers, strong matches, and prizes automatically
- For archived batches, only updates `checked_at` without changing status
- For other batches, updates both `checked_at` and status to 'checked'

Validation rules (explicit import):

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

#### `POST /admin/batches/{id}/archive-checked`

Archives a batch by setting its status to 'archived' and recording the archive timestamp. This endpoint validates that the batch status is 'checked' before archiving.

Response (success):

```json
{
  "ok": true,
  "batch": {
    "id": 123,
    "status": "archived",
    "archived_at": "2026-04-16T12:00:00Z",
    ...
  }
}
```

This endpoint:
- Validates that the batch exists
- Validates that the batch status is 'checked'
- Throws an error if the batch is not in 'checked' status
- Updates the batch status to 'archived' and records the archive timestamp
- Returns the updated batch object

#### `DELETE /admin/batches/{id}`

Soft deletes a batch by setting its `deleted_at` timestamp. Deleted batches are hidden from the UI by default but can be included in queries by setting `deleted=false` in the options.

Response (success):

```json
{
  "ok": true,
  "batchId": 123
}
```

This endpoint:
- Performs a soft delete by setting `deleted_at` to the current timestamp
- The batch remains in the database but is filtered out from default queries
- Deleted batches can still be retrieved by explicitly setting `deleted=false` in the `getBatches` options

#### `POST /admin/batches/{id}/mark-submitted`

Marks a batch as 'submitted' and records the submission timestamp.

#### `POST /admin/batches/{id}/sync-confirmation`

Syncs batch confirmation with the external Lotto API to verify purchased tickets.

Request body:

```json
{
  "token": "otp-token"
}
```

Response:

```json
{
  "ok": true,
  "success": true,
  "matched": true,
  "batch": {...},
  "externalTicketId": "ticket-id"
}
```

The endpoint:
- Fetches active tickets from the Lotto API using the provided OTP token
- Matches local batch tickets against external tickets by numbers and pais_id
- Updates the batch with the external ticket ID and marks it as 'confirmed' if matched
- Records sync attempts and errors for debugging

#### `POST /admin/batches/{id}/submit-and-sync`

Combines marking a batch as submitted and syncing confirmation in a single request.

Request body:

```json
{
  "token": "otp-token"
}
```

Response includes both the submission status and sync confirmation result.

#### `POST /admin/batches/apply-to-lotto`

Applies a generated batch to Lotto Sheli by executing a multi-step payment flow.

Request body:

```json
{
  "batchId": 123,
  "accessToken": "lotto-access-token"
}
```

Response (success):

```json
{
  "ok": true,
  "batchId": 123,
  "transactionId": 3955933,
  "totalPrice": 41.9,
  "status": "submitted"
}
```

This endpoint:
- Validates the batch exists and has status "generated"
- Fetches the batch with all its tickets
- **Step 1**: Calculates the price via Lotto Sheli API (`/api/v1/client/tickets/calculate`)
- **Step 2**: Checks for duplicate combinations via Lotto Sheli API (`/api/v1/client/user/tickets/check-duplicate-combination`)
- **Step 3**: Processes payment via Lotto Sheli API (`/api/v1/client/payments`)
- **Step 4**: Marks the batch as "submitted" on successful payment
- Returns the transaction ID and total price

The endpoint requires a valid Lotto Sheli access token and will fail if:
- The batch is not found or not in "generated" status
- The batch has no tickets
- Price calculation fails
- Duplicate combinations are detected
- Payment fails

#### `POST /admin/batches/refresh-statuses`

Fetches all active tickets from Lotto Sheli API and syncs batch statuses. Matches local batches with remote tickets, confirms submitted batches, and creates missing batches for tickets purchased outside the app.

Request body:

```json
{
  "accessToken": "lotto-access-token"
}
```

Response (success):

```json
{
  "ok": true,
  "success": true,
  "summary": {
    "remoteTickets": 15,
    "retargetedGenerated": 2,
    "matchedExisting": 5,
    "confirmedExisting": 3,
    "createdMissing": 10
  }
}
```

This endpoint:
- Fetches the current open draw information from pais.co.il
- Fetches all active tickets from Lotto Sheli API (paginated)
- **Retargets generated batches**: For batches with status "generated" that have a different target_pais_id than the current open draw, updates their target draw information to the current open draw
- Matches remote tickets with local batches by comparing ticket tables (only batches with "submitted" status are considered for matching)
- For matched local batches with "submitted" status:
  - Updates target draw information (targetDrawId, targetPaisId, targetDrawAt, targetDrawSnapshotJson)
  - Marks the batch as "confirmed" with the external ticket ID
- For remote tickets that don't match any local batch:
  - Creates a new batch with the ticket data
  - Marks the new batch as "submitted" and "confirmed"
- Returns a summary of the sync operation including:
  - `remoteTickets`: Total number of active tickets from Lotto Sheli
  - `retargetedGenerated`: Number of generated batches retargeted to the current open draw
  - `matchedExisting`: Number of local batches that matched remote tickets
  - `confirmedExisting`: Number of submitted batches that were confirmed
  - `createdMissing`: Number of new batches created for tickets purchased outside the app

The endpoint requires a valid Lotto Sheli access token and will fail if:
- The access token is invalid or expired
- The Lotto Sheli API is unreachable
- The pais.co.il API is unreachable

#### `POST /admin/batches/check-missing-results`

Scans all confirmed and archived batches to find those without calculated results and automatically calculates them using their linked draw data.

Request body:

```json
{}
```

Response (success):

```json
{
  "ok": true,
  "success": true,
  "summary": {
    "scanned": 25,
    "eligible": 8,
    "checkedNow": 5,
    "skippedWithResults": 12,
    "skippedNoDraw": 3,
    "failed": 0
  }
}
```

This endpoint:
- Scans all batches with status 'confirmed' or 'archived'
- Skips batches that already have results in the database
- Skips batches without a linked draw
- For eligible batches, calls `calculateAndImportBatchResults` with the linked draw ID
- For archived batches, only updates `checked_at` without changing status
- Returns a summary of the operation including:
  - `scanned`: Total number of batches scanned
  - `eligible`: Number of batches eligible for result checking
  - `checkedNow`: Number of batches successfully checked
  - `skippedWithResults`: Number of batches skipped (already have results)
  - `skippedNoDraw`: Number of batches skipped (no linked draw)
  - `failed`: Number of batches that failed during checking

## Project structure

```
src/
├── index.ts              # Main Worker entry point
├── config.ts              # Configuration constants
├── types.ts               # TypeScript type definitions
├── routes/                # HTTP route handlers
│   ├── admin.ts          # Admin-only endpoints
│   ├── auth.ts           # Authentication endpoints
│   ├── batches.ts        # Public batch endpoints
│   ├── health.ts         # Health check
│   └── stats.ts          # Statistics endpoints
├── services/              # Business logic layer
│   ├── batchService.ts   # Batch operations and sync
│   ├── resultService.ts  # Result checking/import
│   └── overviewService.ts # Overview statistics
├── repositories/          # Data access layer
│   ├── batchesRepo.ts    # Batch CRUD
│   ├── drawsRepo.ts      # Draw queries
│   ├── weightsRepo.ts    # Weight queries
│   ├── ticketsRepo.ts    # Ticket CRUD
│   └── resultsRepo.ts    # Result CRUD
├── domain/                # Domain logic
│   └── validation/      # Ticket validation and prize calculation
└── utils/                 # Utility functions
    ├── json.ts           # JSON body parsing
    ├── lottoApi.ts       # External Lotto API client
    ├── lottoAuth.ts      # Lotto authentication utilities
    ├── pais.ts           # Pais.co.il API client
    └── response.ts       # Response helpers

py-engine/                # Python Worker engine
├── pyproject.toml        # Python project configuration
├── wrangler.jsonc        # Cloudflare Workers configuration
├── data/                 # Data files
│   ├── draw_history.jsonl
│   └── weights.json
└── src/                  # Python source files
    ├── entry.py          # Python Worker entry point
    ├── draw_clustering.py
    ├── draw_history.py
    ├── generator_engine.py
    ├── lottery_generator.py
    ├── lotto_api.py
    ├── lotto_update.py
    ├── validate.py
    ├── validate_updated.py
    └── weights.py

mobile/                   # Expo React Native mobile app
├── app/                  # App screens and navigation
│   ├── (tabs)/          # Tab-based navigation
│   │   ├── info.tsx     # Info/home screen
│   │   ├── login.tsx    # Lotto OTP login screen
│   │   ├── generate.tsx # Generate tickets screen with cluster selection
│   │   ├── batches.tsx  # Batches list screen with status filtering
│   │   └── explore.tsx  # Explore screen
│   ├── batch/           # Batch detail screens
│   │   └── [id].tsx     # Batch detail with linked draw, results, and ticket matching
│   ├── batches/         # Status-filtered batch views
│   │   └── [status].tsx # Batches filtered by status
│   ├── _layout.tsx      # Root layout
│   └── modal.tsx        # Modal screen
├── components/           # Reusable components
│   └── ui/              # UI components
├── services/            # API services
│   ├── api.ts           # Worker API client with Lotto integration
│   └── secureStorage.ts # Secure storage utilities
├── constants/           # App constants
│   └── theme.ts         # Theme configuration
├── hooks/               # Custom React hooks
│   ├── use-color-scheme.ts
│   ├── use-color-scheme.web.ts
│   └── use-theme-color.ts
├── scripts/             # Build and utility scripts
│   └── reset-project.js
├── assets/              # Static assets
├── .env                 # Environment variables
└── package.json         # Node dependencies
```

## Notes

- The scheduled Worker handler is still a placeholder and does not run any jobs yet.
- Batch archiving is now exposed via the `/admin/batches/{id}/archive` endpoint.
- Result imports always attach to the latest draw in the database.
- Batches can be created without draw information (targetDrawId, targetPaisId, targetDrawAt, targetDrawSnapshotJson can be null). This is useful when generating tickets before a draw is closed.
- The main Worker proxies ticket generation requests to the Python Worker via the `/tickets/generate` endpoint. The Python Worker URL is configured via the `PYTHON_WORKER_URL` environment variable in `wrangler.jsonc`.
- The main Worker reads current weights from the database (`weights` table where `is_current = 1`) and confirmed tickets from confirmed batches, then passes them to the Python Worker in the request body. The Python Worker applies these weights directly instead of relying on local `weights.json`. This ensures that weights recalculated via `/admin/recalculate-weights` are immediately used for ticket generation.
- The Python Worker's `generator_engine.py` uses confirmed tickets from the database as history for avoiding duplicates and respecting max_common limits. If no confirmed tickets are provided, it falls back to loading draw history from JSONL format (`draw_history.jsonl`) using the `draw_history.load_history()` function, extracting the numbers field from each draw object.
- The generator enriches the history with tickets generated in the current batch to ensure uniqueness within the batch. This means each newly generated ticket is added to the history pool for subsequent ticket generation in the same batch.
- Batches now include linked draw information when available. The system attempts to resolve the linked draw through multiple strategies: by target_draw_id, by result draw_db_id, by target_pais_id, or by confirmed_pais_id. This enables batch detail views to show the actual draw numbers that tickets were matched against.
- The mobile app's batch detail view visualizes ticket matching by highlighting numbers that matched the linked draw in green. This provides immediate visual feedback on which numbers were winning numbers.
- The "Refresh Statuses" functionality creates missing batches for tickets purchased outside the app, ensuring the database stays synchronized with the Lotto Sheli account even when purchases are made through other channels.
