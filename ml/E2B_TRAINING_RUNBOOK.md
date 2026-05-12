# SHIFA E2B Training Runbook

This run trains a mobile-first Gemma 4 E2B adapter using the same cleaned SHIFA clinical dataset as the validated E4B run.

## Goal

Produce an E2B candidate that can run on more Android phones than E4B:

- smaller base model
- faster training and inference
- lower RAM/storage target
- same validation suite and WHO/IMCI guardrails

## Keep E4B Evidence Intact

Do not overwrite the E4B directories or reports. The E2B profile writes to:

- `models/shifa-gemma4-e2b-finetuned`
- `models/shifa-gemma4-e2b-checkpoints`
- `reports/e2b_training_manifest.json`
- `reports/e2b_validation_metrics.json`

## Kaggle Setup

From a fresh Kaggle GPU session:

```python
import os
from kaggle_secrets import UserSecretsClient

secrets = UserSecretsClient()
os.environ["HF_TOKEN"] = secrets.get_secret("HF_TOKEN")
os.environ["HUGGING_FACE_HUB_TOKEN"] = os.environ["HF_TOKEN"]
os.environ["R2_ACCOUNT_ID"] = secrets.get_secret("R2_ACCOUNT_ID")
os.environ["R2_BUCKET"] = secrets.get_secret("R2_BUCKET")
os.environ["R2_PUBLIC_BASE_URL"] = secrets.get_secret("R2_PUBLIC_BASE_URL")
os.environ["AWS_ACCESS_KEY_ID"] = secrets.get_secret("AWS_ACCESS_KEY_ID")
os.environ["AWS_SECRET_ACCESS_KEY"] = secrets.get_secret("AWS_SECRET_ACCESS_KEY")
os.environ["AWS_DEFAULT_REGION"] = "auto"
os.environ["WANDB_MODE"] = "disabled"
```

```python
!git clone https://github.com/Mist-Labs/shifa.git /kaggle/working/shifa
%cd /kaggle/working/shifa/ml
!pip install -q "unsloth[kaggle-new] @ git+https://github.com/unslothai/unsloth.git"
!pip install -q boto3 requests
!python scripts/download_artifacts.py
```

## E2B Environment

```python
import os

os.environ["SHIFA_BASE_MODEL"] = "google/gemma-4-E2B-it"
os.environ["SHIFA_MODEL_VARIANT"] = "e2b"
os.environ["SHIFA_MAX_SEQ_LENGTH"] = "4096"
os.environ["SHIFA_LOAD_IN_4BIT"] = "1"
os.environ["SHIFA_NUM_EPOCHS"] = "3"
os.environ["SHIFA_BATCH_SIZE"] = "4"
os.environ["SHIFA_GRAD_ACCUM"] = "2"
os.environ["SHIFA_LEARNING_RATE"] = "2e-4"
os.environ["SHIFA_WARMUP_STEPS"] = "10"
os.environ["SHIFA_LOGGING_STEPS"] = "10"
os.environ["SHIFA_SAVE_STRATEGY"] = "epoch"
os.environ["SHIFA_OPTIM"] = "adamw_8bit"
os.environ["SHIFA_DATALOADER_WORKERS"] = "2"
os.environ["SHIFA_DATASET_NUM_PROC"] = "2"
os.environ["SHIFA_LORA_R"] = "16"
os.environ["SHIFA_LORA_ALPHA"] = "16"
os.environ["SHIFA_SEED"] = "42"

os.environ["SHIFA_TRAIN_FILE"] = "data/processed/training_final.jsonl"
os.environ["SHIFA_TEST_FILE"] = "data/test_cases/imci_test_60.jsonl"
os.environ["SHIFA_TEST_CASES"] = "data/test_cases/imci_test_60.jsonl"
os.environ["SHIFA_MODEL_DIR"] = "models/shifa-gemma4-e2b-finetuned"
os.environ["SHIFA_CHECKPOINT_DIR"] = "models/shifa-gemma4-e2b-checkpoints"
os.environ["SHIFA_TRAINING_MANIFEST"] = "reports/e2b_training_manifest.json"
os.environ["SHIFA_VALIDATION_REPORT"] = "reports/e2b_validation_metrics.json"
os.environ["SHIFA_TRAINING_MANIFEST_KEY"] = "reports/e2b_training_manifest.json"
os.environ["SHIFA_VALIDATION_REPORT_KEY"] = "reports/e2b_validation_metrics.json"
```

This keeps the effective batch size at 8 (`4 x 2`) while reducing the number of gradient accumulation steps. If Kaggle reports CUDA out-of-memory, use the safer E4B-style setting:

```python
os.environ["SHIFA_BATCH_SIZE"] = "2"
os.environ["SHIFA_GRAD_ACCUM"] = "4"
```

## Train

```python
!python finetune/finetune_unsloth.py
```

The script auto-uploads artifacts to R2 after training. If Kaggle is unstable, manually run:

```python
!python scripts/upload_artifacts.py
```

## Validate

Restart the Kaggle runtime before validation if VRAM is fragmented.

```python
%cd /kaggle/working/shifa/ml
!python finetune/validate.py
!python scripts/upload_artifacts.py
```

## Expected Decision

Use the E2B model only if validation keeps:

- urgent recall at or near 100%
- schema completion above 95%
- decision accuracy acceptable after guardrails

If E2B misses urgent cases even after guardrails, keep E4B for clinical demo and treat E2B as a deployment optimization experiment.
