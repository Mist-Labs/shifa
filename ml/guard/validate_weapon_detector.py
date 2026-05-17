from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from finetune.common import env, env_float, resolve_path, write_json

# RPG removed — zero examples in all splits, would only suppress mAP
CLASS_NAMES = ["HANDGUN", "RIFLE", "SHOTGUN", "HEAVY_WEAPON", "KNIFE", "PERSON"]
WEAPON_CLASSES = ["HANDGUN", "RIFLE", "SHOTGUN", "HEAVY_WEAPON", "KNIFE"]


def main() -> None:
    try:
        from ultralytics import YOLO
    except ImportError as exc:
        raise SystemExit("Install ml/requirements-guard.txt before validating the Guard detector") from exc

    model_path = resolve_path(env("SHIFA_GUARD_PT_MODEL", "models/shifa-guard-weapon-detector/best.pt"))
    data_yaml = resolve_path(env("SHIFA_GUARD_DATA_YAML", "data/guard/weapon_detection/data.yaml"))
    report_path = env("SHIFA_GUARD_VALIDATION_REPORT", "reports/guard_validation_metrics.json")

    if not model_path.exists():
        raise SystemExit(f"Missing Guard model: {model_path}. Run guard/train_weapon_detector.py first.")

    model = YOLO(str(model_path))
    metrics = model.val(
        data=str(data_yaml),
        split=env("SHIFA_GUARD_VAL_SPLIT", "test"),
        conf=env_float("SHIFA_GUARD_CONFIRM_CONF", 0.65),
        iou=env_float("SHIFA_GUARD_VAL_IOU", 0.5),
    )
    box = metrics.box

    # Per-class mAP50: ap_class_index maps result indices → CLASS_NAMES indices
    per_class_map50: dict[str, float] = {}
    if hasattr(box, "ap_class_index") and hasattr(box, "ap50"):
        for result_idx, class_idx in enumerate(box.ap_class_index):
            if class_idx < len(CLASS_NAMES):
                per_class_map50[CLASS_NAMES[class_idx]] = float(box.ap50[result_idx])

    # Weapon-only mAP50: average over weapon classes that appeared in the val split
    weapon_map50_values = [per_class_map50[c] for c in WEAPON_CLASSES if c in per_class_map50]
    weapon_map50 = sum(weapon_map50_values) / len(weapon_map50_values) if weapon_map50_values else 0.0

    min_weapon_map50 = env_float("SHIFA_GUARD_MIN_WEAPON_MAP50", 0.85)
    min_overall_map50 = env_float("SHIFA_GUARD_MIN_OVERALL_MAP50", 0.80)

    result = {
        "model": str(model_path),
        "data_yaml": str(data_yaml),
        "split": env("SHIFA_GUARD_VAL_SPLIT", "test"),
        "classes": CLASS_NAMES,
        "weapon_classes": WEAPON_CLASSES,
        "thresholds": {
            "runtime_confirm_confidence": env_float("SHIFA_GUARD_CONFIRM_CONF", 0.65),
            "min_weapon_map50": min_weapon_map50,
            "min_overall_map50": min_overall_map50,
        },
        "metrics": {
            "map50": float(box.map50),
            "map50_95": float(box.map),
            "precision": float(box.mp),
            "recall": float(box.mr),
            "per_class_map50": per_class_map50,
            "weapon_map50": weapon_map50,
        },
        "passed_targets": {
            "overall_map50": float(box.map50) >= min_overall_map50,
            "weapon_map50": weapon_map50 >= min_weapon_map50,
        },
    }
    write_json(report_path, result)

    print(f"Guard overall mAP50 : {result['metrics']['map50']:.3f}  (target >= {min_overall_map50:.2f}  {'✅' if result['passed_targets']['overall_map50'] else '❌'})")
    print(f"Guard weapon  mAP50 : {weapon_map50:.3f}  (target >= {min_weapon_map50:.2f}  {'✅' if result['passed_targets']['weapon_map50'] else '❌'})")
    if per_class_map50:
        for cls, val in per_class_map50.items():
            print(f"  {cls:<14}: {val:.3f}")
    print(f"Guard report: {resolve_path(report_path)}")


if __name__ == "__main__":
    main()