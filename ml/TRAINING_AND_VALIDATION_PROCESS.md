# SHIFA: Model Training & Validation Process
### Gemma 4 Fine-tuning on Clinical Decision Data for Humanitarian Crisis Zones

---

## Overview

SHIFA (صحة — Arabic for "healing") is an offline-first AI clinical assistant for community health workers operating in humanitarian crises. This document covers the end-to-end process of fine-tuning Gemma 4 E4B on WHO IMCI clinical protocols and validating the resulting model.

- **Base model:** `google/gemma-4-e4b-it` (4B multimodal, Edge variant)
- **Fine-tuning method:** QLoRA via Unsloth (r=16, α=16)
- **Training platform:** Kaggle (Tesla T4 x2, 14.5GB VRAM)
- **Storage backend:** Cloudflare R2
- **Training data:** 2,000 synthetic clinical cases derived from WHO IMCI, Sphere, and MSF protocols
- **Validation set:** 60 IMCI test cases across Sudan, DRC, Somalia, Northern Nigeria
- **Languages:** Arabic, Somali, French, Lingala, Kinyarwanda, Hausa
- **Latest result:** 96.7% guarded decision accuracy, 100.0% urgent referral recall, 0.0% urgent miss rate

---

## 1. Environment Setup

### Why Kaggle over Colab

Google Colab's runtime at time of training shipped `torch==2.11.0+cu130`. Unsloth 2026.5.x caps at `torch<2.11.0` and the `torch._inductor.config` attribute was restructured in 2.11.0, causing an `AttributeError` in `unsloth_zoo/temporary_patches/common.py`. No stable `cu130` wheel existed for `torch==2.10.0`, making the Colab environment a dead end.

Kaggle's runtime shipped `torch==2.10.0+cu128` which falls within Unsloth's supported range.

### Installation

```python
# Kaggle — install unsloth directly from git, no-deps to bypass version resolver conflicts
!pip install -q "unsloth[kaggle-new] @ git+https://github.com/unslothai/unsloth.git"
```

Key dependency conflicts encountered and resolved:
- `numpy<2.0` required for `trl` compatibility (`_center` import removed in numpy 2.x)
- `torchvision>=0.26.0` required by unsloth for torch 2.10
- Raw `PeftModel.from_pretrained` incompatible with `Gemma4ClippableLinear` — must load via `FastLanguageModel`
- Unsloth Zoo patches the Gemma4 tokenizer into a multimodal processor — `tokenizer(prompt)` positional calls fail; must use `tokenizer(text=prompt)` keyword or `apply_chat_template`

### Secrets Management

All credentials are stored as Kaggle Secrets and loaded via:

```python
from kaggle_secrets import UserSecretsClient
secrets = UserSecretsClient()
os.environ["HF_TOKEN"] = secrets.get_secret("HF_TOKEN")
os.environ["AWS_ACCESS_KEY_ID"] = secrets.get_secret("AWS_ACCESS_KEY_ID")
os.environ["AWS_SECRET_ACCESS_KEY"] = secrets.get_secret("AWS_SECRET_ACCESS_KEY")
```

---

## 2. Data Pipeline

### Training Data

2,000 synthetic clinical cases generated from WHO IMCI protocols, Sphere Humanitarian Standards, and MSF clinical guidelines. Cases span four countries and six languages.

The repaired dataset enforces the clinical output contract:

- Valid decision labels only: `TREAT`, `REFER_URGENT`, `REFER_ROUTINE`
- No `MONITOR` decision label in training targets
- MUAC under 11.5cm is urgent
- Bilateral/bipedal edema is urgent unless explicitly uncomplicated in the source rule
- All assistant outputs include the full SHIFA JSON schema

Latest decision distribution:

| Decision | Count |
|---|---:|
| `REFER_URGENT` | 1305 |
| `TREAT` | 482 |
| `REFER_ROUTINE` | 213 |

Each training record follows the Gemma4 chat format:

```json
{
  "messages": [
    {
      "role": "system",
      "content": "You are SHIFA, a clinical decision support assistant for community health workers. Follow WHO IMCI protocols, Sphere Humanitarian Standards, and the country protocol module exactly. Respond only as valid JSON. Default to REFER_URGENT when confidence is below 0.70, when danger signs are present, or when age/weight needed for dosing is missing. Never provide a drug dose without confirming patient age and weight.\nCountry module: Sudan.\nRespond in Arabic. Include reasoning_trace, confidence, danger_signs, and voice_response."
    },
    {
      "role": "user",
      "content": "Patient, male, 126 months, weight 36.5kg. Cough and fast breathing for 1 days."
    },
    {
      "role": "assistant",
      "content": "{\"decision\": \"TREAT\", \"primary_diagnosis\": \"Pneumonia\", ...}"
    }
  ],
  "text": "<start_of_turn>system\n...<end_of_turn>\n<start_of_turn>user\n...<end_of_turn>\n<start_of_turn>model\n{...}<end_of_turn>\n"
}
```

### Artifact Management

All training data and model artifacts are stored in Cloudflare R2 (`shifa` bucket). They are downloaded to the Kaggle working directory at session start via boto3:

```python
s3 = boto3.client("s3", endpoint_url="https://<account>.r2.cloudflarestorage.com")
s3.download_file("shifa", "data/processed/training_final.jsonl", "/kaggle/working/data/training_final.jsonl")
```

---

## 3. Model Fine-tuning

### Configuration

```python
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name="google/gemma-4-e4b-it",
    max_seq_length=8192,
    load_in_4bit=True,
    dtype=None,
    token=hf_token,
)

model = FastLanguageModel.get_peft_model(
    model,
    r=16,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    lora_alpha=16,
    lora_dropout=0,
    bias="none",
    use_gradient_checkpointing="unsloth",
    random_state=42,
)
```

### Training Arguments (SFTConfig)

```python
SFTConfig(
    dataset_text_field="text",
    max_seq_length=8192,
    per_device_train_batch_size=2,
    gradient_accumulation_steps=4,
    warmup_steps=10,
    num_train_epochs=3,
    learning_rate=2e-4,
    fp16=True,           # T4 does not support bfloat16
    bf16=False,
    logging_steps=10,
    save_strategy="epoch",
    optim="adamw_8bit",
    weight_decay=0.01,
    lr_scheduler_type="linear",
)
```

**Note:** `TrainingArguments` replaced with `SFTConfig` and `tokenizer` arg moved to `processing_class` due to TRL API changes in v0.18+.

### Latest Training Results

| Step | Loss | Epoch |
|------|------|-------|
| Early | 2.326 | 0.04 |
| Early | 0.059 | 0.21 |
| Mid | 0.006-0.007 | 2.2-2.9 |
| Final | train_loss 0.0599 | 3.0 |

- **Total steps:** 729
- **Runtime:** 1h 42m 54s (6,174 seconds)
- **Final train loss:** 0.0599
- **Samples/sec:** 0.943
- **Platform:** Kaggle Tesla T4 x2
- **Completed at:** 2026-05-10T09:01:46Z

Loss converged quickly and stayed stable around 0.006-0.007 late in training, indicating strong adaptation to the clinical JSON output format.

---

## 4. Model Artifacts

Saved artifacts uploaded to R2 at `models/shifa-gemma4-e4b-finetuned/`:

| File | Description |
|------|-------------|
| `adapter_model.safetensors` | LoRA adapter weights (169MB) |
| `adapter_config.json` | LoRA configuration |
| `tokenizer_config.json` | Tokenizer configuration |
| `tokenizer.json` | Full tokenizer (32MB) |
| `processor_config.json` | Multimodal processor config |
| `chat_template.jinja` | Gemma4 chat template |

**Loading for inference:**

```python
# Must use FastLanguageModel — raw PeftModel.from_pretrained fails on Gemma4ClippableLinear
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name="/path/to/shifa-gemma4-finetuned",
    max_seq_length=2048,
    load_in_4bit=True,
)
FastLanguageModel.for_inference(model)
```

---

## 5. Inference Format

The model requires the exact prompt format used during training. Positional tokenizer calls fail on the patched Gemma4 processor — use `text=` keyword:

```python
from common import country_prompt  # generates the SHIFA system prompt per country/language

prompt = (
    f"<start_of_turn>system\n{country_prompt(country, language)}<end_of_turn>\n"
    f"<start_of_turn>user\n{symptom_text}<end_of_turn>\n"
    "<start_of_turn>model\n"
)

inputs = tokenizer(text=prompt, return_tensors="pt").to("cuda")
with torch.no_grad():
    output = model.generate(**inputs, max_new_tokens=1024, do_sample=False)
decoded = tokenizer.decode(output[0], skip_special_tokens=True)
response = decoded[len(prompt):]
```

**Sample output (Arabic, Sudan, conflict wound case):**

```json
{
  "decision": "REFER_URGENT",
  "primary_diagnosis": "Infected conflict wound",
  "differential_diagnoses": ["Cellulitis", "Tetanus risk"],
  "treatment_protocol": null,
  "referral": "Nearest facility with wound care, antibiotics, and tetanus prophylaxis",
  "monitoring": null,
  "reasoning_trace": "تُظهر الحالة علامات عدوى حادة ومُتفاقمة...",
  "confidence": 0.95,
  "danger_signs": ["احمرار مُتوسع", "مصدر تلوث مُتراكم", "عدم معرفة بحالة التيتانوس"],
  "voice_response": "يجب نقل المريضة فوراً إلى قسم الطوارئ أو طبيب مُتخصص في العدوى."
}
```

---

## 6. Validation (60-case held-out set)

### Validation Script

`ml/finetune/validate.py` scores raw model output and the final clinical safety path. The final path is:

1. Model inference.
2. First valid JSON object extraction.
3. Schema and protocol scoring.
4. Deterministic WHO/IMCI safety guardrails.

The guardrail layer overrides under-referrals for high-risk findings including MUAC under 11.5cm, bilateral edema, neonatal feeding/breathing danger, sexual violence, maternal danger signs, meningitis signs, severe chest indrawing, altered consciousness, and inability to drink.

### Latest Validation Metrics

| Metric | Target | Description |
|--------|--------|-------------|
| Decision accuracy, guarded | >88% | 96.7% |
| Urgent referral recall, guarded | >95% | 100.0% |
| Urgent miss rate, guarded | 0% goal | 0.0% |
| Drug dose accuracy | >95% | 100.0% |
| Protocol adherence | >90% | 100.0% |
| Schema completeness | high | 98.3% |
| Danger sign detection | >92% | 88.3% |
| Raw model decision accuracy | tracked | 73.3% |
| Raw model urgent recall | tracked | 79.1% |
| Over-referral rate | tracked | 11.8% |
| Guardrail overrides | tracked | 49 / 60 |

### Validation Findings

The retrained model now follows the full schema in 98.3% of cases. The major remaining issue is not schema compliance; it is conservative under/over-classification in specific protocol families.

**What improved:** deterministic parsing fixed repeated-JSON / `thought` suffix failures. Guardrails corrected systematic under-referrals in SAM, GBV, neonatal, and other urgent-danger cases.

**What remains:** danger-sign extraction is 88.3% against a 92% target because the model often makes the correct referral but names the danger sign differently from the canonical test label. The few remaining decision failures should be audited as synthetic-label issues before any further retraining.

**Clinical safety assessment:** the final system path has 100% urgent recall and zero urgent misses on the current held-out set. Raw model metrics are still tracked separately and should be disclosed honestly.

### Required Reporting Language

Use:

> SHIFA's fine-tuned Gemma 4 E4B adapter plus deterministic WHO/IMCI guardrails achieved 96.7% decision accuracy and 100% urgent referral recall on a 60-case multilingual humanitarian validation set.

Do not use:

> The raw LLM alone achieved 100% urgent recall.

---

## 7. Known Issues & Lessons Learned

### Environment
- Colab torch 2.11.0+cu130 is incompatible with unsloth 2026.5.x — use Kaggle
- Always install unsloth last, after torch and torchvision
- `--no-deps` install from git bypasses broken PyPI version constraints
- Session restarts wipe `/kaggle/working/` — always pull artifacts from R2 at session start

### Gemma4-Specific
- Gemma4 tokenizer is patched by unsloth_zoo into a multimodal processor — always use `text=` kwarg
- `PeftModel.from_pretrained` fails on `Gemma4ClippableLinear` — load adapters via `FastLanguageModel` only
- T4 does not support bfloat16 — use `fp16=True, bf16=False`
- E4B inference on T4 requires a fresh session with no prior model in VRAM (needs ~10GB free)
- `use_cache=False` corrupts attention in E4B due to KV sharing across layers — always use `use_cache=True` at inference

### Training Contract
- System prompt must explicitly list all required JSON output fields — the model follows instructions literally
- Training data `text` field must use the exact `<start_of_turn>` format for Gemma4
- `SFTTrainer` in TRL 0.18+ requires `processing_class=tokenizer` not `tokenizer=tokenizer`
- `TrainingArguments` replaced by `SFTConfig` for SFT-specific args

---

## 8. Current Completion State

1. **Submission evidence** — guarded metrics, raw metrics, and guardrail explanations are captured in the reports and results documentation.
2. **Artifact preservation** — `training_manifest.json`, validation metrics, runtime manifests, upload manifests, adapters, GGUF files, and the LiteRT-LM runtime are stored in R2 as the evidence trail.
3. **Danger-sign canonicalization** — validation now uses clinical synonym and fuzzy matching so multilingual labels are scored against WHO/IMCI concepts instead of brittle exact strings.
4. **Synthetic-label mismatches** — known moderate malnutrition / SAM conflicts were handled in validation guardrail logic and documented for future dataset cleanup.
5. **LiteRT packaging** — fine-tuned E2B LiteRT-LM export succeeded on Vast.ai A100/high-RAM infrastructure and was uploaded to R2 as the primary mobile runtime artifact.
6. **Android integration** — the custom app downloads the LiteRT-LM model on first launch, keeps GGUF as fallback, and applies the same deterministic WHO/IMCI guardrails before returning decisions.
7. **Offline voice pipeline** — Whisper base STT is part of the first-run offline setup and converts recorded patient speech into editable symptom text before local clinical inference. TTS speaks the result in the selected CHW language, preferring installed regional/local device voices when available and falling back to the system default.
8. **Guard firearm detector** — a separate YOLO11n detector was trained from the Roboflow YOLOv8 weapon dataset, exported to TFLite, validated with a firearm-specific release gate, uploaded to R2, added to the mobile first-run offline pack, and wired into Android still-image evidence analysis through a native TFLite bridge.

## 9. SHIFA Guard Firearm Detector Process

The Guard visual detector is intentionally separate from the clinical Gemma models. It supports threat evidence screening and must not influence clinical triage decisions.

Pipeline:

1. Download Roboflow dataset `yolov7test-u13vc/weapon-detection-m7qso` version 16 in YOLOv8 format.
2. Remap source classes into `GUN`, `KNIFE`, and `PERSON`.
3. Train YOLO11n at 640px input size for 80 epochs.
4. Export `best.pt` and TFLite. The current release artifact is FP32; INT8 export is tracked for v2 because torch 2.10's ONNX path and onnx2tf hit a Conv-axis incompatibility during conversion.
5. Validate with firearm-specific release gates.
6. Upload model and report artifacts to R2.
7. Download the TFLite artifact during first-run mobile setup.
8. On Android, run still-image Guard evidence through the native TFLite bridge before Gemini fallback.

Release gate:

| Metric | Target | Reason |
| --- | ---: | --- |
| `GUN` mAP50 | >= 0.60 | Firearm evidence is the only validated dispatch-triggering class |
| Alert-trigger class mAP50 | >= 0.60 | Prevents weak detector artifacts from being uploaded as release candidates |
| Overall mAP50 | reported only | The current dataset has insufficient knife signal |

Latest result: `GUN` mAP50 **0.725**. `KNIFE` remains experimental and should not trigger dispatch alone. `PERSON` is context only.

---

## 10. Mobile Hardware Reality & Optimization Roadmap

The first SHIFA E4B fine-tune proves clinical reasoning and offline-capable architecture, but deployment claims should be hardware-accurate. A full E4B mobile runtime is not realistic on very low-cost Android phones in its current form.

| Device class | Can run SHIFA locally? | Notes |
|--------------|------------------------|-------|
| T4 GPU, 15GB VRAM | Yes | Approximately 7-10s per inference during validation/inference experiments |
| High-end Android, Snapdragon 8 Gen 3 / 12GB RAM | Yes | Prefer E2B LiteRT-LM; physical-device benchmark still required |
| Mid-range Android, 4-6GB RAM | Expected for E2B LiteRT-LM, pending full benchmark | E2B LiteRT-LM is the primary target; GGUF fallback was functional but slow in physical testing |
| Low-end Android, 3-4GB RAM / $50 class | Not yet validated | The 3.1GB LiteRT-LM artifact plus OS/app memory pressure requires careful testing before making claims |

For field deployment language, the accurate claim is:

> SHIFA is designed for offline inference on mid-range and high-end Android devices, with an optimization roadmap for lower-cost phones.

Avoid claiming reliable inference on `$50` Android devices until a smaller model or streaming runtime is validated.

### Deployment Strategy

- **E2B / small model path:** single-symptom, text-only, low-complexity triage on 4GB+ Android devices.
- **E4B path:** multimodal or complex cases on high-end Android devices.
- **Server fallback:** low-end devices can call a FastAPI model backend when connectivity exists.
- **Safety fallback:** when offline and the model is unavailable, SHIFA should fall back to deterministic protocol rules and conservative referral guidance.

### Optimization Roadmap

After clinical validation, reduce runtime requirements through:

- **INT8 quantization:** expected to cut model size significantly while preserving most accuracy.
- **INT4 quantization:** further size reduction with explicit clinical accuracy regression testing.
- **Knowledge distillation:** train a smaller model to mimic E4B clinical outputs and schema.
- **Pruning:** remove low-importance weights where supported by the runtime stack.
- **Router architecture:** route simple cases to E2B/small model and complex multimodal cases to E4B.

The product story should emphasize the achieved milestone: a fine-tuned Gemma4 clinical adapter with multilingual humanitarian protocols, validated safety metrics, and a clear path toward smaller offline runtimes.
