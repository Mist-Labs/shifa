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

ROUTINE_OVERRIDE_PATTERNS: list[tuple[str, str]] = [
    (
        r"fever.{0,50}(widespread\s+rash|rash).{0,80}(cough|red\s+eyes)|"
        r"(widespread\s+rash|rash).{0,80}(cough|red\s+eyes).{0,80}fever|"
        r"measles",
        "Measles suspected without emergency danger signs",
    ),
]


def _check_muac(text: str) -> tuple[bool, str | None]:
    value = _muac_value(text)
    if value is not None and value < MUAC_URGENT_THRESHOLD_CM:
        return True, f"MUAC {value:g}cm < {MUAC_URGENT_THRESHOLD_CM}cm"
    return False, None


def _muac_value(text: str) -> float | None:
    matches = re.findall(r"muac[:\s=]*([0-9]+(?:\.[0-9]+)?)\s*(?:cm)?", text, re.IGNORECASE)
    for value in matches:
        try:
            return float(value)
        except ValueError:
            continue
    return None


def _list_text(value: Any) -> str:
    if isinstance(value, list):
        return " ".join(str(item) for item in value)
    return str(value or "")


def _objective_text(pred: dict[str, Any], symptom_text: str) -> str:
    # Guardrail overrides should be grounded in the original clinical intake.
    # Model danger_signs are scored separately; using them here can turn a model
    # hallucination into a deterministic emergency override.
    return symptom_text


def _diagnostic_text(pred: dict[str, Any]) -> str:
    return " ".join([
        str(pred.get("primary_diagnosis") or ""),
        str(pred.get("reasoning_trace") or ""),
    ])


def _urgent_objective_reason(objective: str) -> str | None:
    triggered, reason = _check_muac(objective)
    if triggered:
        return reason
    for pattern, reason in OBJECTIVE_URGENT_PATTERNS:
        if _has_non_negated_match(pattern, objective):
            return reason
    return None


def _has_non_negated_match(pattern: str, text: str) -> bool:
    for match in re.finditer(pattern, text, re.IGNORECASE):
        if not _is_negated_match(text, match.start(), match.end()):
            return True
    return False


def _is_negated_match(text: str, start: int, end: int) -> bool:
    before = text[max(0, start - 50):start].lower()
    after = text[end:end + 30].lower()
    return bool(
        re.search(r"\b(no|none|without|denies|denied|absent|negative\s+for)\b[\w\s:,-]{0,40}$", before)
        or re.match(r"\s*:\s*(no|none|absent|negative)\b", after)
    )


def _routine_override_reason(objective: str, diagnostic: str) -> str | None:
    text = f"{objective} {diagnostic}"
    for pattern, reason in ROUTINE_OVERRIDE_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            return reason
    return None


def _treat_override_reason(objective: str, diagnostic: str) -> str | None:
    text = f"{objective} {diagnostic}".lower()
    muac = _muac_value(objective)
    edema_absent = re.search(r"bilateral\s+edema\s*:\s*no|bipedal\s+edema\s*:\s*no", objective, re.IGNORECASE)
    if (
        muac is not None
        and muac >= MUAC_URGENT_THRESHOLD_CM
        and edema_absent
        and re.search(r"poor\s+appetite|malnutrition|mam|moderate", text)
    ):
        return "Moderate malnutrition without SAM danger signs"

    has_respiratory_symptom = re.search(r"cough|fast\s+breathing|pneumonia|acute\s+respiratory", text)
    has_non_severe_signals = re.search(r"alert|able\s+to\s+drink|no\s+danger\s+signs", objective, re.IGNORECASE)
    has_severe_respiratory_sign = re.search(
        r"chest\s+indrawing|stridor|severe\s+respiratory\s+distress|unable\s+to\s+drink|letharg",
        objective,
        re.IGNORECASE,
    )
    if has_respiratory_symptom and has_non_severe_signals and not has_severe_respiratory_sign:
        return "Non-severe pneumonia/ARI without emergency danger signs"

    return None


def apply_guardrails(
    pred: dict[str, Any],
    symptom_text: str,
    inferred_decision: str,
) -> tuple[str, str | None]:
    objective = _objective_text(pred, symptom_text)
    diagnostic = _diagnostic_text(pred)

    objective_urgent_reason = _urgent_objective_reason(objective)
    if objective_urgent_reason:
        return "REFER_URGENT", objective_urgent_reason

    routine_reason = _routine_override_reason(objective, diagnostic)
    if routine_reason:
        return "REFER_ROUTINE", routine_reason

    treat_reason = _treat_override_reason(objective, diagnostic)
    if treat_reason and inferred_decision == "REFER_URGENT":
        return "TREAT", treat_reason

    if inferred_decision == "REFER_URGENT":
        return inferred_decision, None

    for pattern, reason in DIAGNOSIS_URGENT_PATTERNS:
        if re.search(pattern, diagnostic, re.IGNORECASE):
            return "REFER_URGENT", reason

    return inferred_decision, None
