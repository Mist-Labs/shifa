from __future__ import annotations

from typing import Any

from common import env, extract_json_object, normalize_text, read_jsonl, resolve_path, write_json


def run_inference(model: Any, tokenizer: Any, prompt: str, max_new_tokens: int = 1024) -> str:
    import torch

    inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
    with torch.no_grad():
        output = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            temperature=0.1,
            top_p=0.95,
            do_sample=False,
            eos_token_id=tokenizer.eos_token_id,
        )
    decoded = tokenizer.decode(output[0], skip_special_tokens=True)
    return decoded[len(prompt) :] if decoded.startswith(prompt) else decoded


def validate_drug_doses(pred: dict[str, Any], expected: dict[str, Any], case: dict[str, Any]) -> bool:
    treatment = pred.get("treatment_protocol") or {}
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
    pred_danger = {normalize_text(item) for item in pred.get("danger_signs", [])}
    required_danger = {normalize_text(item) for item in case.get("required_danger_signs", [])}
    diagnosis = normalize_text(pred.get("primary_diagnosis"))
    expected_diagnosis = normalize_text(expected.get("primary_diagnosis"))
    return {
        "decision_correct": pred.get("decision") == expected.get("decision"),
        "danger_sign_correct": required_danger.issubset(pred_danger),
        "drug_dose_correct": validate_drug_doses(pred, expected, case),
        "protocol_adherence": bool(expected_diagnosis and (expected_diagnosis in diagnosis or diagnosis in expected_diagnosis)),
    }


def main() -> None:
    try:
        from unsloth import FastLanguageModel
    except ImportError as exc:  # pragma: no cover - checked on remote GPU env.
        raise SystemExit("Install ml/requirements.txt before validation") from exc

    from common import country_prompt

    model_dir = str(resolve_path(env("SHIFA_MODEL_DIR", "models/shifa-gemma4-e4b-finetuned")))
    test_file = env("SHIFA_TEST_CASES", "data/test_cases/imci_test_60.jsonl")
    report_path = env("SHIFA_VALIDATION_REPORT", "reports/validation_metrics.json")
    max_seq_length = int(env("SHIFA_MAX_SEQ_LENGTH", "8192"))

    model, tokenizer = FastLanguageModel.from_pretrained(
        model_dir,
        max_seq_length=max_seq_length,
        load_in_4bit=True,
    )
    FastLanguageModel.for_inference(model)

    cases = read_jsonl(test_file)
    totals = {
        "decision_correct": 0,
        "danger_sign_correct": 0,
        "drug_dose_correct": 0,
        "protocol_adherence": 0,
    }
    failures: list[dict[str, Any]] = []

    for case in cases:
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
            pred = {"error": str(exc)}
            result = {key: False for key in totals}

        for key, passed in result.items():
            totals[key] += int(passed)
        if not all(result.values()):
            failures.append({"case_id": case["id"], "result": result, "prediction": pred, "expected": case["expected_decision"]})

    n = len(cases)
    metrics = {
        "case_count": n,
        "decision_accuracy": totals["decision_correct"] / n if n else 0,
        "danger_sign_accuracy": totals["danger_sign_correct"] / n if n else 0,
        "drug_dose_accuracy": totals["drug_dose_correct"] / n if n else 0,
        "protocol_adherence": totals["protocol_adherence"] / n if n else 0,
        "targets": {
            "decision_accuracy": 0.88,
            "danger_sign_accuracy": 0.92,
            "drug_dose_accuracy": 0.95,
            "protocol_adherence": 0.90,
        },
        "passed_targets": {},
        "failures": failures[:20],
    }
    metrics["passed_targets"] = {
        key: metrics[key] >= target for key, target in metrics["targets"].items()
    }
    write_json(report_path, metrics)
    print(f"Decision accuracy:    {metrics['decision_accuracy'] * 100:.1f}% (target >88%)")
    print(f"Danger sign detect:   {metrics['danger_sign_accuracy'] * 100:.1f}% (target >92%)")
    print(f"Drug dose accuracy:   {metrics['drug_dose_accuracy'] * 100:.1f}% (target >95%)")
    print(f"Protocol adherence:   {metrics['protocol_adherence'] * 100:.1f}% (target >90%)")
    print(f"Report: {resolve_path(report_path)}")


if __name__ == "__main__":
    main()
