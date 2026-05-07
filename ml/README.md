# SHIFA ML Pipeline

This directory builds the SHIFA clinical fine-tuning artifact for the guide's Unsloth/LiteRT track. All credentials are read from environment variables or `ml/.env`; no account keys belong in source control.

## Remote GPU Quick Start

Run this on an A100-class remote GPU box with Python 3.11, from the repo root:

```bash
cd ml
cp .env.example .env
# fill HF_TOKEN and optional WANDB/R2 variables in .env
python3.11 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -r requirements-gpu.txt

python finetune/generate_synthetic.py
python finetune/prepare_data.py
python finetune/finetune_unsloth.py
python finetune/validate.py
python finetune/convert_litert.py
python scripts/upload_artifacts.py
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

## Data Policy

Use public clinical protocol sources only: WHO IMCI, WHO cholera/malaria/malnutrition guidance, Sphere, MSF guidance where permitted, and SHIFA country protocol modules. Do not include private patient records.

Raw PDFs can be placed in `data/raw/`. The generator creates synthetic CHW cases from protocol rules across Sudan, DRC, Somalia, and Northern Nigeria, including Hausa.

## Outputs

- `data/processed/synthetic_cases_2000.jsonl`
- `data/processed/training_final.jsonl`
- `data/test_cases/imci_test_60.jsonl`
- `models/shifa-gemma4-e4b-finetuned/`
- `reports/validation_metrics.json`
- `models/shifa-gemma4-e4b-finetuned.tflite`

The validation report is the source for the submission metrics table. Do not tick the guide's training/runtime checklist boxes until the remote commands have completed and the report exists.
