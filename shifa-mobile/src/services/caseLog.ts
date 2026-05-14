import { executeSql, selectRows } from './sqliteExec';
import { localizeProtocolDecision } from './language';

export type ConsultationDecision = 'REFER_URGENT' | 'REFER_ROUTINE' | 'TREAT';

export interface ClinicalDecision {
  decision: ConsultationDecision;
  primaryDiagnosis: string;
  confidence: number;
  summary: string;
  treatmentSteps: string[];
  dangerSigns: string[];
  returnInstructions: string[];
  referral?: {
    urgency: 'URGENT' | 'ROUTINE';
    messageForFacility: string;
  };
  voiceResponse: string;
  engineMode?: 'local_model' | 'cloud_fallback' | 'protocol_fallback';
  rawDecision?: ConsultationDecision | 'MONITOR';
  guardrailOverrideReason?: string;
}

export interface ConsultationInput {
  chwId: string;
  ageMonths?: number;
  sex?: string;
  weightKg?: number;
  muacCm?: number;
  bilateralEdema: boolean;
  symptomText: string;
  decision: ClinicalDecision;
  clinicalPhotoUri?: string;
  clinicalUpload?: {
    uri: string;
    name: string;
    mimeType?: string;
  };
  evidenceAssets?: Array<{
    id: string;
    kind: string;
    uri: string;
    name: string;
    mimeType: string;
  }>;
  audioRecordingUri?: string;
  latitude?: number;
  longitude?: number;
}

export interface CaseLogItem {
  id: string;
  kind: 'consultation' | 'threat';
  title: string;
  decision: string;
  confidence: number;
  createdAt: number;
  synced: boolean;
  detail: string;
}

export interface CaseLogDetail extends CaseLogItem {
  ageMonths?: number;
  sex?: string;
  weightKg?: number;
  muacCm?: number;
  bilateralEdema?: boolean;
  fullResponse?: ClinicalDecision & Record<string, any>;
}

export async function logConsultation(input: ConsultationInput): Promise<string> {
  const id = `case-${Date.now()}`;
  await executeSql(
    `INSERT INTO consultations
      (id, chw_id, patient_age_months, patient_sex, patient_weight_kg, muac_cm, bilateral_edema,
       symptom_text, decision, primary_diagnosis, confidence, full_response_json, voice_response_text,
       latitude, longitude, created_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      id,
      input.chwId,
      input.ageMonths ?? null,
      input.sex ?? null,
      input.weightKg ?? null,
      input.muacCm ?? null,
      input.bilateralEdema ? 1 : 0,
      input.symptomText,
      input.decision.decision,
      input.decision.primaryDiagnosis,
      input.decision.confidence,
      JSON.stringify({
        ...input.decision,
        clinicalPhotoUri: input.clinicalPhotoUri ?? null,
        clinicalUpload: input.clinicalUpload ?? null,
        evidenceAssets: input.evidenceAssets ?? [],
        audioRecordingUri: input.audioRecordingUri ?? null,
      }),
      input.decision.voiceResponse,
      input.latitude ?? null,
      input.longitude ?? null,
      Date.now(),
    ]
  );
  await executeSql(
    `INSERT INTO sync_queue (record_type, record_id, attempts, status, last_attempt) VALUES (?, ?, 0, 'pending', NULL)`,
    ['consultation', id]
  );
  return id;
}

export async function listCaseLog(): Promise<CaseLogItem[]> {
  const consultations = await selectRows<any>(
    `SELECT id, decision, primary_diagnosis, confidence, created_at, synced, symptom_text
       FROM consultations
      ORDER BY created_at DESC
      LIMIT 80`
  );
  const threats = await selectRows<any>(
    `SELECT id, threat_type, urgency, confidence, created_at, synced
       FROM threat_events
      ORDER BY created_at DESC
      LIMIT 80`
  );

  return [
    ...consultations.map((row) => ({
      id: row.id,
      kind: 'consultation' as const,
      title: row.primary_diagnosis || 'Consultation',
      decision: row.decision || 'TREAT',
      confidence: Number(row.confidence ?? 0),
      createdAt: Number(row.created_at ?? 0),
      synced: row.synced === 1,
      detail: row.symptom_text || '',
    })),
    ...threats.map((row) => ({
      id: row.id,
      kind: 'threat' as const,
      title: row.threat_type || 'Threat event',
      decision: `THREAT_${row.urgency || 'HIGH'}`,
      confidence: Number(row.confidence ?? 0),
      createdAt: Number(row.created_at ?? 0),
      synced: row.synced === 1,
      detail: row.urgency || 'Threat',
    })),
  ].sort((a, b) => b.createdAt - a.createdAt);
}

export async function getCaseCounts(): Promise<{ total: number; synced: number }> {
  const rows = await selectRows<{ total: number; synced: number }>(
    `SELECT
       (SELECT COUNT(*) FROM consultations) + (SELECT COUNT(*) FROM threat_events) AS total,
       (SELECT COUNT(*) FROM consultations WHERE synced = 1) + (SELECT COUNT(*) FROM threat_events WHERE synced = 1) AS synced`
  );
  return rows[0] ?? { total: 0, synced: 0 };
}

export async function deleteCaseLogItem(item: Pick<CaseLogItem, 'id' | 'kind'>): Promise<void> {
  if (item.kind === 'consultation') {
    await executeSql(`DELETE FROM consultations WHERE id = ?`, [item.id]);
    return;
  }

  await executeSql(`DELETE FROM threat_events WHERE id = ?`, [item.id]);
}

export async function getCaseLogDetail(item: Pick<CaseLogItem, 'id' | 'kind'>): Promise<CaseLogDetail | null> {
  if (item.kind === 'consultation') {
    const rows = await selectRows<any>(
      `SELECT id, decision, primary_diagnosis, confidence, created_at, synced, symptom_text,
              patient_age_months, patient_sex, patient_weight_kg, muac_cm, bilateral_edema,
              full_response_json
         FROM consultations
        WHERE id = ?
        LIMIT 1`,
      [item.id]
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      kind: 'consultation',
      title: row.primary_diagnosis || 'Consultation',
      decision: row.decision || 'TREAT',
      confidence: Number(row.confidence ?? 0),
      createdAt: Number(row.created_at ?? 0),
      synced: row.synced === 1,
      detail: row.symptom_text || '',
      ageMonths: row.patient_age_months ?? undefined,
      sex: row.patient_sex ?? undefined,
      weightKg: row.patient_weight_kg ?? undefined,
      muacCm: row.muac_cm ?? undefined,
      bilateralEdema: row.bilateral_edema === 1,
      fullResponse: parseStoredJson(row.full_response_json),
    };
  }

  const rows = await selectRows<any>(
    `SELECT id, threat_type, urgency, confidence, created_at, synced
       FROM threat_events
      WHERE id = ?
      LIMIT 1`,
    [item.id]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    kind: 'threat',
    title: row.threat_type || 'Threat event',
    decision: `THREAT_${row.urgency || 'HIGH'}`,
    confidence: Number(row.confidence ?? 0),
    createdAt: Number(row.created_at ?? 0),
    synced: row.synced === 1,
    detail: row.urgency || 'Threat',
  };
}

function parseStoredJson(value: string | null | undefined): any {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export function evaluateFieldProtocol(input: {
  symptomText: string;
  ageMonths?: number;
  weightKg?: number;
  muacCm?: number;
  bilateralEdema: boolean;
  language?: string;
}): ClinicalDecision {
  const symptoms = input.symptomText.toLowerCase();
  const observedDangerSigns = [
    symptoms.includes('convulsion') || symptoms.includes('seizure') || symptoms.includes('fits') ? 'Convulsions' : '',
    symptoms.includes('unconscious') || symptoms.includes('unresponsive') ? 'Altered consciousness' : '',
    symptoms.includes('breathing stops') ? 'Breathing stops' : '',
    symptoms.includes('unable to drink') || symptoms.includes('cannot drink') || symptoms.includes('not able to drink') ? 'Unable to drink' : '',
    symptoms.includes('lethargic') ? 'Lethargy' : '',
    input.bilateralEdema ? 'Bilateral pitting edema' : '',
  ].filter(Boolean);
  const hasDanger = observedDangerSigns.length > 0;
  const severeMuac = typeof input.muacCm === 'number' && input.muacCm > 0 && input.muacCm < 11.5;
  const hasMalnutritionContext =
    input.bilateralEdema ||
    severeMuac ||
    symptoms.includes('malnutrition') ||
    symptoms.includes('muac') ||
    symptoms.includes('wasting') ||
    symptoms.includes('poor appetite');
  const hasFever = symptoms.includes('fever') || symptoms.includes('febrile') || symptoms.includes('temperature');
  const hasHeadache = symptoms.includes('headache');
  const hasMalaria = symptoms.includes('malaria') || symptoms.includes('chills');
  const hasDiarrhea = symptoms.includes('diarrhea') || symptoms.includes('diarrhoea') || symptoms.includes('watery stool');
  const respiratoryWatch =
    symptoms.includes('cough') ||
    symptoms.includes('fast breathing') ||
    symptoms.includes('chest') ||
    symptoms.includes('ari');

  if (hasDanger || severeMuac) {
    const malnutritionEmergency = hasMalnutritionContext || severeMuac || input.bilateralEdema;
    return localizeProtocolDecision({
      decision: 'REFER_URGENT',
      primaryDiagnosis: malnutritionEmergency ? 'Severe Acute Malnutrition with complications' : 'Clinical danger sign',
      confidence: 0.91,
      summary: 'Act now',
      treatmentSteps: malnutritionEmergency
        ? ['Give RUTF only if alert and able to swallow', 'Keep warm during transport', 'Refer immediately for inpatient assessment']
        : ['Keep patient safe and positioned for transport', 'Do not give oral medicine if unconscious or unable to swallow', 'Refer immediately for emergency assessment'],
      dangerSigns: observedDangerSigns.length > 0 ? observedDangerSigns : ['MUAC below 11.5cm'],
      returnInstructions: ['Keep child warm during transport', 'Send referral card with caregiver'],
      referral: {
        urgency: 'URGENT',
        messageForFacility: malnutritionEmergency
          ? 'SAM with complications. Bilateral edema or MUAC below urgent threshold.'
          : `Emergency danger sign observed: ${observedDangerSigns.join(', ') || 'urgent clinical danger sign'}.`,
      },
      voiceResponse: 'Urgent referral required. Keep the patient safe during transport.',
    }, input.language);
  }

  if (respiratoryWatch) {
    return localizeProtocolDecision({
      decision: 'TREAT',
      primaryDiagnosis: 'Mild Respiratory Infection',
      confidence: 0.82,
      summary: 'Treat and monitor',
      treatmentSteps: ['Give fluids frequently', 'Continue breastfeeding', 'Keep child warm and rested'],
      dangerSigns: ['Fast breathing develops', 'Refuses all food or drink'],
      returnInstructions: ['Recheck in 24 hours', 'Return immediately if breathing worsens'],
      voiceResponse: 'Monitor at home. Recheck breathing in twenty four hours.',
    }, input.language);
  }

  if (hasDiarrhea) {
    return localizeProtocolDecision({
      decision: 'TREAT',
      primaryDiagnosis: 'Acute watery diarrhea',
      confidence: 0.86,
      summary: 'Treat and monitor hydration',
      treatmentSteps: ['Give ORS frequently after each loose stool', 'Continue feeding and breastfeeding', 'Give zinc if age-appropriate per local protocol'],
      dangerSigns: ['Unable to drink', 'Lethargy', 'Blood in stool', 'Repeated vomiting'],
      returnInstructions: ['Return immediately if any danger sign appears', 'Recheck if diarrhea continues or dehydration worsens'],
      voiceResponse: 'Give oral rehydration solution and monitor closely for dehydration danger signs.',
    }, input.language);
  }

  if (hasFever || hasHeadache || hasMalaria) {
    return localizeProtocolDecision({
      decision: 'TREAT',
      primaryDiagnosis: hasMalaria ? 'Uncomplicated malaria or febrile illness' : 'Febrile illness',
      confidence: 0.84,
      summary: 'Treat here and monitor danger signs',
      treatmentSteps: [
        `Confirm weight: child is ${input.weightKg ? `${input.weightKg}kg` : 'weighed before dosing'}`,
        'Use national fever or malaria protocol before giving medicine',
        'Give fluids and keep the patient comfortable',
      ],
      dangerSigns: ['Convulsions', 'Unable to drink', 'Persistent vomiting', 'Worsening headache or stiff neck'],
      returnInstructions: ['Return immediately if any danger sign appears', 'Recheck in 24 hours if fever persists'],
      voiceResponse: 'Treat according to fever protocol and return immediately if danger signs appear.',
    }, input.language);
  }

  if (hasMalnutritionContext) {
    return localizeProtocolDecision({
      decision: 'TREAT',
      primaryDiagnosis: 'Moderate or uncomplicated acute malnutrition',
      confidence: 0.85,
      summary: 'Nutrition support and follow-up',
      treatmentSteps: ['Confirm MUAC and weight', 'Provide nutrition counselling or RUTF per local protocol', 'Schedule follow-up measurement'],
      dangerSigns: ['Bilateral pitting edema', 'MUAC below 11.5cm', 'Poor appetite with illness'],
      returnInstructions: ['Refer urgently if edema or low MUAC appears', 'Recheck nutrition status at follow-up'],
      voiceResponse: 'Provide nutrition support and monitor for severe malnutrition danger signs.',
    }, input.language);
  }

  return localizeProtocolDecision({
    decision: 'TREAT',
    primaryDiagnosis: 'Minor illness or non-urgent symptoms',
    confidence: 0.76,
    summary: 'Safe to assess here',
    treatmentSteps: [
      `Confirm weight: child is ${input.weightKg ? `${input.weightKg}kg` : 'weighed before dosing'}`,
      'Assess with the local symptom protocol',
      'Give supportive care and explain return precautions',
    ],
    dangerSigns: ['Convulsions', 'Unable to drink', 'Lethargy', 'Breathing difficulty'],
    returnInstructions: ['Log case before leaving', 'Return immediately if any danger sign appears'],
    voiceResponse: 'No urgent danger sign detected. Continue assessment and review return precautions.',
  }, input.language);
}
