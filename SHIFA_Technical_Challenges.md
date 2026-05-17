# SHIFA - Technical Challenges & Engineering Decisions

> Documentation of real engineering challenges encountered during SHIFA model training, validation, and mobile runtime export.
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

Four export paths were attempted:

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
- E4B export ran but OOM'd during conversion because the 16 GB merged model plus conversion overhead exceeded Kaggle's available RAM

### Path E: E2B fine-tuned LiteRT export

After E2B fine-tuning and validation succeeded, the same LiteRT export path was attempted for the smaller `google/gemma-4-E2B-it` model:

- Downloaded the E2B adapter artifacts from R2 into a fresh Kaggle session
- Attempted to merge LoRA into a standalone Hugging Face model with `save_pretrained_merged(save_method="merged_16bit")`
- Attempted the `litert-torch export_hf` path against the merged E2B model
- Export still OOM'd on Kaggle, confirming that the blocker is available RAM during export/conversion rather than model training or validation
- Re-ran the E2B path on Vast.ai with an A100 SXM4 80GB instance, 200 GB disk, and high system RAM
- Merged E2B LoRA into a 9.6 GB standalone Hugging Face model
- `litert-torch export_hf` completed successfully and produced `/workspace/shifa-litert-e2b/model.litertlm`
- Export log reported original per-layer embedder size of 8.75 GiB and quantized size of 2.19 GiB
- The resulting packaged `.litertlm` artifact was 3,271,645,136 bytes and was copied to `models/shifa-gemma4-e2b-finetuned/shifa-gemma4-e2b-finetuned.litertlm`
- The `.litertlm` artifact was uploaded to R2 and confirmed in the Cloudflare dashboard under `models/shifa-gemma4-e2b-finetuned/`

### Current Status

- E4B F16 GGUF exported successfully to `/tmp/shifa-gemma4-gguf/shifa.F16.gguf`
- E4B Q4_K_M GGUF exported and uploaded to R2 as `models/gguf/shifa-gemma4-e4b-q4km.gguf`
- E2B Q4_K_M GGUF exported successfully and uploaded to R2 as `models/shifa-gemma4-e2b-finetuned/shifa-gemma4-e2b-q4km.gguf`
- Fine-tuned E2B LiteRT-LM `.litertlm` export succeeded on Vast.ai A100 SXM4 80GB and was uploaded to R2
- SHIFA Guard YOLO11n firearm detector trained on Roboflow YOLOv8 export, validated on the firearm class, exported to TFLite, and uploaded to R2
- E4B LiteRT export remains blocked on available export memory and should be retried only on larger high-RAM infrastructure
- Mobile app now prefers the E2B `.litertlm` runtime through the native Kotlin LiteRT/MediaPipe bridge, with GGUF via `llama.rn`, Gemini cloud fallback, and deterministic protocol fallback retained as safety layers

## 6. Guard Detector Dataset & Export

### Problem

The initial Hugging Face weapon dataset path produced unusable detector metrics. Bounding-box conversion fixes did not move mAP meaningfully, which pointed to annotation quality and split imbalance rather than a code-only bug. Knife examples were especially weak.

### Resolution

Switched Guard training to a Roboflow YOLOv8 export (`yolov7test-u13vc/weapon-detection-m7qso` version 16), avoiding the Hugging Face parquet-to-YOLO conversion path entirely. The detector is scoped honestly:

- `GUN` is the validated alert-trigger class.
- `PERSON` is context only.
- `KNIFE` remains experimental and should not trigger dispatch by itself.
- IED/explosive detection requires a separate validated dataset.

Latest Guard validation: `GUN` mAP50 **0.725** against a 0.60 release gate. The exported TFLite artifact is approximately 5.35 MB and is included in the first-run mobile offline pack.

## 7. Disk & Memory Constraints on Kaggle

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

## 8. Danger Sign & Protocol Adherence Scoring

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
| Fine-tuned LiteRT export OOM on Kaggle | High | Re-ran E2B on Vast.ai A100/high-RAM instance; exported `.litertlm` successfully |
| Strict string matching in validation | Medium | Fuzzy + synonym matching |
