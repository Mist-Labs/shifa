from __future__ import annotations

import sys
from pathlib import Path
from urllib.parse import urljoin

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import requests

from finetune.common import env, resolve_path, write_json


DATA_ARTIFACTS = [
    ("data/processed/training_final.jsonl", "data/processed/training_final.jsonl"),
    ("data/test_cases/imci_test_60.jsonl", "data/test_cases/imci_test_60.jsonl"),
    ("data/processed/synthetic_cases_2000.jsonl", "data/processed/synthetic_cases_2000.jsonl"),
    ("source_manifest.json", "data/processed/source_manifest.json"),
]

MODEL_ARTIFACTS = [
    ("validation_metrics.json", "reports/validation_metrics.json"),
    ("shifa-gemma4-e4b-finetuned.tflite", "models/shifa-gemma4-e4b-finetuned.tflite"),
    ("models/shifa-gemma4-e4b-finetuned/chat_template.jinja", "models/shifa-gemma4-e4b-finetuned/chat_template.jinja"),
    ("models/shifa-gemma4-e4b-finetuned/README.md", "models/shifa-gemma4-e4b-finetuned/README.md"),
    ("models/shifa-gemma4-e4b-finetuned/processor_config.json", "models/shifa-gemma4-e4b-finetuned/processor_config.json"),
    ("models/shifa-gemma4-e4b-finetuned/adapter_model.safetensors", "models/shifa-gemma4-e4b-finetuned/adapter_model.safetensors"),
    ("models/shifa-gemma4-e4b-finetuned/adapter_config.json", "models/shifa-gemma4-e4b-finetuned/adapter_config.json"),
    ("models/shifa-gemma4-e4b-finetuned/tokenizer_config.json", "models/shifa-gemma4-e4b-finetuned/tokenizer_config.json"),
    ("models/shifa-gemma4-e4b-finetuned/tokenizer.json", "models/shifa-gemma4-e4b-finetuned/tokenizer.json"),
    ("guard/shifa-guard-weapon-detector.pt", "models/shifa-guard-weapon-detector/best.pt"),
    ("guard/shifa-guard-weapon-detector.tflite", "models/shifa-guard-weapon-detector/shifa-guard-weapon-detector.tflite"),
    ("guard/validation_metrics.json", "reports/guard_validation_metrics.json"),
    ("guard/dataset_manifest.json", "reports/guard_dataset_manifest.json"),
    ("guard/training_manifest.json", "reports/guard_training_manifest.json"),
]


def download_file(base_url: str, key: str, destination: str, required: bool) -> dict[str, object] | None:
    url = urljoin(f"{base_url.rstrip('/')}/", key)
    target = resolve_path(destination)
    target.parent.mkdir(parents=True, exist_ok=True)
    response = requests.get(url, timeout=60)
    if response.status_code == 404 and not required:
        print(f"Skipping missing remote artifact: {key}")
        return None
    response.raise_for_status()
    target.write_bytes(response.content)
    return {
        "key": key,
        "path": str(target),
        "size_bytes": target.stat().st_size,
        "url": url,
    }


def main() -> None:
    base_url = env("R2_PUBLIC_BASE_URL", required=True)
    downloaded = []
    for key, destination in DATA_ARTIFACTS:
        artifact = download_file(base_url, key, destination, required=True)
        if artifact:
            downloaded.append(artifact)
            print(f"Downloaded {key} -> {destination}")
    for key, destination in MODEL_ARTIFACTS:
        artifact = download_file(base_url, key, destination, required=False)
        if artifact:
            downloaded.append(artifact)
            print(f"Downloaded {key} -> {destination}")
    write_json("reports/download_manifest.json", {"artifacts": downloaded})
    print("Download manifest: reports/download_manifest.json")


if __name__ == "__main__":
    main()
