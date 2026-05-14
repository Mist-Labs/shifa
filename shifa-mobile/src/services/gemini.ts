import * as FileSystem from 'expo-file-system/legacy';
import { ClinicalDecision } from './caseLog';
import { extractJsonObject, normalizeCloudClinicalDecision } from './clinicalContract';
import { promptLanguageName } from './language';
import { envValue, hasGeminiKey } from './runtimeEnv';

const GEMINI_API_KEY =
  envValue('EXPO_PUBLIC_GOOGLE_API_KEY', 'googleApiKey') ||
  envValue('EXPO_PUBLIC_GEMINI_API_KEY', 'geminiApiKey') ||
  process.env.GOOGLE_API_KEY ||
  process.env.GEMINI_API_KEY;

const GEMINI_MODEL = envValue('EXPO_PUBLIC_GEMINI_MODEL', 'geminiModel', 'gemini-2.5-flash');
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const RETRY_DELAYS_MS = [700, 1400, 2600];

export type EvidenceKind = 'image' | 'video' | 'pdf' | 'file';

export interface EvidenceAsset {
  id: string;
  kind: EvidenceKind;
  uri: string;
  name: string;
  mimeType: string;
  base64?: string;
}

export interface GuardThreatAnalysis {
  threatDetected: boolean;
  threatType: string;
  confidence: number;
  urgency: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
  rationale: string;
  recommendedAction: string;
}

interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

export class ShifaAIError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
    public readonly retryable = false
  ) {
    super(message);
    this.name = 'ShifaAIError';
  }
}

export function getFieldSafeAIMessage(error: unknown): string {
  if (error instanceof ShifaAIError) return error.userMessage;
  return 'SHIFA could not complete analysis. Check the case details and try again.';
}

export function isGeminiConfigured(): boolean {
  return hasGeminiKey();
}

export async function buildEvidenceAsset(input: {
  uri: string;
  kind: EvidenceKind;
  name: string;
  mimeType: string;
  base64?: string;
}): Promise<EvidenceAsset> {
  const base64 =
    input.base64 ??
    (await FileSystem.readAsStringAsync(input.uri, {
      encoding: FileSystem.EncodingType.Base64,
    }));

  return {
    id: `evidence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: input.kind,
    uri: input.uri,
    name: input.name,
    mimeType: input.mimeType,
    base64,
  };
}

export async function analyzeCloudClinicalCase(input: {
  symptomText: string;
  ageMonths?: number;
  weightKg?: number;
  muacCm?: number;
  bilateralEdema: boolean;
  country: string;
  language: string;
  evidence: EvidenceAsset[];
}): Promise<ClinicalDecision> {
  const languageName = promptLanguageName(input.language);
  const payload = {
    country: input.country,
    chwLanguage: {
      code: input.language,
      name: languageName,
    },
    symptoms: input.symptomText.trim(),
    patient: {
      ageMonths: input.ageMonths ?? null,
      weightKg: input.weightKg ?? null,
      muacCm: input.muacCm ?? null,
      bilateralEdema: input.bilateralEdema,
    },
    evidenceCount: input.evidence.length,
  };

  const text = await generateText([
    {
      text:
        'You are SHIFA clinical decision support for trained community health workers in Sudan, DRC, Somalia, Rwanda, and crisis clinics. ' +
        'Analyze the patient text and attached evidence. Use WHO IMCI and SAM field-triage caution. ' +
        `The CHW selected ${languageName}. Write every user-facing string in ${languageName}: primaryDiagnosis, summary, treatmentSteps, dangerSigns, returnInstructions, referral.messageForFacility, and voiceResponse. ` +
        'Keep only enum values in English: decision and referral.urgency. Do not mix English into the response except drug names, measurements, acronyms, and protocol terms such as ORS, RUTF, MUAC, SAM, or IMCI. ' +
        'Do not invent facts not present. If evidence is poor or measurements are missing, lower confidence and state immediate safe next action. ' +
        'Default to REFER_URGENT when danger signs are present, when confidence is below 0.70, or when age/weight needed for dosing is missing. ' +
        'Use only these decision values: TREAT, REFER_URGENT, REFER_ROUTINE. Do not use MONITOR. ' +
        'Return only valid JSON with this exact shape: ' +
        '{"decision":"REFER_URGENT|REFER_ROUTINE|TREAT","primaryDiagnosis":"string","confidence":0.0,"summary":"string","treatmentSteps":["string"],"dangerSigns":["string"],"returnInstructions":["string"],"referral":{"urgency":"URGENT|ROUTINE","messageForFacility":"string"},"voiceResponse":"string"}. ' +
        'Omit referral only when the decision is TREAT. Confidence must be between 0 and 1.'
    },
    { text: `Clinical input JSON: ${JSON.stringify(payload)}` },
    ...input.evidence.map(toGeminiPart),
  ]);

  return normalizeCloudClinicalDecision(extractJsonObject(text));
}

export async function analyzeGuardEvidence(evidence: EvidenceAsset[]): Promise<GuardThreatAnalysis> {
  if (evidence.length === 0) {
    throw new Error('Capture at least one Guard image or video before analysis.');
  }

  const text = await generateText([
    {
      text:
        'You are SHIFA Guard visual threat analysis. Analyze only the attached evidence. ' +
        'Detect armed individuals, visible firearms, gunfire indicators, explosions, armed convoys, checkpoints, or immediate field threats. ' +
        'Do not classify ordinary indoor scenes, emulator calibration scenes, furniture, animals, or screens as threats. ' +
        'Return only valid JSON with this exact shape: ' +
        '{"threatDetected":true,"threatType":"string","confidence":0.0,"urgency":"CRITICAL|HIGH|MODERATE|LOW","rationale":"string","recommendedAction":"string"}. ' +
        'If no credible threat is visible, set threatDetected false, confidence below 0.5, urgency LOW, and threatType "none".'
    },
    ...evidence.map(toGeminiPart),
  ]);

  return assertGuardThreatAnalysis(parseJson(text));
}

async function generateText(parts: GeminiPart[]): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new ShifaAIError(
      'Missing mobile Google/Gemini API key',
      'Analysis is not configured on this device. Ask the coordinator to complete SHIFA AI setup.',
      false
    );
  }

  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: {
            temperature: 0.1,
            topP: 0.7,
            responseMimeType: 'application/json',
          },
        }),
      });

      const bodyText = await response.text();
      if (!response.ok) {
        console.warn(`SHIFA Gemini request failed with status ${response.status}: ${bodyText.slice(0, 240)}`);
        if (isRetryableStatus(response.status) && attempt < RETRY_DELAYS_MS.length) {
          lastError = new ShifaAIError(
            `Gemini transient status ${response.status}: ${bodyText.slice(0, 180)}`,
            'Analysis service is busy. SHIFA is retrying.',
            true
          );
          await delay(RETRY_DELAYS_MS[attempt]);
          continue;
        }

        throw toSafeHttpError(response.status, bodyText);
      }

      const body = JSON.parse(bodyText);
      const output = body.candidates?.[0]?.content?.parts?.map((part: any) => part.text).filter(Boolean).join('\n');
      if (!output) {
        throw new ShifaAIError(
          'Gemini returned no text output',
          'SHIFA could not read the AI response. Try analysis again.',
          true
        );
      }
      return output;
    } catch (error) {
      lastError = error;
      if (error instanceof ShifaAIError && !error.retryable) throw error;
      if (attempt < RETRY_DELAYS_MS.length) {
        await delay(RETRY_DELAYS_MS[attempt]);
        continue;
      }
    }
  }

  if (lastError instanceof ShifaAIError) {
    throw new ShifaAIError(
      lastError.message,
      lastError.retryable
        ? 'Analysis service is busy or unreachable. Keep the patient safe and try again in a moment.'
        : lastError.userMessage,
      lastError.retryable
    );
  }

  throw new ShifaAIError(
    lastError instanceof Error ? lastError.message : 'Unknown AI analysis failure',
    'Analysis service is unreachable. Keep the patient safe and try again when signal returns.',
    true
  );
}

function toGeminiPart(asset: EvidenceAsset): GeminiPart {
  if (!asset.base64) throw new Error(`Evidence ${asset.name} has no base64 payload.`);
  return {
    inlineData: {
      mimeType: asset.mimeType,
      data: asset.base64,
    },
  };
}

function parseJson(raw: string): any {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  try {
    return JSON.parse(fenced ?? trimmed);
  } catch (error) {
    throw new ShifaAIError(
      error instanceof Error ? error.message : 'Invalid JSON from AI response',
      'SHIFA could not read the AI response. Try analysis again.',
      true
    );
  }
}

function assertGuardThreatAnalysis(value: any): GuardThreatAnalysis {
  if (!value || typeof value !== 'object') throw new Error('Guard AI response was not an object.');
  if (typeof value.threatDetected !== 'boolean') throw new Error('Guard AI omitted threatDetected.');
  if (typeof value.threatType !== 'string') throw new Error('Guard AI omitted threatType.');
  if (typeof value.confidence !== 'number' || value.confidence < 0 || value.confidence > 1) {
    throw new Error('Guard AI returned an invalid confidence.');
  }
  if (!['CRITICAL', 'HIGH', 'MODERATE', 'LOW'].includes(value.urgency)) throw new Error('Guard AI returned invalid urgency.');
  if (typeof value.rationale !== 'string' || typeof value.recommendedAction !== 'string') {
    throw new Error('Guard AI omitted rationale or recommendedAction.');
  }
  return value as GuardThreatAnalysis;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function toSafeHttpError(status: number, bodyText: string): ShifaAIError {
  if (isRetryableStatus(status)) {
    return new ShifaAIError(
      `AI transient status ${status}: ${bodyText.slice(0, 180)}`,
      'Analysis service is busy or unreachable. Keep the patient safe and try again in a moment.',
      true
    );
  }

  if (status === 401 || status === 403) {
    return new ShifaAIError(
      `AI authorization status ${status}`,
      'Analysis is not authorized on this device. Ask the coordinator to check SHIFA AI setup.',
      false
    );
  }

  if (status === 413) {
    return new ShifaAIError(
      'AI evidence payload too large',
      'The attached evidence is too large. Remove long video or large files and try again.',
      false
    );
  }

  return new ShifaAIError(
    `AI request failed with status ${status}`,
    'SHIFA could not complete analysis. Check the case details and try again.',
    false
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
