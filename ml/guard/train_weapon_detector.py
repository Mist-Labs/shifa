from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from finetune.common import env, env_float, env_int, resolve_path, write_json


def main() -> None:
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
        conf=env_float("SHIFA_GUARD_VAL_CONF", 0.35),
        iou=env_float("SHIFA_GUARD_VAL_IOU", 0.5),
    )

    best = Path(results.save_dir) / "weights" / "best.pt"
    output_dir.mkdir(parents=True, exist_ok=True)
    target = output_dir / "best.pt"
    target.write_bytes(best.read_bytes())

    model = YOLO(str(target))
    export_format = env("SHIFA_GUARD_EXPORT_FORMAT", "tflite")
    exported = model.export(format=export_format, imgsz=env_int("SHIFA_GUARD_IMAGE_SIZE", 640), int8=env("SHIFA_GUARD_INT8", "1") == "1")
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
            "classes": ["HANDGUN", "RIFLE", "SHOTGUN", "HEAVY_WEAPON", "RPG", "KNIFE", "PERSON"],
        },
    )
    print(f"Guard detector trained: {target}")
    print(f"Guard detector export: {exported_target if exported_target.exists() else exported_path}")


if __name__ == "__main__":
    main()
