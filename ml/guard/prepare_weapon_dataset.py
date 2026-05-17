from __future__ import annotations

import shutil
import sys
from pathlib import Path
from typing import Any

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from finetune.common import env, resolve_path, write_json


DEFAULT_DATASET = "Subh775/WeaponDetection_Grouped"

# Grouped detector classes. Gun subtype labels are intentionally collapsed
# because the original split was too sparse/noisy for reliable subtype training.
CLASS_NAMES = ["GUN", "KNIFE", "PERSON"]

# Integer category IDs for Subh775/WeaponDetection_Grouped when the HuggingFace
# feature schema does not expose ClassLabel names. The old 29-class mapping is
# also tolerated below so either dataset can still be normalized.
DATASET_INT_TO_LABEL: dict[int, str] = {
    0: "GUN",
    1: "KNIFE",
    2: "PERSON",
}

LEGACY_DATASET_INT_TO_LABEL: dict[int, str] = {
    0:  "weapons",
    1:  "Aggressor",
    2:  "Blood",
    3:  "Guns",
    4:  "Guns perspective",
    5:  "Hand",
    6:  "Heavy Gun",
    7:  "Knife",
    8:  "Knife_Deploy",
    9:  "Knife_Weapon",
    10: "Long guns",
    11: "Person",
    12: "Pistol",
    13: "Rifle",
    14: "Shotgun",
    15: "Stabbing",
    16: "Victim",
    17: "al",          # junk label — will not match LABEL_MAP, skipped
    18: "guns",
    19: "handgun",
    20: "heavyweapon",
    21: "larga",       # Spanish/Portuguese "long" (arma larga = long gun)
    22: "person",
    23: "pistol",
    24: "pistols",
    25: "rifle",
    26: "shotgun",
    27: "violence",    # junk label — will not match LABEL_MAP, skipped
    28: "weapon",
}

LABEL_MAP = {
    "gun": "GUN",
    "guns": "GUN",
    "firearm": "GUN",
    "firearms": "GUN",
    "guns perspective": "GUN",
    "hand pistol": "GUN",
    "handgun": "GUN",
    "pistol": "GUN",
    "pistols": "GUN",
    "rifle": "GUN",
    "long guns": "GUN",
    "larga": "GUN",           # arma larga = long gun
    "shotgun": "GUN",
    "heavy gun": "GUN",
    "heavygun": "GUN",
    "heavyweapon": "GUN",
    "weapon": "GUN",
    "weapons": "GUN",
    "rpg": "GUN",
    "rpg 7": "GUN",
    "knife": "KNIFE",
    "knife deploy": "KNIFE",
    "knife weapon": "KNIFE",
    "stabbing": "KNIFE",
    "person": "PERSON",
    "aggressor": "PERSON",
    "victim": "PERSON",
    "hand": "PERSON",
}


def category_names(features: Any) -> list[str]:
    """
    Attempt to extract ClassLabel names from the HuggingFace feature schema.
    For Subh775/WeaponDetection this returns [] because the category feature
    is a plain int64 with no ClassLabel attached. Callers should fall back to
    DATASET_INT_TO_LABEL in that case.
    """
    objects = features["objects"]
    category = objects.feature["category"] if hasattr(objects, "feature") else objects["category"]
    return list(getattr(category, "names", []))


def yolo_bbox(bbox: list[float], width: int, height: int) -> tuple[float, float, float, float] | None:
    x, y, w, h = bbox
    if width <= 0 or height <= 0 or w <= 0 or h <= 0:
        return None

    # Hugging Face object-detection datasets use COCO XYWH boxes. Some source
    # annotations extend beyond the image bounds; clip in pixel space before
    # normalizing so YOLO does not train on impossible boxes.
    if max(x, y, w, h) <= 1.5:
        x *= width
        w *= width
        y *= height
        h *= height

    x1 = max(0.0, x)
    y1 = max(0.0, y)
    x2 = min(float(width), x + w)
    y2 = min(float(height), y + h)
    clipped_w = x2 - x1
    clipped_h = y2 - y1
    if clipped_w <= 1.0 or clipped_h <= 1.0:
        return None

    return (
        (x1 + clipped_w / 2) / width,
        (y1 + clipped_h / 2) / height,
        clipped_w / width,
        clipped_h / height,
    )


def canonical_label(label: str) -> str | None:
    normalized = label.strip().lower().replace("-", " ").replace("_", " ")
    normalized = " ".join(normalized.split())
    return LABEL_MAP.get(normalized) or LABEL_MAP.get(normalized.replace(" ", "_"))


def export_split(dataset: Any, split: str, out_dir: Path, label_names: list[str]) -> dict[str, int]:
    image_dir = out_dir / split / "images"
    label_dir = out_dir / split / "labels"
    image_dir.mkdir(parents=True, exist_ok=True)
    label_dir.mkdir(parents=True, exist_ok=True)

    stats: dict[str, Any] = {"images": 0, "boxes": 0, "skipped": 0, "class_counts": {name: 0 for name in CLASS_NAMES}}
    class_to_id = {name: idx for idx, name in enumerate(CLASS_NAMES)}
    unmapped: set[str] = set()

    for idx, row in enumerate(dataset):
        image = row["image"].convert("RGB")
        width = int(row.get("width") or image.width)
        height = int(row.get("height") or image.height)
        objects = row.get("objects") or {}
        bboxes = objects.get("bbox") or []
        categories = objects.get("category") or []
        lines: list[str] = []

        for bbox, category in zip(bboxes, categories):
            if isinstance(category, int):
                # Prefer schema-derived names; fall back to hardcoded map.
                if label_names and 0 <= category < len(label_names):
                    label = label_names[category]
                elif category in DATASET_INT_TO_LABEL:
                    label = DATASET_INT_TO_LABEL[category]
                elif category in LEGACY_DATASET_INT_TO_LABEL:
                    label = LEGACY_DATASET_INT_TO_LABEL[category]
                else:
                    unmapped.add(f"<int:{category}>")
                    continue
            else:
                label = str(category)

            target_label = canonical_label(label)
            if not target_label or target_label not in class_to_id:
                unmapped.add(label)
                continue

            converted = yolo_bbox([float(value) for value in bbox], width, height)
            if converted is None:
                continue
            lines.append(f"{class_to_id[target_label]} " + " ".join(f"{value:.6f}" for value in converted))
            stats["class_counts"][target_label] += 1

        if not lines:
            stats["skipped"] += 1
            continue

        stem = f"{split}_{idx:06d}"
        image.save(image_dir / f"{stem}.jpg", quality=92)
        (label_dir / f"{stem}.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
        stats["images"] += 1
        stats["boxes"] += len(lines)

    if unmapped:
        print(f"[{split}] intentionally unmapped labels (junk/irrelevant): {sorted(unmapped)}")

    return stats


def main() -> None:
    try:
        from datasets import load_dataset
    except ImportError as exc:
        raise SystemExit(
            "Install ml/requirements-guard.txt before preparing the Guard dataset. "
            f"Original import error: {exc}"
        ) from exc

    dataset_name = env("SHIFA_GUARD_DATASET", DEFAULT_DATASET)
    out_dir = resolve_path(env("SHIFA_GUARD_DATA_DIR", "data/guard/weapon_detection"))
    if env("SHIFA_GUARD_RESET_DATA", "0") == "1" and out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    dataset = load_dataset(dataset_name)
    first_split = next(iter(dataset.values()))
    label_names = category_names(first_split.features)

    if label_names:
        print(f"Schema-derived category names ({len(label_names)}): {label_names}")
    else:
        print(f"No ClassLabel schema found — using grouped integer labels ({len(DATASET_INT_TO_LABEL)} entries)")

    manifest: dict[str, Any] = {
        "dataset": dataset_name,
        "classes": CLASS_NAMES,
        "splits": {},
    }

    for source_split, target_split in [("train", "train"), ("validation", "val"), ("test", "test")]:
        if source_split not in dataset:
            continue
        manifest["splits"][target_split] = export_split(dataset[source_split], target_split, out_dir, label_names)
        s = manifest["splits"][target_split]
        print(f"[{target_split}] exported {s['images']} images, {s['boxes']} boxes, {s['skipped']} skipped")
        print(f"[{target_split}] class counts: {s['class_counts']}")

    train_images = out_dir / "train" / "images"
    exported = list(train_images.iterdir()) if train_images.exists() else []
    if not exported:
        raise RuntimeError(
            f"No training images exported to {train_images}.\n"
            f"train split stats: {manifest['splits'].get('train')}"
        )

    yaml_path = out_dir / "data.yaml"
    yaml_path.write_text(
        yaml.safe_dump(
            {
                "path": str(out_dir),
                "train": "train/images",
                "val": "val/images",
                "test": "test/images",
                "names": dict(enumerate(CLASS_NAMES)),
            },
            sort_keys=False,
        ),
        encoding="utf-8",
    )
    manifest["data_yaml"] = str(yaml_path)
    write_json("reports/guard_dataset_manifest.json", manifest)
    print(f"Guard dataset ready: {yaml_path}")


if __name__ == "__main__":
    main()
