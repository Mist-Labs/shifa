#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f ".env" ]; then
  echo "Missing ml/.env. Copy .env.example and fill required env values first." >&2
  exit 1
fi

python guard/prepare_weapon_dataset.py
python guard/train_weapon_detector.py
python guard/validate_weapon_detector.py
python scripts/upload_artifacts.py
