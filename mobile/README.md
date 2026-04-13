# Lottery Generator Mobile App

Expo React Native mobile app for the lottery generator worker system. Provides a frontend interface to interact with the Cloudflare Worker API.

## Features

- View health status and system statistics
- Browse lottery draw history
- View generated ticket batches
- Check batch results and prizes
- Secure token storage for admin operations

## Setup

1. Install dependencies

   ```bash
   npm install
   ```

2. Configure environment variables in `.env`:

   ```bash
   EXPO_PUBLIC_API_BASE=https://lottery-generator-worker.ushakov-ma.workers.dev
   ```

3. Start the development server

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go)
- [development build](https://docs.expo.dev/develop/development-builds/introduction/)

## Project structure

```
app/
├── (tabs)/          # Tab-based navigation
│   ├── index.tsx    # Home/overview screen
│   ├── explore.tsx  # Explore/batches screen
│   └── _layout.tsx  # Tab layout configuration
├── batch/
│   └── [id].tsx     # Batch detail screen
├── _layout.tsx      # Root layout
└── modal.tsx        # Modal screen
components/
├── ui/              # Reusable UI components
└── external-link.tsx
services/
├── api.ts           # Worker API client
└── secureStorage.ts # Encrypted storage for tokens
```

## API Integration

The app connects to the Cloudflare Worker API endpoints defined in `services/api.ts`:

- `GET /health` - System health check
- `GET /stats/overview` - System statistics
- `GET /draws/latest` - Latest draw information
- `GET /batches/latest` - Latest batch with tickets
- `GET /batches/{id}` - Specific batch details
- `GET /batches/{id}/tickets` - Batch tickets
- `GET /batches/{id}/results` - Batch results
- `GET /batches/{id}/summary` - Batch summary statistics

## Security

Admin tokens are stored securely using Expo SecureStore. The app uses encrypted storage for sensitive credentials required for admin operations.
