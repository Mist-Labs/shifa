import Constants from 'expo-constants';

type ShifaExtraEnv = {
  africasTalkingUsername?: string;
  africasTalkingApiKey?: string;
  africasTalkingSenderId?: string;
  googleApiKey?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  shifaApiUrl?: string;
  shifaModelBaseUrl?: string;
  shifaBleServiceUuid?: string;
  shifaBleAlertCharUuid?: string;
  shifaBleScanMs?: string;
  shifaBleMaxPeers?: string;
  shifaBleAlertTtlMs?: string;
};

const extra = ((Constants.expoConfig?.extra as any)?.shifa || {}) as ShifaExtraEnv;

export function envValue(expoKey: keyof typeof process.env, extraKey: keyof ShifaExtraEnv, fallback = ''): string {
  const fromProcess = process.env[expoKey];
  const fromExtra = extra[extraKey];
  return String(fromProcess || fromExtra || fallback);
}

export function hasGeminiKey(): boolean {
  return Boolean(
    envValue('EXPO_PUBLIC_GOOGLE_API_KEY', 'googleApiKey') ||
      envValue('EXPO_PUBLIC_GEMINI_API_KEY', 'geminiApiKey') ||
      process.env.GOOGLE_API_KEY ||
      process.env.GEMINI_API_KEY
  );
}
