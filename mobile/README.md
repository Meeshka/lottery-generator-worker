# Lottery Generator Mobile App

Expo React Native mobile app for the lottery generator worker system. It uses the Cloudflare Worker as its API gateway.

## Features

- View Worker health status
- Login with Lotto OTP through Worker proxy routes
- **Role-based access control** - Admin users have access to additional features:
  - View user role (Admin/User) in Info tab
  - Update draws from Lotto API
  - Recalculate weights via Python Worker engine
  - Check missing batch results
  - Archive checked batches
  - Delete generated/archived batches
- **Generate tickets** - Generate lottery tickets via the Python Worker engine with configurable parameters:
  - Number of tickets (dropdown: 2, 4, 6, 8, 10, 12, 14)
  - Max common numbers with history
  - Optional random seed for reproducibility
  - Cluster target selection with dynamic descriptions fetched from current weights (e.g., S3-heavy, balanced, low+S3 mix, high-heavy patterns)
  - Generated batches are automatically saved to the database with open draw information
- **Update draws** - Fetch draws from Lotto Sheli API and import them to the Worker DB. Shows the count of new draws added and total draws in the database. (Admin only)
- **Recalculate weights** - Trigger weight recalculation via the Python Worker engine. Fetches draws from Lotto API, recalculates weights with clustering analysis, and imports both draws and weights to the Worker DB. (Admin only)
- **Batches tab** - View all batches with status filtering tabs (All, generated, submitted, confirmed, checked, archived, etc.). Each tab shows batches filtered by that status.
- **Apply to Lotto** - For batches with "generated" status, apply the batch to Lotto Sheli through a multi-step flow: calculate price, check duplicate combinations, process payment, and mark the batch as "submitted" on success.
- **Refresh Statuses** - Sync batch statuses with Lotto Sheli API. Fetches all active tickets, matches local batches with remote tickets, confirms submitted batches, and creates missing batches for tickets purchased outside the app.
- **Batch detail view** - Comprehensive batch information including:
  - Batch metadata (ID, key, status, created/checked dates)
  - Linked draw information with draw numbers and strong number
  - Summary metrics (ticket count, checked results, 3+ hits, total prize)
  - Results overview (winning tickets, prize winners, strong matches, best match count)
  - Winning tickets section with matched numbers highlighted in green
  - All results section showing match details for each ticket
  - All tickets section with draw number matching visualization (green = matched)
- Store Lotto access tokens and auth profile securely on device using Expo SecureStore
- Save ID number and phone number locally with AsyncStorage for convenience

## Setup

1. Install dependencies

   ```bash
   npm install
   ```

2. Configure environment variables in `.env`

   ```bash
   EXPO_PUBLIC_API_BASE=https://lottery-generator-worker.ushakov-ma.workers.dev
   ```

3. Start the development server

   ```bash
   npx expo start
   ```

You can then open the app in:

- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go)
- [development build](https://docs.expo.dev/develop/development-builds/introduction/)

## Project structure

```text
app/
|-- (tabs)/
|   |-- info.tsx       # Info/home screen
|   |-- login.tsx      # Lotto OTP login screen
|   |-- generate.tsx   # Generate tickets screen
|   |-- batches.tsx    # Batch list screen
|   |-- explore.tsx    # Placeholder screen
|   `-- _layout.tsx    # Tab layout configuration
|-- batch/
|   `-- [id].tsx       # Batch detail screen
|-- _layout.tsx        # Root layout
`-- modal.tsx          # Modal screen
components/
|-- ui/                # Reusable UI components
`-- external-link.tsx
services/
|-- api.ts             # Worker API client
`-- secureStorage.ts   # Token and credential storage
```

## API Integration

The app currently calls these Worker endpoints from `services/api.ts`:

- `GET /health`
- `GET /draws/latest`
- `GET /draws/open`
- `GET /weights/current` - Fetch current weights with clustering information for cluster descriptions
- `GET /batches` - List batches with optional status filter
- `GET /batches/{id}` - Get batch details with linked draw information
- `GET /batches/{id}/tickets` - Get batch tickets
- `GET /batches/{id}/results` - Get batch results with linked draw
- `GET /batches/{id}/summary` - Get batch summary statistics
- `POST /tickets/generate` - Generate tickets via Python Worker engine
- `POST /lotto/otp/generate` - Request OTP code from LottoSheli (proxied)
- `POST /lotto/otp/validate` - Validate OTP and get access tokens (proxied)
- `POST /admin/batches/create` - Create a new batch (requires ADMIN_KEY)
- `POST /admin/update-draws` - Update draws from Lotto API
- `POST /admin/recalculate-weights` - Recalculate weights via Python Worker
- `POST /admin/batches/apply-to-lotto` - Apply a generated batch to Lotto Sheli (requires ADMIN_KEY)
- `POST /admin/batches/refresh-statuses` - Sync batch statuses from Lotto API (requires ADMIN_KEY)

The app no longer calls LottoSheli directly from the client for OTP actions. All Lotto API interactions are proxied through the Worker.

## Security

- Lotto access and refresh tokens are stored with Expo SecureStore.
- User authentication profile (including role) is stored securely with AsyncStorage.
- Saved ID number and phone number are stored locally with AsyncStorage for convenience.
