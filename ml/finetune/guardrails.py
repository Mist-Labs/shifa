from __future__ import annotations

import re
from typing import Any


MUAC_URGENT_THRESHOLD_CM = 11.5

# High-precision objective signs. These should be present in the case text or
# model danger signs, not only in broad differential diagnoses.
OBJECTIVE_URGENT_PATTERNS: list[tuple[str, str]] = [
    (r"bilateral\s+edema|bipedal\s+edema|oedema\s+of\s+both\s+feet", "Bilateral edema"),
    (r"neonate.{0,50}(unable to feed|not feeding|cannot feed|refusing feed)", "Neonatal feeding danger"),
    (r"(unable to feed|not feeding|cannot feed|refusing feed).{0,50}neonate", "Neonatal feeding danger"),
    (r"neonate.{0,50}fast\s+breathing", "Neonatal breathing danger"),
    (r"fast\s+breathing.{0,50}neonate", "Neonatal breathing danger"),
    (r"newborn.{0,50}(not feeding|unable to feed|cannot feed)", "Newborn feeding danger"),
    (r"sexual\s+violence|\bgbv\b|\brape\b", "Sexual violence survivor"),
    (r"pregnan.{0,50}(heavy\s+vaginal\s+bleeding|vaginal\s+bleeding|severe\s+headache)", "Maternal danger sign"),
    (r"(heavy\s+vaginal\s+bleeding|vaginal\s+bleeding|severe\s+headache).{0,50}pregnan", "Maternal danger sign"),
    (r"eclampsia|pre-eclampsia|preeclampsia", "Eclampsia"),
    (r"convulsion|seizure|\bfits?\b", "Convulsions"),
    (r"stiff\s+neck|neck\s+stiffness|nuchal\s+rigidity", "Meningitis sign"),
    (r"bulging\s+fontanell?e", "Meningitis sign"),
    (r"severe\s+chest\s+indrawing|lower\s+chest\s+wall\s+indrawing|severe\s+respiratory\s+distress", "Severe chest indrawing"),
    (r"unconscious|unresponsive|loss\s+of\s+consciousness|altered\s+consciousness", "Altered consciousness"),
    (r"lethargic.{0,40}unable\s+to\s+drink|unable\s+to\s+drink.{0,40}lethargic", "Lethargic and unable to drink"),
    (r"not\s+able\s+to\s+drink|cannot\s+drink|unable\s+to\s+drink", "Unable to drink"),
]

DIAGNOSIS_URGENT_PATTERNS: list[tuple[str, str]] = [
    (r"severe\s+acute\s+malnutrition|(?<!\w)sam(?!\w)", "Severe acute malnutrition"),
    (r"severe\s+pneumonia", "Severe pneumonia"),
    (r"meningitis|meningococcal", "Meningitis"),
    (r"sexual\s+violence|\bgbv\b|\brape\b", "Sexual violence survivor"),
    (r"maternal\s+danger|obstetric\s+emergency", "Maternal danger sign"),
]


def _check_muac(text: str) -> tuple[bool, str | None]:
    matches = re.findall(r"muac[:\s=]*([0-9]+(?:\.[0-9]+)?)\s*(?:cm)?", text, re.IGNORECASE)
    for value in matches:
        try:
            if float(value) < MUAC_URGENT_THRESHOLD_CM:
                return True, f"MUAC {value}cm < {MUAC_URGENT_THRESHOLD_CM}cm"
        except ValueError:
            continue
    return False, None


def _list_text(value: Any) -> str:
    if isinstance(value, list):
        return " ".join(str(item) for item in value)
    return str(value or "")


def _objective_text(pred: dict[str, Any], symptom_text: str) -> str:
    return " ".join([
        symptom_text,
        _list_text(pred.get("danger_signs")),
    ])


def _diagnostic_text(pred: dict[str, Any]) -> str:
    return " ".join([
        str(pred.get("primary_diagnosis") or ""),
        str(pred.get("reasoning_trace") or ""),
    ])


def apply_guardrails(
    pred: dict[str, Any],
    symptom_text: str,
    inferred_decision: str,
) -> tuple[str, str | None]:
    if inferred_decision == "REFER_URGENT":
        return inferred_decision, None

    objective = _objective_text(pred, symptom_text)
    diagnostic = _diagnostic_text(pred)

    triggered, reason = _check_muac(objective)
    if triggered:
        return "REFER_URGENT", reason

    for pattern, reason in OBJECTIVE_URGENT_PATTERNS:
        if re.search(pattern, objective, re.IGNORECASE):
            return "REFER_URGENT", reason

    for pattern, reason in DIAGNOSIS_URGENT_PATTERNS:
        if re.search(pattern, diagnostic, re.IGNORECASE):
            return "REFER_URGENT", reason

    return inferred_decision, None
