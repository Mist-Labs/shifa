# SHIFA — AI Clinical Assistant for Humanitarian Crisis Settings

> Built for community health workers in Sudan, DRC, Somalia, Nigeria, and Rwanda —
> because a wrong triage call in a displacement camp costs a child's life.

**شفاء** (*shifa*) means *healing* in Arabic.

**Offline-capable clinical decision support for crisis settings, with 100% urgent recall in validation and deterministic WHO/IMCI safety guardrails.**

---

## What It Does

A community health worker faces a sick child. No doctor. Unreliable internet. No electricity.

SHIFA listens to the symptoms — in Arabic, Somali, French, Lingala, Kinyarwanda, or Hausa — runs a fine-tuned Gemma 4 model on-device when the model is downloaded, and tells the CHW exactly what to do: treat at home, refer routinely, or refer urgently right now.

When the E2B model is downloaded and active, inference runs fully offline. When not, the app falls back to Gemini API cloud mode. Case data syncs to a coordinator dashboard when connectivity is available.

---

## Try It

```bash
git clone https://github.com/Mist-Labs/shifa.git
cd shifa/ml
pip install unsloth boto3
python scripts/download_artifacts.py
python finetune/validate.py
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

This is how serious clinical AI systems are built — the model reasons, the rules enforce.

---

## The Models

| | E2B | E4B |
|--|-----|-----|
| Base | `google/gemma-4-e2b-it` | `google/gemma-4-e4b-it` |
| Fine-tuning | QLoRA via Unsloth | QLoRA via Unsloth |
| Training time | 56 minutes on Kaggle T4 | 103 minutes on Kaggle T4 |
| Train loss | 0.1759 | 0.0599 |
| Mobile runtime | GGUF Q4_K_M · **3.2 GB** | GGUF Q4_K_M · 5.0 GB |
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

On first launch the app prompts the user to download the E2B GGUF model (~3.2 GB). Offline inference activates after download. Falls back to Gemini API cloud mode if skipped.

For iOS device or TestFlight builds, see `shifa-mobile/IOS_RUNBOOK.md`. The iOS app uses the same first-run model download flow; the GGUF model is not bundled inside the IPA.

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

## Hackathon Track

**Health and Sciences** · **Unsloth Special Mention**

Offline-capable, privacy-preserving clinical AI for humanitarian settings. Fine-tuned with Unsloth on WHO/IMCI protocols. Designed for constrained environments with unreliable connectivity.

---

## Known Limitations

- Validation set is 60 cases — sufficient for proof-of-concept, not for clinical deployment
- E2B over-refers non-severe pneumonia at ~17% — conservative, appropriate for crisis settings
- E2B requires ~6GB device RAM for comfortable inference; not validated on entry-level devices
- iOS support is configured but still needs physical-device validation for GGUF memory, heat, latency, and storage behavior
- LiteRT fine-tuned export was attempted twice (E4B and E2B) and OOM'd on available free GPU infrastructure — documented in `SHIFA_Technical_Challenges.md`
- Not a certified medical device

---

## Built by

**Okoli Arinze Evans** — Mist Labs · Kigali, Rwanda
[github.com/OkoliEvans](https://github.com/OkoliEvans)

Made for health workers operating in the hardest places on earth.
