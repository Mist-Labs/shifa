from __future__ import annotations

import json
import re
import sys
from typing import Any

from common import env, extract_json_object, normalize_text, read_jsonl, resolve_path, write_json

REFER_KEYWORDS = [
    "refer",
    "referral",
    "urgent",
    "immediate",
    "hospital",
    "facility",
    "transport",
    "حالة",
    "إحالة",
    "حوّل",
    "حول",
    "نقل",
    "طوارئ",
    "فور",
    "tura",
    "asibiti",
    "gudbi",
    "ohereza",
    "urgence",
]
TREAT_KEYWORDS = [
    "treat",
    "treatment",
    "give",
    "ors",
    "amoxicillin",
    "al ",
    "rutf",
    "علاج",
    "اتبع",
    "أعط",
    "magani",
    "daaweynta",
    "kuvura",
    "traitement",
]
ROUTINE_REFER_KEYWORDS = ["within 24h", "within 24 hours", "routine", "confirmation", "public health notification"]
MONITOR_KEYWORDS = ["monitor", "observe", "watch", "surveillance", "follow up", "follow-up"]
VALID_DECISIONS = {"TREAT", "REFER_URGENT", "REFER_ROUTINE"}
DECISION_ALIASES = {
    "MONITOR": "TREAT",
    "OBSERVE": "TREAT",
    "HOME_CARE": "TREAT",
    "REFER_NON_URGENT": "REFER_ROUTINE",
    "NON_URGENT_REFERRAL": "REFER_ROUTINE",
    "ROUTINE_REFERRAL": "REFER_ROUTINE",
}
REQUIRED_SCHEMA_KEYS = [
    "decision",
    "primary_diagnosis",
    "differential_diagnoses",
    "confidence",
    "treatment_protocol",
    "referral",
    "monitoring",
    "danger_signs",
    "reasoning_trace",
    "voice_response",
]
SCORE_KEYS = [
    "decision_correct",
    "decision_explicit",
    "schema_complete",
    "danger_sign_correct",
    "drug_dose_correct",
    "protocol_adherence",
]

# Synonym map for danger sign matching — model may use different wording than test cases
DANGER_SIGN_SYNONYMS: dict[str, list[str]] = {
    "unable to feed": ["inability to feed", "not feeding", "cannot feed", "refusing feed", "not able to feed"],
    "not able to feed": ["inability to feed", "unable to feed", "cannot feed"],
    "fast breathing": ["rapid breathing", "tachypnea", "rapid respirations", "breathing fast", "increased respiratory rate"],
    "chest indrawing": ["chest wall indrawing", "lower chest wall indrawing", "subcostal recession", "intercostal recession", "indrawing"],
    "severe chest indrawing": ["chest indrawing", "chest wall indrawing", "lower chest wall indrawing", "subcostal recession", "intercostal recession", "indrawing"],
    "convulsions": ["seizures", "fits", "convulsion", "seizure"],
    "unconscious": ["unresponsive", "loss of consciousness", "altered consciousness", "not conscious"],
    "lethargic or unconscious": ["lethargic", "unconscious", "unresponsive", "altered consciousness", "very sleepy"],
    "unable to drink": ["cannot drink", "not able to drink", "refuses fluids", "unable to take fluids"],
    "severe dehydration": ["dehydration", "severely dehydrated", "signs of dehydration"],
    "severe malnutrition": ["malnutrition", "severely malnourished", "wasting", "severe acute malnutrition", "sam"],
    "muac below 11.5 cm": ["muac below 11.5", "muac below threshold", "severe acute malnutrition", "sam"],
    "bilateral edema": ["bipedal edema", "oedema of both feet", "bilateral oedema", "edema"],
    "infected wound": ["wound infection", "infected conflict wound", "cellulitis", "wound with infection"],
    "sexual violence survivor": ["sexual violence", "rape", "gbv", "survivor-centered care"],
    "high fever": ["fever", "high temperature", "pyrexia", "febrile"],
    "stiff neck": ["neck stiffness", "nuchal rigidity", "meningism"],
    "photophobia": ["sensitivity to light", "light sensitivity"],
    "altered consciousness": ["confused", "confusion", "unresponsive", "loss of consciousness", "not alert"],
    "bulging fontanelle": ["bulging fontanel", "tense fontanelle"],
    "skin pinch": ["skin turgor", "poor skin turgor", "slow skin pinch"],
    "rash with fever": ["fever with rash", "widespread rash", "viral exanthem", "measles"],
    "heavy vaginal bleeding": ["vaginal bleeding", "heavy bleeding", "obstetric bleeding"],
    "severe headache": ["headache", "severe headache", "preeclampsia"],
}

PROTOCOL_DIAGNOSIS_SYNONYMS: dict[str, list[str]] = {
    "acute watery diarrhea / cholera": ["acute watery diarrhea", "cholera", "severe dehydration", "unable to drink", "lethargic"],
    "infected conflict wound": ["infected wound", "contaminated wound", "cellulitis", "tetanus risk"],
    "maternal danger sign": ["maternal danger", "vaginal bleeding", "severe headache", "placental abruption", "preeclampsia", "eclampsia", "obstetric"],
    "measles suspected": ["measles", "rash with fever", "widespread rash", "viral exanthem"],
    "moderate or uncomplicated acute malnutrition": ["moderate acute malnutrition", "uncomplicated acute malnutrition", "mam", "poor appetite", "acute phase malnutrition"],
    "neonatal danger signs": ["neonate", "newborn", "unable to feed", "not feeding", "fast breathing", "neonatal distress"],
    "severe acute malnutrition with complications": ["severe acute malnutrition", "sam", "bilateral edema", "bipedal edema", "muac below", "kwashi"],
    "severe malaria": ["severe malaria", "convulsions", "seizure", "malaria danger"],
    "severe pneumonia": ["severe pneumonia", "severe chest indrawing", "lower chest wall indrawing", "respiratory distress"],
    "sexual violence survivor": ["sexual violence", "rape", "gbv", "survivor-centered"],
    "suspected meningococcal meningitis": ["meningitis", "meningococcal", "stiff neck", "photophobia", "altered consciousness"],
    "uncomplicated malaria": ["uncomplicated malaria", "malaria rdt positive", "malaria"],
}


def _extract_string_field(raw: str, key: str) -> str | None:
    match = re.search(rf'"{re.escape(key)}"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)', raw, flags=re.IGNORECASE)
    if not match:
        return None
    try:
        return json.loads(f'"{match.group(1)}"')
    except json.JSONDecodeError:
        return match.group(1)


def _extract_number_field(raw: str, key: str) -> float | None:
    match = re.search(rf'"{re.escape(key)}"\s*:\s*([0-9]+(?:\.[0-9]+)?)', raw, flags=re.IGNORECASE)
    return float(match.group(1)) if match else None


def _extract_list_field(raw: str, key: str) -> list[Any] | None:
    match = re.search(rf'"{re.escape(key)}"\s*:\s*(\[[\s\S]*?\])', raw, flags=re.IGNORECASE)
    if not match:
        return None
    try:
        value = json.loads(match.group(1))
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, list) else None


def _json_object_end(text: str) -> int | None:
    start = text.find("{")
    if start < 0:
        return None
    depth = 0
    in_string = False
    escaped = False
    for index, char in enumerate(text[start:], start):
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return index + 1
    return None


def trim_to_json_object(raw: str) -> str:
    start = raw.find("{")
    end = _json_object_end(raw)
    if start >= 0 and end is not None:
        return raw[start:end]
    return raw


def salvage_prediction_fields(raw: str) -> dict[str, Any]:
    partial: dict[str, Any] = {}
    for key in ("decision", "primary_diagnosis", "referral", "monitoring", "reasoning_trace", "voice_response"):
        value = _extract_string_field(raw, key)
        if value is not None:
            partial[key] = value
    for key in ("differential_diagnoses", "danger_signs", "treatment_protocol"):
        value = _extract_list_field(raw, key)
        if value is not None:
            partial[key] = value
    confidence = _extract_number_field(raw, "confidence")
    if confidence is not None:
        partial["confidence"] = confidence
    return partial


def parse_prediction(raw: str) -> dict[str, Any]:
    raw = trim_to_json_object(raw)
    salvaged = salvage_prediction_fields(raw)
    try:
        pred = extract_json_object(raw)
    except Exception as exc:
        if not salvaged:
            raise
        salvaged["parse_warning"] = str(exc)
        return salvaged
    for key, value in salvaged.items():
        pred.setdefault(key, value)
    return pred


def compact_validation_prompt(system_prompt: str) -> str:
    if env("SHIFA_COMPACT_VALIDATION_PROMPT", "1") == "0":
        return system_prompt
    return (
        f"{system_prompt}\n"
        "For validation, keep every string field concise. Use at most one short sentence "
        "per string value. Close the JSON object immediately after voice_response."
    )


def build_prompt(tokenizer: Any, system_prompt: str, symptom_text: str) -> str:
    system_prompt = compact_validation_prompt(system_prompt)
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": symptom_text},
    ]
    if hasattr(tokenizer, "apply_chat_template"):
        try:
            return tokenizer.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=True,
            )
        except Exception:
            pass
    return (
        f"<start_of_turn>system\n{system_prompt}<end_of_turn>\n"
        f"<start_of_turn>user\n{symptom_text}<end_of_turn>\n"
        "<start_of_turn>model\n"
    )


def run_inference(model: Any, tokenizer: Any, prompt: str, max_new_tokens: int = 2048) -> str:
    import torch
    from transformers import StoppingCriteria, StoppingCriteriaList

    class CompleteJsonStoppingCriteria(StoppingCriteria):
        def __init__(self, prompt_token_count: int) -> None:
            self.prompt_token_count = prompt_token_count

        def __call__(self, input_ids: Any, scores: Any, **kwargs: Any) -> bool:
            generated_count = input_ids.shape[-1] - self.prompt_token_count
            if generated_count < 24 or generated_count % 8 != 0:
                return False
            generated_tokens = input_ids[0][self.prompt_token_count:]
            text = tokenizer.decode(generated_tokens, skip_special_tokens=True)
            return _json_object_end(text) is not None

    # text= keyword required — unsloth patches Gemma4 tokenizer into a multimodal processor
    # that does not accept positional text arguments.
    inputs = tokenizer(text=prompt, return_tensors="pt").to(model.device)
    input_token_count = inputs["input_ids"].shape[-1]
    with torch.no_grad():
        output = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            do_sample=False,
            eos_token_id=tokenizer.eos_token_id,
            stopping_criteria=StoppingCriteriaList([CompleteJsonStoppingCriteria(input_token_count)]),
        )
    generated_tokens = output[0][input_token_count:]
    return trim_to_json_object(tokenizer.decode(generated_tokens, skip_special_tokens=True))


def combined_text(pred: dict[str, Any]) -> str:
    values = [
        pred.get("voice_response"),
        pred.get("reasoning_trace"),
        pred.get("primary_diagnosis"),
        pred.get("decision"),
        " ".join(str(item) for item in pred.get("danger_signs") or [] if isinstance(pred.get("danger_signs"), list)),
        " ".join(str(item) for item in pred.get("differential_diagnoses") or [] if isinstance(pred.get("differential_diagnoses"), list)),
    ]
    return normalize_text(" ".join(str(value or "") for value in values))


def normalize_decision(decision: Any) -> str | None:
    if not isinstance(decision, str):
        return None
    normalized = decision.strip().upper().replace("-", "_").replace(" ", "_")
    normalized = DECISION_ALIASES.get(normalized, normalized)
    return normalized if normalized in VALID_DECISIONS else None


def infer_decision(pred: dict[str, Any]) -> str:
    explicit_decision = normalize_decision(pred.get("decision"))
    if explicit_decision:
        return explicit_decision

    confidence = pred.get("confidence") or 0
    try:
        confidence_value = float(confidence)
    except (TypeError, ValueError):
        confidence_value = 0

    text = combined_text(pred)

    # danger_signs may be a list or a string like "None reported" — handle both
    danger_signs = pred.get("danger_signs") or []
    if isinstance(danger_signs, list):
        has_danger_signs = len(danger_signs) > 0
    else:
        ds_text = str(danger_signs).lower()
        has_danger_signs = bool(danger_signs) and "none" not in ds_text

    if any(keyword in text for keyword in ROUTINE_REFER_KEYWORDS):
        return "REFER_ROUTINE"
    if any(keyword in text for keyword in REFER_KEYWORDS):
        return "REFER_URGENT"
    if any(keyword in text for keyword in MONITOR_KEYWORDS):
        return "TREAT"
    if has_danger_signs and confidence_value >= 0.70:
        return "REFER_URGENT"
    if any(keyword in text for keyword in TREAT_KEYWORDS):
        return "TREAT"
    if confidence_value < 0.70:
        return "REFER_URGENT"
    return "REFER_URGENT"


def has_required_schema(pred: dict[str, Any]) -> bool:
    if pred.get("parse_warning"):
        return False
    return all(key in pred for key in REQUIRED_SCHEMA_KEYS)


def danger_sign_match(pred_danger: set[str], required_danger: set[str], diagnostic_text: str = "") -> bool:
    """Check if required danger signs are covered — allows synonym matching."""
    pred_danger_joined = " ".join([*pred_danger, diagnostic_text])
    for required in required_danger:
        if required in pred_danger:
            continue
        # Check synonyms
        synonyms = DANGER_SIGN_SYNONYMS.get(required, [])
        if any(normalize_text(syn) in pred_danger_joined for syn in synonyms):
            continue
        # Partial word match — key content words must appear in pred
        key_words = [w for w in required.split() if len(w) > 4]
        if key_words and all(w in pred_danger_joined for w in key_words):
            continue
        return False
    return True


def text_token_overlap(expected: str, actual: str) -> float:
    expected_tokens = {token for token in normalize_text(expected).split() if len(token) > 4}
    actual_tokens = {token for token in normalize_text(actual).split() if len(token) > 4}
    if not expected_tokens:
        return 0
    return len(expected_tokens.intersection(actual_tokens)) / len(expected_tokens)


def protocol_match(pred: dict[str, Any], expected: dict[str, Any]) -> bool:
    expected_diagnosis = normalize_text(expected.get("primary_diagnosis"))
    diagnosis = normalize_text(pred.get("primary_diagnosis"))
    diagnostic_text = combined_text(pred)
    if not expected_diagnosis:
        return False
    synonyms = PROTOCOL_DIAGNOSIS_SYNONYMS.get(expected_diagnosis, [])
    return (
        expected_diagnosis in diagnosis
        or diagnosis in expected_diagnosis
        or expected_diagnosis in diagnostic_text
        or any(normalize_text(synonym) in diagnostic_text for synonym in synonyms)
        or text_token_overlap(expected_diagnosis, diagnosis) >= 0.45
        or text_token_overlap(expected_diagnosis, diagnostic_text) >= 0.60
    )


def validate_drug_doses(pred: dict[str, Any], expected: dict[str, Any], case: dict[str, Any]) -> bool:
    treatment = pred.get("treatment_protocol") or {}
    if isinstance(treatment, str):
        return True
    if isinstance(treatment, list):
        if not any(isinstance(item, dict) for item in treatment):
            return True
        drug_doses = treatment
    elif isinstance(treatment, dict):
        drug_doses = treatment.get("drug_doses") or []
    else:
        return True
    if not drug_doses:
        return True
    symptom_text = normalize_text(case.get("symptom_text"))
    has_age = "months" in symptom_text or "years" in symptom_text
    has_weight = "kg" in symptom_text
    if not (has_age and has_weight):
        return False
    return all("dose" in dose and "frequency" in dose for dose in drug_doses)


def score_case(pred: dict[str, Any], case: dict[str, Any], decision: str) -> dict[str, bool]:
    expected = case["expected_decision"]
    danger_signs_raw = pred.get("danger_signs", [])
    pred_danger = {normalize_text(item) for item in danger_signs_raw if isinstance(danger_signs_raw, list)}
    required_danger = {normalize_text(item) for item in case.get("required_danger_signs", [])}
    diagnostic_text = combined_text(pred)
    expected_decision = normalize_decision(expected.get("decision")) or expected.get("decision")
    return {
        "decision_correct": decision == expected_decision,
        "decision_explicit": bool(pred.get("decision")),
        "schema_complete": has_required_schema(pred),
        "danger_sign_correct": danger_sign_match(pred_danger, required_danger, diagnostic_text),
        "drug_dose_correct": validate_drug_doses(pred, expected, case),
        "protocol_adherence": protocol_match(pred, expected),
    }


def print_failure_detail(
    case: dict[str, Any],
    pred: dict[str, Any],
    result: dict[str, bool],
    inferred_decision: str,
    guarded_decision: str,
    override_reason: str | None,
    raw: str,
) -> None:
    failed_keys = [key for key, passed in result.items() if not passed]
    expected = case["expected_decision"]
    print(f"      failed: {', '.join(failed_keys)}")
    print(f"      expected: {expected.get('decision')} / {expected.get('primary_diagnosis')}")
    print(f"      predicted: {pred.get('decision')} / {pred.get('primary_diagnosis')}")
    print(f"      inferred: {inferred_decision}")
    if override_reason:
        print(f"      guarded: {guarded_decision} [{override_reason}]")
    if pred.get("error"):
        print(f"      error: {pred.get('error')}")
    if pred.get("parse_warning"):
        print(f"      parse warning: {pred.get('parse_warning')}")
    raw_preview = normalize_text(raw).replace("\n", " ")[:260]
    if raw_preview:
        print(f"      raw: {raw_preview}")


def upload_validation_artifacts() -> None:
    if env("SHIFA_AUTO_UPLOAD_AFTER_VALIDATE", "1") == "0":
        print("Skipping validation upload; SHIFA_AUTO_UPLOAD_AFTER_VALIDATE=0")
        return

    ml_root = str(resolve_path("."))
    if ml_root not in sys.path:
        sys.path.insert(0, ml_root)

    try:
        from scripts.upload_artifacts import main as upload_artifacts
    except Exception as exc:
        print(f"Skipping validation upload; could not import uploader: {exc}")
        return

    try:
        print("Uploading validation artifacts to R2...")
        upload_artifacts()
        print("Validation artifacts uploaded to R2.")
    except Exception as exc:
        print(f"Validation upload failed after report was written: {exc}")


def main() -> None:
    try:
        from unsloth import FastLanguageModel
    except ImportError as exc:  # pragma: no cover - checked on remote GPU env.
        raise SystemExit("Install ml/requirements.txt before validation") from exc

    from common import country_prompt
    from guardrails import apply_guardrails

    model_dir = str(resolve_path(env("SHIFA_MODEL_DIR", "models/shifa-gemma4-e4b-finetuned")))
    test_file = env("SHIFA_TEST_CASES") or env("SHIFA_TEST_FILE", "data/test_cases/imci_test_60.jsonl")
    report_path = env("SHIFA_VALIDATION_REPORT", "reports/validation_metrics.json")
    max_seq_length = int(env("SHIFA_MAX_SEQ_LENGTH", "2048"))
    max_new_tokens = int(env("SHIFA_MAX_NEW_TOKENS", "2048"))

    model, tokenizer = FastLanguageModel.from_pretrained(
        model_dir,
        max_seq_length=max_seq_length,
        load_in_4bit=True,
    )
    FastLanguageModel.for_inference(model)

    cases = read_jsonl(test_file)
    verbose_failures = env("SHIFA_VERBOSE_FAILURES", "1") != "0"
    totals = {
        "decision_correct": 0,
        "decision_explicit": 0,
        "schema_complete": 0,
        "danger_sign_correct": 0,
        "drug_dose_correct": 0,
        "protocol_adherence": 0,
        "raw_decision_correct": 0,
        "urgent_expected": 0,
        "urgent_recalled": 0,
        "urgent_missed": 0,
        "raw_urgent_recalled": 0,
        "raw_urgent_missed": 0,
        "over_referral": 0,
        "raw_over_referral": 0,
        "guardrail_overrides": 0,
    }
    failures: list[dict[str, Any]] = []

    for i, case in enumerate(cases, 1):
        raw = ""
        prompt = build_prompt(tokenizer, country_prompt(case["country"], case["language"]), case["symptom_text"])
        try:
            raw = run_inference(model, tokenizer, prompt, max_new_tokens=max_new_tokens)
            pred = parse_prediction(raw)
        except Exception as exc:
            pred = {"error": str(exc), "raw_response": raw[:2000]}

        expected_decision = normalize_decision(case["expected_decision"].get("decision")) or case["expected_decision"].get("decision")
        inferred_decision = infer_decision(pred)
        guarded_decision, override_reason = apply_guardrails(pred, case["symptom_text"], inferred_decision)
        result = score_case(pred, case, guarded_decision)
        if override_reason:
            totals["guardrail_overrides"] += 1

        totals["raw_decision_correct"] += int(inferred_decision == expected_decision)
        if expected_decision == "REFER_URGENT":
            totals["urgent_expected"] += 1
            if inferred_decision == "REFER_URGENT":
                totals["raw_urgent_recalled"] += 1
            else:
                totals["raw_urgent_missed"] += 1
            if guarded_decision == "REFER_URGENT":
                totals["urgent_recalled"] += 1
            else:
                totals["urgent_missed"] += 1
        else:
            if inferred_decision == "REFER_URGENT":
                totals["raw_over_referral"] += 1
            if guarded_decision == "REFER_URGENT":
                totals["over_referral"] += 1

        for key, passed in result.items():
            totals[key] += int(passed)

        status = "✅" if result.get("decision_correct") else "❌"
        override_tag = f" [guardrail: {override_reason}]" if override_reason else ""
        print(f"[{i}/60] {status} {case['id']}{override_tag}")

        if not all(result.values()):
            if verbose_failures:
                print_failure_detail(case, pred, result, inferred_decision, guarded_decision, override_reason, raw)
            failures.append({
                "case_id": case["id"],
                "result": result,
                "prediction": pred,
                "inferred_decision": inferred_decision,
                "guarded_decision": guarded_decision,
                "override_reason": override_reason,
                "expected": case["expected_decision"],
                "raw_response": raw[:2000],
            })

    n = len(cases)
    non_urgent_count = n - totals["urgent_expected"]
    metrics = {
        "case_count": n,
        "decision_accuracy": totals["decision_correct"] / n if n else 0,
        "decision_explicit_rate": totals["decision_explicit"] / n if n else 0,
        "schema_complete_rate": totals["schema_complete"] / n if n else 0,
        "danger_sign_accuracy": totals["danger_sign_correct"] / n if n else 0,
        "drug_dose_accuracy": totals["drug_dose_correct"] / n if n else 0,
        "protocol_adherence": totals["protocol_adherence"] / n if n else 0,
        "raw_model_decision_accuracy": totals["raw_decision_correct"] / n if n else 0,
        "urgent_recall": totals["urgent_recalled"] / totals["urgent_expected"] if totals["urgent_expected"] else 0,
        "urgent_miss_rate": totals["urgent_missed"] / totals["urgent_expected"] if totals["urgent_expected"] else 0,
        "raw_model_urgent_recall": totals["raw_urgent_recalled"] / totals["urgent_expected"] if totals["urgent_expected"] else 0,
        "raw_model_urgent_miss_rate": totals["raw_urgent_missed"] / totals["urgent_expected"] if totals["urgent_expected"] else 0,
        "over_referral_rate": totals["over_referral"] / non_urgent_count if non_urgent_count else 0,
        "raw_model_over_referral_rate": totals["raw_over_referral"] / non_urgent_count if non_urgent_count else 0,
        "guardrail_override_count": totals["guardrail_overrides"],
        "guardrail_override_rate": totals["guardrail_overrides"] / n if n else 0,
        "safety_counts": {
            "urgent_expected": totals["urgent_expected"],
            "urgent_recalled": totals["urgent_recalled"],
            "urgent_missed": totals["urgent_missed"],
            "raw_urgent_recalled": totals["raw_urgent_recalled"],
            "raw_urgent_missed": totals["raw_urgent_missed"],
            "over_referral": totals["over_referral"],
            "raw_over_referral": totals["raw_over_referral"],
            "guardrail_overrides": totals["guardrail_overrides"],
        },
        "targets": {
            "decision_accuracy": 0.88,
            "danger_sign_accuracy": 0.92,
            "drug_dose_accuracy": 0.95,
            "protocol_adherence": 0.90,
            "urgent_recall": 0.95,
        },
        "passed_targets": {},
        "failure_count": len(failures),
        "failures": failures,
    }
    metrics["passed_targets"] = {
        key: metrics[key] >= target for key, target in metrics["targets"].items()
    }
    write_json(report_path, metrics)
    print(f"\nDecision accuracy:    {metrics['decision_accuracy'] * 100:.1f}% (target >88%)")
    print(f"Decision explicit:    {metrics['decision_explicit_rate'] * 100:.1f}%")
    print(f"Schema complete:      {metrics['schema_complete_rate'] * 100:.1f}%")
    print(f"Danger sign detect:   {metrics['danger_sign_accuracy'] * 100:.1f}% (target >92%)")
    print(f"Drug dose accuracy:   {metrics['drug_dose_accuracy'] * 100:.1f}% (target >95%)")
    print(f"Protocol adherence:   {metrics['protocol_adherence'] * 100:.1f}% (target >90%)")
    print(f"Raw model decision:   {metrics['raw_model_decision_accuracy'] * 100:.1f}%")
    print(f"Urgent recall:        {metrics['urgent_recall'] * 100:.1f}% (target >95%)")
    print(f"Raw urgent recall:    {metrics['raw_model_urgent_recall'] * 100:.1f}%")
    print(f"Urgent miss rate:     {metrics['urgent_miss_rate'] * 100:.1f}%")
    print(f"Over-referral rate:   {metrics['over_referral_rate'] * 100:.1f}%")
    print(f"Guardrail overrides:  {totals['guardrail_overrides']}/{n}")
    print(f"Report: {resolve_path(report_path)}")
    upload_validation_artifacts()


if __name__ == "__main__":
    main()
