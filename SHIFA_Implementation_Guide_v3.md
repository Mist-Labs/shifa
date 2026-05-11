# SHIFA — Full Implementation Guide v3.0
**Gemma 4 Good Hackathon | Deadline: May 18, 2026**
**Source of truth. No placeholders. No emulator shortcuts. Production only.**

> Cross-referenced against Product Doc v2.0. UI/CSS removed. All tools verified against prize track requirements. Hausa added throughout. Every feature ships or the submission is incomplete.

---

## Critical Runtime Requirement — Read Before Anything Else

**Expo Go cannot run SHIFA.** Expo Go is a sandboxed JS runtime. It cannot load native Kotlin modules, bundle `.tflite`/`.bin` model files, run llama.cpp binaries, use BLE advertising, run continuous background audio, or load Coqui TTS (native C++). 

**You need a physical Android device running a custom EAS-built APK for every feature in this guide.** The realistic E4B target is a recent high-end Android device with 8GB+ RAM and enough free storage for a 3-4GB LiteRT-LM bundle. Mid-range 4-6GB devices should use the E2B/small-model path or server fallback. Low-end `$50` Android phones are not an honest E4B target until distillation/INT4/router optimizations are validated. Emulators cannot load Gemma 4 reliably — the model exceeds emulator RAM limits. All testing is on-device.

The workflow is: write code → `eas build --profile development` → install APK via `adb install` → test on device. Hot reload via Metro works after the APK is installed.

---

## 2026 On-Device Optimization Note — Gemma 4 LiteRT-LM + MTP

Do not overclaim `$50 phone` E4B support. The official `litert-community/gemma-4-E4B-it-litert-lm` bundle is deployment-ready for Android/iOS/Desktop/IoT/Web, but the model card reports a 3.66GB file size: 2.24GB decoder weights plus 0.67GB embedding parameters, with memory-mapped components reducing working memory on supported platforms.

Official LiteRT-LM Android benchmarks on a current flagship-class Samsung S26 Ultra report:

| Backend | Decode | Time to first token | Model size | CPU memory |
|---|---:|---:|---:|---:|
| CPU | 17.7 tok/s | 5.3s | 3654MB | 3283MB |
| GPU | 22.1 tok/s | 0.8s | 3654MB | 710MB |

The same model card reports Android speculative decoding support on CPU and GPU. With speculative decoding enabled, S26 Ultra GPU decode improves from a baseline ~21.9 tok/s to ~36.7-49.4 tok/s depending on task type; CPU improves from ~17.0 tok/s to ~21.1-29.5 tok/s. Google also announced Gemma 4 Multi-Token Prediction (MTP) drafters with up to 3x speedups without output-quality degradation, task dependent.

**Implementation impact:**

- Prefer `litert-community/gemma-4-E4B-it-litert-lm` as the base mobile runtime bundle instead of hand-rolling raw conversion first.
- Enable LiteRT-LM speculative decoding / MTP where available.
- Keep E4B for high-end Android, multimodal, and complex cases.
- Add an E2B/small-model route for mid-range devices and simple single-symptom text cases.
- Keep deterministic protocol rules and backend/server inference as fallbacks for low-end devices.
- Optimize later with INT8/INT4 quantization, distillation, pruning, shorter prompts, and router-based model selection.

Primary references:

- `litert-community/gemma-4-E4B-it-litert-lm` model card and benchmarks.
- Google AI Blog, May 5 2026: Gemma 4 Multi-Token Prediction drafters for speculative decoding.

---

## Current Clinical ML Status — May 2026

The Unsloth fine-tuning milestone is complete for the clinical adapter. SHIFA has a trained Gemma 4 E4B LoRA adapter on the 2,000-case synthetic humanitarian clinical dataset, with artifacts uploaded to Cloudflare R2 under `models/shifa-gemma4-e4b-finetuned/`.

Latest held-out validation result on `data/test_cases/imci_test_60.jsonl`:

| Metric | Result | Target | Status |
|---|---:|---:|---|
| Decision accuracy, Gemma + guardrails | 96.7% | >88% | Passed |
| Urgent referral recall, Gemma + guardrails | 100.0% | >95% | Passed |
| Urgent miss rate | 0.0% | 0% goal | Passed |
| Drug dose accuracy | 100.0% | >95% | Passed |
| Protocol adherence | 100.0% | >90% | Passed |
| Schema completeness | 98.3% | high | Passed |
| Raw model decision accuracy | 73.3% | tracked | Guardrails required |
| Raw urgent recall | 79.1% | tracked | Guardrails required |
| Danger sign extraction | 88.3% | >92% | Next fix |
| Over-referral rate | 11.8% | lower is better | Improved |
| Guardrail overrides | 49 / 60 | tracked | Safety layer active |

**Clinical safety architecture:** SHIFA is not a pure LLM decision system. The validated path is Gemma 4 E4B inference followed by deterministic WHO/IMCI guardrails for high-risk findings such as MUAC under 11.5cm, bilateral edema, neonatal danger signs, sexual violence, maternal danger signs, meningitis signs, severe chest indrawing, altered consciousness, and inability to drink. This guardrail layer is the reason the final validation has 100% urgent referral recall and zero urgent misses.

Training and validation histories are preserved through `reports/training_manifest.json`, `reports/validation_metrics.json`, and `reports/upload_manifest.json`, all uploaded to Cloudflare R2 when the remote environment has R2 credentials.

**Still not complete:** LiteRT mobile export, native Android runtime integration, physical-device airplane-mode validation, full voice pipeline, and SHIFA Guard weapon detection remain next-phase work. Do not claim the full implementation guide is complete until those items are tested on a physical Android APK.

---

## Table of Contents

1. [Repository Structure](#1-repository-structure)
2. [Phase 0 — Environment & Toolchain Setup](#2-phase-0--environment--toolchain-setup)
3. [Phase 1 — Expo Bare Workflow & EAS Build](#3-phase-1--expo-bare-workflow--eas-build)
4. [Phase 2 — Gemma 4 LiteRT Integration (LiteRT Prize)](#4-phase-2--gemma-4-litert-integration-litert-prize)
5. [Phase 3 — Unsloth Fine-Tuning Pipeline (Unsloth Prize)](#5-phase-3--unsloth-fine-tuning-pipeline-unsloth-prize)
6. [Phase 4 — Model Router E2B/E4B (Cactus Prize)](#6-phase-4--model-router-e2be4b-cactus-prize)
7. [Phase 5 — Voice Pipeline: STT + TTS (6 Languages)](#7-phase-5--voice-pipeline-stt--tts-6-languages)
8. [Phase 6 — Clinical Decision Engine](#8-phase-6--clinical-decision-engine)
9. [Phase 7 — Country Protocol Modules](#9-phase-7--country-protocol-modules)
10. [Phase 8 — Photo Analysis (Multimodal)](#10-phase-8--photo-analysis-multimodal)
11. [Phase 9 — SHIFA Guard: Threat Detection](#11-phase-9--shifa-guard-threat-detection)
12. [Phase 10 — Africa's Talking SMS Alerts (2G)](#12-phase-10--africas-talking-sms-alerts-2g)
13. [Phase 11 — Bluetooth Mesh Relay](#13-phase-11--bluetooth-mesh-relay)
14. [Phase 12 — Offline SQLite Storage](#14-phase-12--offline-sqlite-storage)
15. [Phase 13 — Sync Engine](#15-phase-13--sync-engine)
16. [Phase 14 — Referral Card Generator](#16-phase-14--referral-card-generator)
17. [Phase 15 — FastAPI Backend](#17-phase-15--fastapi-backend)
18. [Phase 16 — Outbreak Detection (DBSCAN)](#18-phase-16--outbreak-detection-dbscan)
19. [Phase 17 — Coordinator Dashboard (Next.js)](#19-phase-17--coordinator-dashboard-nextjs)
20. [Phase 18 — EAS Build & Deployment](#20-phase-18--eas-build--deployment)
21. [Phase 19 — Demo Preparation](#21-phase-19--demo-preparation)
22. [Tools Master Reference](#22-tools-master-reference)
23. [Day-by-Day Build Schedule](#23-day-by-day-build-schedule)
24. [Feature & Prize Track Checklist](#24-feature--prize-track-checklist)

---

## 1. Repository Structure

```
shifa-health/
├── apps/
│   ├── mobile/                          # React Native (Expo bare workflow)
│   │   ├── android/                     # Native Android — auto-generated + custom
│   │   │   └── app/src/main/java/com/shifa/
│   │   │       ├── MediaPipeLLMModule.kt        # LiteRT LLM inference (LiteRT Prize)
│   │   │       ├── MediaPipeLLMPackage.kt
│   │   │       ├── GuardModule.kt               # YOLO-NAS threat detection
│   │   │       ├── AudioGuardModule.kt          # YAMNet audio classification
│   │   │       ├── CoquiTTSModule.kt            # Coqui TTS bridge (6 languages)
│   │   │       └── MainApplication.kt
│   │   ├── src/
│   │   │   ├── engine/
│   │   │   │   ├── litertEngine.ts              # Primary LiteRT bridge
│   │   │   │   ├── llamaEngine.ts               # llama.rn fallback only
│   │   │   │   ├── modelRouter.ts               # E2B/E4B routing (Cactus Prize)
│   │   │   │   ├── promptBuilder.ts             # Gemma chat format + system prompt
│   │   │   │   ├── decisionParser.ts            # Zod validation + danger sign override
│   │   │   │   └── photoAnalysis.ts             # Image prep for multimodal
│   │   │   ├── protocols/
│   │   │   │   ├── index.ts
│   │   │   │   └── [loaded from /protocols JSON files]
│   │   │   ├── guard/
│   │   │   │   ├── threatConfirmation.ts        # Visual + audio correlation
│   │   │   │   ├── smsAlert.ts                  # Africa's Talking dispatch
│   │   │   │   ├── directSMSFallback.ts         # 2G direct AT API call
│   │   │   │   └── bluetoothMesh.ts             # BLE relay
│   │   │   ├── voice/
│   │   │   │   ├── stt.ts                       # Whisper online/offline routing
│   │   │   │   └── tts.ts                       # Coqui TTS 6 languages
│   │   │   ├── db/
│   │   │   │   ├── schema.ts                    # Drizzle schema
│   │   │   │   └── index.ts                     # DB init
│   │   │   ├── sync/
│   │   │   │   └── syncEngine.ts
│   │   │   └── utils/
│   │   │       ├── modelManager.ts              # Download + verify model files
│   │   │       └── gps.ts
│   │   ├── assets/models/                       # Downloaded model files (gitignored)
│   │   ├── app.json
│   │   ├── eas.json
│   │   └── package.json
│   │
│   └── dashboard/                       # Next.js coordinator dashboard
│       ├── app/
│       ├── components/
│       └── package.json
│
├── services/
│   └── api/                             # FastAPI backend
│       ├── main.py
│       ├── routers/
│       │   ├── sync.py
│       │   ├── outbreaks.py
│       │   ├── guard.py
│       │   └── facilities.py
│       ├── models/
│       ├── detection/
│       │   └── outbreak.py              # DBSCAN clustering
│       └── requirements.txt
│
├── ml/                                  # GPU machine only (Colab/Vast.ai)
│   ├── finetune/
│   │   ├── prepare_data.py
│   │   ├── finetune_unsloth.py
│   │   ├── validate.py
│   │   └── convert_litert.py
│   ├── data/
│   │   ├── raw/
│   │   ├── processed/
│   │   └── test_cases/
│   └── requirements.txt
│
├── protocols/
│   ├── sudan.json
│   ├── drc.json
│   ├── somalia.json
│   └── nigeria_north.json               # Hausa / Northern Nigeria
│
├── scripts/
│   ├── seed_demo_data.py
│   └── test_sms.py
│
└── README.md
```

---

## 2. Phase 0 — Environment & Toolchain Setup

### Three Machines, Three Contexts

| Context | What runs here |
|---|---|
| Local machine | React Native, Expo, EAS builds, backend dev |
| Physical Android device | All on-device testing — NO emulators |
| GPU machine (Colab Pro / Vast.ai A100) | Unsloth fine-tuning only |

### Required Tools

| Tool | Version | Purpose | Install |
|---|---|---|---|
| Node.js | 20 LTS | React Native runtime | `nvm install 20 && nvm use 20` |
| pnpm | 9+ | Package manager | `npm i -g pnpm` |
| EAS CLI | Latest | Cloud builds | `npm i -g eas-cli` |
| Android Studio | Hedgehog+ | SDK tools, `adb`, Gradle | Download from developer.android.com |
| Android SDK | API 29+ (Android 10) | Minimum target for MediaPipe | Via Android Studio SDK Manager |
| Android NDK | r25c | Required for llama.rn native build | Via Android Studio SDK Manager |
| Python | 3.11 | ML pipeline + backend | `pyenv install 3.11` |
| uv | Latest | Fast Python package manager | `pip install uv` |
| adb | Latest | Device install + debug | Included with Android Studio |
| Git | Latest | Version control | Pre-installed |

### Environment Setup

```bash
# 1. Node environment
nvm install 20 && nvm use 20
npm install -g pnpm eas-cli

# 2. EAS login — required for cloud builds
eas login
# Create account at expo.dev if needed

# 3. Android SDK environment variables — add to ~/.bashrc or ~/.zshrc
export ANDROID_HOME=$HOME/Android/Sdk
export ANDROID_NDK_HOME=$ANDROID_HOME/ndk/25.2.9519653
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/tools
export PATH=$PATH:$ANDROID_HOME/platform-tools

source ~/.bashrc

# 4. Verify adb sees your physical device
adb devices
# Required output: one device with status "device" (not "unauthorized")

# 5. Python environment for ML pipeline (GPU machine only)
cd ml/
uv venv && source .venv/bin/activate
uv pip install -r requirements.txt

# 6. Python environment for backend
cd services/api/
uv venv && source .venv/bin/activate
uv pip install -r requirements.txt
```

### Physical Device Setup (Required — No Emulator)

Every feature requires a physical Android device. This is not optional.

```bash
# On Android phone:
# Settings → About Phone → tap "Build Number" 7 times (enables Developer Options)
# Settings → Developer Options → USB Debugging: ON
# Settings → Developer Options → Install via USB: ON
# Settings → Developer Options → Disable adb authorization timeout: ON

# On machine:
adb devices
# Must show your device with status "device"
# If "unauthorized": check phone for RSA key prompt and tap "Allow"

# Verify device specs
adb shell getprop ro.build.version.sdk    # Must be 29+ (Android 10)
adb shell cat /proc/meminfo | grep MemTotal  # Must be 4GB+ (4000000 kB+)
adb shell df /sdcard | tail -1              # Must have 6GB+ free
```

### Why No Emulator

Android emulators use x86_64 or arm64 virtual CPU. MediaPipe `tasks-genai` (LiteRT) requires ARM NEON SIMD instructions available only on physical ARM hardware. Gemma 4 E4B requires 4GB RAM — emulators typically cap at 2GB before OOM. YAMNet continuous audio classification and YOLO-NAS real-time inference both require physical camera/microphone hardware.

---

## 3. Phase 1 — Expo Bare Workflow & EAS Build

### What This Phase Delivers

A custom dev APK that includes all native modules. This APK replaces Expo Go on your device and is the only runtime that can load LiteRT, Coqui TTS, YOLO-NAS, YAMNet, and react-native-ble-plx.

### Tools Required

| Tool | Purpose |
|---|---|
| `expo-dev-client` | Enables native modules in Expo |
| `eas-cli` | Builds custom dev APK in EAS cloud |
| `expo prebuild` | Generates `android/` native folder |
| Android Studio | Local Gradle verification |

### Setup

```bash
# 1. Initialize Expo project
cd apps/mobile/
npx create-expo-app shifa --template blank-typescript
cd shifa

# 2. Install core dependencies
pnpm install expo-dev-client expo-sqlite expo-location \
  expo-camera expo-file-system expo-image-manipulator \
  expo-sharing expo-haptics expo-secure-store \
  expo-background-fetch expo-task-manager

# 3. Install llama.rn (fallback path — needed before LiteRT APK is built)
pnpm install llama.rn

# 4. Install remaining native modules
pnpm install react-native-ble-plx \
  @react-native-community/netinfo \
  @react-native-async-storage/async-storage \
  react-native-view-shot \
  drizzle-orm \
  zod

# 5. Eject to bare workflow — generates android/ folder
npx expo prebuild --platform android
# This creates android/ with android/app/build.gradle and MainApplication.kt

# 6. Verify Gradle builds locally before EAS
cd android/
./gradlew assembleDebug
# Must complete without errors

cd ..
```

### Gradle Configuration

```gradle
// android/app/build.gradle

android {
    compileSdkVersion 34
    defaultConfig {
        applicationId "com.mistlabs.shifa"
        minSdkVersion 26          // MediaPipe LLM Inference requires API 26+
        targetSdkVersion 34
        versionCode 1
        versionName "1.0.0"
    }
    // Required for Coqui TTS native .so files
    packagingOptions {
        pickFirst '**/libc++_shared.so'
        pickFirst '**/libfbjni.so'
    }
}

dependencies {
    // LiteRT — Primary inference runtime (LiteRT Prize)
    implementation 'com.google.mediapipe:tasks-genai:0.10.20'
    implementation 'com.google.mediapipe:tasks-core:0.10.20'

    // TFLite for YOLO-NAS visual detection (SHIFA Guard)
    implementation 'org.tensorflow:tensorflow-lite:2.14.0'
    implementation 'org.tensorflow:tensorflow-lite-support:0.4.4'

    // YAMNet audio classification (SHIFA Guard)
    implementation 'org.tensorflow:tensorflow-lite-task-audio:0.4.4'
}
```

```gradle
// android/build.gradle
allprojects {
    repositories {
        google()          // Required for MediaPipe
        mavenCentral()
    }
}
```

### eas.json

```json
{
  "cli": {
    "version": ">= 10.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": {
        "buildType": "apk",
        "gradleCommand": ":app:assembleDebug"
      },
      "env": {
        "APP_ENV": "development"
      }
    },
    "production": {
      "android": {
        "buildType": "apk"
      },
      "env": {
        "APP_ENV": "production"
      }
    }
  }
}
```

### Build & Install

```bash
# Submit build to EAS cloud servers (~15 min on free tier)
eas build --platform android --profile development

# Download APK from EAS dashboard or CLI
eas build:download --platform android

# Install on physical device
adb install shifa-dev.apk

# Start Metro bundler (hot reload now works)
npx expo start --dev-client
```

---

## 4. Phase 2 — Gemma 4 LiteRT Integration (LiteRT Prize)

### Architecture: Two-Layer Approach

**Layer A (Development + Fallback):** `llama.rn` with GGUF model. Used to unblock development before the LiteRT APK is built. Not submitted as primary runtime.

**Layer B (Primary + Prize):** Custom Kotlin module using `com.google.mediapipe:tasks-genai`. This is what qualifies for the LiteRT Prize. It must be the active runtime in the submission demo.

**The submission must document that Layer B is the primary runtime.** Both layers can exist in the codebase — document which is active and why.

### Tools Required

| Tool | Purpose |
|---|---|
| `com.google.mediapipe:tasks-genai:0.10.20` | LiteRT LLM inference — prize runtime |
| `llama.rn` | GGUF fallback for development |
| `expo-file-system` | Model storage in app documents dir |
| Cloudflare R2 | Host model files for first-launch download |
| HuggingFace CLI | Download base model files |

### Model Files Required

| Model | Format | Size | Use |
|---|---|---|---|
| `shifa-gemma4-e4b-finetuned.bin` | LiteRT | ~2.2GB | Primary clinical inference |
| `shifa-gemma4-e2b.bin` | LiteRT | ~1.1GB | Fast path (Cactus router) |
| `gemma-4-e4b-q4.gguf` | GGUF | ~2.6GB | llama.rn fallback only |

### Layer B — MediaPipe LiteRT Kotlin Module

```kotlin
// android/app/src/main/java/com/shifa/MediaPipeLLMModule.kt
package com.shifa

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import com.google.mediapipe.tasks.genai.llminference.LlmInference.LlmInferenceOptions
import kotlinx.coroutines.*

class MediaPipeLLMModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var llmInference: LlmInference? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    override fun getName() = "MediaPipeLLM"

    @ReactMethod
    fun initModel(modelPath: String, promise: Promise) {
        scope.launch {
            try {
                val options = LlmInferenceOptions.builder()
                    .setModelPath(modelPath)
                    .setMaxTokens(1024)
                    .setMaxTopK(40)
                    .setTemperature(0.1f)
                    .build()
                llmInference = LlmInference.createFromOptions(reactApplicationContext, options)
                promise.resolve("ok")
            } catch (e: Exception) {
                promise.reject("INIT_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun generateStreaming(prompt: String, callbackId: String, promise: Promise) {
        val inference = llmInference
            ?: return promise.reject("NOT_INIT", "Call initModel first")

        scope.launch {
            try {
                inference.generateResponseAsync(prompt) { partial, done ->
                    val map = Arguments.createMap().apply {
                        putString("token", partial)
                        putBoolean("done", done)
                        putString("callbackId", callbackId)
                    }
                    reactApplicationContext
                        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                        .emit("LLMToken", map)
                }
                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject("INFERENCE_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun releaseModel(promise: Promise) {
        llmInference?.close()
        llmInference = null
        promise.resolve("released")
    }

    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}
}
```

```kotlin
// android/app/src/main/java/com/shifa/MediaPipeLLMPackage.kt
package com.shifa

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager

class MediaPipeLLMPackage : ReactPackage {
    override fun createNativeModules(ctx: ReactApplicationContext) =
        listOf(MediaPipeLLMModule(ctx))
    override fun createViewManagers(ctx: ReactApplicationContext) =
        emptyList<ViewManager<*, *>>()
}
```

```kotlin
// android/app/src/main/java/com/shifa/MainApplication.kt
// Inside getPackages(), add all packages:
add(MediaPipeLLMPackage())
add(GuardPackage())
add(AudioGuardPackage())
add(CoquiTTSPackage())
```

### TypeScript Bridge — LiteRT Engine

```typescript
// src/engine/litertEngine.ts
import { NativeModules, NativeEventEmitter } from 'react-native';

const { MediaPipeLLM } = NativeModules;
const emitter = new NativeEventEmitter(MediaPipeLLM);

export const LiteRTEngine = {
  async init(modelPath: string): Promise<void> {
    await MediaPipeLLM.initModel(modelPath);
  },

  stream(
    prompt: string,
    onToken: (t: string) => void,
    onDone: () => void
  ): () => void {
    const callbackId = `cb_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const sub = emitter.addListener('LLMToken', (e) => {
      if (e.callbackId !== callbackId) return;
      if (e.done) { sub.remove(); onDone(); }
      else onToken(e.token);
    });
    MediaPipeLLM.generateStreaming(prompt, callbackId).catch(console.error);
    return () => sub.remove();
  },

  async release(): Promise<void> {
    await MediaPipeLLM.releaseModel();
  },
};
```

### Layer A — llama.rn Fallback

```typescript
// src/engine/llamaEngine.ts
import { initLlama, LlamaContext } from 'llama.rn';
import * as FileSystem from 'expo-file-system';

const MODEL_DIR = `${FileSystem.documentDirectory}models/`;
let ctx: LlamaContext | null = null;

export async function initLlamaModel(onProgress: (pct: number) => void) {
  const modelPath = `${MODEL_DIR}gemma-4-e4b-q4.gguf`;
  const info = await FileSystem.getInfoAsync(modelPath);

  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(MODEL_DIR, { intermediates: true });
    const dl = FileSystem.createDownloadResumable(
      'https://shifa-models.r2.dev/gemma-4-e4b-q4.gguf',
      modelPath,
      {},
      ({ totalBytesWritten, totalBytesExpectedToWrite }) =>
        onProgress(Math.round((totalBytesWritten / totalBytesExpectedToWrite) * 100))
    );
    await dl.downloadAsync();
  }

  ctx = await initLlama({
    model: modelPath,
    use_mlock: true,
    n_ctx: 4096,
    n_threads: 4,
    n_gpu_layers: 0,
  });
}

export async function runLlamaInference(
  systemPrompt: string,
  userPrompt: string,
  onToken: (t: string) => void
): Promise<string> {
  if (!ctx) throw new Error('llama model not initialized');

  const prompt =
    `<start_of_turn>system\n${systemPrompt}<end_of_turn>\n` +
    `<start_of_turn>user\n${userPrompt}<end_of_turn>\n` +
    `<start_of_turn>model\n`;

  const result = await ctx.completion(
    { prompt, temperature: 0.1, top_k: 40, top_p: 0.95,
      stop: ['<end_of_turn>'], n_predict: 1024 },
    (data) => onToken(data.token)
  );
  return result.text;
}
```

### Model Download Manager

```typescript
// src/utils/modelManager.ts
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MODEL_DIR = `${FileSystem.documentDirectory}models/`;

// All models hosted on Cloudflare R2 (free 10GB tier)
const MODELS = {
  e4b: {
    filename: 'shifa-gemma4-e4b-finetuned.bin',
    url: 'https://shifa-models.r2.dev/shifa-gemma4-e4b-finetuned.bin',
    size_mb: 2200,
  },
  e2b: {
    filename: 'shifa-gemma4-e2b.bin',
    url: 'https://shifa-models.r2.dev/shifa-gemma4-e2b.bin',
    size_mb: 1100,
  },
  yolo: {
    filename: 'yolo-nas-nano-threat.tflite',
    url: 'https://shifa-models.r2.dev/yolo-nas-nano-threat.tflite',
    size_mb: 12,
  },
  yamnet: {
    filename: 'yamnet.tflite',
    url: 'https://tfhub.dev/google/lite-model/yamnet/classification/tflite/1',
    size_mb: 3,
  },
};

export async function getModelPath(key: keyof typeof MODELS): Promise<string> {
  await FileSystem.makeDirectoryAsync(MODEL_DIR, { intermediates: true });
  return `${MODEL_DIR}${MODELS[key].filename}`;
}

export async function isModelDownloaded(key: keyof typeof MODELS): Promise<boolean> {
  const path = await getModelPath(key);
  const info = await FileSystem.getInfoAsync(path);
  return info.exists;
}

export async function downloadModel(
  key: keyof typeof MODELS,
  onProgress: (pct: number) => void
): Promise<string> {
  const model = MODELS[key];
  const localPath = await getModelPath(key);

  const dl = FileSystem.createDownloadResumable(
    model.url,
    localPath,
    {},
    ({ totalBytesWritten, totalBytesExpectedToWrite }) =>
      onProgress(Math.round((totalBytesWritten / totalBytesExpectedToWrite) * 100))
  );

  await dl.downloadAsync();
  await AsyncStorage.setItem(`model_${key}_ready`, 'true');
  return localPath;
}
```

---

## 5. Phase 3 — Unsloth Fine-Tuning Pipeline (Unsloth Prize)

> **Runs on:** Kaggle Tesla T4 x2 was validated for this repo. A100-class machines are still acceptable. NOT your local Mac.
> **Observed time:** 1h 42m 54s for the repaired 3-epoch training run on Kaggle T4 x2.
> **Current result:** adapter trained, auto-uploaded to R2, and validated with the guardrail scoring path.

### Tools Required

| Tool | Purpose | Install |
|---|---|---|
| `unsloth` | QLoRA fine-tuning — Unsloth Prize | `pip install unsloth` |
| `transformers` | HuggingFace model loading | `pip install transformers` |
| `datasets` | Training data loading | `pip install datasets` |
| `trl` | SFTTrainer | `pip install trl` |
| `pdfplumber` | Extract text from protocol PDFs | `pip install pdfplumber` |
| `ai-edge-torch` | Convert fine-tuned model to LiteRT | `pip install ai-edge-torch` |
| `accelerate` | Training acceleration | `pip install accelerate` |

### ml/requirements.txt

```txt
unsloth==2024.11.7
transformers==4.44.0
datasets==2.21.0
trl==0.10.1
pdfplumber==0.11.4
ai-edge-torch==0.3.0
torch==2.4.0
accelerate==0.34.2
bitsandbytes==0.44.1
xformers==0.0.27.post2
```

### Step 1 — Prepare Training Data

Training sources are all publicly available WHO, Sphere, and MSF documents.

```python
# ml/finetune/prepare_data.py
import pdfplumber
import json
from pathlib import Path

SOURCES = {
    'who_imci': 'data/raw/who_imci_chart_booklet_2025.pdf',
    'sphere': 'data/raw/sphere_handbook_2018_health.pdf',
    'msf': 'data/raw/msf_clinical_guidelines_10th.pdf',
    'who_malaria_drc': 'data/raw/drc_malaria_protocol.pdf',
    'who_cholera': 'data/raw/who_cholera_case_management.pdf',
    'nigeria_north': 'data/raw/nigeria_north_chw_protocol.pdf',
}

def extract_pdf_text(path: str) -> str:
    text = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            t = page.extract_text()
            if t:
                text.append(t)
    return '\n'.join(text)

def generate_training_pair(symptom: str, decision: dict, language: str = 'en') -> dict:
    system = (
        "You are SHIFA, a clinical decision support assistant for community "
        "health workers. Follow WHO IMCI protocols exactly. Respond in JSON."
    )
    return {
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": symptom},
            {"role": "assistant", "content": json.dumps(decision)}
        ]
    }

with open('data/processed/synthetic_cases_2000.jsonl') as f:
    cases = [json.loads(l) for l in f]

with open('data/processed/training_final.jsonl', 'w') as out:
    for case in cases:
        pair = generate_training_pair(
            case['symptom_text'],
            case['expected_decision'],
            case.get('language', 'en')
        )
        out.write(json.dumps(pair) + '\n')

print(f"Training pairs: {len(cases)}")
```

### Step 2 — Generate Synthetic Clinical Cases

2,000 cases across 4 countries, 7 conditions each, 6 languages (including Hausa).

```python
# ml/finetune/generate_synthetic.py
# Condition templates for all 4 country modules
TEMPLATES = {
    'sudan_sam': {
        'symptom_template': "Child, {sex}, {age} months, weight {weight}kg. MUAC {muac}cm. Bilateral edema: {edema}. Not eating for {days} days.",
        'condition': 'SAM', 'country': 'Sudan',
    },
    'drc_malaria': {
        'symptom_template': "Child, {sex}, {age} months. Fever {days} days. RDT: {rdt}. {danger_sign}.",
        'condition': 'Malaria', 'country': 'DRC',
    },
    'somalia_awl': {
        'symptom_template': "Patient, {sex}, {age} months. Diarrhea {days} days. Stool frequency: {freq}/day. {dehydration_sign}.",
        'condition': 'AWD', 'country': 'Somalia',
    },
    'nigeria_meningitis': {
        'symptom_template': "Patient, {sex}, {age} years. Fever, neck stiffness {days} days. Photophobia: {photo}. {danger_sign}.",
        'condition': 'Meningitis', 'country': 'Nigeria',
    },
    # Full 28 templates (4 countries × 7 conditions)
}

# Hausa language pairs generated for Nigeria module
# Arabic for Sudan, Somali for Somalia, Lingala/French for DRC,
# Kinyarwanda for cross-border DRC/Rwanda, Hausa for Northern Nigeria/Niger
```

### Step 3 — Fine-Tune with Unsloth

The repository implementation is `ml/finetune/finetune_unsloth.py`. It now writes `reports/training_manifest.json` and automatically uploads the trained adapter artifacts to R2 after training when R2 credentials are present. This prevents losing `/kaggle/working` outputs if the notebook session dies.

```python
# ml/finetune/finetune_unsloth.py
from unsloth import FastLanguageModel
from datasets import load_dataset
from trl import SFTTrainer
from transformers import TrainingArguments
import torch

model, tokenizer = FastLanguageModel.from_pretrained(
    model_name="google/gemma-4-e4b-it",
    max_seq_length=8192,
    load_in_4bit=True,
    dtype=None,
)

model = FastLanguageModel.get_peft_model(
    model,
    r=16,
    target_modules=[
        "q_proj", "k_proj", "v_proj", "o_proj",
        "gate_proj", "up_proj", "down_proj"
    ],
    lora_alpha=16,
    lora_dropout=0,
    bias="none",
    use_gradient_checkpointing="unsloth",
    random_state=42,
)

dataset = load_dataset(
    "json",
    data_files="data/processed/training_final.jsonl",
    split="train"
)

trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    train_dataset=dataset,
    dataset_text_field="messages",
    max_seq_length=8192,
    args=TrainingArguments(
        per_device_train_batch_size=2,
        gradient_accumulation_steps=4,
        warmup_steps=10,
        num_train_epochs=3,
        learning_rate=2e-4,
        fp16=not torch.cuda.is_bf16_supported(),
        bf16=torch.cuda.is_bf16_supported(),
        logging_steps=10,
        output_dir="models/shifa-gemma4-checkpoints",
        save_strategy="epoch",
        optim="adamw_8bit",
        weight_decay=0.01,
        lr_scheduler_type="linear",
    ),
)

trainer.train()
model.save_pretrained("models/shifa-gemma4-e4b-finetuned")
tokenizer.save_pretrained("models/shifa-gemma4-e4b-finetuned")
print("Fine-tuning complete.")
```

### Step 4 — Validate Before Converting

The validation numbers go directly into your submission write-up as proof for the Unsloth Prize.

Use the repository validator rather than hand-scoring responses. It uses strict JSON extraction, schema checks, raw model metrics, deterministic clinical safety guardrails, and live failure details:

```bash
cd ml
python finetune/validate.py
python scripts/upload_artifacts.py
```

Current validation summary:

| Metric | Result |
|---|---:|
| Guarded decision accuracy | 96.7% |
| Guarded urgent recall | 100.0% |
| Guarded urgent miss rate | 0.0% |
| Drug dose accuracy | 100.0% |
| Protocol adherence | 100.0% |
| Schema completeness | 98.3% |
| Raw model decision accuracy | 73.3% |
| Raw model urgent recall | 79.1% |
| Over-referral rate | 11.8% |
| Guardrail overrides | 49 / 60 |

The remaining clinical validation work is not retraining first. It is improving canonical danger-sign extraction and auditing the few synthetic-label mismatches without losing the 100% urgent-recall safety result.

```python
# ml/finetune/validate.py
import json
from unsloth import FastLanguageModel

model, tokenizer = FastLanguageModel.from_pretrained(
    "models/shifa-gemma4-e4b-finetuned",
    max_seq_length=8192, load_in_4bit=True,
)
FastLanguageModel.for_inference(model)

# 60 held-out test cases: 15 per country (Sudan, DRC, Somalia, Nigeria)
with open('data/test_cases/imci_test_60.jsonl') as f:
    test_cases = [json.loads(l) for l in f]

metrics = {
    'decision_correct': 0,
    'danger_sign_correct': 0,
    'drug_dose_correct': 0,
    'protocol_adherence': 0,
}

for case in test_cases:
    output = run_inference(model, tokenizer, case['symptom_text'])
    pred = json.loads(output)
    expected = case['expected_decision']

    if pred['decision'] == expected['decision']:
        metrics['decision_correct'] += 1
    if set(pred['danger_signs']) >= set(expected['required_danger_signs']):
        metrics['danger_sign_correct'] += 1
    if validate_drug_doses(pred, expected):
        metrics['drug_dose_correct'] += 1
    if pred['primary_diagnosis'].lower() == expected['primary_diagnosis'].lower():
        metrics['protocol_adherence'] += 1

n = len(test_cases)
print(f"Decision accuracy:    {metrics['decision_correct']/n*100:.1f}% (target >88%)")
print(f"Danger sign detect:   {metrics['danger_sign_correct']/n*100:.1f}% (target >92%)")
print(f"Drug dose accuracy:   {metrics['drug_dose_correct']/n*100:.1f}% (target >95%)")
print(f"Protocol adherence:   {metrics['protocol_adherence']/n*100:.1f}% (target >90%)")
```

### Step 5 — Convert to LiteRT

```python
# ml/finetune/convert_litert.py
import ai_edge_torch
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch

model = AutoModelForCausalLM.from_pretrained(
    "models/shifa-gemma4-e4b-finetuned",
    torch_dtype=torch.float32,
)
tokenizer = AutoTokenizer.from_pretrained("models/shifa-gemma4-e4b-finetuned")

edge_model = ai_edge_torch.convert(
    model,
    (torch.zeros(1, 1, dtype=torch.long),),
)
edge_model.export("models/shifa-gemma4-e4b-finetuned.tflite")

print("Exported: shifa-gemma4-e4b-finetuned.tflite")
print("Upload to Cloudflare R2 for device download.")
```

---

## 6. Phase 4 — Model Router E2B/E4B (Cactus Prize)

### Purpose

Routes between Gemma 4 E2B (fast) and E4B (accurate) based on query complexity. This is the qualifying logic for the **Cactus Prize** ("best local-first mobile app with intelligent on-device model routing").

The routing decision is logged and included in submission metrics.

### Tools Required

| Tool | Purpose |
|---|---|
| `LiteRTEngine` | Both E2B and E4B inference |
| `AsyncStorage` | Persist router stats for submission metrics |

```typescript
// src/engine/modelRouter.ts
import { LiteRTEngine } from './litertEngine';
import { buildClinicalPrompt } from './promptBuilder';

export type ModelTier = 'e2b' | 'e4b';

interface RoutingDecision {
  model: ModelTier;
  reason: string;
  enableThinking: boolean;
}

export function assessComplexity(params: {
  symptomText: string;
  hasImage: boolean;
  patientAgeMths?: number;
  muac?: number;
}): RoutingDecision {
  const { symptomText, hasImage, patientAgeMths, muac } = params;

  const wordCount = symptomText.trim().split(/\s+/).length;
  const hasMultipleSymptoms =
    symptomText.includes(' and ') ||
    (symptomText.match(/,/g) || []).length >= 2;
  const isVulnerableAge = patientAgeMths !== undefined && patientAgeMths < 24;
  const isSAMRisk = muac !== undefined && muac < 12.5;
  const hasDangerWords = /convuls|unconscious|bleeding|unable|edema|swollen|neck stiff|no feed/i.test(symptomText);

  const isComplex =
    hasImage ||
    wordCount > 20 ||
    (hasMultipleSymptoms && isVulnerableAge) ||
    isSAMRisk ||
    hasDangerWords;

  if (isComplex) {
    return {
      model: 'e4b',
      reason: 'Complex presentation — full reasoning required',
      enableThinking: true,
    };
  }

  return {
    model: 'e2b',
    reason: 'Simple lookup — fast path',
    enableThinking: false,
  };
}

export async function routedClinicalInference(params: {
  symptomText: string;
  hasImage: boolean;
  imageBase64?: string;
  patientAgeMths?: number;
  patientWeightKg?: number;
  muac?: number;
  systemPrompt: string;
  onToken: (t: string) => void;
  onDone: (model: ModelTier) => void;
}): Promise<void> {
  const routing = assessComplexity(params);

  // Log every routing decision for Cactus Prize evidence
  console.log(`[Router] → ${routing.model}: ${routing.reason}`);
  await logRoutingDecision(routing);

  const prompt = buildClinicalPrompt({
    system: params.systemPrompt,
    symptomText: params.symptomText,
    imageBase64: params.imageBase64,
    patientAgeMths: params.patientAgeMths,
    patientWeightKg: params.patientWeightKg,
    muac: params.muac,
    enableThinking: routing.enableThinking,
  });

  LiteRTEngine.stream(
    prompt,
    params.onToken,
    () => params.onDone(routing.model)
  );
}

async function logRoutingDecision(decision: RoutingDecision) {
  const AsyncStorage = await import('@react-native-async-storage/async-storage');
  const key = `router_log_${Date.now()}`;
  await AsyncStorage.default.setItem(key, JSON.stringify({
    ...decision,
    timestamp: Date.now(),
  }));
}
```

---

## 7. Phase 5 — Voice Pipeline: STT + TTS (6 Languages)

### Language Matrix

| Language | Country | STT Model | TTS Model | Notes |
|---|---|---|---|---|
| Arabic (ar) | Sudan, Somalia | whisper-small-ar | Coqui ar-female | Production ready |
| Somali (so) | Somalia | whisper-small-so | Coqui so-female | Production ready |
| French (fr) | DRC, Rwanda | whisper-small-fr | Coqui fr-neutral | Production ready |
| Lingala (ln) | DRC | whisper-small-fr + glossary | Coqui fr + glossary | Common Voice Lingala for fine-tune |
| Kinyarwanda (rw) | Rwanda, E.DRC | whisper-small-rw | Coqui rw-female | Whisper native support |
| **Hausa (ha)** | **N.Nigeria, Niger, Chad** | **whisper-small-ha** | **Coqui ha (openbible/vits)** | **Common Voice Hausa** |

### Why Hausa

Northern Nigeria's humanitarian crisis — Boko Haram displacement in the Lake Chad Basin, Zamfara state conflict, Kaduna and Kogi state violence — affects approximately 8 million people. Hausa is spoken by 70+ million people across Nigeria, Niger, Chad, Cameroon, and Ghana. Whisper natively supports Hausa (ISO 639-1: `ha`). Coqui TTS has `tts_models/ha/openbible/vits`. Adding it costs ~2 hours of integration work.

### Tools Required

| Tool | Purpose |
|---|---|
| `whisper.rn` | On-device Whisper.cpp STT, 6 languages |
| `@react-native-voice/voice` | Android SpeechRecognizer (online STT) |
| Coqui TTS Android (custom Kotlin) | On-device neural TTS, all 6 languages |
| `expo-av` | Audio recording for STT input |

```bash
pnpm install whisper.rn @react-native-voice/voice expo-av
```

### Coqui TTS — Why Not expo-speech

`expo-speech` uses Android's built-in TTS engine. It does not support Lingala, Hausa, or Kinyarwanda. It also cannot use custom VITS voice models fine-tuned for clarity in humanitarian field conditions.

Coqui TTS requires a native Kotlin module (same pattern as MediaPipeLLM). The `react-native-coqui-tts` package provides a base — if it is incomplete, you build the JNI bridge following the same pattern as `CoquiTTSModule.kt` below.

```kotlin
// android/app/src/main/java/com/shifa/CoquiTTSModule.kt
package com.shifa

import com.facebook.react.bridge.*
import java.io.File

class CoquiTTSModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    // Map language code to model path
    private val modelPaths = mutableMapOf<String, String>()
    private var isInitialized = false

    override fun getName() = "CoquiTTS"

    @ReactMethod
    fun loadModel(language: String, modelPath: String, configPath: String, promise: Promise) {
        try {
            // Verify model files exist
            require(File(modelPath).exists()) { "Model not found: $modelPath" }
            require(File(configPath).exists()) { "Config not found: $configPath" }
            modelPaths[language] = modelPath
            // Initialize native Coqui TTS engine via JNI
            nativeLoadModel(language, modelPath, configPath)
            promise.resolve("loaded")
        } catch (e: Exception) {
            promise.reject("TTS_LOAD_ERROR", e.message)
        }
    }

    @ReactMethod
    fun synthesize(text: String, language: String, outputPath: String, promise: Promise) {
        try {
            val modelPath = modelPaths[language]
                ?: throw IllegalStateException("Model not loaded for $language")
            nativeSynthesize(text, language, outputPath)
            promise.resolve(outputPath)
        } catch (e: Exception) {
            promise.reject("TTS_SYNTH_ERROR", e.message)
        }
    }

    // JNI declarations — implemented in Coqui TTS native library
    private external fun nativeLoadModel(language: String, modelPath: String, configPath: String)
    private external fun nativeSynthesize(text: String, language: String, outputPath: String)

    companion object {
        init {
            System.loadLibrary("coqui-tts")
        }
    }
}
```

### Coqui Model Files Per Language

Download before first launch. Total ~1.65GB for all 6 languages.

```typescript
// Model sizes and download URLs
const COQUI_MODELS = {
  ar: { model: 'tts_ar.bin', config: 'config_ar.json', size_mb: 80 },
  so: { model: 'tts_so.bin', config: 'config_so.json', size_mb: 75 },
  fr: { model: 'tts_fr.bin', config: 'config_fr.json', size_mb: 80 },
  ln: { model: 'tts_fr.bin', config: 'config_fr.json', size_mb: 80 },  // French fallback
  rw: { model: 'tts_rw.bin', config: 'config_rw.json', size_mb: 70 },
  ha: { model: 'tts_ha.bin', config: 'config_ha.json', size_mb: 65 },  // Hausa
};
// Host all on Cloudflare R2
```

### STT Implementation

```typescript
// src/voice/stt.ts
import { initWhisper, WhisperContext } from 'whisper.rn';
import NetInfo from '@react-native-community/netinfo';
import Voice from '@react-native-voice/voice';
import * as FileSystem from 'expo-file-system';

export type Language = 'ar' | 'so' | 'fr' | 'ln' | 'rw' | 'ha';

const WHISPER_MODELS: Record<Language, string> = {
  'ar': 'whisper-small-ar.bin',
  'so': 'whisper-small-so.bin',
  'fr': 'whisper-small-fr.bin',
  'ln': 'whisper-small-fr.bin',    // French fallback for Lingala
  'rw': 'whisper-small-rw.bin',
  'ha': 'whisper-small-ha.bin',    // Hausa — Whisper native support
};

const ANDROID_LOCALE: Record<Language, string> = {
  'ar': 'ar-SA',
  'so': 'so-SO',
  'fr': 'fr-FR',
  'ln': 'fr-FR',
  'rw': 'rw-RW',
  'ha': 'ha-NG',                   // Hausa Nigeria locale
};

let whisperCtx: WhisperContext | null = null;

export async function initSTT(language: Language): Promise<void> {
  const modelFile = WHISPER_MODELS[language];
  const modelPath = `${FileSystem.documentDirectory}models/${modelFile}`;
  const info = await FileSystem.getInfoAsync(modelPath);
  if (!info.exists) throw new Error(`Whisper model not downloaded: ${modelFile}`);
  whisperCtx = await initWhisper({ filePath: modelPath });
}

export async function transcribe(
  audioPath: string,
  language: Language
): Promise<string> {
  const net = await NetInfo.fetch();

  if (net.isConnected) {
    // Online: Android SpeechRecognizer (more accurate, near-zero latency)
    return transcribeOnline(language);
  }

  // Offline: Whisper.cpp on device
  if (!whisperCtx) throw new Error('Whisper not initialized');
  const { result } = await whisperCtx.transcribe(audioPath, {
    language: language === 'ln' ? 'fr' : language,
    translate: false,
  });
  return result;
}

function transcribeOnline(language: Language): Promise<string> {
  return new Promise((resolve, reject) => {
    const locale = ANDROID_LOCALE[language];
    Voice.onSpeechResults = (e) => {
      const result = e.value?.[0];
      if (result) resolve(result);
    };
    Voice.onSpeechError = (e) => reject(new Error(e.error?.message));
    Voice.start(locale).catch(reject);
  });
}
```

### TTS Implementation

```typescript
// src/voice/tts.ts
import { NativeModules } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { Audio } from 'expo-av';

const { CoquiTTS } = NativeModules;

export type Language = 'ar' | 'so' | 'fr' | 'ln' | 'rw' | 'ha';

const TTS_LANGUAGE_MAP: Record<Language, string> = {
  'ar': 'ar',
  'so': 'so',
  'fr': 'fr',
  'ln': 'fr',   // Lingala uses French voice model
  'rw': 'rw',
  'ha': 'ha',   // Hausa — Coqui tts_models/ha/openbible/vits
};

export async function initTTS(language: Language): Promise<void> {
  const lang = TTS_LANGUAGE_MAP[language];
  const modelPath = `${FileSystem.documentDirectory}models/tts_${lang}.bin`;
  const configPath = `${FileSystem.documentDirectory}models/config_${lang}.json`;

  const [modelInfo, configInfo] = await Promise.all([
    FileSystem.getInfoAsync(modelPath),
    FileSystem.getInfoAsync(configPath),
  ]);

  if (!modelInfo.exists || !configInfo.exists) {
    throw new Error(`TTS model not downloaded for language: ${language}`);
  }

  await CoquiTTS.loadModel(language, modelPath, configPath);
}

export async function speak(text: string, language: Language): Promise<void> {
  const lang = TTS_LANGUAGE_MAP[language];
  const outputPath = `${FileSystem.cacheDirectory}tts_output_${Date.now()}.wav`;

  await CoquiTTS.synthesize(text, lang, outputPath);

  const sound = new Audio.Sound();
  await sound.loadAsync({ uri: outputPath });
  await sound.playAsync();

  return new Promise((resolve) => {
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        sound.unloadAsync();
        FileSystem.deleteAsync(outputPath, { idempotent: true });
        resolve();
      }
    });
  });
}

export function stopSpeaking(): void {
  // Implemented via CoquiTTS.stop() native call
  NativeModules.CoquiTTS?.stop?.();
}
```

---

## 8. Phase 6 — Clinical Decision Engine

### Tools Required

| Tool | Purpose |
|---|---|
| `LiteRTEngine` | Model inference |
| `modelRouter.ts` | E2B/E4B selection |
| Country protocol JSON files | Clinical rules |
| `zod` | JSON output validation + type safety |

### Prompt Builder

```typescript
// src/engine/promptBuilder.ts
import { PROTOCOLS } from '../protocols';

export type Country = 'Sudan' | 'DRC' | 'Somalia' | 'Nigeria';
export type Language = 'ar' | 'so' | 'fr' | 'ln' | 'rw' | 'ha';

const LANGUAGE_NAMES: Record<Language, string> = {
  ar: 'Arabic',
  so: 'Somali',
  fr: 'French',
  ln: 'Lingala (use French if needed)',
  rw: 'Kinyarwanda',
  ha: 'Hausa',
};

export function buildSystemPrompt(country: Country, language: Language): string {
  const protocol = PROTOCOLS[country];
  const langName = LANGUAGE_NAMES[language];

  return `You are SHIFA, a clinical decision support assistant for community health workers in ${country}.
You follow WHO IMCI protocols and Sphere Humanitarian Standards.
You have been fine-tuned on MSF Clinical Guidelines for Low-Resource Settings.

ABSOLUTE RULES — never violate:
1. You support health workers. You do not replace doctors.
2. Default to REFER_URGENT when confidence is below 0.70.
3. Never give drug doses without confirming patient age and weight.
4. Always list danger signs requiring immediate escalation.
5. Respond ONLY in ${langName}. Use simple words the CHW can relay to the patient.
6. Think step by step before concluding. Show your reasoning in reasoning_trace.
7. If image analysis is inconclusive, say so. Never guess when a child's life is at stake.

PROTOCOL MODULE:
${JSON.stringify(protocol, null, 2)}

RESPOND IN THIS EXACT JSON STRUCTURE:
{
  "decision": "TREAT" | "REFER_URGENT" | "REFER_ROUTINE" | "MONITOR",
  "primary_diagnosis": "string",
  "differential_diagnoses": ["string"],
  "confidence": 0.0-1.0,
  "treatment_protocol": { ... } | null,
  "referral": { ... } | null,
  "monitoring": { ... } | null,
  "danger_signs": ["string"],
  "reasoning_trace": "string",
  "voice_response": "plain language in ${langName}"
}`;
}

export function buildClinicalPrompt(params: {
  system: string;
  symptomText: string;
  patientAgeMths?: number;
  patientWeightKg?: number;
  muac?: number;
  bilateralEdema?: boolean;
  imageBase64?: string;
  enableThinking: boolean;
}): string {
  let userMessage = params.symptomText;

  if (params.patientAgeMths !== undefined) userMessage += `\nAge: ${params.patientAgeMths} months`;
  if (params.patientWeightKg !== undefined) userMessage += `\nWeight: ${params.patientWeightKg} kg`;
  if (params.muac !== undefined) userMessage += `\nMUAC: ${params.muac} cm`;
  if (params.bilateralEdema !== undefined)
    userMessage += `\nBilateral edema: ${params.bilateralEdema ? 'YES' : 'NO'}`;
  if (params.imageBase64)
    userMessage += `\n[Image attached for visual analysis]`;

  const thinkTag = params.enableThinking ? '<think>' : '';

  return (
    `<start_of_turn>system\n${params.system}<end_of_turn>\n` +
    `<start_of_turn>user\n${userMessage}<end_of_turn>\n` +
    `<start_of_turn>model\n${thinkTag}`
  );
}
```

### Decision Parser & Validator

```typescript
// src/engine/decisionParser.ts
import { z } from 'zod';

const ClinicalDecisionSchema = z.object({
  decision: z.enum(['TREAT', 'REFER_URGENT', 'REFER_ROUTINE', 'MONITOR']),
  primary_diagnosis: z.string(),
  differential_diagnoses: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  treatment_protocol: z.object({
    steps: z.array(z.string()),
    drug_doses: z.array(z.object({
      drug: z.string(),
      dose: z.string(),
      frequency: z.string(),
    })).optional(),
    follow_up_hours: z.number(),
    return_triggers: z.array(z.string()),
  }).nullable(),
  referral: z.object({
    urgency: z.enum(['IMMEDIATE', 'WITHIN_6H', 'WITHIN_24H', 'WITHIN_72H']),
    facility_type: z.string(),
    pre_referral_treatment: z.array(z.string()),
    message_for_facility: z.string(),
    danger_signs_en_route: z.array(z.string()),
  }).nullable(),
  monitoring: z.object({
    watch_signs: z.array(z.string()),
    return_if: z.array(z.string()),
    home_care: z.array(z.string()),
    recheck_hours: z.number(),
  }).nullable(),
  danger_signs: z.array(z.string()),
  reasoning_trace: z.string(),
  voice_response: z.string(),
  image_analysis: z.object({
    finding: z.string(),
    confidence: z.number(),
    recommendation: z.string(),
  }).optional(),
});

export type ClinicalDecision = z.infer<typeof ClinicalDecisionSchema>;

// WHO IMCI universal danger signs — any of these forces REFER_URGENT
const UNIVERSAL_DANGER_SIGNS = [
  'unable to drink or breastfeed',
  'vomits everything',
  'convulsions',
  'lethargic or unconscious',
  'stridor at rest',
  'severe chest indrawing',
  'signs of shock',
  'heavy vaginal bleeding',
  'cord prolapse',
  'neck stiffness',            // Meningitis — Nigeria module
  'bulging fontanelle',
];

export function parseAndValidate(rawOutput: string): ClinicalDecision {
  // Extract JSON — model may emit reasoning text before it
  const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in model output');

  const parsed = JSON.parse(jsonMatch[0]);
  const decision = ClinicalDecisionSchema.parse(parsed);

  // Universal danger sign override
  const hasDangerSign = UNIVERSAL_DANGER_SIGNS.some(sign =>
    decision.danger_signs.some(ds => ds.toLowerCase().includes(sign))
  );

  if (hasDangerSign && decision.decision !== 'REFER_URGENT') {
    decision.decision = 'REFER_URGENT';
    decision.reasoning_trace += '\n[OVERRIDE: Universal danger sign detected — auto REFER_URGENT]';
  }

  // Low confidence override
  if (decision.confidence < 0.70 && decision.decision !== 'REFER_URGENT') {
    decision.decision = 'REFER_URGENT';
    decision.reasoning_trace += `\n[OVERRIDE: Confidence ${decision.confidence} < 0.70 threshold]`;
  }

  return decision;
}
```

---

## 9. Phase 7 — Country Protocol Modules

Four country JSON modules. All loaded into system prompt at session start. No external tools required.

### Module: Sudan

```json
// protocols/sudan.json
{
  "country": "Sudan",
  "context": "Conflict-affected IDP camps, Darfur region. 70%+ health facilities non-functional (UNICEF 2025).",
  "languages": ["ar"],
  "chw_kit": ["ORS sachets", "RUTF packets", "Amoxicillin 250mg",
    "Artemether-Lumefantrine (AL) tabs", "Malaria RDTs", "MUAC tapes",
    "Basic wound supplies", "Oxytocin 10IU"],
  "priority_conditions": [
    {
      "name": "Severe Acute Malnutrition",
      "code": "SAM",
      "thresholds": {
        "severe_complicated": "MUAC < 11.5cm AND (bilateral edema OR medical complication)",
        "severe_uncomplicated": "MUAC < 11.5cm, no complications",
        "moderate": "MUAC 11.5–12.5cm"
      },
      "decisions": {
        "severe_complicated": "REFER_URGENT — give 1 RUTF sachet before journey",
        "severe_uncomplicated": "TREAT — RUTF + follow-up 48h",
        "moderate": "TREAT — RUTF + education + recheck 7 days"
      }
    },
    { "name": "Acute Watery Diarrhea / Cholera", "code": "AWD" },
    { "name": "Malaria (Darfur endemic)", "code": "MAL" },
    { "name": "Acute Respiratory Infection", "code": "ARI" },
    { "name": "Conflict Wound", "code": "WND" },
    { "name": "Sexual Violence Survivor", "code": "GBV" },
    { "name": "Neonatal Emergency", "code": "NEO" }
  ],
  "referral_facilities": [
    { "name": "MSF Zalingei", "type": "MSF", "services": ["OPD", "IPD", "Nutrition"] },
    { "name": "IRC Health Post Alpha", "type": "IRC", "services": ["OPD", "Nutrition"] }
  ]
}
```

### Module: DRC

```json
// protocols/drc.json
{
  "country": "DRC",
  "context": "Eastern Congo, North Kivu. M23 conflict, 7M displaced. 82,000+ measles cases 2025. 58,000+ cholera cases 2025.",
  "languages": ["ln", "fr", "rw"],
  "chw_kit": ["ORS sachets", "RUTF packets", "Amoxicillin 250mg",
    "AL tabs (adult + pediatric)", "Malaria RDTs", "MUAC tapes",
    "Measles case definition card"],
  "priority_conditions": [
    { "name": "Malaria (hyperendemic)", "code": "MAL" },
    { "name": "Mpox", "code": "MPX",
      "visual_classification": true,
      "photo_prompt": "Classify: umbilicated vesicles (mpox), maculopapular (measles), or chickenpox. State confidence." },
    { "name": "Severe Acute Malnutrition", "code": "SAM" },
    { "name": "Cholera", "code": "AWD" },
    { "name": "Measles", "code": "MEA" },
    { "name": "Pneumonia", "code": "ARI" },
    { "name": "Sexual Violence Survivor", "code": "GBV" }
  ]
}
```

### Module: Somalia

```json
// protocols/somalia.json
{
  "country": "Somalia",
  "context": "IDP camps, Mogadishu/Baidoa/Kismayo. Somalia Community Health Strategy 2025-2029 (UNICEF/WHO April 2026).",
  "languages": ["so", "ar"],
  "priority_conditions": [
    { "name": "Severe Acute Malnutrition + appetite test", "code": "SAM" },
    { "name": "Acute Watery Diarrhea", "code": "AWD" },
    { "name": "Malaria", "code": "MAL" },
    { "name": "Neonatal danger signs", "code": "NEO" },
    { "name": "Maternal danger signs", "code": "MAT" },
    { "name": "Measles", "code": "MEA" },
    { "name": "Acute Respiratory Infection", "code": "ARI" }
  ]
}
```

### Module: Northern Nigeria (Hausa) — New

```json
// protocols/nigeria_north.json
{
  "country": "Nigeria",
  "context": "Northern Nigeria IDP context. Boko Haram displacement, Lake Chad Basin, Zamfara/Kaduna conflicts. ~8M affected. Predominantly Muslim communities.",
  "languages": ["ha"],
  "chw_kit": ["ORS sachets", "RUTF packets", "Amoxicillin 250mg",
    "AL tabs", "Malaria RDTs", "MUAC tapes", "Vitamin A capsules",
    "Zinc tabs", "Ceftriaxone 1g vials (referral pre-treatment)"],
  "priority_conditions": [
    {
      "name": "Meningococcal Meningitis",
      "code": "MEN",
      "note": "Meningitis Belt — Nigeria is highest burden globally",
      "danger_signs": ["neck stiffness", "bulging fontanelle", "photophobia", "altered consciousness"],
      "pre_referral": "Ceftriaxone IM if available, immediate referral regardless"
    },
    {
      "name": "Severe Acute Malnutrition",
      "code": "SAM",
      "note": "Borno state SAM rate among highest globally"
    },
    { "name": "Malaria (hyperendemic)", "code": "MAL" },
    { "name": "Acute Watery Diarrhea / Cholera", "code": "AWD" },
    { "name": "Acute Respiratory Infection", "code": "ARI" },
    { "name": "Measles", "code": "MEA",
      "note": "Nigeria had largest measles outbreak in Africa 2024-2025" },
    { "name": "Neonatal Emergency", "code": "NEO" }
  ],
  "referral_facilities": [
    { "name": "MSF Maiduguri", "type": "MSF", "services": ["OPD", "IPD", "Nutrition", "Meningitis"] },
    { "name": "IRC Borno", "type": "IRC", "services": ["OPD", "Nutrition"] }
  ]
}
```

### Protocol Loader

```typescript
// src/protocols/index.ts
import sudan from '../../protocols/sudan.json';
import drc from '../../protocols/drc.json';
import somalia from '../../protocols/somalia.json';
import nigeria_north from '../../protocols/nigeria_north.json';

export const PROTOCOLS = {
  Sudan: sudan,
  DRC: drc,
  Somalia: somalia,
  Nigeria: nigeria_north,
} as const;

export type Country = keyof typeof PROTOCOLS;

export function getProtocol(country: Country) {
  return PROTOCOLS[country];
}
```

---

## 10. Phase 8 — Photo Analysis (Multimodal)

### Tools Required

| Tool | Purpose |
|---|---|
| `expo-camera` | Capture photo on device |
| `expo-image-manipulator` | Resize to 512px max before inference |
| `expo-media-library` | Save captured images locally |
| LiteRT E4B (multimodal) | Image + symptom text reasoning |

```typescript
// src/engine/photoAnalysis.ts
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';

export async function prepareImageForModel(photoUri: string): Promise<string> {
  const resized = await ImageManipulator.manipulateAsync(
    photoUri,
    [{ resize: { width: 512 } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );
  if (!resized.base64) throw new Error('Image encoding failed');
  return resized.base64;
}

export type PhotoType = 'muac_tape' | 'rash' | 'wound' | 'child_malnutrition' | 'other';

export function getPhotoPromptContext(type: PhotoType, country?: string): string {
  const contexts: Record<PhotoType, string> = {
    muac_tape: 'Read the MUAC tape measurement shown in the image. Report the exact cm value.',
    rash: country === 'DRC'
      ? 'Classify: umbilicated vesicles = mpox, maculopapular = measles, chickenpox. State confidence.'
      : 'Classify rash type. State confidence and clinical significance.',
    wound: 'Classify wound: clean/contaminated/infected. Note tetanus risk. Note any signs of NF.',
    child_malnutrition: 'Assess: visible wasting, visible ribs, hair changes (flag sign), bilateral edema.',
    other: 'Describe all clinically relevant findings visible in the image.',
  };
  return contexts[type];
}
```

Photo analysis is always routed to E4B (complex path in the model router — `hasImage: true` forces E4B). The image is embedded in the Gemma multimodal prompt as base64.

---

## 11. Phase 9 — SHIFA Guard: Threat Detection

### Architecture

```
Camera feed → YOLO-NAS nano (LiteRT) → visual threat buffer
Microphone  → YAMNet (LiteRT)        → audio threat buffer
                    ↓
         ThreatConfirmationEngine
                    ↓
    Visual + Audio match → CONFIRMED
                    ↓
    Africa's Talking SMS (2G) + Bluetooth mesh
```

### Privacy Architecture

Raw video and audio are **never stored and never transmitted**. Only the classified output (threat type, GPS, timestamp, confidence) leaves the device. This is documented in the Privacy Notice shown at first launch. Alert recipients are configured by the CHW, not preset.

### Tools Required

| Tool | Purpose |
|---|---|
| `org.tensorflow:tensorflow-lite:2.14.0` | YOLO-NAS LiteRT runtime |
| `org.tensorflow:tensorflow-lite-task-audio:0.4.4` | YAMNet runtime |
| `expo-camera` | Continuous camera frame capture |
| `expo-av` | Microphone audio capture for YAMNet |
| `expo-location` | GPS coordinates for alert payload |
| Custom Kotlin `GuardModule` | YOLO-NAS frame analysis |
| Custom Kotlin `AudioGuardModule` | YAMNet continuous audio loop |

### GuardModule — YOLO-NAS Visual Detection

```kotlin
// android/app/src/main/java/com/shifa/GuardModule.kt
package com.shifa

import com.facebook.react.bridge.*
import org.tensorflow.lite.Interpreter
import android.graphics.Bitmap
import android.util.Base64
import java.nio.ByteBuffer
import java.nio.ByteOrder

class GuardModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var yoloInterpreter: Interpreter? = null
    override fun getName() = "ShifaGuard"

    @ReactMethod
    fun initDetection(modelPath: String, promise: Promise) {
        try {
            yoloInterpreter = Interpreter(java.io.File(modelPath))
            promise.resolve("Guard initialized")
        } catch (e: Exception) {
            promise.reject("GUARD_INIT_ERROR", e.message)
        }
    }

    @ReactMethod
    fun analyzeFrame(base64Image: String, promise: Promise) {
        val interpreter = yoloInterpreter
            ?: return promise.reject("NOT_INIT", "Call initDetection first")

        try {
            val bytes = Base64.decode(base64Image, Base64.DEFAULT)
            val bitmap = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            val results = runYOLOInference(interpreter, bitmap)

            val output = Arguments.createMap().apply {
                putBoolean("threatDetected", results.maxConfidence > 0.75f)
                putDouble("confidence", results.maxConfidence.toDouble())
                putString("threatType", results.topClass)
            }
            promise.resolve(output)
        } catch (e: Exception) {
            promise.reject("DETECTION_ERROR", e.message)
        }
    }

    private data class DetectionResult(val maxConfidence: Float, val topClass: String)

    private fun runYOLOInference(interp: Interpreter, bitmap: Bitmap): DetectionResult {
        val inputSize = 640
        val scaled = Bitmap.createScaledBitmap(bitmap, inputSize, inputSize, true)
        val inputBuffer = ByteBuffer.allocateDirect(1 * inputSize * inputSize * 3 * 4)
            .apply { order(ByteOrder.nativeOrder()) }

        for (y in 0 until inputSize) {
            for (x in 0 until inputSize) {
                val px = scaled.getPixel(x, y)
                inputBuffer.putFloat(((px shr 16) and 0xFF) / 255f)
                inputBuffer.putFloat(((px shr 8) and 0xFF) / 255f)
                inputBuffer.putFloat((px and 0xFF) / 255f)
            }
        }

        val outputBuffer = Array(1) { Array(300) { FloatArray(6) } }
        interp.run(inputBuffer, outputBuffer)

        val best = outputBuffer[0].maxByOrNull { it[4] }
            ?: return DetectionResult(0f, "none")

        val classNames = listOf("person_with_weapon", "vehicle_convoy", "motorbike_cluster")
        val classIdx = best[5].toInt().coerceIn(0, classNames.size - 1)
        return DetectionResult(best[4], classNames[classIdx])
    }
}
```

### AudioGuardModule — YAMNet Continuous Audio

```kotlin
// android/app/src/main/java/com/shifa/AudioGuardModule.kt
package com.shifa

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.tensorflow.lite.task.audio.classifier.AudioClassifier

class AudioGuardModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var classifier: AudioClassifier? = null
    private var isMonitoring = false
    override fun getName() = "AudioGuard"

    @ReactMethod
    fun startMonitoring(modelPath: String, promise: Promise) {
        try {
            classifier = AudioClassifier.createFromFile(reactApplicationContext, modelPath)
            isMonitoring = true
            startAudioLoop()
            promise.resolve("Audio monitoring started")
        } catch (e: Exception) {
            promise.reject("AUDIO_INIT_ERROR", e.message)
        }
    }

    private fun startAudioLoop() {
        Thread {
            val tensor = classifier!!.createInputTensorAudio()
            val record = classifier!!.createAudioRecord()
            record.startRecording()

            while (isMonitoring) {
                tensor.load(record)
                val results = classifier!!.classify(tensor)
                val threats = results[0].categories
                    .filter { it.score > 0.6f && isThreatCategory(it.label) }

                if (threats.isNotEmpty()) {
                    val top = threats.maxByOrNull { it.score }!!
                    val map = Arguments.createMap().apply {
                        putString("label", top.label)
                        putDouble("confidence", top.score.toDouble())
                    }
                    reactApplicationContext
                        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                        .emit("AudioThreat", map)
                }
                Thread.sleep(500)
            }
            record.stop()
        }.start()
    }

    private fun isThreatCategory(label: String): Boolean {
        val threats = listOf("Gunshot, gunfire", "Explosion", "Burst, pop",
                             "Machine gun", "Artillery fire")
        return threats.any { label.contains(it, ignoreCase = true) }
    }

    @ReactMethod
    fun stopMonitoring(promise: Promise) {
        isMonitoring = false
        promise.resolve("Stopped")
    }

    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}
}
```

### Threat Confirmation Engine (TypeScript)

```typescript
// src/guard/threatConfirmation.ts
import { NativeModules, NativeEventEmitter } from 'react-native';

const { ShifaGuard, AudioGuard } = NativeModules;

export interface ThreatEvent {
  type: 'ARMED_INDIVIDUALS' | 'VEHICLE_CONVOY' | 'MOTORBIKE_CLUSTER' |
        'GUNFIRE_SINGLE' | 'GUNFIRE_BURST' | 'EXPLOSION' | 'COMBINED';
  urgency: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
  confidence: number;
  timestamp: number;
}

export class ThreatConfirmationEngine {
  private visualBuffer: Array<{ type: string; confidence: number; time: number }> = [];
  private audioBuffer: Array<{ label: string; confidence: number; time: number }> = [];
  private onThreatConfirmed: (event: ThreatEvent) => void;
  private audioEmitter = new NativeEventEmitter(AudioGuard);
  private audioSub: ReturnType<typeof this.audioEmitter.addListener> | null = null;

  constructor(onThreatConfirmed: (e: ThreatEvent) => void) {
    this.onThreatConfirmed = onThreatConfirmed;
  }

  start() {
    this.audioSub = this.audioEmitter.addListener('AudioThreat', (event) => {
      this.audioBuffer.push({ ...event, time: Date.now() });
      this.pruneOldEvents();
      this.evaluate();
    });
  }

  stop() {
    this.audioSub?.remove();
    ShifaGuard.stopMonitoring?.();
    AudioGuard.stopMonitoring?.();
  }

  addVisualDetection(type: string, confidence: number) {
    this.visualBuffer.push({ type, confidence, time: Date.now() });
    this.pruneOldEvents();
    this.evaluate();
  }

  private pruneOldEvents() {
    const WINDOW_MS = 60_000;
    const now = Date.now();
    this.visualBuffer = this.visualBuffer.filter(e => now - e.time < WINDOW_MS);
    this.audioBuffer = this.audioBuffer.filter(e => now - e.time < WINDOW_MS);
  }

  private evaluate() {
    const hasVisual = this.visualBuffer.some(e => e.confidence > 0.75);
    const hasAudio = this.audioBuffer.some(e => e.confidence > 0.6);
    const hasSustainedVisual = this.visualBuffer.filter(e => e.confidence > 0.6).length >= 5;
    const hasExplosion = this.audioBuffer.some(e =>
      e.label.toLowerCase().includes('explosion'));
    const hasBurst = this.audioBuffer.some(e =>
      e.label.toLowerCase().includes('burst') || e.label.toLowerCase().includes('machine gun'));

    if (hasExplosion) {
      this.confirm('EXPLOSION', 'CRITICAL', 0.95);
    } else if (hasVisual && hasAudio) {
      this.confirm('COMBINED', 'CRITICAL', 0.90);
    } else if (hasBurst) {
      this.confirm('GUNFIRE_BURST', 'CRITICAL', 0.85);
    } else if (hasSustainedVisual) {
      this.confirm('ARMED_INDIVIDUALS', 'HIGH', 0.80);
    } else if (hasAudio) {
      this.confirm('GUNFIRE_SINGLE', 'MODERATE', 0.70);
    }
  }

  private confirm(
    type: ThreatEvent['type'],
    urgency: ThreatEvent['urgency'],
    confidence: number
  ) {
    this.visualBuffer = [];
    this.audioBuffer = [];
    this.onThreatConfirmed({ type, urgency, confidence, timestamp: Date.now() });
  }
}
```

---

## 12. Phase 10 — Africa's Talking SMS Alerts (2G)

### How 2G Works Here

Africa's Talking's REST API (`https://api.africastalking.com/version1/messaging`) works over HTTP on 2G GPRS (minimum ~10 kbps). The payload is URL-encoded form data — less than 1KB per alert. This is the primary alerting mechanism when internet is unavailable but a 2G signal exists.

### Tools Required

| Tool | Purpose |
|---|---|
| Africa's Talking account | API credentials (africastalking.com) |
| Africa's Talking sandbox | Free testing before production |
| `africastalking` npm package | SDK |
| `expo-location` | GPS coordinates for SMS payload |
| `expo-secure-store` | Encrypted storage of AT API key on device |

```bash
# Create account at africastalking.com
# Create app → get API Key + username
# Add $5 credits in production (~2,500 SMS)
# Test in sandbox first (free, no credits needed)

pnpm install africastalking
```

### Mobile SMS Dispatch

The API key lives in the backend — it is never shipped in the mobile APK. The mobile sends the threat payload to the FastAPI backend, which calls the Africa's Talking API.

```typescript
// src/guard/smsAlert.ts
export interface SMSAlertPayload {
  threatType: string;
  urgency: string;
  confidence: number;
  latitude: number;
  longitude: number;
  chwId: string;
  chwName: string;
  region: string;
  recipients: string[];      // E.164 format: +234xxxxxxxxxx (Nigeria), +243xxxxxxxxx (DRC)
  timestamp: string;
}

export async function dispatchSMSAlert(
  payload: SMSAlertPayload,
  backendUrl: string
): Promise<void> {
  await fetch(`${backendUrl}/guard/alert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
```

### 2G Direct Fallback — When Backend Is Unreachable

When there is a 2G signal but no internet connectivity to reach the backend:

```typescript
// src/guard/directSMSFallback.ts
// AT API key is stored in SecureStore — encrypted on device
// This is used ONLY when the backend is unreachable

import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';

export function formatSMSMessage(payload: SMSAlertPayload): string {
  return (
    `[SHIFA GUARD — ${payload.urgency}]\n` +
    `Threat: ${payload.threatType}\n` +
    `Location: ${payload.latitude.toFixed(4)}, ${payload.longitude.toFixed(4)}\n` +
    `CHW: ${payload.chwName} · ${payload.region}\n` +
    `Confidence: ${Math.round(payload.confidence * 100)}%\n` +
    `Time: ${payload.timestamp}\n\n` +
    `Reply CONFIRM to acknowledge.\n` +
    `Reply SAFE if false alarm.\n` +
    `— SHIFA by Mist Labs`
  );
}

export async function directSMSFallback(payload: SMSAlertPayload): Promise<void> {
  const apiKey = await SecureStore.getItemAsync('AT_API_KEY');
  const username = await SecureStore.getItemAsync('AT_USERNAME');
  if (!apiKey || !username) {
    console.warn('AT credentials not configured — cannot dispatch direct SMS');
    return;
  }

  const message = formatSMSMessage(payload);
  const body = new URLSearchParams({
    username,
    to: payload.recipients.join(','),
    message,
    from: 'SHIFA',
  });

  await fetch('https://api.africastalking.com/version1/messaging', {
    method: 'POST',
    headers: {
      'apiKey': apiKey,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: body.toString(),
  });
}
```

### Backend SMS Handler

```python
# services/api/routers/guard.py
import os
import africastalking
from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel
from typing import List

router = APIRouter()

africastalking.initialize(
    username=os.environ['AT_USERNAME'],
    api_key=os.environ['AT_API_KEY']
)
sms = africastalking.SMS

class SMSAlertPayload(BaseModel):
    threat_type: str
    urgency: str
    confidence: float
    latitude: float
    longitude: float
    chw_id: str
    chw_name: str
    region: str
    recipients: List[str]
    timestamp: str

@router.post("/guard/alert")
async def dispatch_alert(payload: SMSAlertPayload, bg: BackgroundTasks):
    bg.add_task(send_sms_alerts, payload)
    return {"status": "dispatched"}

async def send_sms_alerts(payload: SMSAlertPayload):
    message = (
        f"[SHIFA GUARD — {payload.urgency}]\n"
        f"Threat: {payload.threat_type}\n"
        f"Location: {payload.latitude:.4f}, {payload.longitude:.4f}\n"
        f"CHW: {payload.chw_name} · {payload.region}\n"
        f"Confidence: {int(payload.confidence * 100)}%\n"
        f"Time: {payload.timestamp}\n\n"
        f"Reply CONFIRM to acknowledge.\n"
        f"Reply SAFE if false alarm.\n"
        f"— SHIFA by Mist Labs"
    )
    result = sms.send(
        message=message,
        recipients=payload.recipients,
        sender_id="SHIFA"
    )
    print(f"SMS dispatch result: {result}")
```

---

## 13. Phase 11 — Bluetooth Mesh Relay

### Purpose

When both the backend and 2G are unavailable, BLE broadcasts the threat alert to all nearby SHIFA devices. Each device with connectivity then independently dispatches the SMS. This creates a relay chain across field teams.

### Tools Required

| Tool | Purpose |
|---|---|
| `react-native-ble-plx` | BLE scanning + advertising + GATT write |
| `expo-dev-client` | Required — BLE cannot work in Expo Go |

```bash
pnpm install react-native-ble-plx
```

```typescript
// src/guard/bluetoothMesh.ts
import { BleManager, Characteristic } from 'react-native-ble-plx';
import { Buffer } from 'buffer';
import { Platform, PermissionsAndroid } from 'react-native';

const manager = new BleManager();

const SHIFA_SERVICE_UUID = '12345678-1234-1234-1234-1234567890ab';
const ALERT_CHAR_UUID    = '12345678-1234-1234-1234-1234567890ac';

export interface MeshAlert {
  threatType: string;
  urgency: string;
  latitude: number;
  longitude: number;
  timestamp: number;
  originDeviceId: string;
}

export async function requestBLEPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const result = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  ]);
  return Object.values(result).every(v => v === PermissionsAndroid.RESULTS.GRANTED);
}

export async function broadcastAlert(alert: MeshAlert): Promise<void> {
  const granted = await requestBLEPermissions();
  if (!granted) {
    console.warn('BLE permissions denied — cannot broadcast');
    return;
  }

  const payload = Buffer.from(JSON.stringify(alert)).toString('base64');

  return new Promise((resolve) => {
    let resolved = false;

    manager.startDeviceScan(
      [SHIFA_SERVICE_UUID],
      { allowDuplicates: false },
      async (error, device) => {
        if (error || !device) return;

        try {
          const connected = await device.connect();
          await connected.discoverAllServicesAndCharacteristics();
          await connected.writeCharacteristicWithResponseForService(
            SHIFA_SERVICE_UUID,
            ALERT_CHAR_UUID,
            payload
          );
          await connected.cancelConnection();
          console.log(`BLE alert delivered to: ${device.id}`);
        } catch (e) {
          console.warn('BLE write to device failed:', device.id, e);
        }
      }
    );

    setTimeout(() => {
      manager.stopDeviceScan();
      if (!resolved) { resolved = true; resolve(); }
    }, 15_000);
  });
}
```

---

## 14. Phase 12 — Offline SQLite Storage

### Tools Required

| Tool | Purpose |
|---|---|
| `expo-sqlite` | SQLite on Android (production, no emulator needed) |
| `drizzle-orm` | Type-safe query builder |

```bash
pnpm install expo-sqlite drizzle-orm
```

### Schema

```typescript
// src/db/schema.ts
import { sqliteTable, text, real, integer } from 'drizzle-orm/sqlite-core';

export const chwProfile = sqliteTable('chw_profile', {
  id: text('id').primaryKey(),
  name: text('name'),
  country: text('country').notNull(),     // 'Sudan' | 'DRC' | 'Somalia' | 'Nigeria'
  language: text('language').notNull(),   // 'ar' | 'so' | 'fr' | 'ln' | 'rw' | 'ha'
  region: text('region'),
  alertRecipients: text('alert_recipients'),   // JSON array of E.164 phone numbers
  guardEnabled: integer('guard_enabled').default(0),
  syncToken: text('sync_token'),
  createdAt: integer('created_at'),
});

export const consultations = sqliteTable('consultations', {
  id: text('id').primaryKey(),
  chwId: text('chw_id').notNull(),
  patientAgeMths: integer('patient_age_months'),
  patientSex: text('patient_sex'),
  patientWeightKg: real('patient_weight_kg'),
  muacCm: real('muac_cm'),
  bilateralEdema: integer('bilateral_edema'),
  symptomText: text('symptom_text').notNull(),
  imagePath: text('image_path'),
  decision: text('decision').notNull(),
  primaryDiagnosis: text('primary_diagnosis'),
  confidence: real('confidence'),
  fullResponseJson: text('full_response_json'),
  voiceResponseText: text('voice_response_text'),
  latitude: real('latitude'),
  longitude: real('longitude'),
  createdAt: integer('created_at'),
  synced: integer('synced').default(0),
});

export const threatEvents = sqliteTable('threat_events', {
  id: text('id').primaryKey(),
  chwId: text('chw_id').notNull(),
  threatType: text('threat_type').notNull(),
  urgency: text('urgency').notNull(),
  confidence: real('confidence'),
  latitude: real('latitude'),
  longitude: real('longitude'),
  smsDispatched: integer('sms_dispatched').default(0),
  smsRecipients: text('sms_recipients'),
  createdAt: integer('created_at'),
  synced: integer('synced').default(0),
});

export const syncQueue = sqliteTable('sync_queue', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  recordType: text('record_type'),     // 'consultation' | 'threat_event'
  recordId: text('record_id'),
  attempts: integer('attempts').default(0),
  status: text('status').default('pending'),  // 'pending' | 'synced' | 'failed'
  lastAttempt: integer('last_attempt'),
});
```

### Database Initialization

```typescript
// src/db/index.ts
import * as SQLite from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema';

const raw = SQLite.openDatabaseSync('shifa.db');
export const db = drizzle(raw, { schema });

export async function initDB(): Promise<void> {
  await raw.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS chw_profile (
      id TEXT PRIMARY KEY,
      name TEXT,
      country TEXT NOT NULL,
      language TEXT NOT NULL,
      region TEXT,
      alert_recipients TEXT,
      guard_enabled INTEGER DEFAULT 0,
      sync_token TEXT,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS consultations (
      id TEXT PRIMARY KEY,
      chw_id TEXT NOT NULL,
      patient_age_months INTEGER,
      patient_sex TEXT,
      patient_weight_kg REAL,
      muac_cm REAL,
      bilateral_edema INTEGER,
      symptom_text TEXT NOT NULL,
      image_path TEXT,
      decision TEXT NOT NULL,
      primary_diagnosis TEXT,
      confidence REAL,
      full_response_json TEXT,
      voice_response_text TEXT,
      latitude REAL,
      longitude REAL,
      created_at INTEGER,
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS threat_events (
      id TEXT PRIMARY KEY,
      chw_id TEXT NOT NULL,
      threat_type TEXT NOT NULL,
      urgency TEXT NOT NULL,
      confidence REAL,
      latitude REAL,
      longitude REAL,
      sms_dispatched INTEGER DEFAULT 0,
      sms_recipients TEXT,
      created_at INTEGER,
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_type TEXT,
      record_id TEXT,
      attempts INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      last_attempt INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_consultations_synced ON consultations (synced, created_at);
    CREATE INDEX IF NOT EXISTS idx_threats_synced ON threat_events (synced, created_at);
  `);
}
```

---

## 15. Phase 13 — Sync Engine

### Tools Required

| Tool | Purpose |
|---|---|
| `@react-native-community/netinfo` | Detect network type (WiFi / 2G / offline) |
| `expo-task-manager` | Register background task |
| `expo-background-fetch` | Trigger background sync every 15 min |

```bash
pnpm install @react-native-community/netinfo expo-task-manager expo-background-fetch
```

```typescript
// src/sync/syncEngine.ts
import NetInfo from '@react-native-community/netinfo';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { db } from '../db';
import { syncQueue, consultations, threatEvents } from '../db/schema';
import { eq, and, lte } from 'drizzle-orm';

const SYNC_TASK = 'shifa-background-sync';
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL!;
const MAX_RETRY_ATTEMPTS = 5;

TaskManager.defineTask(SYNC_TASK, async () => {
  const net = await NetInfo.fetch();
  if (!net.isConnected) return BackgroundFetch.BackgroundFetchResult.NoData;
  await runSync();
  return BackgroundFetch.BackgroundFetchResult.NewData;
});

export async function registerBackgroundSync(): Promise<void> {
  await BackgroundFetch.registerTaskAsync(SYNC_TASK, {
    minimumInterval: 15 * 60,
    stopOnTerminate: false,
    startOnBoot: true,
  });
}

export async function runSync(): Promise<void> {
  const pending = await db
    .select()
    .from(syncQueue)
    .where(and(
      eq(syncQueue.status, 'pending'),
      lte(syncQueue.attempts, MAX_RETRY_ATTEMPTS)
    ))
    .limit(20);

  for (const item of pending) {
    try {
      let record: Record<string, unknown> | undefined;

      if (item.recordType === 'consultation') {
        const rows = await db.select().from(consultations)
          .where(eq(consultations.id, item.recordId!));
        record = rows[0] as Record<string, unknown>;
      } else if (item.recordType === 'threat_event') {
        const rows = await db.select().from(threatEvents)
          .where(eq(threatEvents.id, item.recordId!));
        record = rows[0] as Record<string, unknown>;
      }

      if (!record) continue;

      const response = await fetch(
        `${BACKEND_URL}/sync/${item.recordType}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(record),
        }
      );

      if (!response.ok) throw new Error(`Sync failed: ${response.status}`);

      await db.update(syncQueue)
        .set({ status: 'synced' })
        .where(eq(syncQueue.id, item.id));

    } catch (e) {
      const newAttempts = (item.attempts ?? 0) + 1;
      await db.update(syncQueue)
        .set({
          attempts: newAttempts,
          lastAttempt: Date.now(),
          status: newAttempts >= MAX_RETRY_ATTEMPTS ? 'failed' : 'pending',
        })
        .where(eq(syncQueue.id, item.id));
    }
  }
}
```

---

## 16. Phase 14 — Referral Card Generator

### Tools Required

| Tool | Purpose |
|---|---|
| `react-native-view-shot` | Screenshot referral card as image |
| `expo-sharing` | Share via any installed app (WhatsApp, BT file share) |
| `expo-print` | Generate PDF for physical printing |

```bash
pnpm install react-native-view-shot expo-sharing expo-print
```

```typescript
// src/components/ReferralCard.tsx
import React, { useRef } from 'react';
import { View, Text } from 'react-native';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import type { ClinicalDecision } from '../engine/decisionParser';

interface Props {
  decision: ClinicalDecision;
  patient: { ageMths?: number; sex?: string; weightKg?: number; muac?: number };
  chw: { name: string; region: string; country: string };
  gps: { lat: number; lng: number };
}

export function ReferralCard({ decision, patient, chw, gps }: Props) {
  const ref = useRef<ViewShot>(null);

  const handleShareImage = async () => {
    const uri = await ref.current?.capture?.();
    if (uri) await Sharing.shareAsync(uri);
  };

  const handleSharePDF = async () => {
    const html = buildReferralHTML(decision, patient, chw, gps);
    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
  };

  return (
    <ViewShot ref={ref} options={{ format: 'jpg', quality: 0.95 }}>
      <View>
        {/* Bilingual header */}
        <Text>✚ SHIFA REFERRAL CARD</Text>
        <Text style={{ color: decision.decision === 'REFER_URGENT' ? '#DC2626' : '#D97706' }}>
          {decision.decision === 'REFER_URGENT' ? 'URGENT REFERRAL' : 'ROUTINE REFERRAL'}
        </Text>

        {/* Patient data */}
        {patient.sex && <Text>Sex: {patient.sex}</Text>}
        {patient.ageMths && <Text>Age: {patient.ageMths} months</Text>}
        {patient.weightKg && <Text>Weight: {patient.weightKg} kg</Text>}
        {patient.muac && <Text>MUAC: {patient.muac} cm</Text>}

        {/* Diagnosis */}
        <Text>Diagnosis: {decision.primary_diagnosis}</Text>
        <Text>Confidence: {Math.round(decision.confidence * 100)}%</Text>

        {/* Pre-referral treatment */}
        {decision.referral?.pre_referral_treatment.map((t, i) => (
          <Text key={i}>• {t}</Text>
        ))}

        {/* Message for facility */}
        {decision.referral?.message_for_facility && (
          <Text>{decision.referral.message_for_facility}</Text>
        )}

        {/* Danger signs en route */}
        {decision.referral?.danger_signs_en_route.map((s, i) => (
          <Text key={i}>⚠ {s}</Text>
        ))}

        {/* Footer */}
        <Text>
          CHW: {chw.name} · {chw.region} · {chw.country}{'\n'}
          GPS: {gps.lat.toFixed(4)}, {gps.lng.toFixed(4)}{'\n'}
          {new Date().toISOString()}
        </Text>
      </View>
    </ViewShot>
  );
}

function buildReferralHTML(
  decision: ClinicalDecision,
  patient: Props['patient'],
  chw: Props['chw'],
  gps: Props['gps']
): string {
  return `
    <!DOCTYPE html>
    <html>
    <body style="font-family: sans-serif; padding: 20px;">
      <h2>✚ SHIFA REFERRAL CARD</h2>
      <p><strong>${decision.decision === 'REFER_URGENT' ? '🔴 URGENT' : '🟡 ROUTINE'}</strong></p>
      <p>Diagnosis: <strong>${decision.primary_diagnosis}</strong></p>
      <p>Patient: ${patient.sex ?? ''}, ${patient.ageMths ?? '?'} months, ${patient.weightKg ?? '?'}kg</p>
      ${patient.muac ? `<p>MUAC: ${patient.muac} cm</p>` : ''}
      <p>Pre-referral: ${decision.referral?.pre_referral_treatment.join(', ') ?? 'None'}</p>
      <p>For facility: ${decision.referral?.message_for_facility ?? ''}</p>
      <hr/>
      <small>CHW: ${chw.name} · ${chw.region} · ${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)} · ${new Date().toISOString()}</small>
    </body>
    </html>
  `;
}
```

---

## 17. Phase 15 — FastAPI Backend

### Tools Required

| Tool | Purpose |
|---|---|
| `fastapi` | API framework |
| `sqlalchemy[asyncio]` + `asyncpg` | Async PostgreSQL ORM |
| `geoalchemy2` | PostGIS spatial types (for DBSCAN) |
| `alembic` | Database migrations |
| `uvicorn` | ASGI server |
| `africastalking` | SMS dispatch |
| `scikit-learn` + `numpy` | DBSCAN outbreak detection |
| Neon | Serverless PostgreSQL with PostGIS |

### services/api/requirements.txt

```txt
fastapi==0.111.0
uvicorn[standard]==0.30.1
sqlalchemy[asyncio]==2.0.30
asyncpg==0.29.0
geoalchemy2==0.14.7
alembic==1.13.1
psycopg2-binary==2.9.9
africastalking==1.2.5
pydantic==2.7.0
python-dotenv==1.0.1
scikit-learn==1.5.0
numpy==1.26.4
```

```python
# services/api/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import sync, outbreaks, guard, facilities

app = FastAPI(title="SHIFA Backend API")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

app.include_router(sync.router, prefix="/sync", tags=["sync"])
app.include_router(outbreaks.router, prefix="/outbreaks", tags=["outbreaks"])
app.include_router(guard.router, prefix="/guard", tags=["guard"])
app.include_router(facilities.router, prefix="/facilities", tags=["facilities"])

@app.get("/health")
def health(): return {"status": "ok", "service": "SHIFA API"}
```

```python
# services/api/routers/sync.py
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from models import Case, ThreatEvent
from database import get_db

router = APIRouter()

@router.post("/consultation")
async def sync_consultation(data: dict, db: AsyncSession = Depends(get_db)):
    case = Case(
        id=data['id'],
        chw_id=data['chw_id'],
        decision=data['decision'],
        primary_diagnosis=data.get('primary_diagnosis'),
        confidence=data.get('confidence'),
        full_json=data,
        location=(
            f"POINT({data['longitude']} {data['latitude']})"
            if data.get('latitude') and data.get('longitude') else None
        ),
        country=data.get('country'),
        case_date=data['created_at'],
    )
    db.add(case)
    await db.commit()
    return {"status": "synced", "id": data['id']}

@router.post("/threat_event")
async def sync_threat(data: dict, db: AsyncSession = Depends(get_db)):
    event = ThreatEvent(
        id=data['id'],
        chw_id=data['chw_id'],
        threat_type=data['threat_type'],
        urgency=data['urgency'],
        confidence=data.get('confidence'),
        location=(
            f"POINT({data['longitude']} {data['latitude']})"
            if data.get('latitude') and data.get('longitude') else None
        ),
        country=data.get('country'),
    )
    db.add(event)
    await db.commit()
    return {"status": "synced"}
```

---

## 18. Phase 16 — Outbreak Detection (DBSCAN)

```python
# services/api/detection/outbreak.py
from sklearn.cluster import DBSCAN
from datetime import datetime
import numpy as np
from typing import List

class OutbreakDetector:

    RULES = {
        "cholera": {
            "diagnoses": ["AWD", "Cholera", "Acute Watery Diarrhea"],
            "min_cases": 5, "radius_km": 3.0, "window_hours": 48,
            "severity": "EPIDEMIC",
        },
        "malnutrition_emergency": {
            "muac_threshold": 11.5,
            "min_cases": 10, "radius_km": 5.0, "window_hours": 168,
            "severity": "NUTRITION_EMERGENCY",
        },
        "measles": {
            "diagnoses": ["Measles"],
            "min_cases": 3, "radius_km": 10.0, "window_hours": 336,
            "severity": "DISEASE_CLUSTER",
        },
        "mpox": {
            "diagnoses": ["Mpox", "Monkeypox"],
            "min_cases": 2, "radius_km": 5.0, "window_hours": 336,
            "severity": "DISEASE_CLUSTER",
        },
        "meningitis": {
            # Nigeria Meningitis Belt — lower threshold
            "diagnoses": ["Meningitis", "Meningococcal"],
            "min_cases": 2, "radius_km": 5.0, "window_hours": 168,
            "severity": "EPIDEMIC",
        },
    }

    def detect(self, cases: List[dict]) -> List[dict]:
        alerts = []
        for condition_name, rule in self.RULES.items():
            matching = self._filter_cases(cases, rule)
            if len(matching) < rule['min_cases']:
                continue

            coords = np.array([[c['lat'], c['lng']] for c in matching])
            eps = rule['radius_km'] / 111.0  # km to degrees

            labels = DBSCAN(
                eps=eps, min_samples=rule['min_cases']
            ).fit_predict(coords)

            for cluster_id in set(labels) - {-1}:
                cluster = [c for c, l in zip(matching, labels) if l == cluster_id]
                times = [datetime.fromisoformat(c['case_date']) for c in cluster]
                time_span = (max(times) - min(times)).total_seconds() / 3600

                if time_span <= rule['window_hours']:
                    alerts.append({
                        "condition": condition_name,
                        "severity": rule['severity'],
                        "case_count": len(cluster),
                        "radius_km": rule['radius_km'],
                        "center_lat": float(np.mean([c['lat'] for c in cluster])),
                        "center_lng": float(np.mean([c['lng'] for c in cluster])),
                        "first_case": min(times).isoformat(),
                        "country": cluster[0].get('country', 'Unknown'),
                    })

        return alerts

    def _filter_cases(self, cases: List[dict], rule: dict) -> List[dict]:
        result = []
        for c in cases:
            if 'diagnoses' in rule:
                if any(d.lower() in c.get('primary_diagnosis', '').lower()
                       for d in rule['diagnoses']):
                    result.append(c)
            elif 'muac_threshold' in rule:
                muac = c.get('muac_cm')
                if muac and muac < rule['muac_threshold']:
                    result.append(c)
        return result
```

---

## 19. Phase 17 — Coordinator Dashboard (Next.js)

### Tools Required

| Tool | Purpose |
|---|---|
| Next.js 14 (App Router) | Dashboard framework |
| Mapbox GL JS | Case + threat event map with PostGIS GeoJSON |
| Recharts | Trend charts |
| Supabase Auth | NGO coordinator login |
| `swr` | Data fetching + 30s auto-revalidation |

```bash
cd apps/dashboard/
npx create-next-app@latest . --typescript --tailwind --app
pnpm install mapbox-gl recharts @supabase/supabase-js swr
```

```typescript
// apps/dashboard/app/page.tsx
'use client';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function Dashboard() {
  const { data: cases } = useSWR('/api/cases', fetcher, { refreshInterval: 30_000 });
  const { data: threats } = useSWR('/api/threats', fetcher, { refreshInterval: 10_000 });
  const { data: alerts } = useSWR('/api/outbreaks', fetcher, { refreshInterval: 60_000 });

  return (
    <div className="h-screen bg-gray-950 flex flex-col">
      <header className="bg-green-900 text-white px-6 py-3 flex justify-between">
        <span className="font-bold text-lg">SHIFA · Coordinator Dashboard</span>
        <span className="text-green-300 text-sm">Live · Auto-refresh</span>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1">
          {/* Map: cases, threats, outbreak clusters */}
        </div>
        <div className="w-80 bg-gray-900 border-l border-gray-700 overflow-y-auto p-4">
          {/* Outbreak alerts, CHW activity, threat timeline */}
        </div>
      </div>
    </div>
  );
}
```

```typescript
// apps/dashboard/app/api/outbreaks/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  const backend = process.env.BACKEND_URL;
  const res = await fetch(`${backend}/outbreaks/current`);
  const data = await res.json();
  return NextResponse.json(data);
}
```

---

## 20. Phase 18 — EAS Build & Deployment

### Build Commands

```bash
# Development APK — includes all native modules, Metro hot reload
eas build --platform android --profile development

# Production APK — for submission download link
eas build --platform android --profile production

# Check build status
eas build:list

# Download latest APK
eas build:download --platform android

# Install on device
adb install path/to/shifa.apk
```

### Backend — Railway

```bash
npm install -g @railway/cli
railway login
railway init

# Set production environment variables
railway variables set AT_USERNAME=your_at_username
railway variables set AT_API_KEY=your_at_api_key
railway variables set DATABASE_URL=your_neon_postgres_connection_string

# Deploy
railway up

# Get public URL
railway domain
```

### Dashboard — Vercel

```bash
cd apps/dashboard/
vercel deploy --prod

# Set in Vercel dashboard:
# NEXT_PUBLIC_BACKEND_URL = https://your-app.railway.app
# NEXT_PUBLIC_MAPBOX_TOKEN = your_mapbox_token
# SUPABASE_URL = your_supabase_project_url
# SUPABASE_ANON_KEY = your_supabase_anon_key
```

### Database — Neon PostgreSQL

```bash
# 1. Create project at neon.tech (free tier)
# 2. Copy connection string → set as DATABASE_URL in Railway

# 3. Enable PostGIS
psql $DATABASE_URL -c "CREATE EXTENSION IF NOT EXISTS postgis;"

# 4. Run Alembic migrations
cd services/api/
alembic upgrade head

# 5. Seed demo data for demo
python scripts/seed_demo_data.py
```

---

## 21. Phase 19 — Demo Preparation

### Pre-Demo Verification Checklist

```bash
# 1. Airplane mode — full offline flow
# Enable airplane mode on physical Android device
# Open SHIFA → select Nigeria → Hausa
# Speak symptom in Hausa → get clinical decision
# Verify: response in Hausa voice, full offline, < 60 seconds

# 2. Sudan Arabic round-trip
# Select Sudan → Arabic
# Speak: child, female, 18 months, bilateral edema, MUAC 10.4cm
# Expected: REFER_URGENT, SAM complicated, Arabic voice response

# 3. DRC mpox photo
# Select DRC → Lingala/French
# Photograph test rash image
# Expected: Mpox classification with confidence, isolation protocol

# 4. Kinyarwanda voice
# Select DRC → Kinyarwanda
# Speak any symptom in Kinyarwanda
# Expected: response in Kinyarwanda voice

# 5. SHIFA Guard SMS
adb push test_assets/threat_video_clip.mp4 /sdcard/Download/
# Show clip to camera → threat detected → SMS arrives on test phone
# Must arrive within 30 seconds

# 6. Backend seeded data
python scripts/seed_demo_data.py
# Creates: 6 cholera cases Darfur, 3 meningitis cases Borno Nigeria,
#          3 threat events DRC

# 7. Dashboard outbreak alert
open https://shifa-dashboard.vercel.app
# Cholera cluster in Sudan should show red alert
# Meningitis cluster in Nigeria should show epidemic alert
# Threat event map should show DRC events

# 8. Verify APK is downloadable
eas build:download --platform android
# Confirm fresh install works on a clean device
```

### Demo Data Seeder

```python
# scripts/seed_demo_data.py
import requests
import random
from datetime import datetime, timedelta

BACKEND = "https://your-api.railway.app"

# Sudan: 6 cholera cases near Zalingei, Darfur
for i in range(6):
    requests.post(f"{BACKEND}/sync/consultation", json={
        "id": f"demo-cholera-sudan-{i}",
        "chw_id": "demo-chw-sd-01",
        "decision": "REFER_URGENT",
        "primary_diagnosis": "Cholera",
        "confidence": 0.88,
        "latitude": -12.9 + random.uniform(-0.02, 0.02),
        "longitude": 23.4 + random.uniform(-0.02, 0.02),
        "country": "Sudan",
        "case_date": (datetime.utcnow() - timedelta(hours=i*6)).isoformat(),
        "created_at": int(datetime.utcnow().timestamp()),
    })

# Nigeria: 3 meningitis cases near Maiduguri, Borno
for i in range(3):
    requests.post(f"{BACKEND}/sync/consultation", json={
        "id": f"demo-mening-ng-{i}",
        "chw_id": "demo-chw-ng-01",
        "decision": "REFER_URGENT",
        "primary_diagnosis": "Meningitis",
        "confidence": 0.91,
        "latitude": 11.85 + random.uniform(-0.02, 0.02),
        "longitude": 13.16 + random.uniform(-0.02, 0.02),
        "country": "Nigeria",
        "case_date": (datetime.utcnow() - timedelta(hours=i*12)).isoformat(),
        "created_at": int(datetime.utcnow().timestamp()),
    })

# DRC: 3 threat events near Goma, North Kivu
for i in range(3):
    requests.post(f"{BACKEND}/sync/threat_event", json={
        "id": f"demo-threat-drc-{i}",
        "chw_id": "demo-chw-drc-01",
        "threat_type": "ARMED_INDIVIDUALS",
        "urgency": "HIGH",
        "confidence": 0.82,
        "latitude": -1.67 + random.uniform(-0.01, 0.01),
        "longitude": 29.22 + random.uniform(-0.01, 0.01),
        "country": "DRC",
        "created_at": int(datetime.utcnow().timestamp()),
    })

print("Demo data seeded.")
print("Outbreak alerts will fire: Cholera (Sudan), Meningitis (Nigeria)")
print("Threat events will appear on map: DRC North Kivu")
```

---

## 22. Tools Master Reference

### Mobile App

| Tool | Version | Purpose | Install | Prize Track |
|---|---|---|---|---|
| Expo SDK | 51+ | React Native framework | `npx create-expo-app` | — |
| `expo-dev-client` | Latest | Custom native APK | `pnpm install expo-dev-client` | All (required for native) |
| `eas-cli` | Latest | Cloud builds | `npm i -g eas-cli` | — |
| `com.google.mediapipe:tasks-genai` | 0.10.20 | **LiteRT LLM inference** | Gradle | **LiteRT Prize** |
| `com.google.mediapipe:tasks-core` | 0.10.20 | LiteRT core | Gradle | LiteRT Prize |
| `org.tensorflow:tensorflow-lite` | 2.14.0 | YOLO-NAS runtime | Gradle | Global Resilience |
| `org.tensorflow:tensorflow-lite-task-audio` | 0.4.4 | YAMNet runtime | Gradle | Global Resilience |
| `llama.rn` | Latest | GGUF fallback only | `pnpm install llama.rn` | LiteRT Prize (documented fallback) |
| `whisper.rn` | Latest | Offline STT, 6 languages | `pnpm install whisper.rn` | Digital Equity |
| `@react-native-voice/voice` | Latest | Online STT via Android | `pnpm install @react-native-voice/voice` | Digital Equity |
| Coqui TTS (Kotlin JNI) | Latest | Offline TTS, 6 languages | Custom native module | Digital Equity |
| `expo-sqlite` | Latest | Offline database | `pnpm install expo-sqlite` | Global Resilience |
| `drizzle-orm` | Latest | Type-safe SQL | `pnpm install drizzle-orm` | — |
| `expo-camera` | Latest | Photo capture + Guard frames | `pnpm install expo-camera` | Health + Guard |
| `expo-image-manipulator` | Latest | Image resize for multimodal | `pnpm install expo-image-manipulator` | Health |
| `expo-file-system` | Latest | Model file storage | `pnpm install expo-file-system` | — |
| `expo-location` | Latest | GPS tagging | `pnpm install expo-location` | Global Resilience |
| `expo-av` | Latest | Audio recording for STT/YAMNet | `pnpm install expo-av` | Digital Equity + Guard |
| `expo-sharing` | Latest | Share referral cards | `pnpm install expo-sharing` | Health |
| `expo-print` | Latest | Referral card PDF | `pnpm install expo-print` | Health |
| `expo-haptics` | Latest | Tactile feedback | `pnpm install expo-haptics` | — |
| `expo-secure-store` | Latest | Encrypted AT API key | `pnpm install expo-secure-store` | Safety |
| `expo-background-fetch` | Latest | Background sync | `pnpm install expo-background-fetch` | Global Resilience |
| `expo-task-manager` | Latest | Background task registry | `pnpm install expo-task-manager` | Global Resilience |
| `react-native-ble-plx` | Latest | Bluetooth mesh alerts | `pnpm install react-native-ble-plx` | Global Resilience |
| `react-native-view-shot` | Latest | Referral card screenshot | `pnpm install react-native-view-shot` | Health |
| `@react-navigation/native` | Latest | Screen navigation | `pnpm install @react-navigation/native` | — |
| `@react-navigation/stack` | Latest | Stack navigator | `pnpm install @react-navigation/stack` | — |
| `react-native-gesture-handler` | Latest | Hold-to-speak gesture | `pnpm install react-native-gesture-handler` | Digital Equity |
| `@react-native-community/netinfo` | Latest | Network type detection | `pnpm install @react-native-community/netinfo` | Global Resilience |
| `@react-native-async-storage/async-storage` | Latest | Settings persistence | `pnpm install @react-native-async-storage/async-storage` | — |
| `zod` | Latest | Schema validation | `pnpm install zod` | Safety |

### ML Pipeline (GPU Machine)

| Tool | Purpose | Install |
|---|---|---|
| `unsloth` | **QLoRA fine-tuning (Unsloth Prize)** | `pip install unsloth` |
| `transformers` | HuggingFace model loading | `pip install transformers` |
| `datasets` | Training data | `pip install datasets` |
| `trl` | SFTTrainer | `pip install trl` |
| `pdfplumber` | PDF text extraction | `pip install pdfplumber` |
| `ai-edge-torch` | **LiteRT export** | `pip install ai-edge-torch` |
| `torch` | PyTorch | `pip install torch` |
| `accelerate` | Training acceleration | `pip install accelerate` |
| `bitsandbytes` | QLoRA quantization | `pip install bitsandbytes` |

### Backend

| Tool | Purpose |
|---|---|
| `fastapi` | API framework |
| `uvicorn[standard]` | ASGI server |
| `sqlalchemy[asyncio]` | Async ORM |
| `asyncpg` | PostgreSQL async driver |
| `geoalchemy2` | PostGIS spatial types |
| `alembic` | Migrations |
| `scikit-learn` | **DBSCAN outbreak detection** |
| `numpy` | Spatial math |
| `africastalking` | **SMS dispatch API** |

### Dashboard

| Tool | Purpose |
|---|---|
| Next.js 14 | Framework |
| Mapbox GL JS | Case + threat map |
| Recharts | Trend charts |
| Supabase Auth | Coordinator login |
| `swr` | Data fetching |

### External Services

| Service | Purpose | Cost |
|---|---|---|
| expo.dev | EAS Build | Free |
| Neon (neon.tech) | PostgreSQL | Free tier |
| Railway (railway.app) | Backend hosting | $5/mo |
| Vercel (vercel.com) | Dashboard | Free |
| Cloudflare R2 | Model file hosting | Free (10GB) |
| Africa's Talking | SMS API | $5 (~2,500 SMS) |
| Mapbox | Map tiles | Free (50k loads/mo) |
| HuggingFace | Model download | Free |
| Google Colab Pro / Vast.ai | Fine-tuning GPU | ~$10–15 |

---

## 23. Day-by-Day Build Schedule

```
DAY 1 — Foundation
  ☐ npx expo prebuild --platform android
  ☐ pnpm install all mobile dependencies
  ☐ Write MediaPipeLLMModule.kt + MediaPipeLLMPackage.kt
  ☐ Register in MainApplication.kt
  ☐ Configure android/app/build.gradle with MediaPipe + TFLite deps
  ☐ eas build --profile development (submit to EAS, ~15 min)
  ☐ While building: write llamaEngine.ts (fast path for Day 1 testing)
  ☐ Install dev APK on physical device via adb
  ☐ Smoke test: llama.rn loads GGUF model, returns response
  MILESTONE: Gemma 4 responding offline on physical Android device ✓

DAY 2 — LiteRT Bridge + Model Router
  ☐ Test MediaPipeLLMModule.kt end-to-end with a test prompt
  ☐ Write litertEngine.ts TypeScript bridge
  ☐ Write modelRouter.ts with E2B/E4B routing + logging
  ☐ Write promptBuilder.ts (all 4 countries, 6 languages)
  ☐ Write decisionParser.ts with Zod + danger sign override
  ☐ Smoke test: Sudan clinical prompt → ClinicalDecision JSON via LiteRT
  MILESTONE: LiteRT inference + model routing working ✓

DAY 3 — Unsloth Fine-Tuning (GPU)
  ☐ Set up Colab Pro / Vast.ai A100
  ☐ Install ml/requirements.txt
  ☐ Run prepare_data.py on WHO IMCI + Sphere + MSF PDFs
  ☑ Generate 2,000 synthetic cases (4 countries × 7 conditions, 6 languages incl. Hausa)
  ☐ Start finetune_unsloth.py (runs ~4 hours)
  ☐ While fine-tuning: write all 4 protocol JSON files (Sudan, DRC, Somalia, Nigeria)
  ☐ Write protocols/index.ts loader
  MILESTONE: Fine-tuning running, protocol modules complete ✓

DAY 4 — Validate + Convert + Upload
  ☐ Run validate.py on 60 held-out cases (>88% decision accuracy target)
  ☐ Record validation metrics for Unsloth Prize write-up
  ☐ Run convert_litert.py → .tflite
  ☐ Upload .tflite + GGUF to Cloudflare R2
  ☐ Write modelManager.ts (download + verify on first launch)
  ☐ Write initDB.ts + all SQLite tables
  ☐ Test model download flow on physical device
  MILESTONE: Fine-tuned LiteRT model on physical device ✓

DAY 5 — Voice Pipeline
  ☐ Install whisper.rn + @react-native-voice/voice + expo-av
  ☐ Build CoquiTTSModule.kt + CoquiTTSPackage.kt
  ☐ Write stt.ts (online Android + offline Whisper routing, 6 languages)
  ☐ Write tts.ts (Coqui 6 languages)
  ☐ Download Whisper small models: ar, so, fr, rw, ha
  ☐ Download Coqui TTS models: ar, so, fr, rw, ha
  ☐ eas build (new APK with Coqui native module)
  ☐ Test Arabic STT + TTS round-trip on device
  ☐ Test Hausa STT + TTS round-trip on device
  ☐ Test Kinyarwanda STT + TTS
  MILESTONE: All 6 language voice round-trips verified on device ✓

DAY 6 — Sudan + Nigeria Clinical Engine
  ☐ Wire clinical engine end-to-end (Sudan module complete)
  ☐ Test all 7 Sudan conditions manually with Arabic voice
  ☐ Build Nigeria module (Hausa) — all 7 conditions incl. meningitis
  ☐ Test meningitis protocol in Hausa — neck stiffness → REFER_URGENT
  ☐ Drug dose calculator verified (AL by weight, ORS by dehydration grade)
  ☐ MUAC interpretation verified (thresholds by age + edema)
  ☐ Danger sign override logic verified (all universal signs)
  ☐ Referral card component + share working
  MILESTONE: Arabic Sudan + Hausa Nigeria clinical engine complete ✓

DAY 7 — SHIFA Guard Visual + Audio
  ☐ Write GuardModule.kt (YOLO-NAS TFLite)
  ☐ Write GuardPackage.kt + register
  ☐ Write AudioGuardModule.kt (YAMNet)
  ☐ Write AudioGuardPackage.kt + register
  ☐ eas build (new APK with Guard modules)
  ☐ Download YAMNet .tflite from TFHub
  ☐ Download / train YOLO-NAS nano .tflite (threat classes)
  ☐ Write ThreatConfirmationEngine.ts
  ☐ Test: show weapon image to camera → detection fires
  ☐ Test: play gunshot audio → YAMNet fires AudioThreat event
  MILESTONE: On-device visual + audio threat detection working ✓

DAY 8 — SHIFA Guard Alerts
  ☐ Set up Africa's Talking account + sandbox
  ☐ Write FastAPI guard router (routers/guard.py)
  ☐ Write smsAlert.ts (mobile → backend)
  ☐ Write directSMSFallback.ts (2G direct to AT API)
  ☐ Store AT credentials in expo-secure-store
  ☐ Write bluetoothMesh.ts
  ☐ End-to-end test: threat detected → SMS arrives on second phone
  ☐ Verify: SMS arrives within 30 seconds over 2G
  MILESTONE: SMS alert dispatched and received under 30 seconds ✓

DAY 9 — DRC + Somalia + All Languages
  ☐ Build DRC protocol module + mpox photo classification
  ☐ Test mpox rash photo → isolation protocol in Lingala/French
  ☐ Build Somalia protocol module + Somali voice complete
  ☐ Test all 7 Somalia conditions
  ☐ Verify Kinyarwanda voice in DRC module (cross-border refugees)
  ☐ Test all 7 DRC conditions
  MILESTONE: All 4 country modules + 6 languages complete ✓

DAY 10 — Offline Sync + Photo Analysis
  ☐ Write syncEngine.ts + background sync registration
  ☐ Test: log case offline → find WiFi → case appears on backend
  ☐ Test: log threat offline → sync → appears in dashboard
  ☐ Wire photo analysis to multimodal prompt (E4B always)
  ☐ Test MUAC tape photo read on DRC module
  ☐ Verify all 4 country modules sync correctly to backend
  *** FEATURE FREEZE END OF DAY 10 ***
  MILESTONE: Offline sync verified, multimodal photo confirmed ✓

DAY 11 — React Native App Navigation
  ☐ Wire AppNavigator.tsx (14 screens)
  ☐ Country/Language selection screen → country module loaded
  ☐ Model download screen (first launch)
  ☐ Main consultation screen (hold-to-speak, photo button, patient fields)
  ☐ Processing screen (token streaming)
  ☐ Decision result screen (color-coded, voice playback, referral card)
  ☐ SHIFA Guard toggle screen (enable/disable, recipient config)
  ☐ Threat detected screen (urgency, SMS status, BLE relay status)
  ☐ Cases log screen (offline case history)
  ☐ Settings screen
  ☐ Full end-to-end flow on physical device: onboard → consult → decision → log
  MILESTONE: Complete app navigation, all screens wired ✓

DAY 12 — FastAPI Backend + DBSCAN
  ☐ Write all FastAPI routes (sync, outbreaks, guard, facilities)
  ☐ Set up Neon PostgreSQL + PostGIS extension
  ☐ Run alembic migrations
  ☐ Write OutbreakDetector.py with all 5 condition rules (incl. meningitis)
  ☐ Write seed_demo_data.py (Sudan cholera + Nigeria meningitis + DRC threats)
  ☐ Seed demo data
  ☐ Deploy to Railway
  ☐ Test: POST consultation → GET outbreaks returns cluster alert
  MILESTONE: Backend live, DBSCAN outbreak detection running ✓

DAY 13 — Coordinator Dashboard
  ☐ Build Next.js dashboard (case map + threat map + alerts sidebar)
  ☐ Wire Mapbox with case GeoJSON + threat event layer
  ☐ Outbreak alerts sidebar (Sudan cholera + Nigeria meningitis both visible)
  ☐ CHW activity panel
  ☐ Test: seeded cholera cluster fires red EPIDEMIC alert
  ☐ Test: seeded meningitis cluster fires EPIDEMIC alert (Nigeria)
  ☐ Deploy to Vercel
  MILESTONE: Dashboard live, all alerts visible, maps populated ✓

DAY 14 — Demo + Submit
  ☐ Practice demo video 3 times (time each to <3 minutes)
  ☐ Record demo video on physical device in airplane mode
  ☐ Verify: Arabic Sudan consultation offline
  ☐ Verify: Hausa Nigeria consultation offline (new — highlight in video)
  ☐ Verify: DRC mpox photo analysis offline
  ☐ Verify: SHIFA Guard SMS on second phone
  ☐ Verify: Dashboard outbreak alerts for Sudan + Nigeria
  ☐ Write README with architecture diagram
  ☐ Document prize track evidence in README (LiteRT, Unsloth, Cactus, 6 languages)
  ☐ Confirm APK downloadable from EAS link
  ☐ Submit to Kaggle before 11:59 PM
  DONE ✓
```

---

## 24. Feature & Prize Track Checklist

This checklist is the submission QA gate. Every item must be checked before May 18. No placeholders. No "will add later."

---

### 🏆 Prize Track Verification

#### LiteRT Prize ($10,000)
- [ ] `com.google.mediapipe:tasks-genai:0.10.20` is in `android/app/build.gradle` dependencies
- [ ] `MediaPipeLLMModule.kt` written, compiled, and registered in `MainApplication.kt`
- [ ] `LiteRTEngine.init()` called with actual `.bin` model path (not GGUF)
- [ ] `LiteRTEngine.stream()` produces streaming tokens on physical device
- [ ] Demo video shows Gemma 4 inference via LiteRT (not llama.rn) with airplane mode ON
- [ ] README explicitly states LiteRT is the primary runtime
- [ ] llama.rn is documented as fallback/development path only

#### Unsloth Prize ($10,000)
- [x] `unsloth` installed and `FastLanguageModel.from_pretrained("google/gemma-4-e4b-it")` runs on Kaggle T4 x2
- [x] `finetune_unsloth.py` completes without error and uploads adapter artifacts to R2
- [x] `validate.py` reports guarded decision accuracy >88% on 60-case test set
- [x] Validation metrics table documented in `ml/README.md`
- [ ] `convert_litert.py` produces `.tflite` file successfully
- [ ] Fine-tuned `.tflite` is the model loaded on device (not base Gemma 4)
- [x] Training data sources cited (WHO IMCI, Sphere, MSF — all public)

#### Cactus Prize ($10,000)
- [ ] `assessComplexity()` in `modelRouter.ts` routes E2B vs E4B correctly
- [ ] Simple queries (single symptom, known condition) → E2B confirmed in logs
- [ ] Complex queries (image + multi-symptom + vulnerable age) → E4B confirmed
- [ ] Routing decisions logged to AsyncStorage with timestamps
- [ ] Router stats table included in submission write-up
- [ ] Both E2B and E4B `.bin` models are downloaded and initialized

#### Health & Sciences Track ($10,000)
- [ ] All 7 Sudan conditions produce correct TREAT/REFER/MONITOR decisions
- [ ] All 7 DRC conditions produce correct decisions
- [ ] All 7 Somalia conditions produce correct decisions
- [ ] All 7 Nigeria conditions produce correct decisions (incl. meningitis)
- [ ] MUAC thresholds correctly interpreted (SAM: <11.5cm, MAM: 11.5–12.5cm)
- [ ] Bilateral edema forces SAM complicated → REFER_URGENT
- [ ] Universal danger sign override verified (convulsions, lethargic, unable to feed)
- [ ] Low confidence (<0.70) override to REFER_URGENT verified
- [ ] Drug doses require age + weight confirmation (no dose without both)
- [ ] Referral card generates for every REFER decision
- [ ] WHO IMCI protocols cited in README

#### Global Resilience Track ($10,000)
- [ ] Full consultation works with airplane mode ON on physical device
- [ ] SHIFA Guard: YOLO-NAS detects visual threat on physical camera
- [ ] SHIFA Guard: YAMNet detects gunshot audio on physical microphone
- [ ] SMS dispatched via Africa's Talking within 30 seconds
- [ ] SMS delivered to test phone with correct GPS coordinates
- [ ] Bluetooth mesh alert broadcast to second nearby SHIFA device
- [ ] Offline case logging to SQLite works without network
- [ ] Background sync uploads when WiFi found
- [ ] Coordinator dashboard shows synced cases on map
- [ ] DBSCAN outbreak alert fires for seeded cholera cluster (Sudan)
- [ ] DBSCAN outbreak alert fires for seeded meningitis cluster (Nigeria)

#### Digital Equity & Inclusivity Track ($10,000)
- [ ] Arabic (ar) — Sudan: STT ✓, TTS ✓, clinical decision ✓, on-device offline ✓
- [ ] Somali (so) — Somalia: STT ✓, TTS ✓, clinical decision ✓, on-device offline ✓
- [ ] French (fr) — DRC: STT ✓, TTS ✓, clinical decision ✓, on-device offline ✓
- [ ] Lingala (ln) — DRC: STT (French whisper + glossary) ✓, TTS (French Coqui) ✓
- [ ] Kinyarwanda (rw) — Rwanda/DRC: STT ✓ (Whisper native), TTS ✓ (Coqui)
- [ ] **Hausa (ha) — N.Nigeria/Niger: STT ✓ (Whisper native), TTS ✓ (Coqui ha/openbible/vits)**
- [ ] Nigeria Hausa module complete (7 conditions incl. meningitis)
- [ ] Whisper small models for all 6 languages downloaded to device
- [ ] Coqui TTS models for all 6 languages downloaded to device
- [ ] E4B target documented: recent high-end Android with 8GB+ RAM and 3-4GB free model storage
- [ ] E2B/small-model fallback documented for mid-range 4-6GB Android devices
- [ ] Low-end `$50` Android documented as deterministic-protocol/server-fallback only until distillation is validated

#### Safety & Trust Track ($10,000)
- [ ] `reasoning_trace` field populated in every ClinicalDecision output
- [ ] `confidence` score displayed on every decision
- [ ] Danger sign override logic documented and tested
- [ ] Low confidence override documented and tested
- [ ] SHIFA Guard privacy architecture documented (no raw video/audio stored/transmitted)
- [ ] Guard is opt-in — requires explicit CHW enable during onboarding
- [ ] Alert recipients configured by CHW only (not preset)
- [ ] Explainability: every REFER decision includes `referral.message_for_facility`
- [ ] AT API key stored in encrypted `expo-secure-store` (not bundled in APK)

---

### 🔧 Technical Completeness

#### Native Modules (all must be in MainApplication.kt)
- [x] Generate native Android project with `npx expo prebuild --platform android`
- [x] Add `expo-dev-client`; Expo Go cannot load LiteRT/Kotlin modules
- [ ] Produce and install a custom APK on a physical Android device
- [x] Add Gradle dependency for `com.google.mediapipe:tasks-genai`
- [x] `ShifaLiteRTPackage` — native LiteRT LLM package registered in `MainApplication.kt`
- [x] `ShifaLiteRTModule.kt` loads the local SHIFA runtime model artifact and exposes `init`, `generate`, `sizeInTokens`, `isReady`, and `close` to React Native
- [x] TypeScript `litertEngine.ts` calls the native module and falls back when the native runtime/artifact is unavailable
- [ ] Add streaming token callback support after APK smoke test confirms base `generate` path
- [ ] `GuardPackage` — YOLO-NAS visual detection
- [ ] `AudioGuardPackage` — YAMNet audio
- [ ] `CoquiTTSPackage` — Coqui TTS 6 languages
- [x] `react-native-ble-plx` package auto-linked via prebuild

#### Native LiteRT Blocker To Clear Next
- [ ] Export or obtain a LiteRT-LM compatible SHIFA clinical artifact; the current R2 upload is a LoRA adapter bundle, not yet a standalone mobile LiteRT runtime package
- [ ] Decide runtime artifact format: `.litertlm` preferred; `.tflite` only if Gemma 4 E4B export succeeds cleanly
- [ ] Validate the artifact on a physical 8GB+ Android device in airplane mode
- [ ] Run the 60-case validation set through the APK and compare against Kaggle metrics before claiming offline Gemma 4 inference

#### Model Files (all must download and verify on first launch)
- [ ] `shifa-gemma4-e4b-finetuned.litertlm` or `.tflite` — LiteRT E4B fine-tuned, benchmarked on 8GB+ Android
- [ ] `shifa-gemma4-e2b.litertlm` or `.tflite` — LiteRT E2B/small-model fallback for 4-6GB Android
- [ ] MTP/speculative decoding drafter assets included where supported by LiteRT-LM
- [ ] `yolo-nas-nano-threat.tflite` (~12MB) — SHIFA Guard visual
- [ ] `yamnet.tflite` (~3MB) — SHIFA Guard audio
- [ ] `whisper-small-ar.bin`, `so.bin`, `fr.bin`, `rw.bin`, `ha.bin` (~350MB each)
- [ ] `tts_ar.bin`, `so.bin`, `fr.bin`, `rw.bin`, `ha.bin` + configs (~80MB each)
- [ ] All models hosted on Cloudflare R2 with correct public URLs
- [ ] `modelManager.ts` downloads + verifies each model with progress callback

#### Database
- [ ] `initDB()` creates all 4 tables on first launch
- [ ] `consultations` table stores full `ClinicalDecision` JSON
- [ ] `threat_events` table stores GPS + type + recipients
- [ ] `sync_queue` table populates on every new record
- [ ] Background sync retries up to 5 times before marking failed
- [ ] WAL journal mode enabled for concurrent access

#### Backend
- [ ] `/sync/consultation` endpoint accepts + persists consultation records
- [ ] `/sync/threat_event` endpoint accepts + persists threat records
- [ ] `/outbreaks/current` returns active DBSCAN clusters
- [ ] `/guard/alert` dispatches SMS via Africa's Talking
- [ ] PostGIS spatial index on `cases.location` and `threat_events.location`
- [ ] All 5 DBSCAN rules operational (cholera, malnutrition, measles, mpox, meningitis)
- [ ] Alembic migrations run cleanly on fresh Neon instance
- [ ] Railway deployment health check returns 200

#### Dashboard
- [ ] Mapbox map loads with case points and threat event points
- [ ] Outbreak alerts appear in sidebar when DBSCAN clusters fire
- [ ] Data refreshes every 30s (cases) / 10s (threats) / 60s (outbreaks)
- [ ] Vercel deployment accessible via public URL

---

### 🎥 Demo Video Requirements
- [ ] Opens with personal story (Rwanda, eastern Congo border, Hausa communities)
- [ ] Arabic consultation shown with airplane mode visible in status bar
- [ ] **Hausa consultation shown** (new — highlight Northern Nigeria crisis)
- [ ] DRC mpox photo analysis shown
- [ ] Kinyarwanda voice shown (minimum 10 seconds)
- [ ] SHIFA Guard: threat detected → SMS arrives on second phone (on camera)
- [ ] Coordinator dashboard: outbreak alert shown for Sudan cholera cluster
- [ ] Coordinator dashboard: outbreak alert shown for Nigeria meningitis cluster (new)
- [ ] Recorded on physical Android device (no emulator, no screen recording simulator)
- [ ] Audio clear, no background noise, runtime under 3 minutes

---

### 📦 Repository Requirements
- [ ] Public GitHub: `shifa-health`
- [ ] Architecture diagram in README (updated for 4 countries, 6 languages)
- [ ] `protocols/nigeria_north.json` committed
- [x] ML training scripts committed with comments
- [x] Validation results table documented in `ml/README.md`
- [ ] `CC-BY 4.0` LICENSE file present
- [ ] `.gitignore` excludes `assets/models/` (model files not committed)
- [ ] Setup runnable in <10 minutes from README
- [ ] APK download link from EAS in README

---

*SHIFA Implementation Guide v3.0*
*Mist Labs | Kigali, Rwanda*
*For the people the world forgot to heal.*
*And for the people in the north — yan arewa — who the world is forgetting now.*
