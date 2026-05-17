# SHIFA Training and Validation Results

Submission-facing summary of the Gemma 4 fine-tuning and validation runs for SHIFA, an offline-first clinical decision support assistant for community health workers in humanitarian crisis settings.

## Models

| Model | Purpose | Status |
| --- | --- | --- |
| Gemma 4 E4B | Higher-quality clinical reasoning model for demo/server and high-end-device path | Trained, validated, GGUF exported |
| Gemma 4 E2B | Mobile-first model for mid-range Android deployment | Trained, validated, LiteRT-LM and GGUF exported |

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

Root cause for the below-target danger-sign score: the model correctly refers urgent cases, but often names danger signs differently from canonical WHO/IMCI labels in multilingual output. Synonym matching in the v2 validation script partially mitigates this; guarded urgent recall remains 100%.

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

## E2B Mobile Runtime Artifacts

| Artifact | Value |
| --- | --- |
| Primary runtime format | LiteRT-LM `.litertlm` |
| Primary model | `models/shifa-gemma4-e2b-finetuned/shifa-gemma4-e2b-finetuned.litertlm` |
| Export host | Vast.ai A100 SXM4 80GB |
| Export result | Successful |
| Packaged artifact size | 3,271,645,136 bytes, approximately 3.1 GB |
| Export log size | 2.19 GiB quantized from 8.75 GiB per-layer embedder |
| Primary runtime path | Native Kotlin LiteRT / MediaPipe `LlmInference` bridge |
| Fallback runtime format | GGUF Q4_K_M |
| Fallback model | `models/shifa-gemma4-e2b-finetuned/shifa-gemma4-e2b-q4km.gguf` |
| Fallback size | 3,427,878,240 bytes, approximately 3.2 GB |
| Fallback runtime path | `llama.rn` / llama.cpp bridge |
| Delivery model | First-run user-approved download from R2 |

The E2B LiteRT-LM artifact is now the preferred offline Android runtime target. The E2B GGUF remains available as a fallback runtime. Neither multi-GB artifact is bundled into the APK because it would create an impractical install size. The mobile app asks the user to download the LiteRT-LM model on first launch and falls back to cloud/protocol mode if the user skips setup.

The current R2 LiteRT-LM package was rebuilt with the tokenizer export step enabled, then republished over the earlier incomplete package. The live artifact reports `Content-Length: 3271671808` and includes the quantized weights plus bundled SentencePiece tokenizer metadata required by MediaPipe `LlmInference`.

The first-run offline setup now also includes the multilingual Whisper base speech-to-text model (`ggml-base.bin`, approximately 142 MB). This allows recorded patient speech to be converted into editable symptom text before the local LiteRT/GGUF clinical model runs. The STT model does not alter the validated clinical model weights, validation guardrails, or scoring logic; it only improves offline voice input routing.

The first-run offline setup also includes the compact SHIFA Guard firearm detector (`guard/shifa-guard-weapon-detector.tflite`, 5,350,968 bytes). This detector is separate from the clinical model and does not affect clinical validation metrics.

## SHIFA Guard Firearm Detector

| Item | Value |
| --- | --- |
| Detector | YOLO11n |
| Dataset | Roboflow `yolov7test-u13vc/weapon-detection-m7qso` version 16 |
| Classes | `GUN`, `KNIFE`, `PERSON` |
| Training host | Kaggle T4 |
| Epochs | 80 |
| Image size | 640 |
| PT artifact | `guard/shifa-guard-weapon-detector.pt`, 5,475,994 bytes |
| TFLite artifact | `guard/shifa-guard-weapon-detector.tflite`, 5,350,968 bytes |

| Metric | Result | Release Target | Status |
| --- | ---: | ---: | :---: |
| Overall mAP50 | 0.363 | reported only | — |
| `GUN` mAP50 | **0.725** | 0.60 | ✅ |
| Alert-trigger class mAP50 | **0.725** | 0.60 | ✅ |
| `KNIFE` mAP50 | 0.000 | experimental | — |

Overall mAP50 is depressed by the `KNIFE` class due to insufficient training signal in this dataset version. `GUN` mAP50 is the release gate because visible firearm detection is the only dispatch-triggering offline class.

The detector is validated as an offline firearm evidence screen. Android now has a native TFLite bridge for still-image Guard evidence; video evidence and iOS detector execution remain separate implementation targets. Alert dispatch should require high-confidence visible `GUN` detections. `KNIFE` is logged as experimental and should not trigger dispatch by itself. `PERSON` is context only and never a dispatch trigger.

## Physical Android Smoke Test

Physical-device testing confirmed that the E2B GGUF runtime can load and complete offline clinical analysis on Android after the first-run model download.

| Test | Result |
| --- | --- |
| Offline E2B GGUF analysis | Completed successfully on Android |
| Offline Kinyarwanda output | Completed successfully |
| Offline Kinyarwanda speech playback | Completed successfully |
| Regional/local TTS voice preference | Implemented; uses installed regional voice when available, otherwise falls back to system default |
| Offline speech-to-text pack | Added to first-run model download; physical-device transcription validation pending |
| Guard firearm detector pack | Added to first-run model download; Android still-image TFLite bridge implemented, physical-device detector smoke test pending |
| Guard still-image TFLite inference | Android bridge implemented; physical-device detector smoke test pending |
| Case logging | Saved locally |
| Data center sync | Confirmed after connectivity was available |
| Cloud Gemini fallback | Completed successfully when online |

Observed GGUF latency on the tested Android device was still high: a full offline clinical response took roughly 4 minutes, with local-language generation/translation adding additional time. This confirmed offline capability, but not field-fast GGUF latency. The subsequent LiteRT-LM export is expected to be the faster mobile runtime path and still requires physical-device validation.

After this test, the mobile runtime was tightened for faster no-retrain inference. The model weights, validation guardrails, clinical parser, and safety override logic were not changed. Only runtime generation settings were adjusted:

| Setting | Previous | Updated | Reason |
| --- | ---: | ---: | --- |
| Context window | 4096 | 2048 | The mobile prompt is short; smaller context reduces local memory/work |
| Batch size | 256 | 128 | Lower peak runtime pressure on Android |
| Max output tokens | 768 | 512 | Keeps enough room for compact JSON while reducing generation time |
| Temperature | 0.1 | 0 | Deterministic clinical output |
| Prompt style | Full JSON response | Compact JSON response | Same schema, shorter user-facing strings |

This should improve GGUF latency without materially changing clinical accuracy, because the learned model and deterministic WHO/IMCI guardrails are unchanged. The remaining risk is schema truncation on unusually long local-language responses; if seen in testing, the output budget should be raised from 512 to 640 tokens.

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
- Physical Android GGUF inference is functional but slow on the tested device. A full GGUF response can take several minutes, especially for local-language output.
- E2B LiteRT-LM export succeeded after moving from Kaggle to Vast.ai A100/high-RAM infrastructure. Physical-device LiteRT validation is still required before replacing GGUF performance observations with LiteRT benchmark claims.
- Validation set size is still small. The next clinical milestone is a broader blinded validation set with more non-urgent respiratory, nutrition, malaria, and diarrhea cases.

## Evidence Artifacts

| Artifact | Purpose |
| --- | --- |
| `ml/reports/training_manifest.json` | E4B training evidence |
| `ml/reports/validation_metrics.json` | E4B validation evidence |
| `ml/reports/e2b_training_manifest.json` | E2B training evidence, currently on R2 |
| `ml/reports/e2b_validation_metrics.json` | E2B validation evidence, currently on R2 |
| `ml/reports/runtime_manifest.json` | E2B LiteRT-LM export evidence |
| `models/shifa-gemma4-e2b-finetuned/shifa-gemma4-e2b-finetuned.litertlm` | E2B primary LiteRT-LM runtime model on R2 |
| `models/shifa-gemma4-e2b-finetuned/shifa-gemma4-e2b-q4km.gguf` | E2B offline runtime model on R2 |
| `models/shifa-gemma4-e2b-finetuned/shifa-gemma4-e2b-mmproj-f16.gguf` | Optional multimodal projector on R2 |
| `guard/shifa-guard-weapon-detector.tflite` | Guard offline firearm detector on R2 |
| `guard/validation_metrics.json` | Guard firearm detector validation evidence |
| `guard/dataset_manifest.json` | Guard detector dataset/export evidence |
| `guard/training_manifest.json` | Guard detector training evidence |
| `ml/reports/upload_manifest.json` | R2 upload proof |
| `ml/reports/download_manifest.json` | R2 download proof |
| `SHIFA_Technical_Challenges.md` | Engineering decisions and challenges |
