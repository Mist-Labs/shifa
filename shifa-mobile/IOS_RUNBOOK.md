# SHIFA iOS Runbook

This app now has a generated native iOS project without changing the existing Android build path.

## Current iOS Status

- Native iOS project exists at `shifa-mobile/ios`.
- CocoaPods dependencies are installed and locked in `ios/Podfile.lock`.
- Expo config includes `ios.bundleIdentifier`: `org.mistlabs.shifa`.
- Native iOS privacy strings are configured for microphone, camera, location, photo library, and Bluetooth.
- EAS profiles include iOS simulator, internal preview, and production targets.
- The React Native clinical engine is shared with Android:
  - Android uses the verified E2B GGUF model through `llama.rn` as the stable offline field runtime.
  - The E2B LiteRT-LM artifact remains available for the accelerated Android path while runtime-template hardening continues.
  - iOS uses the E2B GGUF model through `llama.rn` as its local offline runtime.
  - Gemini and deterministic protocol fallback remain the final safety fallbacks.
- The offline model pack is downloaded after user approval. Do not bundle the multi-GB model inside the IPA.
- First-run setup on iOS downloads the E2B GGUF runtime from R2, the Whisper base STT model for offline voice input, and the compact Guard firearm detector artifact.

## Prerequisites

- macOS with Xcode installed.
- The iOS platform/runtime must be installed in Xcode Settings > Components.
- Apple Developer account for physical-device or TestFlight builds.
- EAS account logged in with `npx eas login`.
- Environment values in `shifa-mobile/.env`, especially:
  - `EXPO_PUBLIC_SHIFA_API_URL` must be HTTPS for real iOS devices.
  - `EXPO_PUBLIC_SHIFA_MODEL_BASE_URL` must point to the R2 public model bucket.
  - `EXPO_PUBLIC_GOOGLE_API_KEY` or `EXPO_PUBLIC_GEMINI_API_KEY` is optional but needed for cloud fallback.

## Local Simulator Smoke Test

Use this only to validate UI, storage flow, Gemini fallback, and protocol fallback. The iOS simulator is not a reliable proof for large local model performance.

```bash
cd shifa-mobile
npx tsc --noEmit
npx pod-install ios
npx expo start --dev-client --host lan
```

If Expo CLI cannot resolve the Simulator app after the native project is generated, use Xcode's build tools directly:

```bash
cd shifa-mobile
xcodebuild \
  -workspace ios/SHIFA.xcworkspace \
  -scheme SHIFA \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  CODE_SIGNING_ALLOWED=NO \
  build

APP_PATH=$(find ~/Library/Developer/Xcode/DerivedData -path '*Debug-iphonesimulator/SHIFA.app' -maxdepth 8 -type d | tail -1)
xcrun simctl install booted "$APP_PATH"
xcrun simctl launch booted org.mistlabs.shifa
```

If the dev client says "No development servers found" or shows a red screen for `127.0.0.1:8081`, keep Metro running in LAN mode and open the dev URL manually:

```bash
xcrun simctl openurl booted 'exp+shifa-health://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081'
```

Verified on this machine after installing the iOS 26.1 platform: generic iOS device compile succeeded, iOS simulator compile succeeded, `org.mistlabs.shifa` launched on the booted simulator, Metro bundled successfully in LAN mode, and the app initialized the local database.

## EAS Simulator Build

```bash
cd shifa-mobile
npx eas build -p ios --profile development
```

This creates a development-client simulator build.

## EAS Internal Device Build

```bash
cd shifa-mobile
npx eas build -p ios --profile preview
```

Use this for real iPhone testing before TestFlight. EAS will ask for Apple credentials and provisioning setup.

For a local Xcode build, open:

```bash
open ios/SHIFA.xcworkspace
```

Select the `SHIFA` scheme, sign with your Apple team, and run on an attached iPhone.

## Production/TestFlight Build

```bash
cd shifa-mobile
npx eas build -p ios --profile production
```

After the build succeeds, submit through EAS or upload from Apple Transporter.

## Physical Device Validation Checklist

- First launch asks for offline model setup.
- Offline model download shows progress for the GGUF model, Whisper base STT pack, and Guard firearm detector artifact.
- App has enough free storage before model download.
- Airplane-mode clinical analysis works after the GGUF model is downloaded.
- Recorded patient speech is converted to symptom text with the offline Whisper base model before local analysis.
- Cloud fallback works when online and no local model is present.
- TTS speaks the result in the selected CHW language, prefers installed regional/local voices when available, falls back to the system default, and stops cleanly.
- Camera, video, file upload, microphone, and location permissions show clear iOS prompts.
- Cases save locally and reopen from the Cases screen.
- Sync works against the deployed HTTPS backend.
- Guard alert camera/video/Bluetooth paths do not crash when permissions are denied.
- Guard firearm detector artifact is present after setup; native iOS TFLite image inference remains a separate bridge task.

## Known iOS Risks

- The E2B GGUF artifact is approximately 3.2 GB, plus the Whisper base STT model at approximately 142 MB and the Guard firearm detector at approximately 5.4 MB. iOS testing must confirm download reliability, storage pressure, memory pressure, heat, and inference latency.
- LiteRT iOS execution is not enabled yet. The exported `.litertlm` artifact is available for Android acceleration work and for a future iOS LiteRT bridge, but iOS should use GGUF until that native module exists.
- Guard detector TFLite execution is Android-only in this build. iOS downloads the detector artifact for parity, but native iOS image inference still needs its own bridge.
- Local iOS compile requires Xcode's iOS platform/runtime. If `xcodebuild` reports `iOS 26.1 is not installed`, install the platform from Xcode > Settings > Components, then rerun `npx expo run:ios`.
- iOS production sync requires HTTPS. Plain `http://10.0.2.2:3000` is emulator-only and should not be used in distributed builds.
- The app is clinical decision support, not a certified medical device.
