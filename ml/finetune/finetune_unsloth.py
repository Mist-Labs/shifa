from __future__ import annotations

import unsloth

import os

from common import env, env_float, env_int, resolve_path


def main() -> None:
    hf_token = env("HF_TOKEN") or env("HUGGING_FACE_HUB_TOKEN")
    if hf_token:
        os.environ["HF_TOKEN"] = hf_token
        os.environ["HUGGING_FACE_HUB_TOKEN"] = hf_token

    os.environ.setdefault("WANDB_PROJECT", env("WANDB_PROJECT", "shifa-clinical-gemma"))
    os.environ.setdefault("WANDB_MODE", env("WANDB_MODE", "disabled"))

    try:
        import torch
        from datasets import load_dataset
        from trl import SFTConfig, SFTTrainer
        from unsloth import FastLanguageModel
    except ImportError as exc:
        raise SystemExit("Install ml/requirements.txt on the GPU machine before training") from exc

    base_model = env("SHIFA_BASE_MODEL", "google/gemma-4-e4b-it")
    max_seq_length = env_int("SHIFA_MAX_SEQ_LENGTH", 8192)
    train_file = str(resolve_path(env("SHIFA_TRAIN_FILE", "data/processed/training_final.jsonl")))
    output_dir = str(resolve_path(env("SHIFA_CHECKPOINT_DIR", "models/shifa-gemma4-checkpoints")))
    model_dir = str(resolve_path(env("SHIFA_MODEL_DIR", "models/shifa-gemma4-e4b-finetuned")))

    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=base_model,
        max_seq_length=max_seq_length,
        load_in_4bit=env("SHIFA_LOAD_IN_4BIT", "1") != "0",
        dtype=None,
        token=hf_token or None,
    )

    model = FastLanguageModel.get_peft_model(
        model,
        r=env_int("SHIFA_LORA_R", 16),
        target_modules=[
            "q_proj",
            "k_proj",
            "v_proj",
            "o_proj",
            "gate_proj",
            "up_proj",
            "down_proj",
        ],
        lora_alpha=env_int("SHIFA_LORA_ALPHA", 16),
        lora_dropout=0,
        bias="none",
        use_gradient_checkpointing="unsloth",
        random_state=env_int("SHIFA_SEED", 42),
    )

    dataset = load_dataset("json", data_files=train_file, split="train")

    trainer = SFTTrainer(
        model=model,
        processing_class=tokenizer,
        train_dataset=dataset,
        args=SFTConfig(
            dataset_text_field="text",
            max_seq_length=max_seq_length,
            per_device_train_batch_size=env_int("SHIFA_BATCH_SIZE", 2),
            gradient_accumulation_steps=env_int("SHIFA_GRAD_ACCUM", 4),
            warmup_steps=10,
            num_train_epochs=env_int("SHIFA_NUM_EPOCHS", 3),
            learning_rate=env_float("SHIFA_LEARNING_RATE", 2e-4),
            fp16=not torch.cuda.is_bf16_supported(),
            bf16=torch.cuda.is_bf16_supported(),
            logging_steps=10,
            output_dir=output_dir,
            save_strategy="epoch",
            optim="adamw_8bit",
            weight_decay=0.01,
            lr_scheduler_type="linear",
            report_to=[] if env("WANDB_MODE", "disabled") == "disabled" else ["wandb"],
        ),
    )

    trainer.train()
    model.save_pretrained(model_dir)
    tokenizer.save_pretrained(model_dir)
    print(f"Fine-tuning complete: {model_dir}")


if __name__ == "__main__":
    main()