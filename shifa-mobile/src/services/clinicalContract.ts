import { ClinicalDecision } from './caseLog';

export type DecisionValue = 'TREAT' | 'REFER_URGENT' | 'REFER_ROUTINE';

const VALID_DECISIONS = new Set<DecisionValue>(['TREAT', 'REFER_URGENT', 'REFER_ROUTINE']);
const DECISION_ALIASES: Record<string, DecisionValue> = {
  MONITOR: 'TREAT',
  OBSERVE: 'TREAT',
  HOME_CARE: 'TREAT',
  REFER_NON_URGENT: 'REFER_ROUTINE',
  NON_URGENT_REFERRAL: 'REFER_ROUTINE',
  ROUTINE_REFERRAL: 'REFER_ROUTINE',
};

const REFER_KEYWORDS = ['refer', 'referral', 'urgent', 'immediate', 'hospital', 'facility', 'إحالة', 'نقل', 'طوارئ', 'فور'];
const ROUTINE_REFER_KEYWORDS = ['within 24h', 'within 24 hours', 'routine', 'confirmation', 'public health notification'];
const TREAT_KEYWORDS = ['treat', 'treatment', 'give', 'ors', 'amoxicillin', 'rutf', 'علاج', 'أعط', 'magani'];

export function extractJsonObject(raw: string): Record<string, unknown> {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? raw;
  for (let start = fenced.indexOf('{'); start !== -1; start = fenced.indexOf('{', start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < fenced.length; index += 1) {
      const char = fenced[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === '{') depth += 1;
      if (char === '}') depth -= 1;
      if (depth === 0) {
        try {
          const value = JSON.parse(fenced.slice(start, index + 1));
          if (value && typeof value === 'object' && !Array.isArray(value)) return value;
        } catch {
          break;
        }
      }
    }
  }
  throw new Error('No JSON object found in model output');
}

export function normalizeCloudClinicalDecision(value: any): ClinicalDecision {
  const decision = inferDecision(value);
  const treatmentSteps = normalizeStringArray(value.treatmentSteps ?? value.treatment_protocol?.steps ?? value.treatment_protocol);
  const dangerSigns = normalizeStringArray(value.dangerSigns ?? value.danger_signs);
  const returnInstructions = normalizeStringArray(value.returnInstructions ?? value.monitoring?.return_if ?? value.monitoring?.returnTriggers);
  const primaryDiagnosis = String(value.primaryDiagnosis ?? value.primary_diagnosis ?? 'Clinical assessment').trim();
  const summary = String(value.summary ?? value.reasoning_trace ?? primaryDiagnosis).trim();
  const voiceResponse = String(value.voiceResponse ?? value.voice_response ?? summary).trim();
  const confidence = clampConfidence(value.confidence);
  const referralMessage =
    value.referral?.messageForFacility ??
    value.referral?.message_for_facility ??
    (typeof value.referral === 'string' ? value.referral : undefined);

  return {
    decision,
    primaryDiagnosis,
    confidence,
    summary,
    treatmentSteps: treatmentSteps.length ? treatmentSteps : defaultTreatmentSteps(decision),
    dangerSigns,
    returnInstructions: returnInstructions.length ? returnInstructions : defaultReturnInstructions(decision),
    referral:
      decision === 'REFER_URGENT' || decision === 'REFER_ROUTINE'
        ? {
            urgency: decision === 'REFER_URGENT' ? 'URGENT' : 'ROUTINE',
            messageForFacility: String(referralMessage ?? summary),
          }
        : undefined,
    voiceResponse,
    engineMode: 'cloud_fallback',
  };
}

export function inferDecision(value: any): DecisionValue {
  const explicit = normalizeDecision(value?.decision);
  if (explicit) return explicit;
  const text = normalizeText([
    value?.voiceResponse,
    value?.voice_response,
    value?.summary,
    value?.reasoning_trace,
    value?.primaryDiagnosis,
    value?.primary_diagnosis,
    ...(Array.isArray(value?.dangerSigns) ? value.dangerSigns : []),
    ...(Array.isArray(value?.danger_signs) ? value.danger_signs : []),
  ].join(' '));
  if (ROUTINE_REFER_KEYWORDS.some((keyword) => text.includes(keyword))) return 'REFER_ROUTINE';
  if (REFER_KEYWORDS.some((keyword) => text.includes(keyword))) return 'REFER_URGENT';
  if (TREAT_KEYWORDS.some((keyword) => text.includes(keyword))) return 'TREAT';
  return clampConfidence(value?.confidence) < 0.7 ? 'REFER_URGENT' : 'REFER_URGENT';
}

export function normalizeDecision(value: unknown): DecisionValue | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase().replace(/[-\s]/g, '_');
  const aliased = DECISION_ALIASES[normalized] ?? normalized;
  return VALID_DECISIONS.has(aliased as DecisionValue) ? (aliased as DecisionValue) : null;
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function clampConfidence(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0.7;
  return Math.max(0, Math.min(1, numeric));
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function defaultTreatmentSteps(decision: DecisionValue): string[] {
  if (decision === 'REFER_URGENT') return ['Keep patient warm and transport to the nearest appropriate facility now.'];
  if (decision === 'REFER_ROUTINE') return ['Refer within 24 hours for facility confirmation and follow-up.'];
  return ['Treat according to the country protocol and review danger signs with caregiver.'];
}

function defaultReturnInstructions(decision: DecisionValue): string[] {
  if (decision === 'TREAT') return ['Return immediately if any danger sign appears.', 'Recheck within 24 hours if symptoms persist.'];
  return ['Go immediately if breathing worsens, consciousness changes, convulsions occur, or the patient cannot drink/feed.'];
}
