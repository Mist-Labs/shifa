from __future__ import annotations

import mimetypes
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from finetune.common import env, resolve_path, write_json


def required_r2_env() -> dict[str, str]:
    values = {
        "R2_ACCOUNT_ID": env("R2_ACCOUNT_ID"),
        "R2_BUCKET": env("R2_BUCKET"),
        "AWS_ACCESS_KEY_ID": env("AWS_ACCESS_KEY_ID"),
        "AWS_SECRET_ACCESS_KEY": env("AWS_SECRET_ACCESS_KEY"),
    }
    missing = [key for key, value in values.items() if not value]
    if missing:
        print(f"Skipping upload; missing env: {', '.join(missing)}")
        return {}
    return values


def upload_file(client, bucket: str, path: Path, key: str) -> dict[str, str]:
    content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    client.upload_file(
        str(path),
        bucket,
        key,
        ExtraArgs={"ContentType": content_type},
    )
    public_base = env("R2_PUBLIC_BASE_URL").rstrip("/")
    return {
        "key": key,
        "path": str(path),
        "size_bytes": path.stat().st_size,
        "url": f"{public_base}/{key}" if public_base else "",
    }


def model_artifacts() -> list[tuple[Path, str]]:
    model_dir = resolve_path(env("SHIFA_MODEL_DIR", "models/shifa-gemma4-e4b-finetuned"))
    if not model_dir.exists():
        return []

    artifacts: list[tuple[Path, str]] = []
    for path in sorted(model_dir.rglob("*")):
        if path.is_file():
            relative = path.relative_to(resolve_path("."))
            artifacts.append((path, str(relative)))
    return artifacts


def runtime_artifacts() -> list[tuple[Path, str]]:
    model_dir = resolve_path(env("SHIFA_MODEL_DIR", "models/shifa-gemma4-e4b-finetuned"))
    configured_output = resolve_path(env("SHIFA_LITERT_OUTPUT", "models/shifa-gemma4-e4b-finetuned/shifa-gemma4-e4b-finetuned.litertlm"))
    candidates = [
        configured_output,
        model_dir / "shifa-gemma4-e4b-finetuned.litertlm",
        model_dir / "shifa-gemma4-e4b-finetuned.task",
        model_dir / "shifa-gemma4-e4b-finetuned.tflite",
    ]
    artifacts: list[tuple[Path, str]] = []
    seen: set[Path] = set()
    for path in candidates:
        if path in seen:
            continue
        seen.add(path)
        relative = path.relative_to(resolve_path(".")) if path.is_relative_to(resolve_path(".")) else Path(path.name)
        artifacts.append((path, str(relative)))
    return artifacts


def main() -> None:
    config = required_r2_env()
    if not config:
        return

    try:
        import boto3
    except ImportError as exc:  # pragma: no cover - checked on remote env.
        raise SystemExit("Install boto3 from ml/requirements.txt before uploading artifacts") from exc

    endpoint_url = f"https://{config['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com"
    client = boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=config["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=config["AWS_SECRET_ACCESS_KEY"],
        region_name=env("AWS_DEFAULT_REGION", "auto"),
    )

    artifacts = [
        (resolve_path(env("SHIFA_TRAIN_FILE", "data/processed/training_final.jsonl")), "data/processed/training_final.jsonl"),
        (resolve_path(env("SHIFA_TEST_FILE", "data/test_cases/imci_test_60.jsonl")), "data/test_cases/imci_test_60.jsonl"),
        (resolve_path("data/processed/synthetic_cases_2000.jsonl"), "data/processed/synthetic_cases_2000.jsonl"),
        (resolve_path(env("SHIFA_VALIDATION_REPORT", "reports/validation_metrics.json")), "validation_metrics.json"),
        (resolve_path(env("SHIFA_TRAINING_MANIFEST", "reports/training_manifest.json")), "training_manifest.json"),
        (resolve_path("reports/runtime_manifest.json"), "runtime_manifest.json"),
        (resolve_path(env("SHIFA_GUARD_PT_MODEL", "models/shifa-guard-weapon-detector/best.pt")), "guard/shifa-guard-weapon-detector.pt"),
        (resolve_path(env("SHIFA_GUARD_TFLITE_MODEL", "models/shifa-guard-weapon-detector/shifa-guard-weapon-detector.tflite")), "guard/shifa-guard-weapon-detector.tflite"),
        (resolve_path(env("SHIFA_GUARD_VALIDATION_REPORT", "reports/guard_validation_metrics.json")), "guard/validation_metrics.json"),
        (resolve_path("reports/guard_dataset_manifest.json"), "guard/dataset_manifest.json"),
        (resolve_path("reports/guard_training_manifest.json"), "guard/training_manifest.json"),
        (resolve_path("data/processed/source_manifest.json"), "source_manifest.json"),
    ]
    artifacts.extend(runtime_artifacts())
    artifacts.extend(model_artifacts())

    uploaded = []
    for path, key in artifacts:
        if path.exists():
            uploaded.append(upload_file(client, config["R2_BUCKET"], path, key))
        else:
            print(f"Skipping missing artifact: {path}")

    write_json("reports/upload_manifest.json", {"bucket": config["R2_BUCKET"], "artifacts": uploaded})
    print("Upload manifest: reports/upload_manifest.json")


if __name__ == "__main__":
    main()
