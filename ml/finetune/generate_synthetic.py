from __future__ import annotations

import random
from typing import Any

from common import env_int, write_jsonl


COUNTRY_LANGUAGES = {
    "Sudan": ["ar"],
    "DRC": ["fr", "ln", "rw"],
    "Somalia": ["so", "ar"],
    "Nigeria": ["ha"],
}

CONDITIONS = {
    "Sudan": ["SAM", "AWD", "MAL", "ARI", "WND", "GBV", "NEO"],
    "DRC": ["MAL", "MPX", "SAM", "AWD", "MEA", "ARI", "GBV"],
    "Somalia": ["SAM", "AWD", "MAL", "NEO", "MAT", "MEA", "ARI"],
    "Nigeria": ["MEN", "SAM", "MAL", "AWD", "ARI", "MEA", "NEO"],
}

SEX = ["female", "male"]


def decision(
    decision_value: str,
    diagnosis: str,
    confidence: float,
    danger_signs: list[str],
    language: str,
    treatment_steps: list[str] | None = None,
    referral_message: str | None = None,
    drug_doses: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    treatment = None
    referral = None
    monitoring = None
    if decision_value == "TREAT":
        treatment = {
            "steps": treatment_steps or ["Follow country protocol", "Recheck within recommended window"],
            "drug_doses": drug_doses or [],
            "follow_up_hours": 24,
            "return_triggers": ["danger sign appears", "symptoms worsen", "no improvement"],
        }
    elif decision_value.startswith("REFER"):
        referral = {
            "urgency": "IMMEDIATE" if decision_value == "REFER_URGENT" else "WITHIN_24H",
            "facility_type": "nearest hospital or protocol referral facility",
            "pre_referral_treatment": treatment_steps or ["Keep patient warm", "Do not delay transport"],
            "message_for_facility": referral_message or diagnosis,
            "danger_signs_en_route": danger_signs or ["worsening consciousness"],
        }
    else:
        monitoring = {
            "watch_signs": ["fever", "poor feeding", "breathing difficulty"],
            "return_if": ["danger sign appears", "symptoms worsen"],
            "home_care": treatment_steps or ["fluids", "continue feeding", "rest"],
            "recheck_hours": 24,
        }

    return {
        "decision": decision_value,
        "primary_diagnosis": diagnosis,
        "differential_diagnoses": [],
        "confidence": confidence,
        "treatment_protocol": treatment,
        "referral": referral,
        "monitoring": monitoring,
        "danger_signs": danger_signs,
        "reasoning_trace": f"Protocol-matched {diagnosis}; safety overrides applied where required.",
        "voice_response": voice_response(decision_value, diagnosis, language),
    }


def voice_response(decision_value: str, diagnosis: str, language: str) -> str:
    if language == "ha":
        return f"{'A tura mara lafiya yanzu' if decision_value == 'REFER_URGENT' else 'Bi tsarin magani'}: {diagnosis}."
    if language == "ar":
        return f"{'حوّل المريض الآن' if decision_value == 'REFER_URGENT' else 'اتبع خطة العلاج'}: {diagnosis}."
    if language == "so":
        return f"{'U gudbi bukaanka hadda' if decision_value == 'REFER_URGENT' else 'Raac qorshaha daaweynta'}: {diagnosis}."
    if language == "rw":
        return f"{'Ohereza umurwayi ako kanya' if decision_value == 'REFER_URGENT' else 'Kurikiza gahunda yo kuvura'}: {diagnosis}."
    if language == "ln":
        return f"{'Tinda moto ya maladi sikoyo' if decision_value == 'REFER_URGENT' else 'Landa plan ya lisalisi'}: {diagnosis}."
    return f"{'Refer now' if decision_value == 'REFER_URGENT' else 'Follow treatment plan'}: {diagnosis}."


def generate_case(case_id: int, country: str, condition: str, rng: random.Random) -> dict[str, Any]:
    language = rng.choice(COUNTRY_LANGUAGES[country])
    age_months = rng.randint(1, 180)
    age_years = max(1, round(age_months / 12))
    weight = round(rng.uniform(4.5, 45.0), 1)
    sex = rng.choice(SEX)
    days = rng.randint(1, 7)

    symptom = f"Patient, {sex}, {age_months} months, weight {weight}kg. "
    expected: dict[str, Any]

    if condition == "SAM":
        muac = round(rng.uniform(10.0, 12.4), 1)
        edema = rng.choice([True, False])
        symptom += f"MUAC {muac}cm. Bilateral edema: {'yes' if edema else 'no'}. Poor appetite for {days} days."
        urgent = muac < 11.5 and edema
        expected = decision(
            "REFER_URGENT" if urgent else "TREAT",
            "Severe Acute Malnutrition with complications" if urgent else "Moderate or uncomplicated acute malnutrition",
            0.91,
            ["MUAC below 11.5 cm", "bilateral edema"] if urgent else [],
            language,
            ["Give RUTF only if alert and able to swallow", "Keep child warm"],
            "SAM danger signs. Needs therapeutic feeding facility.",
        )
    elif condition == "AWD":
        severe = rng.choice([True, False])
        symptom += f"Acute watery diarrhea for {days} days. Stool frequency {rng.randint(4, 12)}/day. "
        symptom += "Lethargic and unable to drink." if severe else "Alert and drinking ORS."
        expected = decision(
            "REFER_URGENT" if severe else "TREAT",
            "Acute Watery Diarrhea / Cholera",
            0.88,
            ["lethargic or unconscious", "unable to drink"] if severe else [],
            language,
            ["Give ORS if able to drink", "Refer immediately if severe dehydration"],
            "Severe dehydration with AWD.",
            [{"drug": "ORS", "dose": "50-100mL/kg over 4 hours", "frequency": "small frequent amounts"}] if not severe else [],
        )
    elif condition == "MAL":
        severe = rng.choice([True, False])
        symptom += f"Fever for {days} days. Malaria RDT positive. "
        symptom += "Convulsions reported." if severe else "Able to drink and no danger signs."
        expected = decision(
            "REFER_URGENT" if severe else "TREAT",
            "Severe malaria" if severe else "Uncomplicated malaria",
            0.9,
            ["convulsions"] if severe else [],
            language,
            ["Start AL only after confirming age and weight"] if not severe else ["Do not delay referral"],
            "Possible severe malaria with danger sign.",
            [{"drug": "AL", "dose": "use national IMCI weight-band dose", "frequency": "twice daily x3 days"}] if not severe else [],
        )
    elif condition == "ARI":
        severe = rng.choice([True, False])
        symptom += f"Cough and fast breathing for {days} days. "
        symptom += "Severe chest indrawing." if severe else "No chest indrawing, drinking well."
        expected = decision(
            "REFER_URGENT" if severe else "TREAT",
            "Severe pneumonia" if severe else "Pneumonia or acute respiratory infection",
            0.86,
            ["severe chest indrawing"] if severe else [],
            language,
            ["Count respiratory rate", "Give amoxicillin only with age and weight confirmed"],
            "Severe respiratory danger sign.",
        )
    elif condition == "MEN":
        symptom = f"Patient, {sex}, {age_years} years. Fever and neck stiffness for {days} days. Photophobia: yes. Confused."
        expected = decision(
            "REFER_URGENT",
            "Suspected Meningococcal Meningitis",
            0.93,
            ["neck stiffness", "photophobia", "altered consciousness"],
            language,
            ["Give ceftriaxone IM only if available, authorized, and age/weight confirmed"],
            "Northern Nigeria meningitis belt danger signs.",
        )
    elif condition == "MPX":
        symptom += "Fever with umbilicated vesicular rash and swollen lymph nodes."
        expected = decision(
            "REFER_URGENT",
            "Mpox suspected",
            0.84,
            ["rash with fever"],
            language,
            ["Isolate patient", "Avoid touching lesions", "Notify facility"],
            "Suspected mpox requires isolation and confirmation.",
        )
    elif condition == "MEA":
        symptom += "Fever with widespread rash, cough, and red eyes."
        expected = decision(
            "REFER_ROUTINE",
            "Measles suspected",
            0.83,
            ["rash with fever"],
            language,
            ["Isolate if possible", "Give vitamin A per protocol if available"],
            "Suspected measles needs facility confirmation and public health notification.",
        )
    elif condition == "NEO":
        symptom = f"Neonate, {rng.randint(1, 25)} days old. Unable to feed and fast breathing."
        expected = decision(
            "REFER_URGENT",
            "Neonatal danger signs",
            0.94,
            ["unable to feed", "fast breathing"],
            language,
            ["Keep baby warm", "Do not delay referral"],
            "Any neonatal danger sign requires immediate referral.",
        )
    elif condition == "MAT":
        symptom = f"Pregnant patient. Heavy vaginal bleeding and severe headache for {days} days."
        expected = decision(
            "REFER_URGENT",
            "Maternal danger sign",
            0.92,
            ["heavy vaginal bleeding", "severe headache"],
            language,
            ["Lay patient on left side if possible", "Do not delay referral"],
            "Maternal danger sign requiring emergency obstetric care.",
        )
    elif condition == "GBV":
        symptom = "Sexual violence survivor requests care and privacy. No immediate heavy bleeding reported."
        expected = decision(
            "REFER_URGENT",
            "Sexual Violence Survivor",
            0.82,
            ["sexual violence survivor"],
            language,
            ["Ensure privacy and consent", "Refer for PEP and survivor-centered care"],
            "Survivor-centered urgent referral required.",
        )
    else:  # WND
        symptom += "Conflict wound on leg, contaminated, redness spreading, tetanus status unknown."
        expected = decision(
            "REFER_URGENT",
            "Infected conflict wound",
            0.85,
            ["infected wound"],
            language,
            ["Cover wound with clean dressing", "Refer for debridement/tetanus assessment"],
            "Contaminated conflict wound with infection signs.",
        )

    return {
        "id": f"synthetic-{case_id:05d}",
        "country": country,
        "language": language,
        "condition": condition,
        "symptom_text": symptom,
        "expected_decision": expected,
        "required_danger_signs": expected["danger_signs"],
        "source": "synthetic_protocol_case",
    }


def main() -> None:
    rng = random.Random(env_int("SHIFA_SEED", 42))
    count = env_int("SHIFA_CASE_COUNT", 2000)
    cases: list[dict[str, Any]] = []
    countries = list(CONDITIONS)
    for index in range(count):
        country = countries[index % len(countries)]
        condition = CONDITIONS[country][(index // len(countries)) % len(CONDITIONS[country])]
        cases.append(generate_case(index + 1, country, condition, rng))
    rng.shuffle(cases)

    test_cases = []
    for country in countries:
        country_cases = [case for case in cases if case["country"] == country]
        test_cases.extend(country_cases[:15])
    test_ids = {case["id"] for case in test_cases}
    train_cases = [case for case in cases if case["id"] not in test_ids]

    write_jsonl("data/processed/synthetic_cases_2000.jsonl", train_cases)
    write_jsonl("data/test_cases/imci_test_60.jsonl", test_cases)
    print(f"Training synthetic cases: {len(train_cases)}")
    print(f"Held-out test cases: {len(test_cases)}")


if __name__ == "__main__":
    main()
