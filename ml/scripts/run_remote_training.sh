#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f ".env" ]; then
  echo "Missing ml/.env. Copy .env.example and fill required env values first." >&2
  exit 1
fi

python finetune/generate_synthetic.py
python finetune/prepare_data.py
python finetune/finetune_unsloth.py
python finetune/validate.py
python finetune/convert_litert.py
python scripts/upload_artifacts.py
