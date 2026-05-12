import * as FileSystem from 'expo-file-system/legacy';

const MODEL_BASE_URL = (process.env.EXPO_PUBLIC_SHIFA_MODEL_BASE_URL || '').replace(/\/$/, '');
const MODEL_DIR = `${FileSystem.documentDirectory ?? ''}models/shifa-gemma4-e4b-finetuned/`;

type RuntimeKind = 'litert' | 'gguf';

const MODEL_ARTIFACTS = [
  { key: 'models/shifa-gemma4-e4b-finetuned/shifa-gemma4-e4b-finetuned.litertlm', filename: 'shifa-gemma4-e4b-finetuned.litertlm', required: false, runtime: true, runtimeKind: 'litert' as RuntimeKind },
  { key: 'models/shifa-gemma4-e4b-finetuned/shifa-gemma4-e4b-finetuned.task', filename: 'shifa-gemma4-e4b-finetuned.task', required: false, runtime: true, runtimeKind: 'litert' as RuntimeKind },
  { key: 'models/shifa-gemma4-e4b-finetuned/shifa-gemma4-e4b-finetuned.tflite', filename: 'shifa-gemma4-e4b-finetuned.tflite', required: false, runtime: true, runtimeKind: 'litert' as RuntimeKind },
  { key: 'models/gguf/shifa-gemma4-e4b-q4km.gguf', filename: 'shifa-gemma4-e4b-q4km.gguf', required: false, runtime: true, runtimeKind: 'gguf' as RuntimeKind },
  { key: 'models/shifa-gemma4-e4b-finetuned/adapter_config.json', filename: 'adapter_config.json', required: true },
  { key: 'models/shifa-gemma4-e4b-finetuned/adapter_model.safetensors', filename: 'adapter_model.safetensors', required: true },
  { key: 'models/shifa-gemma4-e4b-finetuned/tokenizer.json', filename: 'tokenizer.json', required: true },
  { key: 'models/shifa-gemma4-e4b-finetuned/tokenizer_config.json', filename: 'tokenizer_config.json', required: true },
  { key: 'models/shifa-gemma4-e4b-finetuned/processor_config.json', filename: 'processor_config.json', required: false },
  { key: 'models/shifa-gemma4-e4b-finetuned/chat_template.jinja', filename: 'chat_template.jinja', required: false },
];

export interface ModelArtifactStatus {
  configured: boolean;
  ready: boolean;
  downloadedCount: number;
  requiredDownloadedCount: number;
  requiredCount: number;
  runtimeReady: boolean;
  runtimeModelPath?: string;
  liteRTRuntimeReady: boolean;
  liteRTModelPath?: string;
  ggufRuntimeReady: boolean;
  ggufModelPath?: string;
  totalBytes: number;
  directory: string;
  baseUrl: string;
  missing: string[];
}

export function getModelBaseUrl(): string {
  return MODEL_BASE_URL;
}

export async function getClinicalModelStatus(): Promise<ModelArtifactStatus> {
  const statuses = await Promise.all(
    MODEL_ARTIFACTS.map(async (artifact) => {
      const info = await FileSystem.getInfoAsync(`${MODEL_DIR}${artifact.filename}`);
      return {
        artifact,
        exists: info.exists,
        size: info.exists ? Number(info.size ?? 0) : 0,
      };
    })
  );
  const required = statuses.filter((item) => item.artifact.required);
  const runtime = statuses.find((item) => item.artifact.runtime && item.exists);
  const liteRTRuntime = statuses.find((item) => item.artifact.runtimeKind === 'litert' && item.exists);
  const ggufRuntime = statuses.find((item) => item.artifact.runtimeKind === 'gguf' && item.exists);
  return {
    configured: Boolean(MODEL_BASE_URL),
    ready: required.every((item) => item.exists),
    runtimeReady: Boolean(runtime),
    runtimeModelPath: runtime ? `${MODEL_DIR}${runtime.artifact.filename}` : undefined,
    liteRTRuntimeReady: Boolean(liteRTRuntime),
    liteRTModelPath: liteRTRuntime ? `${MODEL_DIR}${liteRTRuntime.artifact.filename}` : undefined,
    ggufRuntimeReady: Boolean(ggufRuntime),
    ggufModelPath: ggufRuntime ? `${MODEL_DIR}${ggufRuntime.artifact.filename}` : undefined,
    downloadedCount: statuses.filter((item) => item.exists).length,
    requiredDownloadedCount: required.filter((item) => item.exists).length,
    requiredCount: required.length,
    totalBytes: statuses.reduce((sum, item) => sum + item.size, 0),
    directory: MODEL_DIR,
    baseUrl: MODEL_BASE_URL,
    missing: required.filter((item) => !item.exists).map((item) => item.artifact.filename),
  };
}

export async function getLiteRTModelPath(): Promise<string | null> {
  const status = await getClinicalModelStatus();
  return status.liteRTModelPath ?? null;
}

export async function getGGUFModelPath(): Promise<string | null> {
  const status = await getClinicalModelStatus();
  return status.ggufModelPath ?? null;
}

export async function downloadClinicalModelArtifacts(onProgress?: (done: number, total: number, filename: string) => void): Promise<ModelArtifactStatus> {
  if (!MODEL_BASE_URL) throw new Error('EXPO_PUBLIC_SHIFA_MODEL_BASE_URL is not configured.');
  await FileSystem.makeDirectoryAsync(MODEL_DIR, { intermediates: true });

  for (let index = 0; index < MODEL_ARTIFACTS.length; index += 1) {
    const artifact = MODEL_ARTIFACTS[index];
    const localPath = `${MODEL_DIR}${artifact.filename}`;
    const info = await FileSystem.getInfoAsync(localPath);
    if (!info.exists) {
      const remoteUrl = `${MODEL_BASE_URL}/${artifact.key}`;
      try {
        await FileSystem.downloadAsync(remoteUrl, localPath);
      } catch (error) {
        if (artifact.required) throw error;
      }
    }
    onProgress?.(index + 1, MODEL_ARTIFACTS.length, artifact.filename);
  }

  return getClinicalModelStatus();
}
