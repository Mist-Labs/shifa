# SHIFA Training and Validation Results

Submission-facing summary of the Gemma 4 fine-tuning and validation runs for SHIFA, an offline-first clinical decision support assistant for community health workers in humanitarian crisis settings.

## Models

| Model | Purpose | Status |
| --- | --- | --- |
| Gemma 4 E4B | Higher-quality clinical reasoning model for demo/server and high-end-device path | Trained, validated, GGUF exported |
| Gemma 4 E2B | Mobile-first model for mid-range Android deployment | Trained, validated, GGUF exported |

Both models were fine-tuned with Unsloth QLoRA on the cleaned SHIFA WHO/IMCI clinical dataset and validated on the same 60-case IMCI test set.

## Training Data

- Training cases: 2,000 synthetic clinical cases.
- Validation cases: 60 IMCI-style cases.
- Protocol sources: WHO IMCI, Sphere Humanitarian Standards, MSF-style crisis-care workflows.
- Countries represented: Sudan, DRC, Somalia, Northern Nigeria.
- Languages represented: Arabic, Somali, French, Lingala, Kinyarwanda, Hausa.
- Valid decisions: `TREAT`, `REFER_URGENT`, `REFER_ROUTINE`.

The training data was cleaned before the final runs to remove invalid decision aliases such as `MONITOR`, `OBSERVE`, and `REFER_NON_URGENT`.

## E4B Training Run

| Field | Value |
| --- | --- |
| Base model | `google/gemma-4-e4b-it` |
| Fine-tuning method | QLoRA via Unsloth |
| Epochs | 3 |
| LoRA rank / alpha | 16 / 16 |
| Max sequence length | 8192 |
| Runtime | 6,174 seconds |
| Final train loss | 0.0599 |
| Output directory | `models/shifa-gemma4-e4b-finetuned` |
| Evidence file | `ml/reports/training_manifest.json` |

## E4B Validation Results

| Metric | Result | Target | Status |
| --- | ---: | ---: | --- |
| Decision accuracy | 96.7% | 88% | Pass |
| Urgent recall | 100.0% | 95% | Pass |
| Urgent miss rate | 0.0% | lower is better | Pass |
| Danger sign detection | 88.3% | 92% | Below target |
| Drug dose accuracy | 100.0% | 95% | Pass |
| Protocol adherence | 100.0% | 90% | Pass |
| Schema completeness | 98.3% | tracked | Strong |
| Raw model decision accuracy | 73.3% | tracked | Guardrails required |
| Over-referral rate | 11.8% | lower is better | Acceptable |
| Guardrail overrides | 49/60 | tracked | Expected safety layer |

Evidence file: `ml/reports/validation_metrics.json`.

## E2B Training Run

| Field | Value |
| --- | --- |
| Base model | `google/gemma-4-E2B-it` |
| Fine-tuning method | QLoRA via Unsloth |
| Epochs | 3 |
| LoRA rank / alpha | 16 / 16 |
| Max sequence length | 4096 |
| Runtime | 3,350 seconds |
| Final train loss | 0.1759 |
| Output directory | `models/shifa-gemma4-e2b-finetuned` |
| Evidence file | `ml/reports/e2b_training_manifest.json` on R2 |

E2B trained in 55m 50s on Kaggle T4 and is the preferred candidate for mid-range Android deployment because it is smaller and faster than E4B.

## E2B Validation Results

| Metric | Result | Target | Status |
| --- | ---: | ---: | --- |
| Decision accuracy | 95.0% | 88% | Pass |
| Urgent recall | 100.0% | 95% | Pass |
| Urgent miss rate | 0.0% | lower is better | Pass |
| Danger sign detection | 95.0% | 92% | Pass |
| Drug dose accuracy | 100.0% | 95% | Pass |
| Protocol adherence | 93.3% | 90% | Pass |
| Schema completeness | 91.7% | tracked | Acceptable |
| Raw model decision accuracy | 83.3% | tracked | Guardrails required |
| Raw urgent recall | 100.0% | tracked | Strong |
| Over-referral rate | 17.6% | lower is better | Manageable |
| Guardrail overrides | 49/60 | tracked | Expected safety layer |

Evidence file: `ml/reports/e2b_validation_metrics.json` on R2.

## E2B Mobile Runtime Artifact

| Artifact | Value |
| --- | --- |
| Runtime format | GGUF Q4_K_M |
| Main model | `models/shifa-gemma4-e2b-finetuned/shifa-gemma4-e2b-q4km.gguf` |
| Size | 3,427,878,240 bytes, approximately 3.2 GB |
| Multimodal projector | `models/shifa-gemma4-e2b-finetuned/shifa-gemma4-e2b-mmproj-f16.gguf` |
| Projector size | 985,653,664 bytes, approximately 940 MB |
| Runtime path | `llama.rn` / llama.cpp bridge |
| Delivery model | First-run user-approved download from R2 |

The E2B GGUF is the practical offline Android runtime target. It is not bundled into the APK because a multi-GB model would create an impractical install size. The mobile app asks the user to download the model on first launch and falls back to cloud/protocol mode if the user skips setup.

## Guardrail Layer

SHIFA uses deterministic WHO/IMCI protocol guardrails after model inference. This is intentional clinical safety architecture, not a metric shortcut.

The model provides structured reasoning and likely diagnosis. The guardrail layer enforces safety-critical protocol rules such as:

- `MUAC < 11.5cm` -> `REFER_URGENT`
- bilateral/bipedal edema without negation -> `REFER_URGENT`
- severe chest indrawing -> `REFER_URGENT`
- neonatal inability to feed -> `REFER_URGENT`
- lethargy plus inability to drink -> `REFER_URGENT`
- convulsions, meningitis signs, or altered consciousness -> `REFER_URGENT`
- sexual violence survivor -> `REFER_URGENT`
- maternal danger signs -> `REFER_URGENT`

The final guardrail implementation also handles negation and conservative downgrades for non-severe cases:

- `Bilateral edema: no` does not trigger a SAM referral.
- `no danger signs` does not allow model hallucinations to force urgent referral.
- moderate malnutrition with `MUAC >= 11.5cm` and no edema remains `TREAT`.
- non-severe pneumonia/ARI without emergency danger signs remains `TREAT`.

## Key Findings

E4B remains the stronger model for high-quality clinical reasoning and schema consistency. E2B is the stronger deployment candidate for mid-range Android because it preserves 100% urgent recall with a smaller model footprint.

The most important safety result is shared across both models:

> SHIFA achieved 100% urgent recall and 0% urgent miss rate on the 60-case validation set when paired with deterministic WHO/IMCI guardrails.

## Known Limitations

- E2B is more schema-fragile than E4B. It sometimes emits malformed or truncated JSON, so the validator and mobile app use a robust parser plus deterministic guardrails.
- E2B remains more conservative than E4B and can over-refer non-severe pneumonia/ARI cases.
- LiteRT fine-tuned export is still a tooling/infrastructure milestone. E2B GGUF via llama.cpp/llama.rn is the current practical offline runtime path.
- Validation set size is still small. The next clinical milestone is a broader blinded validation set with more non-urgent respiratory, nutrition, malaria, and diarrhea cases.

## Evidence Artifacts

| Artifact | Purpose |
| --- | --- |
| `ml/reports/training_manifest.json` | E4B training evidence |
| `ml/reports/validation_metrics.json` | E4B validation evidence |
| `ml/reports/e2b_training_manifest.json` | E2B training evidence, currently on R2 |
| `ml/reports/e2b_validation_metrics.json` | E2B validation evidence, currently on R2 |
| `models/shifa-gemma4-e2b-finetuned/shifa-gemma4-e2b-q4km.gguf` | E2B offline runtime model on R2 |
| `models/shifa-gemma4-e2b-finetuned/shifa-gemma4-e2b-mmproj-f16.gguf` | Optional multimodal projector on R2 |
| `ml/reports/upload_manifest.json` | R2 upload proof |
| `ml/reports/download_manifest.json` | R2 download proof |
| `SHIFA_Technical_Challenges.md` | Engineering decisions and challenges |

## Next Phase

1. Download and commit the E2B report artifacts from R2 if they are not present locally.
2. Test first-run model download on Android with the E2B GGUF.
3. Run the 60-case suite through the on-device runtime and compare against Kaggle validation.
4. Attempt E2B LiteRT export on a larger GPU/RAM instance if time remains.
5. Record the final demo: symptom input -> model output -> guardrail decision -> referral/treatment UI.
