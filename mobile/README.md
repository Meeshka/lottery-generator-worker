# Lotto Generator Mobile App

A React Native mobile application for generating and managing lottery tickets with smart weighted algorithms.

## Overview

Lotto Generator is a mobile app that allows users to:
- Generate lottery tickets using intelligent weighted algorithms
- Track ticket batches and their results
- View historical draw data
- Authenticate with LottoSheli via OTP
- Check prize results automatically

## Tech Stack

- **Framework**: Expo SDK 54
- **Language**: TypeScript
- **Navigation**: Expo Router (file-based routing)
- **UI**: React Native components with Expo modules
- **State Management**: React hooks (useState, useEffect, useContext)
- **Storage**: Expo Secure Store (auth tokens), AsyncStorage (preferences)
- **Networking**: Fetch API with TypeScript interfaces

## Project Structure

```
mobile/
├── app/                    # Expo Router screens
│   ├── (tabs)/            # Tab-based navigation
│   │   ├── _layout.tsx    # Tab layout
│   │   ├── index.tsx      # Home/generator
│   │   ├── batches.tsx    # Batch management
│   │   ├── admin.tsx      # Admin panel
│   │   └── info.tsx       # App info
│   ├── _layout.tsx        # Root layout
│   └── modal.tsx          # Modal screens
├── components/            # Reusable components
│   ├── TicketCard.tsx     # Ticket display
│   ├── BatchCard.tsx      # Batch display
│   └── ...
├── services/              # API client
│   └── api.ts             # API functions
├── hooks/                 # Custom hooks
│   ├── useAuth.ts         # Authentication hook
│   └── useBatches.ts      # Batches hook
├── constants/            # App constants
├── assets/               # Images, icons, fonts
└── app.json              # Expo configuration
```

## Features

### Core Features
- **Ticket Generation**: Generate lottery tickets with customizable parameters
  - Number of tickets (2-4-6-8-10-12-14)
  - Maximum common numbers (avoid too many duplicates)
  - Seed for reproducible results
  - Cluster targeting for number distribution

- **Batch Management**: 
  - Create and save ticket batches
  - Track batch status (pending, confirmed, submitted)
  - View batch details and results
  - Apply batches to LottoSheli (need LottoSheli registration with mobile)

- **Authentication**:
  - OTP-based login with LottoSheli
  - Secure token storage
  - Automatic token refresh

- **Admin Panel** (for admin users):
  - Recalculate number weights with configurable windows
  - Update draw data from LottoSheli
  - Manage batch quotas
  - Configure generation windows (weights window for frequency calculation, cluster window for clustering analysis)
  - Check missing results

### UI Features
- Tab-based navigation
- Dark mode support
- Responsive design
- Loading states and error handling
- Pull-to-refresh on lists

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)
- For iOS: Xcode (macOS only)
- For Android: Android Studio with SDK

### Installation

1. Navigate to the mobile directory:
```bash
cd mobile
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
```

Edit `.env` with your API URLs:
```bash
EXPO_PUBLIC_API_URL=https://lottery-generator-worker.ushakov-ma.workers.dev
EXPO_PUBLIC_PYTHON_ENGINE_BASE=https://lottery-generator-python-engine.ushakov-ma.workers.dev
```

### Development

Start the Expo development server:
```bash
npm start
```

This will open the Expo DevTools in your browser.

#### Running on Simulator/Emulator

- **iOS**: Press `i` in the terminal or use DevTools
- **Android**: Press `a` in the terminal or use DevTools

#### Running on Physical Device

1. Install Expo Go app on your device (iOS/Android)
2. Scan the QR code from Expo DevTools
3. The app will load in Expo Go

### Building for Production

Using EAS Build (recommended):

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Configure build
eas build:configure

# Build for Android
eas build --platform android

# Build for iOS (requires Apple Developer account)
eas build --platform ios
```

Using local build tools:

```bash
# Android
npm run android

# iOS (macOS only)
npm run ios
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `EXPO_PUBLIC_API_URL` | Base URL for API worker | (see app.json) |
| `EXPO_PUBLIC_PYTHON_ENGINE_BASE` | Base URL for Python engine | (see app.json) |

## API Integration

The app communicates with the API worker through the `services/api.ts` module. Key API functions:

- `healthCheck()` - Check API status
- `generateTickets(options)` - Generate lottery tickets
- `createBatch(options)` - Create a ticket batch
- `getBatches(limit)` - List batches
- `getBatchDetails(id)` - Get batch details
- `generateOtp(idNumber, phoneNumber)` - Generate authentication OTP
- `validateOtp(idNumber, phoneNumber, otpCode)` - Validate OTP and get tokens
- `recalculateWeightsWithWindows(accessToken, { weightsWindow, clusterWindow })` - Recalculate weights with custom windows
- `getGenerationWindows(accessToken)` - Get generation windows settings
- `setGenerationWindows(accessToken, { weightsWindow, clusterWindow })` - Set generation windows settings

See `services/api.ts` for complete API documentation.

## Authentication Flow

1. User enters ID number and phone number
2. App generates OTP via `generateOtp()`
3. User receives OTP via SMS
4. User enters OTP code
5. App validates OTP via `validateOtp()`
6. Tokens (access & refresh) are stored securely
7. User is logged in and can access protected features

## State Management

The app uses React hooks for state management:

- `useAuth` - Authentication state and methods
- `useBatches` - Batch data and operations
- Local component state with `useState`/`useReducer`

## Styling

The app uses React Native's built-in styling system with StyleSheet. Key styling patterns:

- Consistent color palette defined in constants
- Responsive layouts using Flexbox
- Platform-specific adjustments where needed
- Dark mode support via `useColorScheme`

## Deployment

### Google Play Store

1. Configure `app.json` with your package name and signing
2. Build APK or AAB using EAS Build
3. Upload to Google Play Console
4. Complete store listing and release

### Apple App Store

1. Configure `app.json` with your bundle identifier
2. Build IPA using EAS Build
3. Upload to App Store Connect
4. Complete app information and submit for review

## Troubleshooting

### Common Issues

**Metro bundler not starting**
```bash
npm start -- --clear
```

**Dependencies not linking**
```bash
npx expo install --fix
```

**iOS build fails**
- Ensure Xcode is installed and updated
- Run `pod install` in ios/ directory
- Clean build folder in Xcode

**Android build fails**
- Ensure Android SDK is installed
- Check JAVA_HOME environment variable
- Clean Gradle cache: `cd android && ./gradlew clean`

## Development Tips

- Use Expo DevTools for quick debugging
- Enable Fast Refresh for faster development
- Use React Native Debugger for network inspection
- Test on both iOS and Android for platform-specific issues
- Keep components small and focused
- Use TypeScript for type safety

## Contributing

1. Follow the existing code style
2. Write TypeScript for new components
3. Test on both iOS and Android
4. Update documentation as needed

## License

See main project LICENSE file.

## Support

For issues specific to the mobile app, please open an issue on GitHub.
