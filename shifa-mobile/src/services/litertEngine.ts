import { NativeModules } from 'react-native';
import { ClinicalDecision } from './caseLog';
import { extractJsonObject, normalizeCloudClinicalDecision } from './clinicalContract';
import { getLiteRTModelPath } from './modelManager';
import { promptLanguageName } from './language';

type LiteRTBackend = 'GPU' | 'CPU';

interface ShifaLiteRTNativeModule {
  init(modelPath: string, backend: LiteRTBackend, maxTokens: number): Promise<LiteRTRuntimeInfo>;
  generate(prompt: string): Promise<string>;
  sizeInTokens(text: string): Promise<number>;
  isReady(): Promise<boolean>;
  getRuntimeInfo(): Promise<LiteRTRuntimeInfo>;
  getDeviceMemoryInfo?(): Promise<LiteRTDeviceMemoryInfo>;
  close(): Promise<boolean>;
}

export interface LiteRTRuntimeInfo {
  ready: boolean;
  modelPath?: string;
  backend?: LiteRTBackend;
}

export interface LiteRTDeviceMemoryInfo {
  totalBytes: number;
  availableBytes: number;
  lowMemory: boolean;
  meetsRecommendedMemory: boolean;
  recommendedBytes: number;
}

const nativeLiteRT = NativeModules.ShifaLiteRT as ShifaLiteRTNativeModule | undefined;
const LOCAL_MAX_CONTEXT_TOKENS = 4096;

function toNativeFilePath(uri: string): string {
  if (!uri.startsWith('file://')) return uri;
  return decodeURIComponent(uri.replace('file://', ''));
}

export function isLiteRTNativeAvailable(): boolean {
  return Boolean(nativeLiteRT);
}

export async function getLiteRTRuntimeInfo(): Promise<LiteRTRuntimeInfo> {
  if (!nativeLiteRT) return { ready: false };
  return nativeLiteRT.getRuntimeInfo();
}

export async function preloadLiteRTRuntime(): Promise<LiteRTRuntimeInfo | null> {
  if (!nativeLiteRT) {
    console.warn('SHIFA LiteRT native module is not available in this build.');
    return null;
  }
  const modelPath = await getLiteRTModelPath();
  if (!modelPath) return null;

  const runtime = await initializeLiteRT(toNativeFilePath(modelPath), ['CPU']);
  console.log(`SHIFA LiteRT runtime initialized with ${runtime.backend ?? 'unknown'} backend`);
  return runtime;
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
  const nativeModelPath = toNativeFilePath(modelPath);

  const prompt = buildClinicalPrompt(input);
  const raw = await generateWithFallbackBackend(nativeModelPath, prompt, input);
  const parsed = parseModelJson(raw);
  const decision = normalizeCloudClinicalDecision(parsed);
  return {
    ...decision,
    engineMode: 'local_model',
  };
}

async function initializeLiteRT(modelPath: string, backends: LiteRTBackend[]): Promise<LiteRTRuntimeInfo> {
  const memoryInfo = await nativeLiteRT!.getDeviceMemoryInfo?.().catch(() => null);
  if (memoryInfo && !memoryInfo.meetsRecommendedMemory) {
    throw new Error(
      `Device RAM is below the recommended offline AI requirement (${formatBytes(memoryInfo.totalBytes)} available to Android, ${formatBytes(memoryInfo.recommendedBytes)} recommended).`
    );
  }

  const errors: string[] = [];
  for (const backend of backends) {
    try {
      const current: LiteRTRuntimeInfo = await nativeLiteRT!.getRuntimeInfo().catch(() => ({ ready: false }));
      if (current.ready && current.modelPath === modelPath && current.backend === backend) {
        return current;
      }
      await nativeLiteRT!.close().catch(() => undefined);
      return await nativeLiteRT!.init(modelPath, backend, LOCAL_MAX_CONTEXT_TOKENS);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${backend}: ${message}`);
      console.warn(`SHIFA LiteRT ${backend} initialization failed:`, message);
    }
  }
  throw new Error(`LiteRT initialization failed. ${errors.join(' | ')}`);
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'unknown';
  const gb = bytes / 1024 / 1024 / 1024;
  return `${gb.toFixed(1)}GB`;
}

async function generateWithFallbackBackend(
  modelPath: string,
  prompt: string,
  input: Parameters<typeof buildClinicalPrompt>[0]
): Promise<string> {
  const errors: string[] = [];
  for (const backend of ['CPU'] as LiteRTBackend[]) {
    try {
      await initializeLiteRT(modelPath, [backend]);
      const raw = await nativeLiteRT!.generate(prompt);
      parseModelJson(raw);
      return raw;
    } catch (firstError) {
      errors.push(`${backend}: ${firstError instanceof Error ? firstError.message : String(firstError)}`);
      console.warn(`SHIFA LiteRT ${backend} inference attempt failed:`, firstError instanceof Error ? firstError.message : firstError);
      try {
        const repairRaw = await nativeLiteRT!.generate(buildJsonRepairPrompt(input));
        parseModelJson(repairRaw);
        return repairRaw;
      } catch (repairError) {
        errors.push(`${backend} repair: ${repairError instanceof Error ? repairError.message : String(repairError)}`);
      }
    }
  }
  throw new Error(`LiteRT could not produce a valid clinical JSON response with the local CPU runtime. ${errors.join(' | ')}`);
}

function parseModelJson(raw: string): Record<string, unknown> {
  return extractJsonObject(raw);
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

  const userMessage = [
    'SHIFA offline clinical triage.',
    'Return compact valid JSON only. No markdown.',
    'Keys: decision, primary_diagnosis, differential_diagnoses, confidence, treatment_protocol, referral, monitoring, danger_signs, reasoning_trace, voice_response.',
    'Valid decision values: TREAT, REFER_URGENT, REFER_ROUTINE. Never output MONITOR.',
    'Use WHO IMCI safety rules. Refer urgently for danger signs, low confidence, or missing dosing context.',
    'Max 3 treatment steps, 4 danger signs, 2 monitoring items.',
    `Country: ${input.country}. CHW language: ${languageName} (${input.language}).`,
    `Write user-facing JSON strings in ${languageName}; keep decision enum in English.`,
    'Case:',
    `${fieldContext}\nSymptoms: ${input.symptomText}`.trim(),
    'JSON:',
  ].join('\n');

  return `<start_of_turn>user\n${userMessage}<end_of_turn>\n<start_of_turn>model\n`;
}

function buildJsonRepairPrompt(input: Parameters<typeof buildClinicalPrompt>[0]): string {
  const languageName = promptLanguageName(input.language);
  const userMessage = [
    'Return one compact JSON object only. No markdown. No explanation.',
    'Required keys: decision, primary_diagnosis, confidence, treatment_protocol, referral, monitoring, danger_signs, reasoning_trace, voice_response.',
    'Valid decision values: TREAT, REFER_URGENT, REFER_ROUTINE.',
    `Language for user-facing strings: ${languageName}.`,
    `Case: ${[
      input.ageMonths !== undefined ? `Age months ${input.ageMonths}` : '',
      input.weightKg !== undefined ? `Weight kg ${input.weightKg}` : '',
      input.muacCm !== undefined ? `MUAC ${input.muacCm}cm` : '',
      input.bilateralEdema ? 'bilateral edema yes' : 'bilateral edema no',
      input.symptomText,
    ].filter(Boolean).join('; ')}`,
    'JSON:',
  ].join('\n');
  return `<start_of_turn>user\n${userMessage}<end_of_turn>\n<start_of_turn>model\n`;
}
