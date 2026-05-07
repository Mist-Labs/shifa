import { executeSql, selectRows } from './sqliteExec';

export type ConsultationDecision = 'REFER_URGENT' | 'TREAT' | 'MONITOR';

export interface ClinicalDecision {
  decision: ConsultationDecision;
  primaryDiagnosis: string;
  confidence: number;
  summary: string;
  treatmentSteps: string[];
  dangerSigns: string[];
  returnInstructions: string[];
  referral?: {
    urgency: 'URGENT';
    messageForFacility: string;
  };
  voiceResponse: string;
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

export function evaluateFieldProtocol(input: {
  symptomText: string;
  ageMonths?: number;
  weightKg?: number;
  muacCm?: number;
  bilateralEdema: boolean;
}): ClinicalDecision {
  const symptoms = input.symptomText.toLowerCase();
  const hasDanger =
    input.bilateralEdema ||
    symptoms.includes('convulsion') ||
    symptoms.includes('unconscious') ||
    symptoms.includes('breathing stops') ||
    symptoms.includes('unable to drink') ||
    symptoms.includes('lethargic');
  const severeMuac = typeof input.muacCm === 'number' && input.muacCm > 0 && input.muacCm < 11.5;
  const respiratoryWatch =
    symptoms.includes('cough') ||
    symptoms.includes('fast breathing') ||
    symptoms.includes('chest') ||
    symptoms.includes('ari');

  if (hasDanger || severeMuac) {
    return {
      decision: 'REFER_URGENT',
      primaryDiagnosis: 'Severe Acute Malnutrition with complications',
      confidence: 0.91,
      summary: 'Act now',
      treatmentSteps: ['Give 1 RUTF sachet now if alert and able to swallow', 'Do NOT give ORS yet'],
      dangerSigns: ['Convulsions: stop and call now', 'Breathing stops: start CPR and call now'],
      returnInstructions: ['Keep child warm during transport', 'Send referral card with caregiver'],
      referral: {
        urgency: 'URGENT',
        messageForFacility: 'SAM with complications. Bilateral edema or MUAC below urgent threshold.',
      },
      voiceResponse: 'Referral required. Give RUTF if safe. Do not give ORS yet.',
    };
  }

  if (respiratoryWatch) {
    return {
      decision: 'MONITOR',
      primaryDiagnosis: 'Mild Respiratory Infection',
      confidence: 0.82,
      summary: 'Watch and wait',
      treatmentSteps: ['Give fluids frequently', 'Continue breastfeeding', 'Keep child warm and rested'],
      dangerSigns: ['Fast breathing develops', 'Refuses all food or drink'],
      returnInstructions: ['Recheck in 24 hours', 'Return immediately if breathing worsens'],
      voiceResponse: 'Monitor at home. Recheck breathing in twenty four hours.',
    };
  }

  return {
    decision: 'TREAT',
    primaryDiagnosis: 'Uncomplicated Malnutrition',
    confidence: 0.87,
    summary: 'Safe to treat here',
    treatmentSteps: [
      `Confirm weight: child is ${input.weightKg ? `${input.weightKg}kg` : 'weighed before dosing'}`,
      'Give AL tablet twice daily for 3 days when malaria protocol indicates',
      'Give first dose now with food',
      'Return in 24h if no improvement',
    ],
    dangerSigns: ['Fever, vomiting, or convulsions', 'No improvement after 3 days'],
    returnInstructions: ['Log case before leaving', 'Review danger signs with caregiver'],
    voiceResponse: 'Treatment protocol loaded. Case can be treated here.',
  };
}
