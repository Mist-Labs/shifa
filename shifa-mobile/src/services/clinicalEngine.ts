import { ClinicalDecision, evaluateFieldProtocol } from './caseLog';
import { analyzeCloudClinicalCase, EvidenceAsset, isGeminiConfigured, ShifaAIError } from './gemini';
import { DecisionValue, inferDecision, normalizeDecision } from './clinicalContract';
import { analyzeWithLiteRT } from './litertEngine';
import { analyzeWithLlama } from './llamaEngine';
import { localizeGuardrailReason, textPack } from './language';
import { getClinicalModelStatus } from './modelManager';

interface ClinicalEngineInput {
  symptomText: string;
  ageMonths?: number;
  weightKg?: number;
  muacCm?: number;
  bilateralEdema: boolean;
  country: string;
  language: string;
  evidence: EvidenceAsset[];
  online: boolean;
}

const OBJECTIVE_URGENT_PATTERNS: Array<[RegExp, string]> = [
  [/bilateral\s+edema|bipedal\s+edema|oedema\s+of\s+both\s+feet/i, 'Bilateral edema'],
  [/neonate.{0,50}(unable to feed|not feeding|cannot feed|refusing feed)/i, 'Neonatal feeding danger'],
  [/(unable to feed|not feeding|cannot feed|refusing feed).{0,50}neonate/i, 'Neonatal feeding danger'],
  [/neonate.{0,50}fast\s+breathing|fast\s+breathing.{0,50}neonate/i, 'Neonatal breathing danger'],
  [/newborn.{0,50}(not feeding|unable to feed|cannot feed)/i, 'Newborn feeding danger'],
  [/sexual\s+violence|\bgbv\b|\brape\b/i, 'Sexual violence survivor'],
  [/pregnan.{0,50}(heavy\s+vaginal\s+bleeding|vaginal\s+bleeding|severe\s+headache)/i, 'Maternal danger sign'],
  [/(heavy\s+vaginal\s+bleeding|vaginal\s+bleeding|severe\s+headache).{0,50}pregnan/i, 'Maternal danger sign'],
  [/eclampsia|pre-eclampsia|preeclampsia/i, 'Eclampsia'],
  [/convulsion|seizure|\bfits?\b/i, 'Convulsions'],
  [/stiff\s+neck|neck\s+stiffness|nuchal\s+rigidity/i, 'Meningitis sign'],
  [/bulging\s+fontanell?e/i, 'Meningitis sign'],
  [/severe\s+chest\s+indrawing|lower\s+chest\s+wall\s+indrawing|severe\s+respiratory\s+distress/i, 'Severe chest indrawing'],
  [/unconscious|unresponsive|loss\s+of\s+consciousness|altered\s+consciousness/i, 'Altered consciousness'],
  [/lethargic.{0,40}unable\s+to\s+drink|unable\s+to\s+drink.{0,40}lethargic/i, 'Lethargic and unable to drink'],
  [/not\s+able\s+to\s+drink|cannot\s+drink|unable\s+to\s+drink/i, 'Unable to drink'],
];

const DIAGNOSIS_URGENT_PATTERNS: Array<[RegExp, string]> = [
  [/severe\s+acute\s+malnutrition|\bsam\b/i, 'Severe acute malnutrition'],
  [/severe\s+pneumonia/i, 'Severe pneumonia'],
  [/meningitis|meningococcal/i, 'Meningitis'],
  [/sexual\s+violence|\bgbv\b|\brape\b/i, 'Sexual violence survivor'],
  [/maternal\s+danger|obstetric\s+emergency/i, 'Maternal danger sign'],
];

const ROUTINE_OVERRIDE_PATTERNS: Array<[RegExp, string]> = [
  [
    /fever.{0,50}(widespread\s+rash|rash).{0,80}(cough|red\s+eyes)|(widespread\s+rash|rash).{0,80}(cough|red\s+eyes).{0,80}fever|measles/i,
    'Measles suspected without emergency danger signs',
  ],
];

export async function analyzeClinicalCase(input: ClinicalEngineInput): Promise<ClinicalDecision> {
  let decision: ClinicalDecision;
  const hasEvidence = input.evidence.length > 0;
  const hasAudioEvidence = input.evidence.some((asset) => asset.kind === 'audio' || asset.mimeType.startsWith('audio/'));
  const hasTypedSymptoms = input.symptomText.trim().length > 0;

  if (hasEvidence && input.online && isGeminiConfigured()) {
    try {
      decision = await analyzeCloudClinicalCase(input);
      return applyClinicalSafetyLayer(decision, input);
    } catch (error) {
      if (error instanceof ShifaAIError && !error.retryable) throw error;
      if (hasAudioEvidence && !hasTypedSymptoms) {
        throw new ShifaAIError(
          error instanceof Error ? error.message : 'Audio evidence analysis failed',
          'This recording has not been converted to text. Reconnect for cloud audio analysis, or type the spoken symptoms and measurements before running offline analysis.',
          true
        );
      }
      if (!hasTypedSymptoms) {
        throw new ShifaAIError(
          error instanceof Error ? error.message : 'Evidence analysis failed',
          'Voice, photo, or video-only cases need cloud analysis. Type the key symptoms and measurements, or reconnect and try again.',
          true
        );
      }
    }
  }

  if (hasEvidence && !hasTypedSymptoms && (!input.online || !isGeminiConfigured())) {
    throw new ShifaAIError(
      'Evidence-only case cannot be analyzed by local text model',
      'Voice, photo, or video-only cases need cloud analysis. Type the key symptoms and measurements, or reconnect and try again.',
      false
    );
  }

  const localErrors: string[] = [];
  const localStatus = await getClinicalModelStatus().catch(() => null);
  const localDecision = await analyzeWithLiteRT(input).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    localErrors.push(`LiteRT: ${message}`);
    console.warn('SHIFA LiteRT local inference unavailable:', message);
    return null;
  });
  if (localDecision) {
    decision = localDecision;
  } else {
    const ggufDecision = await analyzeWithLlama(input).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      localErrors.push(`GGUF: ${message}`);
      console.warn('SHIFA GGUF local inference unavailable:', message);
      return null;
    });
    if (ggufDecision) {
      decision = ggufDecision;
    } else if (input.online && isGeminiConfigured()) {
      try {
        decision = await analyzeCloudClinicalCase(input);
      } catch (error) {
        if (error instanceof ShifaAIError && !error.retryable) throw error;
        decision = evaluateFieldProtocol(input);
        decision.engineMode = 'protocol_fallback';
        decision.summary = `${decision.summary}. ${textPack(input.language).cloudFallbackNotice}`;
      }
    } else if (!input.online && localStatus?.runtimeReady) {
      decision = evaluateFieldProtocol(input);
      decision.engineMode = 'protocol_fallback';
      decision.summary = withProtocolFallbackNotice(decision.summary, input.language);
      decision.voiceResponse = withProtocolFallbackNotice(decision.voiceResponse ?? decision.summary, input.language);
    } else {
      decision = evaluateFieldProtocol(input);
      decision.engineMode = 'protocol_fallback';
    }
  }

  return applyClinicalSafetyLayer(decision, input);
}

function withProtocolFallbackNotice(text: string, language: string): string {
  const fallbackNotice = protocolFallbackNotice(language);
  return text.includes(fallbackNotice) ? text : `${fallbackNotice} ${text}`;
}

function protocolFallbackNotice(language: string): string {
  switch (language) {
    case 'fr':
      return "Le modele hors ligne n'a pas pu demarrer; SHIFA utilise la liste de securite du protocole.";
    case 'rw':
      return 'Modeli yo kuri telefoni ntiyabashije gukora; SHIFA irakoresha amabwiriza ya protokole yumutekano.';
    case 'so':
      return 'Moodalkii offline-ka ma bilaaban; SHIFA waxay isticmaaleysaa xeerarka badbaadada ee hab-maamuuska.';
    case 'ha':
      return 'Samfurin offline bai fara aiki ba; SHIFA na amfani da dokokin kariya na protokol.';
    case 'ln':
      return 'Model offline ebimaki te; SHIFA ezali kosalela mibeko ya bokengi ya protocole.';
    case 'ar':
      return 'تعذر تشغيل النموذج دون إنترنت؛ يستخدم SHIFA قواعد السلامة في البروتوكول.';
    default:
      return 'The offline AI model could not start, so SHIFA is using the safety protocol checklist.';
  }
}

function applyClinicalSafetyLayer(decision: ClinicalDecision, input: ClinicalEngineInput): ClinicalDecision {
  const inferred = normalizeDecision(decision.decision) ?? inferDecision(decision);
  const objective = buildObjectiveText(input, decision);
  const diagnostic = `${decision.primaryDiagnosis} ${decision.summary}`;
  const objectiveUrgent = urgentObjectiveReason(objective);
  const routineReason = !objectiveUrgent ? routineOverrideReason(`${objective} ${diagnostic}`) : null;
  const urgentDiagnostic = !objectiveUrgent && !routineReason ? urgentDiagnosticReason(diagnostic) : null;

  const guardedDecision = objectiveUrgent
    ? 'REFER_URGENT'
    : routineReason
      ? 'REFER_ROUTINE'
      : urgentDiagnostic
        ? 'REFER_URGENT'
        : inferred;
  const overrideReason = objectiveUrgent ?? routineReason ?? urgentDiagnostic;
  const localizedReason = localizeGuardrailReason(overrideReason, input.language);
  const text = textPack(input.language);

  if (guardedDecision === decision.decision && !overrideReason) return { ...decision, decision: guardedDecision };

  return {
    ...decision,
    decision: guardedDecision,
    rawDecision: decision.decision,
    guardrailOverrideReason: overrideReason ? localizedReason : undefined,
    summary: overrideReason ? `${decision.summary} ${text.safetyApplied(localizedReason)}` : decision.summary,
    referral:
      guardedDecision === 'REFER_URGENT' || guardedDecision === 'REFER_ROUTINE'
        ? {
            urgency: guardedDecision === 'REFER_URGENT' ? 'URGENT' : 'ROUTINE',
            messageForFacility: decision.referral?.messageForFacility ?? text.referralSafetyMessage(decision.primaryDiagnosis, localizedReason),
          }
        : undefined,
  };
}

function buildObjectiveText(input: ClinicalEngineInput, decision: ClinicalDecision): string {
  return [
    input.symptomText,
    input.bilateralEdema ? 'bilateral edema' : '',
    typeof input.muacCm === 'number' && input.muacCm > 0 ? `MUAC ${input.muacCm}cm` : '',
    typeof input.ageMonths === 'number' && input.ageMonths < 1 ? 'neonate' : '',
  ].join(' ');
}

function urgentObjectiveReason(text: string): string | null {
  const muac = text.match(/muac[:\s=]*([0-9]+(?:\.[0-9]+)?)\s*(?:cm)?/i)?.[1];
  if (muac && Number(muac) < 11.5) return `MUAC ${muac}cm < 11.5cm`;
  for (const [pattern, reason] of OBJECTIVE_URGENT_PATTERNS) {
    if (pattern.test(text)) return reason;
  }
  return null;
}

function routineOverrideReason(text: string): string | null {
  for (const [pattern, reason] of ROUTINE_OVERRIDE_PATTERNS) {
    if (pattern.test(text)) return reason;
  }
  return null;
}

function urgentDiagnosticReason(text: string): string | null {
  for (const [pattern, reason] of DIAGNOSIS_URGENT_PATTERNS) {
    if (pattern.test(text)) return reason;
  }
  return null;
}
