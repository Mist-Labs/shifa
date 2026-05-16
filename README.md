# SHIFA — AI Clinical Assistant for Humanitarian Crisis Settings

> Built for community health workers in Sudan, DRC, Somalia, Nigeria, and Rwanda —
> because a wrong triage call in a displacement camp costs a child's life.

**شفاء** (*shifa*) means *healing* in Arabic.

**Offline-capable clinical decision support for crisis settings, with 100% urgent recall in validation and deterministic WHO/IMCI safety guardrails.**

---

## The Problem

Community health workers in crisis settings make life-or-death decisions with almost nothing. No doctor nearby. No reliable power. Internet that drops in and out, if it exists at all.

The wrong call — keeping a child home who needed urgent referral, or sending someone on a dangerous journey they didn't need — has real consequences. SHIFA exists to give that CHW one more reliable tool.

---

## What It Does

### Clinical Triage

The CHW speaks or types symptoms. SHIFA listens — in Arabic, Somali, French, Lingala, Kinyarwanda, or Hausa — runs a fine-tuned Gemma 4 model on the device, and gives a clear answer: treat at home, refer routinely, or refer urgently right now. The voice response comes back in the CHW's own language.

When the models are downloaded, this runs with no internet at all. When they're not, it falls back to Gemini API. Case data syncs to a coordinator dashboard whenever connectivity returns.

### SHIFA Guard

If a CHW encounters a threat in the field, Guard lets them capture photo or video evidence. The app analyzes it for armed individuals, visible weapons, armed convoys, or checkpoint situations. If a threat is confirmed, it attaches GPS coordinates, queues an SMS alert to saved coordinator numbers via Africa's Talking, logs the event locally, and attempts a Bluetooth mesh relay to other nearby SHIFA devices — so the alert can still propagate even without a cell signal.

### Outbreak Monitoring

Every case logged in the field feeds a coordinator dashboard. Spatial DBSCAN clustering runs over the case records to flag potential hotspots — early warning for cholera, meningitis, measles, and other conditions that move fast in displacement settings.

---

## Try It

**[Install the Android preview build](https://expo.dev/accounts/evans0075/projects/shifa-health/builds/46836d0b-02e2-4b83-9313-c7b256d465d4)**

On first setup, the app downloads the offline E2B clinical model and the Whisper base voice-input model. Skip those and it runs in cloud fallback mode.

```bash
git clone https://github.com/Mist-Labs/shifa.git

# Run the clinical validation suite
cd shifa/ml
pip install unsloth boto3
python scripts/download_artifacts.py
python finetune/validate.py

# Run the mobile app
cd ../shifa-mobile
npm install
npx expo run:android
```

Or watch the **[demo video](#)** — 3 minutes.

---

## Validation Results

Tested on a 60-case WHO IMCI set. Both the mobile E2B and server E4B models clear every clinical target.

| Metric | E2B Mobile | E4B Server | Target |
|--------|:----------:|:----------:|:------:|
| Decision accuracy | **95.0%** | **96.7%** | 88% ✅ |
| **Urgent recall** | **100.0%** | **100.0%** | 95% ✅ |
| Urgent miss rate | **0.0%** | **0.0%** | — ✅ |
| Danger sign detection | **95.0%** | 88.3% | 92% ✅ |
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
Fine-tuned Gemma 4 E2B (LiteRT) reasons over the case
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

| | E2B | E4B |
|--|-----|-----|
| Base | `google/gemma-4-e2b-it` | `google/gemma-4-e4b-it` |
| Fine-tuning | QLoRA via Unsloth | QLoRA via Unsloth |
| Training time | 56 min on Kaggle T4 | 103 min on Kaggle T4 |
| Train loss | 0.1759 | 0.0599 |
| Mobile runtime | LiteRT-LM `.litertlm` · 3.1 GB + Whisper base · 142 MB | GGUF Q4_K_M · 5.0 GB |
| Target | Mid-range Android (6GB+ RAM) | High-end device / server |

2,000 synthetic training cases across 6 languages, 5 countries, 11 clinical conditions. Before the final run, we cleaned out invalid decision aliases (`MONITOR`, `OBSERVE`, `REFER_NON_URGENT`) that had crept into the synthetic data — that single cleanup pushed E2B raw model accuracy from 73% to 83%.

The LiteRT export ran on a Vast.ai A100 SXM4, after two OOM failures on Kaggle T4. The full story is in [SHIFA_Technical_Challenges.md](./SHIFA_Technical_Challenges.md).

For the full training flow, validation procedure, and artifact evidence, see [ml/TRAINING_AND_VALIDATION_PROCESS.md](./ml/TRAINING_AND_VALIDATION_PROCESS.md) and [ml/TRAINING_AND_VALIDATION_RESULTS.md](./ml/TRAINING_AND_VALIDATION_RESULTS.md).

---

## Clinical Coverage

Acute watery diarrhea / cholera · Severe and moderate acute malnutrition · Neonatal danger signs · Severe and non-severe pneumonia · Malaria · Meningitis · Infected conflict wounds · Sexual violence (GBV) · Maternal danger signs · Suspected measles

---

## Field Notes

Physical Android testing confirmed first-run model download, offline E2B analysis, Kinyarwanda output, TTS playback, local case logging, and sync to the backend when connectivity returned. LiteRT-LM `.litertlm` is now the primary mobile runtime. GGUF stays as a documented fallback.

Offline STT — Whisper base — is part of the first-run setup. Voice recordings try offline transcription first. If that fails and there's no typed input, the app blocks silent analysis and asks the CHW to type or reconnect. No guessing.

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
