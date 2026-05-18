# SHIFA — AI Clinical Assistant for Humanitarian Crisis Settings

> Built for community health workers in Sudan, DRC, Somalia, Nigeria, and Rwanda —
> because a wrong triage call in a displacement camp costs a child's life.

**SHIFA** comes from the Arabic word **شفاء** (*shifa*), meaning *healing*.

**Offline-capable clinical decision support for crisis settings, with 100% urgent recall in validation and deterministic WHO/IMCI safety guardrails.**

---

## The Problem

Community health workers in crisis settings make life-or-death decisions with almost nothing. No doctor nearby. No reliable power. Internet that drops in and out, if it exists at all.

The wrong call — keeping a child home who needed urgent referral, or sending someone on a dangerous journey they didn't need — has real consequences. SHIFA exists to give that CHW one more reliable tool.

**What makes SHIFA different:**

- Fine-tuned Gemma 4 E2B runs fully offline on Android after setup — no cloud dependency for clinical decisions.
- Two-layer safety architecture: learned model reasoning plus deterministic WHO/IMCI guardrails that model output cannot override.
- Built for the actual field: six languages, five crisis-country contexts, physical Android offline smoke testing, SMS/BLE Guard relay, and dashboard outbreak monitoring.

---

## What It Does

### Clinical Triage

The CHW speaks or types symptoms. SHIFA listens — in Arabic, Somali, French, Lingala, Kinyarwanda, or Hausa — runs a fine-tuned Gemma 4 model on the device, and gives a clear answer: treat at home, refer routinely, or refer urgently right now. The result is read aloud in the CHW's language, using the closest local or regional voice available on the device so the guidance sounds familiar and easy to understand.

When the models are downloaded, this runs with no internet at all. When they're not, it falls back to Gemini API. Case data syncs to a coordinator dashboard whenever connectivity returns.

### SHIFA Guard

If a CHW encounters a threat in the field, Guard lets them capture photo or video evidence. The offline detector analyzes still images for visible weapons and armed individuals, while Gemini fallback handles richer scene context such as checkpoints or convoy-like situations when connectivity is available. If a threat is confirmed, SHIFA attaches GPS coordinates, queues an SMS alert to saved coordinator numbers via Africa's Talking, logs the event locally, and attempts a Bluetooth mesh relay to other nearby SHIFA devices — so the alert can still propagate even without a cell signal.

Guard also publishes and downloads a compact offline firearm detector (`.tflite`, 5.35 MB). On Android, still-image Guard evidence can run through a native TFLite bridge before cloud fallback. The current validated release gates alerts on visible firearms: `GUN` mAP50 is **0.725** against a 0.60 release target. Knife detection is treated as experimental and never triggers dispatch by itself.

### Outbreak Monitoring

Every case logged in the field feeds a coordinator dashboard. Spatial DBSCAN clustering runs over the case records to flag potential hotspots — early warning for cholera, meningitis, measles, and other conditions that move fast in displacement settings.
On the dashboard map, country boundaries are lightly outlined and regions with active outbreak alerts are highlighted in red for fast coordinator triage.
Current backend rules use condition-specific DBSCAN windows: cholera/AWD clusters require 5 cases within 3 km over 48 hours, meningitis requires 2 cases within 5 km over 168 hours, measles requires 3 cases within 10 km over 336 hours, and mpox requires 2 cases within 5 km over 336 hours. Backend tests cover clustered AWD/cholera and Nigeria meningitis alert scenarios.

---

## Try It

**[Install the Android preview build](https://expo.dev/accounts/evans0075/projects/shifa-health/builds/dc8daf6e-48f4-4e8e-9719-d262d4eab28e)**

**[Open the live coordinator dashboard](https://shifa-dashboard-theta.vercel.app/)**

On first setup, the app downloads the offline E2B clinical model, the Whisper base voice-input model, and the compact Guard firearm detector. Skip those and it runs in cloud fallback mode.

```bash
git clone https://github.com/Mist-Labs/shifa.git

# Run the clinical validation suite
cd shifa/ml
pip install unsloth boto3
# Gemma base model access requires Hugging Face approval:
# https://huggingface.co/google/gemma-4-e2b-it
# Published SHIFA artifacts are hosted on public R2 URLs;
# no R2 credentials are needed for download.
python scripts/download_artifacts.py
python finetune/validate.py

# Run the mobile app
cd ../shifa-mobile
npm install
npx expo run:android
```

---

## Validation Results

Tested on a 60-case WHO IMCI set. The mobile E2B clears every clinical target; E4B clears the safety-critical decision, urgent-recall, dosing, and protocol targets, while danger-sign naming is documented in the results report.

| Metric | E2B Mobile | E4B Server | Target |
|--------|:----------:|:----------:|:------:|
| Decision accuracy | **95.0%** | **96.7%** | 88% ✅ |
| **Urgent recall** | **100.0%** | **100.0%** | 95% ✅ |
| Urgent miss rate | **0.0%** | **0.0%** | — ✅ |
| Danger sign detection | **95.0%** | 88.3% | 92% |
| Drug dose accuracy | **100.0%** | **100.0%** | 95% ✅ |
| Protocol adherence | **93.3%** | **100.0%** | 90% ✅ |

The model never misses an emergency. That's the only number that matters.

---

## How It Works

```
CHW speaks or types symptoms
        ↓
Whisper base STT transcribes offline
        ↓
Fine-tuned Gemma 4 E2B reasons over the case locally
        ↓
Deterministic WHO/IMCI guardrails apply
        ↓
Decision + voice response in CHW's language
        ↓
Case logged locally → syncs to dashboard when back online
```

Two layers of safety — the model handles reasoning and produces structured clinical JSON, the guardrails enforce hard protocol rules on top of that. Things like MUAC < 11.5cm, bilateral edema, neonatal danger signs, convulsions, sexual violence, meningitis signs, maternal danger signs, and altered consciousness always trigger urgent referral regardless of what the model output says.

---

## The Models

Gemma 4 E2B's edge-oriented architecture is what makes offline Android clinical inference possible without a cloud dependency on a mid-range device. The stable field build uses the verified GGUF runtime first, while the LiteRT-LM artifact remains published for the accelerated Android path as we finish runtime-template hardening.

| | E2B | E4B |
|--|-----|-----|
| Base | `google/gemma-4-e2b-it` | `google/gemma-4-e4b-it` |
| Fine-tuning | QLoRA via Unsloth | QLoRA via Unsloth |
| Training time | 56 min on Kaggle T4 | 103 min on Kaggle T4 |
| Train loss | 0.1759 | 0.0599 |
| Mobile runtime | GGUF Q4_K_M · 3.2 GB + Whisper base · 142 MB | GGUF Q4_K_M · 5.0 GB |
| Target | Mid-range Android field runtime | High-end device / server |

2,000 synthetic training cases across 6 languages, 5 countries, 11 clinical conditions. Before the final run, we cleaned out invalid decision aliases (`MONITOR`, `OBSERVE`, `REFER_NON_URGENT`) that had crept into the synthetic data — that single cleanup pushed E2B raw model accuracy from 73% to 83%.

The LiteRT export ran on a Vast.ai A100 SXM4, after two OOM failures on Kaggle T4. The full story is in [SHIFA_Technical_Challenges.md](./SHIFA_Technical_Challenges.md).

For the full training flow, validation procedure, and artifact evidence, see [ml/TRAINING_AND_VALIDATION_PROCESS.md](./ml/TRAINING_AND_VALIDATION_PROCESS.md) and [ml/TRAINING_AND_VALIDATION_RESULTS.md](./ml/TRAINING_AND_VALIDATION_RESULTS.md).

---

## Model Artifacts

Published weights and mobile runtime artifacts are hosted on Cloudflare R2:

| Artifact | Link |
| --- | --- |
| E2B LiteRT-LM accelerated runtime artifact | [shifa-gemma4-e2b-finetuned.litertlm](https://pub-b2b135c13b0a406c8a4dc9c60eadb248.r2.dev/models/shifa-gemma4-e2b-finetuned/shifa-gemma4-e2b-finetuned.litertlm) |
| E2B LoRA adapter weights | [adapter_model.safetensors](https://pub-b2b135c13b0a406c8a4dc9c60eadb248.r2.dev/models/shifa-gemma4-e2b-finetuned/adapter_model.safetensors) |
| E2B GGUF stable Android/iOS runtime | [shifa-gemma4-e2b-q4km.gguf](https://pub-b2b135c13b0a406c8a4dc9c60eadb248.r2.dev/models/shifa-gemma4-e2b-finetuned/shifa-gemma4-e2b-q4km.gguf) |
| E2B validation metrics | [validation_metrics.json](https://pub-b2b135c13b0a406c8a4dc9c60eadb248.r2.dev/validation_metrics.json) |
| E2B training manifest | [training_manifest.json](https://pub-b2b135c13b0a406c8a4dc9c60eadb248.r2.dev/training_manifest.json) |
| Guard firearm detector TFLite | [shifa-guard-weapon-detector.tflite](https://pub-b2b135c13b0a406c8a4dc9c60eadb248.r2.dev/guard/shifa-guard-weapon-detector.tflite) |
| Guard validation metrics | [guard/validation_metrics.json](https://pub-b2b135c13b0a406c8a4dc9c60eadb248.r2.dev/guard/validation_metrics.json) |

---

## Clinical Coverage

Acute watery diarrhea / cholera · Severe and moderate acute malnutrition · Neonatal danger signs · Severe and non-severe pneumonia · Malaria · Meningitis · Infected conflict wounds · Sexual violence (GBV) · Maternal danger signs · Suspected measles

---

## Field Notes

Physical Android testing confirmed first-run model download, offline E2B GGUF analysis, Kinyarwanda, French and Lingala outputs, TTS playback, regional/local voice preference fallback, local case logging, and sync to the backend when connectivity returned. The Android field build now prefers GGUF because it completed on the tested 4GB phone. LiteRT-LM remains available as an accelerated artifact, but the current 3.1GB LiteRT-LM bundle can fall back on 4GB-class phones because Android does not leave the full device RAM available to the app once the OS, services, runtime buffers, tokenizer, and generation cache are loaded.

Offline STT — Whisper base — is part of the first-run setup. Voice recordings try offline transcription first. If that fails and there's no typed input, the app blocks silent analysis and asks the CHW to type or reconnect. No guessing.

The Guard firearm detector is also part of the first-run offline pack. Android uses a native TFLite bridge for still-image firearm screening, then keeps Gemini Guard analysis as fallback for richer visual context and video evidence. iOS native detector inference is still a separate bridge task. Knife detection remains experimental until a better-balanced dataset is trained.

---

## Setup

```bash
# Training pipeline
cd shifa/ml
pip install -r requirements-gpu.txt
python scripts/download_artifacts.py
python finetune/finetune_unsloth.py
python finetune/validate.py

# Mobile
cd shifa/shifa-mobile
npm install
npx expo run:android   # Android
npx expo run:ios       # iOS simulator smoke test
```

For iOS device builds and TestFlight, see [shifa-mobile/IOS_RUNBOOK.md](./shifa-mobile/IOS_RUNBOOK.md). The model is not bundled in the IPA — same first-run download flow as Android.

---

## Project Structure

```
shifa/
├── ml/
│   ├── finetune/
│   │   ├── finetune_unsloth.py        # Training
│   │   ├── validate.py                # Validation suite
│   │   ├── guardrails.py              # WHO/IMCI safety overrides
│   │   └── common.py
│   ├── data/
│   ├── reports/
│   ├── TRAINING_AND_VALIDATION_PROCESS.md
│   └── TRAINING_AND_VALIDATION_RESULTS.md
├── shifa-mobile/
│   └── IOS_RUNBOOK.md
├── SHIFA_Technical_Challenges.md
└── README.md
```

---

## Built by

**Okoli Arinze Evans** — Mist Labs · Kigali, Rwanda
[github.com/OkoliEvans](https://github.com/OkoliEvans)

Made for health workers in the hardest places on earth.
