# lottery-generator-worker

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
- **Generate tickets** - Direct ticket generation via the Python Worker engine with configurable parameters (count, max common, seed, cluster target). Generated batches are automatically saved to the database with open draw information from `/draws/open`.
- batch listing
- batch detail, summary, and result views

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

Proxies ticket generation requests to the Python Worker engine.

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

#### `POST /`

Python Worker entry point for generating lottery tickets.

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

This endpoint is used by the `bridge.py sync` command to keep the Worker DB in sync with local `draw_history.jsonl`.

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
│   ├── generator/       # Generator domain logic
│   └── validation/      # Ticket validation and prize calculation
└── utils/                 # Utility functions
    ├── json.ts           # JSON body parsing
    ├── lottoApi.ts       # External Lotto API client
    ├── lottoAuth.ts      # Lotto authentication utilities
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
│   │   ├── generate.tsx # Generate tickets screen
│   │   ├── batches.tsx  # Batches list screen
│   │   └── explore.tsx  # Explore screen
│   ├── batch/           # Batch detail screens
│   │   └── [id].tsx     # Batch detail by ID
│   ├── _layout.tsx      # Root layout
│   └── modal.tsx        # Modal screen
├── components/           # Reusable components
│   └── ui/              # UI components
├── services/            # API services
│   ├── api.ts           # Worker API client
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
