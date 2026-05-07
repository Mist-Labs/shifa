from __future__ import annotations

import sys
from pathlib import Path
from urllib.parse import urljoin

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import requests

from finetune.common import env, resolve_path, write_json


ARTIFACTS = [
    ("data/processed/training_final.jsonl", "data/processed/training_final.jsonl"),
    ("data/test_cases/imci_test_60.jsonl", "data/test_cases/imci_test_60.jsonl"),
    ("data/processed/synthetic_cases_2000.jsonl", "data/processed/synthetic_cases_2000.jsonl"),
    ("source_manifest.json", "data/processed/source_manifest.json"),
]


def download_file(base_url: str, key: str, destination: str) -> dict[str, object]:
    url = urljoin(f"{base_url.rstrip('/')}/", key)
    target = resolve_path(destination)
    target.parent.mkdir(parents=True, exist_ok=True)
    response = requests.get(url, timeout=60)
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
    for key, destination in ARTIFACTS:
        downloaded.append(download_file(base_url, key, destination))
        print(f"Downloaded {key} -> {destination}")
    write_json("reports/download_manifest.json", {"artifacts": downloaded})
    print("Download manifest: reports/download_manifest.json")


if __name__ == "__main__":
    main()
