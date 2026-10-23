# NovaCart Mobile

The NovaCart customer app, built with [Expo](https://expo.dev) (SDK 54), Expo Router and NativeWind.

```bash
npm install
cp .env.example .env     # Clerk + Stripe keys, EXPO_PUBLIC_API_URL
npx expo start           # scan the QR code with Expo Go, or press `a` for an Android emulator
```

On a physical device, set `EXPO_PUBLIC_API_URL` to your PC's LAN IP (for example `http://192.168.1.10:3000/api`) or to the deployed backend.

## Build an APK

```bash
eas login
eas build --platform android --profile preview
```

Full steps, including the EAS environment variables, are in the [root README](../README.md#3-android-apk-eas-build).

By Mohit Yadav ([@mohityadav55199](https://github.com/mohityadav55199)).
