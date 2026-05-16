from __future__ import annotations

import shutil
import sys
from pathlib import Path
from typing import Any

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from finetune.common import env, resolve_path, write_json


DEFAULT_DATASET = "Subh775/WeaponDetection"
CLASS_NAMES = ["HANDGUN", "RIFLE", "SHOTGUN", "HEAVY_WEAPON", "RPG", "KNIFE", "PERSON"]
LABEL_MAP = {
    "guns": "HANDGUN",
    "guns perspective": "HANDGUN",
    "hand pistol": "HANDGUN",
    "handgun": "HANDGUN",
    "pistol": "HANDGUN",
    "pistols": "HANDGUN",
    "rifle": "RIFLE",
    "long guns": "RIFLE",
    "shotgun": "SHOTGUN",
    "heavy gun": "HEAVY_WEAPON",
    "heavygun": "HEAVY_WEAPON",
    "heavyweapon": "HEAVY_WEAPON",
    "weapon": "HEAVY_WEAPON",
    "weapons": "HEAVY_WEAPON",
    "rpg": "RPG",
    "rpg-7": "RPG",
    "knife": "KNIFE",
    "knife_deploy": "KNIFE",
    "knife_weapon": "KNIFE",
    "stabbing": "KNIFE",
    "person": "PERSON",
    "aggressor": "PERSON",
    "victim": "PERSON",
    "hand": "PERSON",
}


def category_names(features: Any) -> list[str]:
    objects = features["objects"]
    category = objects.feature["category"] if hasattr(objects, "feature") else objects["category"]
    return list(getattr(category, "names", []))


def yolo_bbox(bbox: list[float], width: int, height: int) -> tuple[float, float, float, float]:
    x, y, w, h = bbox
    return (
        (x + w / 2) / width,
        (y + h / 2) / height,
        w / width,
        h / height,
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

    for idx, row in enumerate(dataset):
        image = row["image"].convert("RGB")
        width = int(row.get("width") or image.width)
        height = int(row.get("height") or image.height)
        objects = row.get("objects") or {}
        bboxes = objects.get("bbox") or []
        categories = objects.get("category") or []
        lines: list[str] = []

        for bbox, category in zip(bboxes, categories):
            label = label_names[int(category)] if label_names else str(category)
            target_label = canonical_label(label)
            if not target_label or target_label not in class_to_id:
                continue
            xc, yc, bw, bh = yolo_bbox([float(value) for value in bbox], width, height)
            if bw <= 0 or bh <= 0:
                continue
            values = [max(0.0, min(1.0, value)) for value in (xc, yc, bw, bh)]
            lines.append(f"{class_to_id[target_label]} " + " ".join(f"{value:.6f}" for value in values))
            stats["class_counts"][target_label] += 1

        if not lines:
            stats["skipped"] += 1
            continue

        stem = f"{split}_{idx:06d}"
        image.save(image_dir / f"{stem}.jpg", quality=92)
        (label_dir / f"{stem}.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
        stats["images"] += 1
        stats["boxes"] += len(lines)

    return stats


def main() -> None:
    try:
        from datasets import load_dataset
    except ImportError as exc:
        raise SystemExit("Install ml/requirements-guard.txt before preparing the Guard dataset") from exc

    dataset_name = env("SHIFA_GUARD_DATASET", DEFAULT_DATASET)
    out_dir = resolve_path(env("SHIFA_GUARD_DATA_DIR", "data/guard/weapon_detection"))
    if env("SHIFA_GUARD_RESET_DATA", "0") == "1" and out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    dataset = load_dataset(dataset_name)
    label_names = category_names(next(iter(dataset.values())).features)
    manifest: dict[str, Any] = {
        "dataset": dataset_name,
        "classes": CLASS_NAMES,
        "splits": {},
    }

    for source_split, target_split in [("train", "train"), ("validation", "val"), ("test", "test")]:
        if source_split not in dataset:
            continue
        manifest["splits"][target_split] = export_split(dataset[source_split], target_split, out_dir, label_names)

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
