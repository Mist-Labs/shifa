# SHIFA ML Pipeline

This directory builds the SHIFA clinical fine-tuning artifact for the guide's Unsloth/LiteRT track. All credentials are read from environment variables or `ml/.env`; no account keys belong in source control.

## Current Clinical Result

The clinical Gemma 4 E4B adapter has been trained and validated on the repaired 60-case humanitarian IMCI validation set. The production scoring path is:

1. Fine-tuned Gemma 4 E4B LoRA adapter.
2. Strict JSON parsing and schema checks.
3. Deterministic WHO/IMCI safety guardrails for high-risk clinical signs.

Latest validation result:

| Metric | Result | Target | Status |
|---|---:|---:|---|
| Decision accuracy, guarded | 96.7% | >88% | Pass |
| Urgent referral recall, guarded | 100.0% | >95% | Pass |
| Urgent miss rate, guarded | 0.0% | 0% goal | Pass |
| Drug dose accuracy | 100.0% | >95% | Pass |
| Protocol adherence | 100.0% | >90% | Pass |
| Schema completeness | 98.3% | high | Pass |
| Raw model decision accuracy | 73.3% | tracked | Needs guardrails |
| Raw urgent recall | 79.1% | tracked | Needs guardrails |
| Danger sign extraction | 88.3% | >92% | Next fix |
| Over-referral rate | 11.8% | lower is better | Improved |
| Guardrail overrides | 49 / 60 | tracked | Safety layer active |

The important safety claim is: **the trained model plus deterministic clinical guardrails reached 100% urgent referral recall with zero urgent misses on the current held-out validation set.** Do not present the raw model alone as the final clinical system.

## Kaggle / Remote GPU Quick Start

Kaggle Tesla T4 x2 was the successful training environment. Colab's current torch stack caused Unsloth/Gemma 4 compatibility issues during this project. Run the GPU flow from the `ml/` directory after setting Kaggle secrets or a private `.env` with Hugging Face and R2 credentials.

```python
%cd /kaggle/working
!git clone <your-shifa-repo-url> shifa
%cd /kaggle/working/shifa/ml

!pip install -q "unsloth[kaggle-new] @ git+https://github.com/unslothai/unsloth.git"
!python scripts/download_artifacts.py
!python finetune/finetune_unsloth.py
!python finetune/validate.py
!python scripts/upload_artifacts.py
```

`finetune_unsloth.py` writes `reports/training_manifest.json` and uploads the trained adapter artifacts to R2 when R2 credentials are present. Set `SHIFA_AUTO_UPLOAD_AFTER_TRAIN=0` only if you intentionally want to skip automatic upload.

`validate.py` writes `reports/validation_metrics.json` and automatically uploads it to R2 at the end of validation when R2 credentials are present. Set `SHIFA_AUTO_UPLOAD_AFTER_VALIDATE=0` only if you intentionally want to skip automatic upload.

To retrieve the latest trained model and manifests on a fresh Kaggle session:

```python
%cd /kaggle/working/shifa/ml
!python scripts/download_artifacts.py
!ls -lh models/shifa-gemma4-e4b-finetuned
!cat reports/training_manifest.json
```

## Local Data Prep On Mac

Do not install the full GPU stack on a local Python 3.14 Homebrew venv. For local PDF extraction and R2/source checks, install only the data-prep requirements:

```bash
cd ml
python3 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -r requirements-data.txt
python finetune/prepare_data.py
```

The full `requirements.txt` intentionally points to `requirements-gpu.txt` and is for the remote training machine.

## Guard Weapon Detector

SHIFA Guard uses a separate compact object detector for phone camera/video evidence. Train it on a GPU box after `.env` is filled:

```bash
cd ml
source .venv/bin/activate
pip install -r requirements-guard.txt
bash scripts/run_guard_training.sh
```

The Guard pipeline downloads the configured Hugging Face weapon dataset, exports YOLO-format `HANDGUN`, `RIFLE`, `SHOTGUN`, `HEAVY_WEAPON`, `RPG`, `KNIFE`, and `PERSON` labels where those source labels exist, trains a small YOLO detector, exports a TFLite model, validates against the test split, then uploads:

- `guard/shifa-guard-weapon-detector.pt`
- `guard/shifa-guard-weapon-detector.tflite`
- `guard/validation_metrics.json`

Runtime alerts should require high confidence and visible weapon classes. Do not trigger emergency dispatch from `PERSON` alone. IED/explosive detection requires a separate validated dataset; do not pretend the gun/knife dataset proves IED detection.

## Data Policy

Use public clinical protocol sources only: WHO IMCI, WHO cholera/malaria/malnutrition guidance, Sphere, MSF guidance where permitted, and SHIFA country protocol modules. Do not include private patient records.

Raw PDFs can be placed in `data/raw/`. The generator creates synthetic CHW cases from protocol rules across Sudan, DRC, Somalia, and Northern Nigeria, including Hausa.

## Outputs

- `data/processed/synthetic_cases_2000.jsonl`
- `data/processed/training_final.jsonl`
- `data/test_cases/imci_test_60.jsonl`
- `models/shifa-gemma4-e4b-finetuned/`
- `reports/training_manifest.json`
- `reports/validation_metrics.json`
- `reports/upload_manifest.json`
- `models/shifa-gemma4-e4b-finetuned.tflite`

The validation report is the source for the clinical metrics table. Training, validation, LiteRT export, mobile packaging, and physical-device offline testing are documented in the linked process and results reports. R2 artifacts remain the reproducible evidence trail for training and validation.
