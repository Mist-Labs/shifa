from __future__ import annotations

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
    "severe dehydration": ["dehydration", "severely dehydrated", "signs of dehydration"],
    "severe malnutrition": ["malnutrition", "severely malnourished", "wasting"],
    "infected wound": ["wound infection", "infected conflict wound", "cellulitis", "wound with infection"],
    "high fever": ["fever", "high temperature", "pyrexia", "febrile"],
    "stiff neck": ["neck stiffness", "nuchal rigidity", "meningism"],
    "bulging fontanelle": ["bulging fontanel", "tense fontanelle"],
    "skin pinch": ["skin turgor", "poor skin turgor", "slow skin pinch"],
}


def run_inference(model: Any, tokenizer: Any, prompt: str, max_new_tokens: int = 1024) -> str:
    import torch

    # text= keyword required — unsloth patches Gemma4 tokenizer into a multimodal processor
    # that does not accept positional text arguments.
    inputs = tokenizer(text=prompt, return_tensors="pt").to(model.device)
    with torch.no_grad():
        output = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            do_sample=False,
            eos_token_id=tokenizer.eos_token_id,
        )
    decoded = tokenizer.decode(output[0], skip_special_tokens=True)
    return decoded[len(prompt):] if decoded.startswith(prompt) else decoded


def combined_text(pred: dict[str, Any]) -> str:
    values = [
        pred.get("voice_response"),
        pred.get("reasoning_trace"),
        pred.get("primary_diagnosis"),
        pred.get("decision"),
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
    return all(key in pred for key in REQUIRED_SCHEMA_KEYS)


def danger_sign_match(pred_danger: set[str], required_danger: set[str]) -> bool:
    """Check if required danger signs are covered — allows synonym matching."""
    pred_danger_joined = " ".join(pred_danger)
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
    return (
        expected_diagnosis in diagnosis
        or diagnosis in expected_diagnosis
        or expected_diagnosis in diagnostic_text
        or text_token_overlap(expected_diagnosis, diagnosis) >= 0.45
        or text_token_overlap(expected_diagnosis, diagnostic_text) >= 0.60
    )


def validate_drug_doses(pred: dict[str, Any], expected: dict[str, Any], case: dict[str, Any]) -> bool:
    treatment = pred.get("treatment_protocol") or {}
    if isinstance(treatment, str):
        return True
    drug_doses = treatment.get("drug_doses") or []
    if not drug_doses:
        return True
    symptom_text = normalize_text(case.get("symptom_text"))
    has_age = "months" in symptom_text or "years" in symptom_text
    has_weight = "kg" in symptom_text
    if not (has_age and has_weight):
        return False
    return all("dose" in dose and "frequency" in dose for dose in drug_doses)


def score_case(pred: dict[str, Any], case: dict[str, Any]) -> dict[str, bool]:
    expected = case["expected_decision"]
    danger_signs_raw = pred.get("danger_signs", [])
    pred_danger = {normalize_text(item) for item in danger_signs_raw if isinstance(danger_signs_raw, list)}
    required_danger = {normalize_text(item) for item in case.get("required_danger_signs", [])}
    inferred_decision = infer_decision(pred)
    expected_decision = normalize_decision(expected.get("decision")) or expected.get("decision")
    return {
        "decision_correct": inferred_decision == expected_decision,
        "decision_explicit": bool(pred.get("decision")),
        "schema_complete": has_required_schema(pred),
        "danger_sign_correct": danger_sign_match(pred_danger, required_danger),
        "drug_dose_correct": validate_drug_doses(pred, expected, case),
        "protocol_adherence": protocol_match(pred, expected),
    }


def print_failure_detail(case: dict[str, Any], pred: dict[str, Any], result: dict[str, bool], inferred_decision: str, raw: str) -> None:
    failed_keys = [key for key, passed in result.items() if not passed]
    expected = case["expected_decision"]
    print(f"      failed: {', '.join(failed_keys)}")
    print(f"      expected: {expected.get('decision')} / {expected.get('primary_diagnosis')}")
    print(f"      predicted: {pred.get('decision')} / {pred.get('primary_diagnosis')}")
    print(f"      inferred: {inferred_decision}")
    if pred.get("error"):
        print(f"      error: {pred.get('error')}")
    raw_preview = normalize_text(raw).replace("\n", " ")[:260]
    if raw_preview:
        print(f"      raw: {raw_preview}")


def main() -> None:
    try:
        from unsloth import FastLanguageModel
    except ImportError as exc:  # pragma: no cover - checked on remote GPU env.
        raise SystemExit("Install ml/requirements.txt before validation") from exc

    from common import country_prompt

    model_dir = str(resolve_path(env("SHIFA_MODEL_DIR", "models/shifa-gemma4-e4b-finetuned")))
    test_file = env("SHIFA_TEST_CASES") or env("SHIFA_TEST_FILE", "data/test_cases/imci_test_60.jsonl")
    report_path = env("SHIFA_VALIDATION_REPORT", "reports/validation_metrics.json")
    max_seq_length = int(env("SHIFA_MAX_SEQ_LENGTH", "2048"))

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
        "urgent_expected": 0,
        "urgent_recalled": 0,
        "urgent_missed": 0,
        "over_referral": 0,
    }
    failures: list[dict[str, Any]] = []

    for i, case in enumerate(cases, 1):
        raw = ""
        prompt = (
            f"<start_of_turn>system\n{country_prompt(case['country'], case['language'])}<end_of_turn>\n"
            f"<start_of_turn>user\n{case['symptom_text']}<end_of_turn>\n"
            "<start_of_turn>model\n"
        )
        try:
            raw = run_inference(model, tokenizer, prompt)
            pred = extract_json_object(raw)
            result = score_case(pred, case)
        except Exception as exc:
            pred = {"error": str(exc), "raw_response": raw[:2000]}
            result = {key: False for key in SCORE_KEYS}

        expected_decision = normalize_decision(case["expected_decision"].get("decision")) or case["expected_decision"].get("decision")
        inferred_decision = infer_decision(pred)
        if expected_decision == "REFER_URGENT":
            totals["urgent_expected"] += 1
            if inferred_decision == "REFER_URGENT":
                totals["urgent_recalled"] += 1
            else:
                totals["urgent_missed"] += 1
        elif inferred_decision == "REFER_URGENT":
            totals["over_referral"] += 1

        for key, passed in result.items():
            totals[key] += int(passed)

        status = "✅" if result.get("decision_correct") else "❌"
        print(f"[{i}/60] {status} {case['id']}")

        if not all(result.values()):
            if verbose_failures:
                print_failure_detail(case, pred, result, inferred_decision, raw)
            failures.append({
                "case_id": case["id"],
                "result": result,
                "prediction": pred,
                "inferred_decision": inferred_decision,
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
        "urgent_recall": totals["urgent_recalled"] / totals["urgent_expected"] if totals["urgent_expected"] else 0,
        "urgent_miss_rate": totals["urgent_missed"] / totals["urgent_expected"] if totals["urgent_expected"] else 0,
        "over_referral_rate": totals["over_referral"] / non_urgent_count if non_urgent_count else 0,
        "safety_counts": {
            "urgent_expected": totals["urgent_expected"],
            "urgent_recalled": totals["urgent_recalled"],
            "urgent_missed": totals["urgent_missed"],
            "over_referral": totals["over_referral"],
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
    print(f"Urgent recall:        {metrics['urgent_recall'] * 100:.1f}% (target >95%)")
    print(f"Urgent miss rate:     {metrics['urgent_miss_rate'] * 100:.1f}%")
    print(f"Over-referral rate:   {metrics['over_referral_rate'] * 100:.1f}%")
    print(f"Report: {resolve_path(report_path)}")


if __name__ == "__main__":
    main()
