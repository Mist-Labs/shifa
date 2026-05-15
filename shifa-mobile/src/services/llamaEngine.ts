import { initLlama, LlamaContext } from 'llama.rn';
import { ClinicalDecision } from './caseLog';
import { extractJsonObject, normalizeCloudClinicalDecision } from './clinicalContract';
import { getGGUFModelPath } from './modelManager';
import { promptLanguageName } from './language';

let context: LlamaContext | null = null;
let loadedModelPath: string | null = null;

const STOP_WORDS = [
  '<end_of_turn>',
  '<|end_of_turn|>',
  '</s>',
  '<|end|>',
  '<|eot_id|>',
  '<|end_of_text|>',
  '<|im_end|>',
  '<|EOT|>',
  '<|END_OF_TURN_TOKEN|>',
  '<|endoftext|>',
];
const LOCAL_CONTEXT_TOKENS = 2048;
const LOCAL_BATCH_TOKENS = 128;
const LOCAL_THREAD_COUNT = 4;
const LOCAL_MAX_OUTPUT_TOKENS = 512;

export interface LlamaRuntimeInfo {
  ready: boolean;
  modelPath?: string;
  gpu?: boolean;
  reasonNoGPU?: string;
  androidLib?: string;
}

export async function getLlamaRuntimeInfo(): Promise<LlamaRuntimeInfo> {
  if (!context) return { ready: false };
  return {
    ready: true,
    modelPath: loadedModelPath ?? undefined,
    gpu: context.gpu,
    reasonNoGPU: context.reasonNoGPU,
    androidLib: context.androidLib,
  };
}

export async function analyzeWithLlama(input: {
  symptomText: string;
  ageMonths?: number;
  weightKg?: number;
  muacCm?: number;
  bilateralEdema: boolean;
  country: string;
  language: string;
}): Promise<ClinicalDecision | null> {
  const modelPath = await getGGUFModelPath();
  if (!modelPath) return null;

  const llama = await getOrCreateContext(modelPath);
  await llama.clearCache(false).catch(() => undefined);
  const result = await llama.completion({
    prompt: buildClinicalPrompt(input),
    n_predict: LOCAL_MAX_OUTPUT_TOKENS,
    temperature: 0,
    top_p: 0.9,
    penalty_repeat: 1.02,
    stop: STOP_WORDS,
  });

  const parsed = extractJsonObject(result.text ?? '');
  const decision = normalizeCloudClinicalDecision(parsed);
  return {
    ...decision,
    engineMode: 'local_model',
  };
}

export async function releaseLlamaEngine(): Promise<void> {
  await context?.release().catch(() => undefined);
  context = null;
  loadedModelPath = null;
}

async function getOrCreateContext(modelPath: string): Promise<LlamaContext> {
  if (context && loadedModelPath === modelPath) return context;
  await releaseLlamaEngine();
  context = await initLlama({
    model: modelPath,
    n_ctx: LOCAL_CONTEXT_TOKENS,
    n_batch: LOCAL_BATCH_TOKENS,
    n_threads: LOCAL_THREAD_COUNT,
    n_gpu_layers: 99,
    use_mlock: false,
    use_mmap: true,
    no_extra_bufts: true,
  });
  loadedModelPath = modelPath;
  return context;
}

function buildClinicalPrompt(input: {
  symptomText: string;
  ageMonths?: number;
  weightKg?: number;
  muacCm?: number;
  bilateralEdema: boolean;
  country: string;
  language: string;
}): string {
  const fieldContext = [
    input.ageMonths !== undefined ? `Age months: ${input.ageMonths}` : null,
    input.weightKg !== undefined ? `Weight kg: ${input.weightKg}` : null,
    input.muacCm !== undefined ? `MUAC cm: ${input.muacCm}` : null,
    input.bilateralEdema ? 'Bilateral edema: yes' : 'Bilateral edema: no',
  ].filter(Boolean).join('\n');
  const languageName = promptLanguageName(input.language);

  return [
    '<start_of_turn>system',
    'You are SHIFA, an offline clinical decision support assistant for trained community health workers.',
    'Follow WHO IMCI protocols and the country protocol module exactly.',
    'Respond only as compact valid JSON with: decision, primary_diagnosis, differential_diagnoses, confidence, treatment_protocol, referral, monitoring, danger_signs, reasoning_trace, voice_response.',
    'Valid decisions are TREAT, REFER_URGENT, REFER_ROUTINE. Never output MONITOR.',
    'Default to REFER_URGENT when danger signs are present, confidence is below 0.70, or age/weight needed for dosing is missing.',
    'Keep output short: max 3 treatment steps, max 4 danger signs, max 2 monitoring instructions, one-sentence reasoning_trace, one-sentence voice_response.',
    `Country: ${input.country}. CHW language: ${languageName} (${input.language}).`,
    `Write every user-facing JSON string in ${languageName}: diagnosis, treatment, referral, danger signs, reasoning, and voice response. Keep only decision enum values in English.`,
    '<end_of_turn>',
    '<start_of_turn>user',
    `${fieldContext}\n${input.symptomText}`.trim(),
    '<end_of_turn>',
    '<start_of_turn>model',
  ].join('\n');
}
