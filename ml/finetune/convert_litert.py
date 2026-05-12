from __future__ import annotations

from common import env, resolve_path


def main() -> None:
    try:
        import ai_edge_torch
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer
    except ImportError as exc:  # pragma: no cover - checked on remote GPU env.
        raise SystemExit("Install ml/requirements.txt before LiteRT conversion") from exc

    model_dir = str(resolve_path(env("SHIFA_MODEL_DIR", "models/shifa-gemma4-e4b-finetuned")))
    output = str(resolve_path(env("SHIFA_LITERT_OUTPUT", "models/shifa-gemma4-e4b-finetuned/shifa-gemma4-e4b-finetuned.tflite")))
    output_path = resolve_path(output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    model = AutoModelForCausalLM.from_pretrained(model_dir, torch_dtype=torch.float32)
    AutoTokenizer.from_pretrained(model_dir)

    sample_tokens = torch.zeros(1, 1, dtype=torch.long)
    edge_model = ai_edge_torch.convert(model, (sample_tokens,))
    edge_model.export(output)
    print(f"Exported LiteRT artifact: {output}")


if __name__ == "__main__":
    main()
