from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from finetune.common import env, resolve_path, write_json


# Roboflow dataset: universe.roboflow.com/yolov7test-u13vc/weapon-detection-m7qso
# Exported in YOLOv8 format: pre-split, pre-annotated, no COCO bbox conversion.
DEFAULT_RF_WORKSPACE = "yolov7test-u13vc"
DEFAULT_RF_PROJECT = "weapon-detection-m7qso"
DEFAULT_RF_VERSION = "16"

CLASS_NAMES = ["GUN", "KNIFE", "PERSON"]

GUN_SYNONYMS = {
    "gun",
    "guns",
    "firearm",
    "firearms",
    "handgun",
    "pistol",
    "pistols",
    "rifle",
    "shotgun",
    "heavy gun",
    "heavygun",
    "heavyweapon",
    "weapon",
    "weapons",
    "long guns",
    "rpg",
    "rpg 7",
    "submachine gun",
}

KNIFE_SYNONYMS = {
    "knife",
    "knife deploy",
    "knife weapon",
    "stabbing",
    "blade",
}

PERSON_SYNONYMS = {
    "person",
    "people",
    "aggressor",
    "victim",
    "hand",
}


def normalize_label(name: str) -> str:
    normalized = name.strip().lower().replace("-", " ").replace("_", " ")
    return " ".join(normalized.split())


def to_our_class(name: str) -> str | None:
    normalized = normalize_label(name)
    if normalized in GUN_SYNONYMS:
        return "GUN"
    if normalized in KNIFE_SYNONYMS:
        return "KNIFE"
    if normalized in PERSON_SYNONYMS:
        return "PERSON"
    return None


def load_roboflow() -> Any:
    try:
        from roboflow import Roboflow
    except ImportError as exc:
        raise SystemExit(
            "Missing roboflow package. Run: python -m pip install -r requirements-guard.txt"
        ) from exc
    return Roboflow


def download_dataset(api_key: str, workspace: str, project: str, version: int, out_dir: Path) -> Path:
    dataset_url = env("SHIFA_RF_DATASET_URL", f"{workspace}/{project}/{version}")

    print(f"Downloading Roboflow Universe dataset {dataset_url} in YOLOv8 format...")
    try:
        subprocess.run(
            ["roboflow", "download", "-f", "yolov8", "-l", str(out_dir), dataset_url],
            check=True,
        )
    except FileNotFoundError as exc:
        raise SystemExit(
            "Missing roboflow CLI. Run: python -m pip install -r requirements-guard.txt"
        ) from exc
    except subprocess.CalledProcessError as exc:
        raise SystemExit(
            "Roboflow dataset download failed. Confirm the dataset URL/version is public "
            "or fork it into your workspace, then set SHIFA_RF_DATASET_URL."
        ) from exc

    return find_data_yaml(out_dir).parent


def find_data_yaml(dataset_dir: Path) -> Path:
    direct = dataset_dir / "data.yaml"
    if direct.exists():
        return direct

    matches = sorted(dataset_dir.rglob("data.yaml"))
    if not matches:
        raise RuntimeError(f"No data.yaml found under {dataset_dir}")
    if len(matches) > 1:
        print(f"Multiple data.yaml files found; using {matches[0]}")
    return matches[0]


def source_names(src_meta: dict[str, Any]) -> dict[int, str]:
    names = src_meta.get("names", {})
    if isinstance(names, list):
        return {idx: str(name) for idx, name in enumerate(names)}
    return {int(idx): str(name) for idx, name in names.items()}


def remap_classes(dataset_dir: Path) -> Path:
    src_yaml_path = find_data_yaml(dataset_dir)
    with src_yaml_path.open(encoding="utf-8") as f:
        src_meta = yaml.safe_load(f) or {}

    src_id_to_name = source_names(src_meta)
    our_id = {name: idx for idx, name in enumerate(CLASS_NAMES)}
    src_id_to_ours: dict[int, int] = {}
    unmapped: list[str] = []

    for src_id, src_name in src_id_to_name.items():
        mapped = to_our_class(src_name)
        if mapped is None:
            unmapped.append(src_name)
            continue
        src_id_to_ours[src_id] = our_id[mapped]

    if unmapped:
        print(f"[remap] source classes not mapped and dropped: {unmapped}")
    if not src_id_to_ours:
        raise RuntimeError(f"No Roboflow classes mapped to {CLASS_NAMES}. Source names: {src_id_to_name}")
    print(f"[remap] source names: {src_id_to_name}")
    print(f"[remap] class id map: {src_id_to_ours}")

    for label_file in dataset_dir.rglob("*.txt"):
        if label_file.name == "classes.txt":
            continue
        lines = label_file.read_text(encoding="utf-8").splitlines()
        new_lines: list[str] = []
        for line in lines:
            parts = line.strip().split()
            if not parts:
                continue
            try:
                src_id = int(float(parts[0]))
            except ValueError:
                continue
            if src_id not in src_id_to_ours:
                continue
            new_lines.append(f"{src_id_to_ours[src_id]} " + " ".join(parts[1:]))
        label_file.write_text("\n".join(new_lines) + "\n" if new_lines else "", encoding="utf-8")

    dataset_root = src_yaml_path.parent
    val_folder = "valid" if (dataset_root / "valid" / "images").exists() else "val"
    test_folder = "test" if (dataset_root / "test" / "images").exists() else val_folder

    src_yaml_path.write_text(
        yaml.safe_dump(
            {
                "path": str(dataset_root),
                "train": "train/images",
                "val": f"{val_folder}/images",
                "test": f"{test_folder}/images",
                "names": dict(enumerate(CLASS_NAMES)),
            },
            sort_keys=False,
        ),
        encoding="utf-8",
    )
    print(f"[remap] data.yaml written to {src_yaml_path}")
    return src_yaml_path


def collect_stats(data_yaml: Path) -> dict[str, Any]:
    with data_yaml.open(encoding="utf-8") as f:
        meta = yaml.safe_load(f) or {}

    root = Path(meta["path"])
    splits: dict[str, Any] = {}
    for split_name, rel_images in [("train", meta.get("train")), ("val", meta.get("val")), ("test", meta.get("test"))]:
        if not rel_images:
            continue
        image_dir = root / rel_images
        label_dir = image_dir.parent / "labels"
        if not image_dir.exists():
            continue

        images = [
            *image_dir.glob("*.jpg"),
            *image_dir.glob("*.jpeg"),
            *image_dir.glob("*.png"),
        ]
        boxes = 0
        empty_labels = 0
        class_counts = {name: 0 for name in CLASS_NAMES}

        for label_file in label_dir.glob("*.txt"):
            lines = [line for line in label_file.read_text(encoding="utf-8").splitlines() if line.strip()]
            if not lines:
                empty_labels += 1
            for line in lines:
                parts = line.strip().split()
                if not parts:
                    continue
                cls_id = int(float(parts[0]))
                boxes += 1
                if 0 <= cls_id < len(CLASS_NAMES):
                    class_counts[CLASS_NAMES[cls_id]] += 1

        splits[split_name] = {
            "images": len(images),
            "boxes": boxes,
            "empty_labels": empty_labels,
            "class_counts": class_counts,
        }

    return splits


def main() -> None:
    api_key = env("ROBOFLOW_API_KEY", "")
    if not api_key:
        raise SystemExit("ROBOFLOW_API_KEY is not set. Add it to Kaggle secrets and ml/.env.")

    workspace = env("SHIFA_RF_WORKSPACE", DEFAULT_RF_WORKSPACE)
    project = env("SHIFA_RF_PROJECT", DEFAULT_RF_PROJECT)
    version = int(env("SHIFA_RF_VERSION", DEFAULT_RF_VERSION))
    out_dir = resolve_path(env("SHIFA_GUARD_DATA_DIR", "data/guard/weapon_detection"))

    if env("SHIFA_GUARD_RESET_DATA", "0") == "1" and out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    dataset_dir = download_dataset(api_key, workspace, project, version, out_dir)
    print(f"Dataset downloaded to: {dataset_dir}")

    data_yaml = remap_classes(dataset_dir)
    stable_yaml = out_dir / "data.yaml"
    if data_yaml != stable_yaml:
        stable_yaml.write_text(data_yaml.read_text(encoding="utf-8"), encoding="utf-8")
        print(f"Stable Guard data.yaml written to: {stable_yaml}")
        data_yaml = stable_yaml

    with data_yaml.open(encoding="utf-8") as f:
        data_meta = yaml.safe_load(f) or {}
    train_images = Path(data_meta["path"]) / data_meta["train"]
    if not train_images.exists() or not any(train_images.iterdir()):
        raise RuntimeError(f"No training images found at {train_images} after Roboflow download.")

    stats = collect_stats(data_yaml)
    for split, split_stats in stats.items():
        print(
            f"[{split}] {split_stats['images']} images, {split_stats['boxes']} boxes, "
            f"class counts: {split_stats['class_counts']}"
        )

    manifest: dict[str, Any] = {
        "dataset": f"{workspace}/{project}@v{version}",
        "source": "roboflow",
        "classes": CLASS_NAMES,
        "data_yaml": str(data_yaml),
        "splits": stats,
    }
    write_json("reports/guard_dataset_manifest.json", manifest)
    print(f"Guard dataset ready: {data_yaml}")


if __name__ == "__main__":
    main()
