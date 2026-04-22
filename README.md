# Lottery Generator Worker

A smart lottery ticket generation system built with Cloudflare Workers and Python, featuring weighted number generation based on historical draw data.

## Overview

This project consists of three main components:

- **API Worker (TypeScript)**: Cloudflare Worker handling HTTP requests, authentication, batch management, and database operations
- **Python Engine**: Workers-py service for intelligent lottery number generation using weighted algorithms
- **Mobile App**: Expo/React Native application for users to generate and manage lottery tickets

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Mobile App    │────▶│  API Worker     │────▶│  Python Engine  │
│  (Expo/React)   │     │  (TypeScript)   │     │   (NumPy)       │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────┐
                        │ Cloudflare  │
                        │  D1 Database│
                        └─────────────┘
```

## Features

- **Weighted Number Generation**: Uses historical draw data to calculate optimal number weights
- **Dual Window Configuration**: Separate configurable windows for weight calculation (default: 300 draws) and clustering (default: 150 draws)
- **Smart Draw Matching**: CSV import matches draws by `paisId` first, then falls back to `drawId`
- **Enhanced Data Normalization**: Robust parsing of draw data with multiple fallback sources for numbers, strong number, dates, and IDs
- **Optimized Clustering**: Vectorized silhouette score calculation using NumPy broadcasting for improved CPU performance
- **Smart Cluster Recommendations**: Focuses on most common distribution patterns rather than rare ones for more reliable generation
- **Batch Management**: Create, track, and manage ticket batches
- **Authentication**: OTP-based authentication integration with LottoSheli
- **Admin Panel**: Administrative features for weight recalculation, draw updates, and generation window management
- **Result Checking**: Automatic prize checking against draw results
- **Mobile-First**: Native mobile app with intuitive UI

## Tech Stack

### API Worker
- **Runtime**: Cloudflare Workers
- **Language**: TypeScript
- **Database**: Cloudflare D1 (SQLite)
- **Deployment**: Wrangler CLI

### Python Engine
- **Runtime**: Workers-py (Python on Cloudflare Workers)
- **Language**: Python 3.12+
- **Dependencies**: NumPy for numerical computations

### Mobile App
- **Framework**: Expo SDK 54
- **Language**: TypeScript
- **Navigation**: Expo Router
- **State Management**: React hooks
- **Storage**: Expo Secure Store, AsyncStorage

## Project Structure

```
lottery-generator-worker/
├── src/                    # API Worker source
│   ├── routes/            # Route handlers
│   ├── repositories/      # Database repositories
│   └── utils/             # Utility functions
├── py-engine/             # Python Engine
│   └── src/               # Python source
├── mobile/                # Mobile app
│   ├── app/               # Expo Router screens
│   ├── components/        # React components
│   ├── services/          # API client
│   └── hooks/             # Custom hooks
├── migrations/            # D1 database migrations
└── wrangler.jsonc         # Cloudflare Workers config
```

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.12+
- Wrangler CLI (`npm install -g wrangler`)
- Expo CLI (for mobile development)

### API Worker Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd lottery-generator-worker
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables in `wrangler.jsonc`:
```json
{
  "vars": {
    "ADMIN_KEY": "your-admin-key"
  }
}
```

4. Create D1 database:
```bash
wrangler d1 create lottery-db
```

5. Run migrations:
```bash
wrangler d1 execute lottery-db --file=./migrations/init.sql
```

6. Start development server:
```bash
npm run dev
```

### Python Engine Setup

1. Navigate to Python engine:
```bash
cd py-engine
```

2. Install dependencies with uv:
```bash
uv sync
```

3. Deploy Python worker:
```bash
wrangler deploy
```

### Mobile App Setup

1. Navigate to mobile directory:
```bash
cd mobile
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables in `.env`:
```bash
EXPO_PUBLIC_API_URL=https://your-worker-url.workers.dev
EXPO_PUBLIC_PYTHON_ENGINE_BASE=https://your-python-engine-url.workers.dev
```

4. Start development server:
```bash
npm start
```

5. Run on device/simulator:
```bash
npm run android  # or npm run ios
```

## API Endpoints

### Public Endpoints

- `GET /health` - Health check
- `GET /draws/latest` - Get latest lottery draw
- `GET /draws/all` - Get all historical draws
- `GET /draws/open` - Get current open draw
- `GET /weights/current` - Get current number weights
- `POST /tickets/generate` - Generate lottery tickets

### Authentication

- `POST /lotto/otp/generate` - Generate OTP
- `POST /lotto/otp/validate` - Validate OTP and get tokens
- `GET /auth/me` - Get current user info

### Admin Endpoints (Requires Admin Key)

- `POST /admin/update-draws` - Update draws from LottoSheli API
- `POST /admin/recalculate-weights` - Recalculate number weights with enhanced data normalization
  - Body: `{ "draws": [...], "weightsWindow": 300, "clusterWindow": 150 }`
  - Supports optional `weightsWindow` (default: 300) and `clusterWindow` (default: 150) parameters
  - Normalizes draw data from multiple sources (raw_json, numbers_json, numbers fields)
  - Returns optimized weights with cluster analysis focusing on most common patterns
- `POST /admin/import/weights` - Import weight data
- `POST /admin/import/draws` - Import draw data (matches by `paisId` first, then `drawId` as fallback)
- `GET /admin/settings/daily-batch-quota` - Get daily batch quota setting
- `POST /admin/settings/daily-batch-quota` - Set daily batch quota setting
- `GET /admin/settings/generation-windows` - Get generation windows settings
- `POST /admin/settings/generation-windows` - Set generation windows settings

### Batch Management

- `GET /batches` - List batches
- `GET /batches/:id` - Get batch details
- `GET /batches/:id/tickets` - Get batch tickets
- `POST /batches/create` - Create new batch
- `POST /batches/:id/apply-to-lotto` - Apply batch to LottoSheli
- `POST /batches/refresh-statuses` - Refresh batch statuses

## Deployment

### Deploy API Worker

```bash
npm run deploy
```

### Deploy Python Engine

```bash
cd py-engine
wrangler deploy
```

### Deploy Mobile App

Using EAS Build:

```bash
cd mobile
eas build --platform android
eas build --platform ios
```

## Database Schema

The project uses Cloudflare D1 with the following main tables:

- `draws` - Historical lottery draw results
- `weights` - Number weight calculations
- `ticket_batches` - Ticket batch management
- `tickets` - Individual ticket records
- `users` - User authentication data

## Development

### Running Locally

1. Start API Worker:
```bash
npm run dev
```

2. Start Python Engine (in separate terminal):
```bash
cd py-engine
wrangler dev --local
```

3. Start Mobile App:
```bash
cd mobile
npm start
```

### Testing

Run API tests:
```bash
npm test
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

[Your License Here]

## Support

For issues and questions, please open an issue on GitHub.
