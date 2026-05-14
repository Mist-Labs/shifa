import { randomUUID } from 'node:crypto';
import { ClinicalEngine } from './engine.js';
import { ClinicalDecisionResponse, Consultation as ApiConsultation, ConsultationRequest, Country, Language } from '../types/index.js';
import { saveConsultations } from '../services/memoryStore.js';

const engine = new ClinicalEngine();

export interface StoredConsultation {
  id: string;
  chwId?: string;
  patientAgeMonths?: number;
  patientSex?: 'M' | 'F';
  patientWeightKg?: number;
  muacCm?: number;
  bilateralEdema?: boolean;
  symptomText: string;
  imagePath?: string;
  decision?: ClinicalDecisionResponse;
  primaryDiagnosis?: string;
  confidence?: number;
  country?: Country;
  language?: Language;
  createdAt?: string;
}

export async function processConsultation(data: Partial<StoredConsultation> | ConsultationRequest) {
  const now = new Date().toISOString();
  const id = randomUUID();
  const request = normalizeConsultationRequest(data);
  const decision = await engine.processConsultation(request);

  const record: StoredConsultation = {
    id,
    chwId: request.chwId,
    patientAgeMonths: request.patient.ageMonths,
    patientSex: request.patient.sex,
    patientWeightKg: request.patient.weightKg,
    muacCm: request.patient.muacCm,
    bilateralEdema: request.patient.bilateralEdema,
    symptomText: request.symptomText,
    imagePath: request.imagePath,
    decision,
    confidence: decision.confidence,
    primaryDiagnosis: decision.primaryDiagnosis,
    country: request.country,
    language: request.language,
    createdAt: now,
  };

  const apiRecord: ApiConsultation = {
    id,
    chwId: request.chwId,
    patient: request.patient,
    symptomText: request.symptomText,
    imagePath: request.imagePath,
    decision,
    country: request.country,
    language: request.language,
    createdAt: now,
    synced: false,
  };
  await saveConsultations([apiRecord]);

  return { success: true, record };
}

function normalizeConsultationRequest(data: any): ConsultationRequest {
  return {
    chwId: data.chwId || 'unknown',
    country: data.country || 'sudan',
    language: data.language || 'ar',
    symptomText: data.symptomText || '',
    imagePath: data.imagePath,
    patient: data.patient || {
      ageMonths: data.patientAgeMonths,
      sex: data.patientSex,
      weightKg: data.patientWeightKg,
      muacCm: data.muacCm,
      bilateralEdema: data.bilateralEdema,
    },
  };
}

export default { processConsultation };
