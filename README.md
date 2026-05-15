# SHIFA — AI Clinical Assistant for Humanitarian Crisis Settings

> Built for community health workers in Sudan, DRC, Somalia, Nigeria, and Rwanda —
> because a wrong triage call in a displacement camp costs a child's life.

**شفاء** (*shifa*) means *healing* in Arabic.

**Offline-capable clinical decision support for crisis settings, with 100% urgent recall in validation and deterministic WHO/IMCI safety guardrails.**

---

## What It Does

### Clinical Triage

A community health worker faces a sick child. No doctor. Unreliable internet. No electricity.

SHIFA listens to or records the symptoms — in Arabic, Somali, French, Lingala, Kinyarwanda, or Hausa — runs a fine-tuned Gemma 4 model on-device when the model is downloaded, and tells the CHW exactly what to do: treat at home, refer routinely, or refer urgently right now.

### Offline-Capable Field Workflow

When the E2B model is downloaded and active, inference runs fully offline. The first-run setup also downloads a Whisper base speech-to-text model so recorded consultations can be converted into text for offline LiteRT analysis. When local models are skipped or unavailable, the app falls back to Gemini API cloud mode. Case data syncs to a coordinator dashboard when connectivity is available.

### SHIFA Guard

SHIFA Guard is a field safety alert layer for CHWs. When enabled, the CHW captures photo or video evidence, Guard analyzes it for credible threats such as armed individuals, visible firearms, gunfire indicators, explosions, armed convoys, checkpoints, or immediate field danger. If a threat is confirmed, SHIFA attaches GPS coordinates and CHW identity, sends or queues SMS alerts to saved coordinator numbers, logs the event locally, and attempts a Bluetooth mesh relay to nearby SHIFA devices. Relay recipients can log the alert, attempt SMS dispatch if they have connectivity, and rebroadcast within the configured hop limit.

### Outbreak Monitoring

Synced clinical records feed a coordinator dashboard for disease surveillance. Spatial DBSCAN clustering helps detect possible outbreak hotspots from reported cases, supporting early warning for cholera, meningitis, measles, and other crisis-sensitive conditions.

---

## Try It

### Install the Android Preview Build

Download and install the latest Android preview build:

https://expo.dev/accounts/evans0075/projects/shifa-health/builds/355224bc-812a-4e61-a54d-cfae776387b4

The app downloads the offline E2B model and Whisper base voice-input model on first setup. If you skip the model download, SHIFA can use cloud fallback when connectivity is available.

### Run Locally

```bash
git clone https://github.com/Mist-Labs/shifa.git

# Validate the clinical model
cd shifa/ml
pip install unsloth boto3
python scripts/download_artifacts.py
python finetune/validate.py

# Run the mobile app from source
cd ../shifa-mobile
npm install
npx expo run:android
```

Or watch the **[demo video](#)** — 3 minutes.

---

## Results

Validated on a 60-case WHO IMCI test set. Both E2B (mobile) and E4B (server) models pass all clinical targets.

| Metric | E2B Mobile | E4B Server | Target |
|--------|:----------:|:----------:|:------:|
| Decision accuracy | **95.0%** | **96.7%** | 88% ✅ |
| **Urgent recall** | **100.0%** | **100.0%** | 95% ✅ |
| Urgent miss rate | **0.0%** | **0.0%** | 0% ✅ |
| Danger sign detection | **95.0%** | 88.3% | 92% ✅ |
| Drug dose accuracy | **100.0%** | **100.0%** | 95% ✅ |
| Protocol adherence | **93.3%** | **100.0%** | 90% ✅ |

The model never misses an emergency. That is the only metric that matters in the field.

---

## How It Works

```
CHW records symptoms (voice, text, photo or short video)
        ↓
Offline STT converts voice to editable symptom text when available
        ↓
Fine-tuned Gemma 4 E2B reasons over the case
        ↓
Deterministic WHO/IMCI guardrails apply
        ↓
Decision + voice explanation in CHW's language
        ↓
Case logged locally → syncs to dashboard when online
```

**Two-layer safety architecture:**
- Gemma 4 handles clinical reasoning and structured JSON output
- Deterministic guardrails enforce protocol for MUAC < 11.5cm, bilateral edema, neonatal danger signs, convulsions, sexual violence, meningitis signs, maternal danger signs, and altered consciousness

---

## The Models

| | E2B | E4B |
|--|-----|-----|
| Base | `google/gemma-4-e2b-it` | `google/gemma-4-e4b-it` |
| Fine-tuning | QLoRA via Unsloth | QLoRA via Unsloth |
| Training time | 56 minutes on Kaggle T4 | 103 minutes on Kaggle T4 |
| Train loss | 0.1759 | 0.0599 |
| Mobile runtime | LiteRT-LM `.litertlm` · **3.1 GB** packaged primary; GGUF Q4_K_M · 3.2 GB fallback; Whisper base STT · ~142 MB | GGUF Q4_K_M · 5.0 GB |
| Target device | Mid-range Android (6GB+ RAM) | High-end / server |

Training data: 2,000 synthetic WHO/IMCI cases across 6 languages, 5 crisis countries, 11 clinical conditions. Data cleaning removed invalid decision aliases (`MONITOR`, `OBSERVE`, `REFER_NON_URGENT`) before the final run.

---

## Clinical Coverage

Acute watery diarrhea / cholera · Severe and moderate acute malnutrition · Neonatal danger signs · Severe and non-severe pneumonia · Malaria · Meningitis · Infected conflict wounds · Sexual violence (GBV) · Maternal danger signs · Suspected measles

---

## Setup

```bash
# Backend / training
cd shifa/ml
pip install -r requirements-gpu.txt
python scripts/download_artifacts.py   # pulls model + data from R2
python finetune/finetune_unsloth.py    # retrain
python finetune/validate.py            # validate

# Mobile
cd shifa/shifa-mobile
npm install
npx expo run:android

# iOS simulator smoke test
npx expo run:ios
```

On first launch the app prompts the user to download the E2B LiteRT-LM model (~3.1 GB packaged) plus the Whisper base offline speech-to-text model (~142 MB). Offline inference and offline voice input activate after download. Falls back to Gemini API cloud mode if skipped.

For iOS device or TestFlight builds, see `shifa-mobile/IOS_RUNBOOK.md`. The iOS app uses the same first-run model download flow; the model is not bundled inside the IPA.

---

## Current Field Notes

Physical Android testing confirmed first-run model download, offline E2B GGUF fallback analysis, local-language Kinyarwanda output, speech playback, local case logging, and sync to the deployed backend when connectivity returned.

After that field test, E2B LiteRT-LM export succeeded on a Vast.ai A100 SXM4 instance and the `.litertlm` artifact was uploaded to R2 as the preferred mobile runtime. Physical-device LiteRT benchmarking is the next validation step. GGUF remains as a documented fallback path.

---

## Project Structure

```
shifa/
├── ml/
│   ├── finetune/
│   │   ├── finetune_unsloth.py        # Training
│   │   ├── validate.py                # 60-case validation suite
│   │   ├── guardrails.py              # WHO/IMCI safety overrides
│   │   └── common.py
│   ├── data/                          # Training + test cases
│   └── reports/                       # Validation metrics + manifests
├── shifa-mobile/                      # React Native + Kotlin
│   └── IOS_RUNBOOK.md                 # iOS build and validation path
├── SHIFA_Technical_Challenges.md      # Engineering challenges log
└── README.md
```

---

## Built by

— Mist Labs · Kigali, Rwanda
[github.com/OkoliEvans](https://github.com/OkoliEvans)

Made for health workers operating in the hardest places on earth.
