from __future__ import annotations

import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from finetune.common import env, env_float, env_int, resolve_path, write_json

CLASS_NAMES = ["GUN", "KNIFE", "PERSON"]


def export_tflite(target: Path, output_dir: Path, image_size: int) -> Path:
    """
    Export through a legacy Torch ONNX path because Torch 2.10 + Ultralytics'
    default exporter emits opset-18 graphs that onnx2tf 1.x fails to convert
    for YOLO Conv nodes. Keep this separate so Kaggle can rerun export without
    retraining by setting SHIFA_GUARD_SKIP_TRAIN=1.
    """
    onnx_path = target.with_suffix(".onnx")
    tflite_dir = output_dir / "tflite_export"
    exported_target = output_dir / "shifa-guard-weapon-detector.tflite"

    subprocess.run(
        [
            sys.executable,
            "-c",
            f"""
import torch
from ultralytics import YOLO

model = YOLO({str(target)!r}).model.cpu().eval()
dummy = torch.zeros(1, 3, {image_size}, {image_size})
torch.onnx.export(
    model,
    dummy,
    {str(onnx_path)!r},
    opset_version=12,
    input_names=["images"],
    output_names=["output0"],
    do_constant_folding=True,
    dynamo=False,
)
print("ONNX exported to {onnx_path}")
""",
        ],
        check=True,
    )

    subprocess.run(
        [
            sys.executable,
            "-m",
            "onnx2tf",
            "-i",
            str(onnx_path),
            "-o",
            str(tflite_dir),
            "-ois",
            f"images:1,3,{image_size},{image_size}",
            "-kt",
            "images",
            "-nuo",
            "--non_verbose",
        ],
        check=True,
    )

    tflite_files = sorted(tflite_dir.rglob("*.tflite"))
    if not tflite_files:
        raise RuntimeError(f"No .tflite found in {tflite_dir} after onnx2tf export")

    exported_target.write_bytes(tflite_files[0].read_bytes())
    print(f"TFLite exported: {exported_target} ({exported_target.stat().st_size / 1e6:.1f} MB)")
    return exported_target


def _patch_raytune() -> None:
    """
    Ultralytics' raytune callback calls ray.train._internal.session._get_session()
    which was renamed to get_session() in newer Ray versions. Monkeypatch the
    missing attribute so the callback becomes a no-op instead of crashing.
    """
    try:
        import ray.train._internal.session as _session
        if not hasattr(_session, "_get_session"):
            _session._get_session = lambda: None
    except Exception:
        pass


def main() -> None:
    _patch_raytune()

    try:
        from ultralytics import YOLO
    except ImportError as exc:
        raise SystemExit("Install ml/requirements-guard.txt before training the Guard detector") from exc

    data_yaml = resolve_path(env("SHIFA_GUARD_DATA_YAML", "data/guard/weapon_detection/data.yaml"))
    base_model = env("SHIFA_GUARD_BASE_MODEL", "yolo11n.pt")
    run_name = env("SHIFA_GUARD_RUN_NAME", "shifa-guard-weapon-detector")
    project = resolve_path(env("SHIFA_GUARD_RUNS_DIR", "models/guard-runs"))
    output_dir = resolve_path(env("SHIFA_GUARD_MODEL_DIR", "models/shifa-guard-weapon-detector"))
    image_size = env_int("SHIFA_GUARD_IMAGE_SIZE", 640)

    if not data_yaml.exists():
        raise SystemExit(f"Missing Guard dataset YAML: {data_yaml}. Run guard/prepare_weapon_dataset.py first.")

    output_dir.mkdir(parents=True, exist_ok=True)
    target = output_dir / "best.pt"

    if env("SHIFA_GUARD_SKIP_TRAIN", "0") == "1":
        if not target.exists():
            raise SystemExit(f"SHIFA_GUARD_SKIP_TRAIN=1 but missing trained model: {target}")
        print(f"Skipping Guard training and reusing existing model: {target}")
    else:
        model = YOLO(base_model)
        results = model.train(
            data=str(data_yaml),
            epochs=env_int("SHIFA_GUARD_EPOCHS", 80),
            imgsz=image_size,
            batch=env_int("SHIFA_GUARD_BATCH_SIZE", 16),
            patience=env_int("SHIFA_GUARD_PATIENCE", 20),
            device=env("SHIFA_GUARD_DEVICE", "0"),
            project=str(project),
            name=run_name,
            exist_ok=True,
            seed=env_int("SHIFA_SEED", 42),
            iou=env_float("SHIFA_GUARD_VAL_IOU", 0.5),
            # conf intentionally omitted — YOLO uses 0.001 internally during training
            # validation to sweep the full PR curve. Passing 0.35 here collapses
            # P/R/mAP50 to 0 for all epochs because early predictions never reach
            # that threshold. 0.35 is applied at inference time only (validate script).
        )

        best = Path(results.save_dir) / "weights" / "best.pt"
        target.write_bytes(best.read_bytes())

    export_format = env("SHIFA_GUARD_EXPORT_FORMAT", "tflite")
    if export_format != "tflite":
        exported_target = target.with_suffix(f".{export_format}")
        YOLO(str(target)).export(format=export_format, imgsz=image_size)
    else:
        exported_target = export_tflite(target, output_dir, image_size)

    write_json(
        "reports/guard_training_manifest.json",
        {
            "data_yaml": str(data_yaml),
            "base_model": base_model,
            "best_pt": str(target),
            "exported_model": str(exported_target),
            "classes": CLASS_NAMES,
            "notes": "Current validation supports GUN/firearm detection; KNIFE remains weak and should not trigger dispatch alone.",
        },
    )
    print(f"Guard detector trained: {target}")
    print(f"Guard detector export: {exported_target if exported_target.exists() else exported_path}")


if __name__ == "__main__":
    main()
