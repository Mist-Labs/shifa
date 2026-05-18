import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { envValue } from './runtimeEnv';

const DEFAULT_MODEL_BASE_URL = 'https://pub-b2b135c13b0a406c8a4dc9c60eadb248.r2.dev';
const MODEL_BASE_URL = envValue('EXPO_PUBLIC_SHIFA_MODEL_BASE_URL', 'shifaModelBaseUrl', DEFAULT_MODEL_BASE_URL).replace(/\/$/, '');
const MODEL_DIR = `${FileSystem.documentDirectory ?? ''}models/shifa-gemma4-e2b-finetuned/`;
const MODEL_SETUP_MARKER = `${MODEL_DIR}.setup-dismissed-gguf-v2`;

type RuntimeKind = 'litert' | 'gguf' | 'stt' | 'guard';
const SUPPORTED_RUNTIME_KINDS: RuntimeKind[] = Platform.OS === 'ios' ? ['gguf'] : ['litert', 'gguf'];
const DEFAULT_RUNTIME_KIND = 'gguf' as RuntimeKind;

const MODEL_ARTIFACTS = [
  {
    key: 'models/shifa-gemma4-e2b-finetuned/shifa-gemma4-e2b-finetuned.litertlm',
    filename: 'shifa-gemma4-e2b-finetuned.litertlm',
    required: DEFAULT_RUNTIME_KIND === 'litert',
    runtime: true,
    runtimeKind: 'litert' as RuntimeKind,
    downloadByDefault: DEFAULT_RUNTIME_KIND === 'litert',
    estimatedBytes: 3271671808,
  },
  {
    key: 'models/stt/ggml-base.bin',
    filename: 'ggml-base.bin',
    required: false,
    runtime: false,
    runtimeKind: 'stt' as RuntimeKind,
    downloadByDefault: true,
    estimatedBytes: 147951465,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
  },
  {
    key: 'guard/shifa-guard-weapon-detector.tflite',
    filename: 'shifa-guard-weapon-detector.tflite',
    required: false,
    runtime: false,
    runtimeKind: 'guard' as RuntimeKind,
    downloadByDefault: true,
    estimatedBytes: 5350968,
  },
  {
    key: 'models/shifa-gemma4-e2b-finetuned/shifa-gemma4-e2b-q4km.gguf',
    filename: 'shifa-gemma4-e2b-q4km.gguf',
    required: DEFAULT_RUNTIME_KIND === 'gguf',
    runtime: true,
    runtimeKind: 'gguf' as RuntimeKind,
    downloadByDefault: DEFAULT_RUNTIME_KIND === 'gguf',
    estimatedBytes: 3427878240,
  },
  {
    key: 'models/shifa-gemma4-e2b-finetuned/shifa-gemma4-e2b-mmproj-f16.gguf',
    filename: 'shifa-gemma4-e2b-mmproj-f16.gguf',
    required: false,
    runtime: false,
    runtimeKind: 'gguf' as RuntimeKind,
    downloadByDefault: false,
    estimatedBytes: 985653664,
  },
  { key: 'models/shifa-gemma4-e2b-finetuned/shifa-gemma4-e2b-finetuned.task', filename: 'shifa-gemma4-e2b-finetuned.task', required: false, runtime: true, runtimeKind: 'litert' as RuntimeKind, downloadByDefault: false },
  { key: 'models/shifa-gemma4-e2b-finetuned/shifa-gemma4-e2b-finetuned.tflite', filename: 'shifa-gemma4-e2b-finetuned.tflite', required: false, runtime: true, runtimeKind: 'litert' as RuntimeKind, downloadByDefault: false },
];

function isCompleteArtifact(size: number, estimatedBytes?: number): boolean {
  if (!estimatedBytes) return size > 0;
  return size >= estimatedBytes * 0.99;
}

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
  sttReady: boolean;
  sttModelPath?: string;
  guardDetectorReady: boolean;
  guardDetectorPath?: string;
  totalBytes: number;
  directory: string;
  baseUrl: string;
  missing: string[];
  estimatedDownloadBytes: number;
  setupDismissed: boolean;
}

export function getModelBaseUrl(): string {
  return MODEL_BASE_URL;
}

export async function getClinicalModelStatus(): Promise<ModelArtifactStatus> {
  const statuses = await Promise.all(
    MODEL_ARTIFACTS.map(async (artifact) => {
      const info = await FileSystem.getInfoAsync(`${MODEL_DIR}${artifact.filename}`);
      const size = info.exists ? Number(info.size ?? 0) : 0;
      return {
        artifact,
        exists: info.exists && isCompleteArtifact(size, artifact.estimatedBytes),
        size,
      };
    })
  );
  const required = statuses.filter((item) => item.artifact.required);
  const runtime = statuses.find((item) => item.artifact.runtime && SUPPORTED_RUNTIME_KINDS.includes(item.artifact.runtimeKind) && item.exists);
  const liteRTRuntime = statuses.find((item) => item.artifact.runtimeKind === 'litert' && SUPPORTED_RUNTIME_KINDS.includes(item.artifact.runtimeKind) && item.exists);
  const ggufRuntime = statuses.find((item) => item.artifact.runtimeKind === 'gguf' && SUPPORTED_RUNTIME_KINDS.includes(item.artifact.runtimeKind) && item.exists);
  const sttRuntime = statuses.find((item) => item.artifact.runtimeKind === 'stt' && item.exists);
  const guardDetector = statuses.find((item) => item.artifact.runtimeKind === 'guard' && item.exists);
  const setupDismissedInfo = await FileSystem.getInfoAsync(MODEL_SETUP_MARKER);
  const defaultDownloads = statuses.filter((item) => item.artifact.downloadByDefault !== false);
  return {
    configured: Boolean(MODEL_BASE_URL),
    ready: required.every((item) => item.exists),
    runtimeReady: Boolean(runtime),
    runtimeModelPath: runtime ? `${MODEL_DIR}${runtime.artifact.filename}` : undefined,
    liteRTRuntimeReady: Boolean(liteRTRuntime),
    liteRTModelPath: liteRTRuntime ? `${MODEL_DIR}${liteRTRuntime.artifact.filename}` : undefined,
    ggufRuntimeReady: Boolean(ggufRuntime),
    ggufModelPath: ggufRuntime ? `${MODEL_DIR}${ggufRuntime.artifact.filename}` : undefined,
    sttReady: Boolean(sttRuntime),
    sttModelPath: sttRuntime ? `${MODEL_DIR}${sttRuntime.artifact.filename}` : undefined,
    guardDetectorReady: Boolean(guardDetector),
    guardDetectorPath: guardDetector ? `${MODEL_DIR}${guardDetector.artifact.filename}` : undefined,
    downloadedCount: statuses.filter((item) => item.exists).length,
    requiredDownloadedCount: required.filter((item) => item.exists).length,
    requiredCount: required.length,
    totalBytes: statuses.reduce((sum, item) => sum + item.size, 0),
    directory: MODEL_DIR,
    baseUrl: MODEL_BASE_URL,
    missing: required.filter((item) => !item.exists).map((item) => item.artifact.filename),
    estimatedDownloadBytes: defaultDownloads.reduce((sum, item) => sum + Number(item.artifact.estimatedBytes ?? 0), 0),
    setupDismissed: setupDismissedInfo.exists,
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

export async function getOfflineSTTModelPath(): Promise<string | null> {
  const status = await getClinicalModelStatus();
  return status.sttModelPath ?? null;
}

export async function getGuardDetectorModelPath(): Promise<string | null> {
  const status = await getClinicalModelStatus();
  return status.guardDetectorPath ?? null;
}

export async function shouldShowModelSetup(): Promise<boolean> {
  const status = await getClinicalModelStatus();
  return status.configured && (!status.ready || !status.sttReady || !status.guardDetectorReady) && !status.setupDismissed;
}

export async function dismissModelSetup(): Promise<void> {
  await FileSystem.makeDirectoryAsync(MODEL_DIR, { intermediates: true });
  await FileSystem.writeAsStringAsync(MODEL_SETUP_MARKER, new Date().toISOString());
}

export async function resetModelSetupPrompt(): Promise<void> {
  const info = await FileSystem.getInfoAsync(MODEL_SETUP_MARKER);
  if (info.exists) await FileSystem.deleteAsync(MODEL_SETUP_MARKER, { idempotent: true });
}

export async function getFreeDiskBytes(): Promise<number | null> {
  const getFreeDiskStorageAsync = (FileSystem as unknown as { getFreeDiskStorageAsync?: () => Promise<number> }).getFreeDiskStorageAsync;
  return getFreeDiskStorageAsync ? getFreeDiskStorageAsync() : null;
}

export async function downloadClinicalModelArtifacts(
  onProgress?: (done: number, total: number, filename: string, percent?: number, bytesWritten?: number, totalBytes?: number) => void
): Promise<ModelArtifactStatus> {
  if (!MODEL_BASE_URL) throw new Error('EXPO_PUBLIC_SHIFA_MODEL_BASE_URL is not configured.');
  await FileSystem.makeDirectoryAsync(MODEL_DIR, { intermediates: true });
  await cleanupUnsupportedRuntimeArtifacts();

  const artifacts = MODEL_ARTIFACTS.filter((artifact) => artifact.downloadByDefault !== false);
  for (let index = 0; index < artifacts.length; index += 1) {
    const artifact = artifacts[index];
    const localPath = `${MODEL_DIR}${artifact.filename}`;
    const info = await FileSystem.getInfoAsync(localPath);
    const currentSize = info.exists ? Number(info.size ?? 0) : 0;
    const needsDownload = !info.exists || !isCompleteArtifact(currentSize, artifact.estimatedBytes);
    if (needsDownload) {
      if (info.exists) await FileSystem.deleteAsync(localPath, { idempotent: true });
      const remoteUrl = artifact.url ?? `${MODEL_BASE_URL}/${artifact.key}`;
      try {
        const download = FileSystem.createDownloadResumable(
          remoteUrl,
          localPath,
          {},
          (progress) => {
            const total = progress.totalBytesExpectedToWrite || artifact.estimatedBytes || 0;
            const percent = total ? progress.totalBytesWritten / total : undefined;
            onProgress?.(index, artifacts.length, artifact.filename, percent, progress.totalBytesWritten, total);
          }
        );
        await download.downloadAsync();
      } catch (error) {
        await FileSystem.deleteAsync(localPath, { idempotent: true });
        if (artifact.required) throw error;
      }
    }
    onProgress?.(index + 1, artifacts.length, artifact.filename, 1, artifact.estimatedBytes, artifact.estimatedBytes);
  }

  return getClinicalModelStatus();
}

async function cleanupUnsupportedRuntimeArtifacts(): Promise<void> {
  const unsupportedRuntimeArtifacts = MODEL_ARTIFACTS.filter(
    (artifact) => artifact.runtime && !SUPPORTED_RUNTIME_KINDS.includes(artifact.runtimeKind)
  );
  await Promise.all(
    unsupportedRuntimeArtifacts.map(async (artifact) => {
      await FileSystem.deleteAsync(`${MODEL_DIR}${artifact.filename}`, { idempotent: true }).catch(() => undefined);
    })
  );
}
