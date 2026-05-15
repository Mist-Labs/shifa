import { initWhisper, WhisperContext } from 'whisper.rn';
import { getOfflineSTTModelPath } from './modelManager';

let whisperContext: WhisperContext | null = null;
let loadedModelPath: string | null = null;

const WHISPER_LANGUAGE_CODES: Record<string, string> = {
  en: 'en',
  ar: 'ar',
  so: 'so',
  fr: 'fr',
  ln: 'fr',
  rw: 'rw',
  ha: 'ha',
};

export async function isOfflineSTTReady(): Promise<boolean> {
  return Boolean(await getOfflineSTTModelPath());
}

export async function transcribeOfflinePatientAudio(input: {
  uri: string;
  language: string;
}): Promise<string | null> {
  const modelPath = await getOfflineSTTModelPath();
  if (!modelPath) return null;

  const context = await getOrCreateWhisperContext(modelPath);
  const language = WHISPER_LANGUAGE_CODES[input.language] ?? 'auto';
  const { promise } = context.transcribe(input.uri, {
    language,
    maxThreads: 4,
    beamSize: 1,
    bestOf: 1,
    temperature: 0,
    maxLen: 160,
  });
  const result = await promise;
  return result.result.trim() || null;
}

export async function releaseOfflineSTT(): Promise<void> {
  await whisperContext?.release?.().catch(() => undefined);
  whisperContext = null;
  loadedModelPath = null;
}

async function getOrCreateWhisperContext(modelPath: string): Promise<WhisperContext> {
  if (whisperContext && loadedModelPath === modelPath) return whisperContext;
  await releaseOfflineSTT();
  whisperContext = await initWhisper({ filePath: modelPath });
  loadedModelPath = modelPath;
  return whisperContext;
}
