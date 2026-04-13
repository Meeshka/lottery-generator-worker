# Lottery Generator Mobile App

Expo React Native mobile app for the lottery generator worker system. It uses the Cloudflare Worker as its API gateway.

## Features

- View Worker health status
- Login with Lotto OTP through Worker proxy routes
- View generated ticket batches
- View batch summaries and result details
- Store Lotto access tokens securely on device

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
|   |-- login.tsx      # Lotto OTP login screen
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
- `GET /batches`
- `GET /batches/{id}`
- `GET /batches/{id}/tickets`
- `GET /batches/{id}/results`
- `GET /batches/{id}/summary`
- `POST /lotto/otp/generate`
- `POST /lotto/otp/validate`

The app no longer calls LottoSheli directly from the client for OTP actions.

## Security

- Lotto access and refresh tokens are stored with Expo SecureStore.
- Saved ID number and phone number are stored locally with AsyncStorage for convenience.
