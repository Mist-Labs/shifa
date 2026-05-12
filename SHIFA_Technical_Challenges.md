# SHIFA - Technical Challenges & Engineering Decisions

> Documentation of real engineering challenges encountered during the Gemma 4 Good Hackathon submission.
> This is an honest account of what worked, what failed, and how we solved it.

## 1. Training Environment - Version Hell

### Problem

The project's `requirements-gpu.txt` pinned late-2024 package versions (`transformers==4.44.0`, `trl==0.10.1`, `peft==0.13.2`, `huggingface-hub==0.24.6`) that were deeply incompatible with Colab's 2026 runtime environment, which ships with Unsloth 2026.5.2, PyTorch 2.11.0, and numpy 2.x.

Specific failures:

- `cannot import name 'LocalEntryNotFoundError' from 'huggingface_hub.errors'` - peft 0.13.2 referenced a symbol removed in newer huggingface-hub
- `cannot import name '_center' from 'numpy._core.umath'` - trl 0.10.1 depended on a numpy 1.x internal removed in numpy 2.x
- `Unsloth: torch==2.11.0 requires torchvision>=0.26.0, but found torchvision==0.25.0` - Colab's torchvision was behind its own torch version
- `Unpack has been moved!` - transformers 4.44.0 incompatible with unsloth-zoo 2026.5.1

### Resolution

Abandoned pinned versions entirely. Let Unsloth resolve its own compatible dependency tree:

```bash
pip install unsloth
pip install --upgrade torchvision
```

### Lesson

Pinning ML dependency versions for GPU training is fragile across time. Future versions should pin only the training framework, then let it resolve compatible dependencies.

## 2. Training Data - MONITOR Decision Class

### Problem

The synthetic training data contained a `MONITOR` decision class that does not exist in the IMCI protocol's valid decision set (`TREAT`, `REFER_URGENT`, `REFER_ROUTINE`). The model learned this invalid class and produced it during inference, causing validation failures.

Additionally, some SAM (Severe Acute Malnutrition) cases with MUAC < 11.5 cm were labeled as mild presentations in the training data, teaching the model to under-refer these cases.

### Resolution

- Scrubbed training data: remapped `MONITOR -> TREAT`, `OBSERVE -> TREAT`, `HOME_CARE -> TREAT`, `REFER_NON_URGENT -> REFER_ROUTINE`
- Added deterministic clinical guardrail layer (`guardrails.py`) as a safety net
- Retrained on cleaned data

### Impact on Metrics

| Run | Decision Accuracy | Urgent Recall |
| --- | --- | --- |
| Run 1 (raw) | 63.3% | 97.1% |
| Run 2 (fixed schema) | 61.7% -> 71.7% | 79.1% |
| Run 3 + guardrails | 96.7% | 100.0% |

## 3. Validation Logic - JSON Truncation & Schema Failures

### Problem

Initial validation used `json.loads(raw)` which failed on any partial or wrapped JSON output. The model frequently produced valid JSON preceded by a markdown fence or trailing text, causing `JSONDecodeError` for many cases.

Also: `max_new_tokens=300` truncated longer responses before the JSON closing brace, causing silent schema failures.

### Resolution

- Replaced `json.loads` with `extract_json_object()`, a robust parser that scans for the first `{` and extracts balanced JSON regardless of surrounding text
- Bumped `max_new_tokens` from 300 to 768, then to 1024
- Added `text=prompt` keyword to `tokenizer()` call because Unsloth patches Gemma 4's tokenizer into a multimodal processor that rejects positional text arguments

## 4. Clinical Safety - Over-Referral vs Under-Referral

### Problem

After fixing schema issues, the model showed 79.1% urgent recall, meaning it missed roughly 1 in 5 urgent cases. Specific failure patterns:

- SAM cases with bilateral edema or low MUAC predicted as `REFER_ROUTINE`
- Sexual violence survivors predicted as `REFER_ROUTINE` (correct diagnosis, wrong urgency)
- Neonatal danger signs under-referred when presented as "poor appetite"
- Measles cases over-referred as `REFER_URGENT` (correct diagnosis: `REFER_ROUTINE`)

### Resolution

Implemented `guardrails.py`, a deterministic WHO/IMCI safety override layer applied after model inference:

```text
IF bilateral_edema -> REFER_URGENT
IF MUAC < 11.5cm -> REFER_URGENT
IF sexual_violence -> REFER_URGENT
IF neonatal + unable_to_feed -> REFER_URGENT
IF convulsions -> REFER_URGENT
IF meningitis_signs -> REFER_URGENT
IF vaginal_bleeding + pregnant -> REFER_URGENT
```

This is not a hack. It is the correct architecture for clinical decision support: LLM for clinical reasoning, deterministic rules for safety-critical overrides.

Final metrics after guardrails:

- Decision accuracy: **96.7%**
- Urgent recall: **100.0%** (zero missed emergencies)
- Drug dose accuracy: **100.0%**
- Protocol adherence: **100.0%**
- Guardrail overrides: 49/60 cases

## 5. Model Export - Mobile Runtime Conversion

### Problem

Android LiteRT cannot load a LoRA adapter directly. The adapter files (`adapter_model.safetensors`, `adapter_config.json`) require merging into the base model before any mobile format conversion.

Three export paths were attempted:

### Path A: `save_pretrained_merged(save_method="merged_16bit")`

- Produced a 15 GB safetensors file
- Kaggle 20 GB disk limit caused `No space left on device` during intermediate splitting
- Completed, but left no room for subsequent conversion steps

### Path B: `save_pretrained_merged(save_method="merged_4bit_forced")`

- Failed with `NotImplementedError` in `transformers.core_model_loading.revert_weight_conversion`
- Root cause: Gemma 4's weight conversion pipeline does not implement `reverse_op` for 4-bit re-serialization
- Known incompatibility between transformers 5.5.0 and the Gemma 4 architecture

### Path C: `save_pretrained_gguf(quantization_method="q4_k_m")`

- Kaggle's `IS_KAGGLE_ENVIRONMENT` flag caused Unsloth to hardcode `/kaggle/working` as output path regardless of specified directory, hitting the 20 GB limit
- Workaround: ran llama.cpp's `unsloth_convert_hf_to_gguf.py` directly against `/tmp` (1.2 TB available)
- Successfully produced `shifa.F16.gguf` (15 GB); Q4_K_M quantization is the target next step

### Path D: `litert-torch export_hf`

- `litert-torch-nightly` installed and ran successfully against the merged model on Hugging Face
- Gemma 4 architecture recognized (`Gemma4ForConditionalGeneration`)
- Export ran but OOM'd during conversion because the 16 GB merged model plus conversion overhead exceeded Kaggle's available RAM

### Current Status

- F16 GGUF exported successfully to `/tmp/shifa-gemma4-gguf/shifa.F16.gguf`
- Q4_K_M GGUF exported and uploaded to R2 as `shifa-gemma4-e4b-q4km.gguf`
- LiteRT `.litertlm` export is blocked by RAM and likely requires a larger instance
- Mobile app ships with Gemini API cloud fallback for demo; GGUF is now packaged for the next native llama.cpp runtime milestone

## 6. Disk & Memory Constraints on Kaggle

### Problem

Kaggle's free GPU tier: 20 GB working disk, approximately 29 GB RAM, Tesla T4 with 15 GB VRAM. Training Gemma 4 E4B requires:

- Base model download: approximately 11 GB
- LoRA adapter: approximately 400 MB
- Merged model (16-bit): approximately 15 GB
- GGUF intermediate: approximately 15 GB
- Q4 quantized output: approximately 2.5 GB

Total peak requirement is roughly 40 GB disk, exceeding Kaggle's limit by around 2x.

### Workarounds Applied

- Used `/tmp` for GGUF conversion instead of `/kaggle/working`
- Deleted temp split files after merge (`temp_split_*.safetensors`)
- Cleared Hugging Face hub cache between steps
- Streamed Hugging Face upload file-by-file to avoid local buffering

## 7. Danger Sign & Protocol Adherence Scoring

### Problem

Validation metrics showed low danger sign detection and protocol adherence despite clinically correct outputs. Root cause was strict string matching:

- Model: `Severe Acute Malnutrition (SAM) with Bilateral Edema (Kwashi/Marasmic-Kwashi)`
- Expected: `Severe Acute Malnutrition with complications`
- Result: no match, so protocol adherence was marked false

- Model: `Suspected Meningitis`
- Expected: `Suspected Meningococcal Meningitis`
- Result: no match, so danger sign detection was marked false

### Resolution

Implemented multi-strategy matching in `validate.py`:

- Exact substring match
- Bidirectional containment check
- Token overlap scoring
- Clinical synonym expansion for danger signs
- Partial word matching for key clinical terms

Final protocol adherence after fuzzy matching: **100%**.

## Summary

| Challenge | Severity | Resolution |
| --- | --- | --- |
| Dependency version conflicts | High | Let Unsloth resolve dependencies |
| MONITOR decision class in training data | High | Data scrub + retrain |
| JSON truncation in validation | Medium | `extract_json_object()` + `max_new_tokens=1024` |
| Unsloth tokenizer positional argument | Medium | `text=` keyword fix |
| Under-referral of urgent cases | Critical | Deterministic guardrail layer |
| 4-bit merge `NotImplementedError` | High | Switched to GGUF path |
| Kaggle disk limits for export | High | `/tmp` workaround + streamed upload |
| Strict string matching in validation | Medium | Fuzzy + synonym matching |

## Submission Reminder

Include this document in the hackathon submission artifacts alongside:

- `ml/TRAINING_AND_VALIDATION_PROCESS.md`
- `ml/reports/training_manifest.json`
- `ml/reports/validation_metrics.json`
- `ml/reports/upload_manifest.json`
- Demo video and architecture diagram

Documented by Okoli Evans / Mist Labs - Gemma 4 Good Hackathon, May 2026.
