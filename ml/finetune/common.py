from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

try:
    from dotenv import load_dotenv
except Exception:  # pragma: no cover - python-dotenv is installed on the GPU env.
    load_dotenv = None


ML_ROOT = Path(__file__).resolve().parents[1]
if load_dotenv:
    load_dotenv(ML_ROOT / ".env")


def env(name: str, default: str | None = None, required: bool = False) -> str:
    value = os.environ.get(name, default)
    if required and not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value or ""


def env_int(name: str, default: int) -> int:
    return int(env(name, str(default)))


def env_float(name: str, default: float) -> float:
    return float(env(name, str(default)))


def resolve_path(value: str | Path) -> Path:
    path = Path(value)
    return path if path.is_absolute() else ML_ROOT / path


def read_jsonl(path: str | Path) -> list[dict[str, Any]]:
    target = resolve_path(path)
    if not target.exists():
        raise FileNotFoundError(target)
    with target.open("r", encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def write_jsonl(path: str | Path, rows: list[dict[str, Any]]) -> None:
    target = resolve_path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def write_json(path: str | Path, value: Any) -> None:
    target = resolve_path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


LANGUAGE_NAMES = {
    "ar": "Arabic",
    "so": "Somali",
    "fr": "French",
    "ln": "Lingala",
    "rw": "Kinyarwanda",
    "ha": "Hausa",
}


SYSTEM_PROMPT = (
    "You are SHIFA, a clinical decision support assistant for community health workers. "
    "Follow WHO IMCI protocols, Sphere Humanitarian Standards, and the country protocol "
    "module exactly. Respond only as valid JSON. Default to REFER_URGENT when confidence "
    "is below 0.70, when danger signs are present, or when age/weight needed for dosing "
    "is missing. Never provide a drug dose without confirming patient age and weight."
)


def country_prompt(country: str, language: str) -> str:
    lang_name = LANGUAGE_NAMES.get(language, language)
    return (
        f"{SYSTEM_PROMPT}\nCountry module: {country}.\n"
        f"Respond in {lang_name}. Include reasoning_trace, confidence, danger_signs, "
        "and voice_response."
    )


def chat_format(messages: list[dict[str, str]]) -> str:
    return "".join(
        f"<start_of_turn>{message['role']}\n{message['content']}<end_of_turn>\n"
        for message in messages
    ) + "<start_of_turn>model\n"


def to_training_pair(case: dict[str, Any]) -> dict[str, Any]:
    system = country_prompt(case["country"], case["language"])
    answer = json.dumps(case["expected_decision"], ensure_ascii=False)
    return {
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": case["symptom_text"]},
            {"role": "assistant", "content": answer},
        ],
        "text": (
            f"<start_of_turn>system\n{system}<end_of_turn>\n"
            f"<start_of_turn>user\n{case['symptom_text']}<end_of_turn>\n"
            f"<start_of_turn>model\n{answer}<end_of_turn>\n"
        ),
        "case_id": case["id"],
        "country": case["country"],
        "language": case["language"],
        "condition": case["condition"],
    }


def extract_json_object(text: str) -> dict[str, Any]:
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, flags=re.IGNORECASE)
    candidate = fenced.group(1) if fenced else text
    match = re.search(r"\{[\s\S]*\}", candidate)
    if not match:
        raise ValueError("No JSON object found in model output")
    return json.loads(match.group(0))


def normalize_text(value: Any) -> str:
    return str(value or "").strip().lower()
