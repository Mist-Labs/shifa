from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from finetune.common import env, env_float, env_int, resolve_path, write_json

CLASS_NAMES = ["GUN", "KNIFE", "PERSON"]


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

    if not data_yaml.exists():
        raise SystemExit(f"Missing Guard dataset YAML: {data_yaml}. Run guard/prepare_weapon_dataset.py first.")

    model = YOLO(base_model)
    results = model.train(
        data=str(data_yaml),
        epochs=env_int("SHIFA_GUARD_EPOCHS", 80),
        imgsz=env_int("SHIFA_GUARD_IMAGE_SIZE", 640),
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
    output_dir.mkdir(parents=True, exist_ok=True)
    target = output_dir / "best.pt"
    target.write_bytes(best.read_bytes())

    model = YOLO(str(target))
    export_format = env("SHIFA_GUARD_EXPORT_FORMAT", "tflite")

    # onnxscript is required by the torch 2.10+ ONNX export path used by
    # Ultralytics before TFLite conversion. Keep it in requirements too; this
    # import check gives a clearer Kaggle error if the environment is stale.
    try:
        import onnxscript  # noqa: F401
    except ImportError as exc:
        raise SystemExit("Missing onnxscript. Run: pip install -r requirements-guard.txt") from exc

    exported = model.export(
        format=export_format,
        imgsz=env_int("SHIFA_GUARD_IMAGE_SIZE", 640),
        int8=env("SHIFA_GUARD_INT8", "1") == "1",
        data=str(data_yaml),
    )
    exported_path = Path(exported)
    exported_target = output_dir / "shifa-guard-weapon-detector.tflite"
    if exported_path.exists():
        exported_target.write_bytes(exported_path.read_bytes())

    write_json(
        "reports/guard_training_manifest.json",
        {
            "data_yaml": str(data_yaml),
            "base_model": base_model,
            "best_pt": str(target),
            "exported_model": str(exported_target if exported_target.exists() else exported_path),
            "classes": CLASS_NAMES,
        },
    )
    print(f"Guard detector trained: {target}")
    print(f"Guard detector export: {exported_target if exported_target.exists() else exported_path}")


if __name__ == "__main__":
    main()
