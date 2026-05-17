from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from finetune.common import env, env_float, resolve_path, write_json

CLASS_NAMES = ["GUN", "KNIFE", "PERSON"]
ALERT_CLASSES = ["GUN"]
EXPERIMENTAL_CLASSES = ["KNIFE"]


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

    alert_map50_values = [per_class_map50[c] for c in ALERT_CLASSES if c in per_class_map50]
    alert_map50 = sum(alert_map50_values) / len(alert_map50_values) if alert_map50_values else 0.0
    gun_map50 = per_class_map50.get("GUN", 0.0)
    knife_map50 = per_class_map50.get("KNIFE", 0.0)

    min_gun_map50 = env_float("SHIFA_GUARD_MIN_GUN_MAP50", 0.60)
    min_alert_map50 = env_float("SHIFA_GUARD_MIN_ALERT_MAP50", min_gun_map50)
    fail_on_validation = env("SHIFA_GUARD_FAIL_ON_VALIDATION", "1") == "1"

    result = {
        "model": str(model_path),
        "data_yaml": str(data_yaml),
        "split": env("SHIFA_GUARD_VAL_SPLIT", "test"),
        "classes": CLASS_NAMES,
        "alert_classes": ALERT_CLASSES,
        "experimental_classes": EXPERIMENTAL_CLASSES,
        "thresholds": {
            "runtime_confirm_confidence": env_float("SHIFA_GUARD_CONFIRM_CONF", 0.65),
            "min_gun_map50": min_gun_map50,
            "min_alert_map50": min_alert_map50,
            "fail_on_validation": fail_on_validation,
        },
        "metrics": {
            "map50": float(box.map50),
            "map50_95": float(box.map),
            "precision": float(box.mp),
            "recall": float(box.mr),
            "per_class_map50": per_class_map50,
            "alert_map50": alert_map50,
            "gun_map50": gun_map50,
            "knife_map50": knife_map50,
        },
        "passed_targets": {
            "gun_map50": gun_map50 >= min_gun_map50,
            "alert_map50": alert_map50 >= min_alert_map50,
        },
        "notes": "Only GUN/firearm detections are validated for emergency alerting. KNIFE is reported as experimental and must not trigger dispatch alone.",
    }
    write_json(report_path, result)

    print(f"Guard overall mAP50 : {result['metrics']['map50']:.3f}  (reported, not a release gate)")
    print(f"Guard GUN     mAP50 : {gun_map50:.3f}  (target >= {min_gun_map50:.2f}  {'✅' if result['passed_targets']['gun_map50'] else '❌'})")
    print(f"Guard alert   mAP50 : {alert_map50:.3f}  (target >= {min_alert_map50:.2f}  {'✅' if result['passed_targets']['alert_map50'] else '❌'})")
    print("Guard KNIFE status : experimental; do not trigger dispatch from KNIFE alone")
    if per_class_map50:
        for cls, val in per_class_map50.items():
            print(f"  {cls:<14}: {val:.3f}")
    print(f"Guard report: {resolve_path(report_path)}")

    if fail_on_validation and not all(result["passed_targets"].values()):
        raise SystemExit("Guard firearm validation failed; upload blocked.")


if __name__ == "__main__":
    main()
