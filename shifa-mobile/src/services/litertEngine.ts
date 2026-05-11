import { NativeModules } from 'react-native';
import { ClinicalDecision } from './caseLog';
import { extractJsonObject, normalizeCloudClinicalDecision } from './clinicalContract';
import { getLiteRTModelPath } from './modelManager';

type LiteRTBackend = 'GPU' | 'CPU';

interface ShifaLiteRTNativeModule {
  init(modelPath: string, backend: LiteRTBackend, maxTokens: number): Promise<LiteRTRuntimeInfo>;
  generate(prompt: string): Promise<string>;
  sizeInTokens(text: string): Promise<number>;
  isReady(): Promise<boolean>;
  getRuntimeInfo(): Promise<LiteRTRuntimeInfo>;
  close(): Promise<boolean>;
}

export interface LiteRTRuntimeInfo {
  ready: boolean;
  modelPath?: string;
  backend?: LiteRTBackend;
}

const nativeLiteRT = NativeModules.ShifaLiteRT as ShifaLiteRTNativeModule | undefined;

export function isLiteRTNativeAvailable(): boolean {
  return Boolean(nativeLiteRT);
}

export async function getLiteRTRuntimeInfo(): Promise<LiteRTRuntimeInfo> {
  if (!nativeLiteRT) return { ready: false };
  return nativeLiteRT.getRuntimeInfo();
}

export async function analyzeWithLiteRT(input: {
  symptomText: string;
  ageMonths?: number;
  weightKg?: number;
  muacCm?: number;
  bilateralEdema: boolean;
  country: string;
  language: string;
}): Promise<ClinicalDecision | null> {
  if (!nativeLiteRT) return null;
  const modelPath = await getLiteRTModelPath();
  if (!modelPath) return null;

  await nativeLiteRT.init(modelPath, 'GPU', 1024);
  const raw = await nativeLiteRT.generate(buildClinicalPrompt(input));
  const parsed = extractJsonObject(raw);
  const decision = normalizeCloudClinicalDecision(parsed);
  return {
    ...decision,
    engineMode: 'local_model',
  };
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

  return [
    '<start_of_turn>system',
    'You are SHIFA, an offline clinical decision support assistant for trained community health workers.',
    'Follow WHO IMCI protocols and the country protocol module exactly.',
    'Respond only as valid JSON with: decision, primary_diagnosis, differential_diagnoses, confidence, treatment_protocol, referral, monitoring, danger_signs, reasoning_trace, voice_response.',
    'Valid decisions are TREAT, REFER_URGENT, REFER_ROUTINE. Never output MONITOR.',
    'Default to REFER_URGENT when danger signs are present, confidence is below 0.70, or age/weight needed for dosing is missing.',
    `Country: ${input.country}. Language: ${input.language}.`,
    '<end_of_turn>',
    '<start_of_turn>user',
    `${fieldContext}\n${input.symptomText}`.trim(),
    '<end_of_turn>',
    '<start_of_turn>model',
  ].join('\n');
}
