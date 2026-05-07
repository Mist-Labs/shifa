from __future__ import annotations

from pathlib import Path
from typing import Any

try:
    from .common import env, read_jsonl, resolve_path, to_training_pair, write_json, write_jsonl
except ImportError:  # Allows direct execution: python finetune/prepare_data.py
    from common import env, read_jsonl, resolve_path, to_training_pair, write_json, write_jsonl

try:
    import pdfplumber
except ImportError:  # pragma: no cover - remote GPU env installs this.
    pdfplumber = None


SOURCES: dict[str, dict[str, Any]] = {
    "who_imci": {
        "filenames": ["imci-chart-booklet.pdf", "who_imci_chart_booklet_2025.pdf"],
        "description": "WHO IMCI chart booklet / child health chart booklet.",
        "urls": [],
    },
    "sphere": {
        "filenames": ["Sphere-Handbook-2018-EN.pdf", "sphere_handbook_2018_health.pdf"],
        "description": "Sphere Handbook 2018 health standards.",
        "urls": [],
    },
    "msf": {
        "filenames": [
            "msf_clinical_guidelines_10th.pdf",
            "web_sources/medicalguidelines-msf-org-en-viewport-cg-english-clinical-guidelines-16686604-html.pdf",
        ],
        "description": "MSF clinical guidelines. Latest public version is online-first.",
        "urls": [
            "https://medicalguidelines.msf.org/en/viewport/CG/english/clinical-guidelines-16686604.html"
        ],
    },
    "drc_malaria": {
        "filenames": ["DR_CONGO_Malaria_Profile_PMI_FY_2024.pdf", "drc_malaria_protocol.pdf"],
        "description": "DRC malaria country profile / protocol evidence.",
        "urls": ["https://www.severemalaria.org/countries/democratic-republic-congo"],
    },
    "cholera": {
        "filenames": [
            "Cholera Management Guidelines Revision (2).pdf",
            "who_cholera_case_management.pdf",
            "web_sources/medicalguidelines-msf-org-en-viewport-chol-english-management-of-a-cholera-epidemic-23444438-htm.pdf",
        ],
        "description": "Cholera case management / epidemic management guidance.",
        "urls": [
            "https://medicalguidelines.msf.org/en/viewport/CHOL/english/management-of-a-cholera-epidemic-23444438.html"
        ],
    },
    "nigeria_north": {
        "filenames": ["nigeria_north_chw_protocol.pdf", "web_sources/www-mnch2-com.pdf"],
        "description": "Northern Nigeria CHW / MNCH programme material when supplied by programme partners.",
        "urls": ["https://www.mnch2.com/"],
    },
}


def extract_pdf_text(path: Path) -> str:
    if pdfplumber is None:
        raise RuntimeError("pdfplumber is required to extract present PDF sources. Install ml/requirements.txt.")
    text: list[str] = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text.append(page_text)
    return "\n".join(text)


def build_source_manifest(raw_dir: Path) -> dict[str, Any]:
    manifest: dict[str, Any] = {
        "policy": "Public protocol sources only. No private patient data.",
        "sources": {},
    }
    extracted_dir = resolve_path("data/processed/extracted_sources")
    extracted_dir.mkdir(parents=True, exist_ok=True)

    for key, source in SOURCES.items():
        filenames = source["filenames"]
        source_path = next((raw_dir / name for name in filenames if (raw_dir / name).exists()), raw_dir / filenames[0])
        entry: dict[str, Any] = {
            "filenames": filenames,
            "selected_filename": source_path.name,
            "description": source.get("description"),
            "urls": source.get("urls", []),
            "present": source_path.exists(),
            "text_extract_path": None,
            "text_chars": 0,
            "extract_error": None,
        }
        if source_path.exists():
            try:
                text = extract_pdf_text(source_path)
                out_path = extracted_dir / f"{key}.txt"
                out_path.write_text(text, encoding="utf-8")
                entry["text_extract_path"] = str(out_path.relative_to(resolve_path(".")))
                entry["text_chars"] = len(text)
            except Exception as exc:
                entry["extract_error"] = str(exc)
        manifest["sources"][key] = entry
    return manifest


def main() -> None:
    raw_dir = resolve_path(env("SHIFA_RAW_DATA_DIR", "data/raw"))
    synthetic_file = env("SHIFA_SYNTHETIC_FILE", "data/processed/synthetic_cases_2000.jsonl")
    train_file = env("SHIFA_TRAIN_FILE", "data/processed/training_final.jsonl")

    cases = read_jsonl(synthetic_file)
    training_rows = [to_training_pair(case) for case in cases]
    write_jsonl(train_file, training_rows)

    manifest = build_source_manifest(raw_dir)
    manifest["training_rows"] = len(training_rows)
    manifest["training_file"] = train_file
    write_json("data/processed/source_manifest.json", manifest)
    print(f"Training pairs: {len(training_rows)}")
    print("Source manifest: data/processed/source_manifest.json")


if __name__ == "__main__":
    main()
