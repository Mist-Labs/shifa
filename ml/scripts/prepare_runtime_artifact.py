from __future__ import annotations

import hashlib
import shutil
import sys
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import requests

from finetune.common import env, resolve_path, write_json

RUNTIME_EXTENSIONS = {".litertlm", ".task", ".tflite"}


def runtime_output_path(source: str) -> Path:
    configured = env("SHIFA_LITERT_OUTPUT", "")
    if configured:
        return resolve_path(configured)

    suffix = Path(urlparse(source).path).suffix.lower()
    if suffix not in RUNTIME_EXTENSIONS:
        suffix = ".litertlm"
    return resolve_path(f"models/shifa-gemma4-e4b-finetuned/shifa-gemma4-e4b-finetuned{suffix}")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(source: str, destination: Path) -> None:
    with requests.get(source, stream=True, timeout=60) as response:
        response.raise_for_status()
        with destination.open("wb") as file:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    file.write(chunk)


def copy_or_download(source: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    parsed = urlparse(source)
    if parsed.scheme in {"http", "https"}:
        download(source, destination)
        return

    source_path = resolve_path(source)
    if not source_path.exists():
        raise SystemExit(f"Runtime source does not exist: {source_path}")
    if source_path.suffix.lower() not in RUNTIME_EXTENSIONS:
        raise SystemExit(f"Runtime source must end in one of {sorted(RUNTIME_EXTENSIONS)}: {source_path}")
    shutil.copyfile(source_path, destination)


def main() -> None:
    source = env("SHIFA_LITERT_SOURCE", "")
    if not source:
        raise SystemExit(
            "Set SHIFA_LITERT_SOURCE to a local or HTTPS .litertlm/.task/.tflite file. "
            "The current LoRA adapter cannot be uploaded as a standalone LiteRT runtime artifact."
        )

    output = runtime_output_path(source)
    copy_or_download(source, output)
    manifest = {
        "source": source,
        "output": str(output),
        "size_bytes": output.stat().st_size,
        "sha256": sha256(output),
    }
    write_json("reports/runtime_manifest.json", manifest)
    print(f"Runtime artifact ready: {output}")
    print("Runtime manifest: reports/runtime_manifest.json")


if __name__ == "__main__":
    main()
