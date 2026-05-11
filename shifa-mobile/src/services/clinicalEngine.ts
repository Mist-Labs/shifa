import { ClinicalDecision, evaluateFieldProtocol } from './caseLog';
import { analyzeCloudClinicalCase, EvidenceAsset, isGeminiConfigured, ShifaAIError } from './gemini';
import { DecisionValue, inferDecision, normalizeDecision } from './clinicalContract';

interface ClinicalEngineInput {
  symptomText: string;
  ageMonths?: number;
  weightKg?: number;
  muacCm?: number;
  bilateralEdema: boolean;
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

  if (input.online && isGeminiConfigured()) {
    try {
      decision = await analyzeCloudClinicalCase(input);
    } catch (error) {
      if (error instanceof ShifaAIError && !error.retryable) throw error;
      decision = evaluateFieldProtocol(input);
      decision.engineMode = 'protocol_fallback';
      decision.summary = `${decision.summary}. Cloud fallback was unavailable; deterministic SHIFA safety rules were applied.`;
    }
  } else {
    decision = evaluateFieldProtocol(input);
    decision.engineMode = 'protocol_fallback';
  }

  return applyClinicalSafetyLayer(decision, input);
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

  if (guardedDecision === decision.decision && !overrideReason) return { ...decision, decision: guardedDecision };

  return {
    ...decision,
    decision: guardedDecision,
    rawDecision: decision.decision,
    guardrailOverrideReason: overrideReason ?? undefined,
    summary: overrideReason ? `${decision.summary} Safety protocol applied: ${overrideReason}.` : decision.summary,
    referral:
      guardedDecision === 'REFER_URGENT' || guardedDecision === 'REFER_ROUTINE'
        ? {
            urgency: guardedDecision === 'REFER_URGENT' ? 'URGENT' : 'ROUTINE',
            messageForFacility: decision.referral?.messageForFacility ?? `${decision.primaryDiagnosis}. Safety protocol applied: ${overrideReason}.`,
          }
        : undefined,
  };
}

function buildObjectiveText(input: ClinicalEngineInput, decision: ClinicalDecision): string {
  return [
    input.symptomText,
    input.bilateralEdema ? 'bilateral edema' : '',
    typeof input.muacCm === 'number' ? `MUAC ${input.muacCm}cm` : '',
    typeof input.ageMonths === 'number' && input.ageMonths < 1 ? 'neonate' : '',
    ...decision.dangerSigns,
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
