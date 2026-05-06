// Comprehensive type definitions for SHIFA backend

export type Country = 'sudan' | 'drc' | 'somalia';
export type Language = 'ar' | 'so' | 'fr' | 'ln' | 'rw'; // Arabic, Somali, French, Lingala, Kinyarwanda

export type ClinicalDecision = 'TREAT' | 'REFER_URGENT' | 'REFER_ROUTINE' | 'MONITOR';
export type ThreatType = 'armed_individuals' | 'vehicle_convoy' | 'motorbike_cluster' | 'gunfire_single' | 'gunfire_burst' | 'explosion' | 'combined';
export type ThreatUrgency = 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
export type ReferralUrgency = 'IMMEDIATE' | 'WITHIN_6H' | 'WITHIN_24H' | 'WITHIN_72H';

export interface CHWProfile {
  id: string;
  externalId?: string;
  name?: string;
  country: Country;
  language: Language;
  region?: string;
  alertRecipients: string[]; // phone numbers
  guardEnabled: boolean;
  createdAt: string;
  lastSyncAt?: string;
}

export interface PatientData {
  ageMonths?: number;
  sex?: 'M' | 'F';
  weightKg?: number;
  muacCm?: number;
  bilateralEdema?: boolean;
}

export interface ConsultationRequest {
  chwId: string;
  patient: PatientData;
  symptomText: string;
  imagePath?: string;
  country: Country;
  language: Language;
}

export interface DangerSign {
  sign: string;
  triggersUrgent: boolean;
}

export interface TreatmentProtocol {
  steps: string[];
  drugDoses?: Array<{ drug: string; dose: string; frequency: string }>;
  followUpHours: number;
  returnTriggers: string[];
}

export interface ReferralInfo {
  urgency: ReferralUrgency;
  facilityType: string;
  preReferralTreatment: string[];
  messageForFacility: string;
  dangerSignsEnRoute: string[];
}

export interface MonitoringPlan {
  watchSigns: string[];
  returnIf: string[];
  homeCare: string[];
  recheckHours: number;
}

export interface ClinicalDecisionResponse {
  id: string;
  decision: ClinicalDecision;
  primaryDiagnosis: string;
  differentialDiagnoses: string[];
  confidence: number;
  treatment?: TreatmentProtocol;
  referral?: ReferralInfo;
  monitoring?: MonitoringPlan;
  dangerSigns: DangerSign[];
  reasoningTrace: string;
  voiceResponse: string;
  imageAnalysis?: {
    finding: string;
    confidence: number;
    recommendation: string;
  };
}

export interface Consultation {
  id: string;
  chwId: string;
  patient: PatientData;
  symptomText: string;
  imagePath?: string;
  decision: ClinicalDecisionResponse;
  latitude?: number;
  longitude?: number;
  country: Country;
  language: Language;
  createdAt: string;
  synced: boolean;
}

export interface ReferralCard {
  id: string;
  consultationId: string;
  cardHtml: string;
  shared: boolean;
  createdAt: string;
}

export interface ThreatEvent {
  id: string;
  chwId: string;
  threatType: ThreatType;
  urgency: ThreatUrgency;
  confidence: number;
  latitude?: number;
  longitude?: number;
  smsDispatched: boolean;
  smsRecipients?: string[];
  createdAt: string;
  synced: boolean;
}

export interface OutbreakAlert {
  id: string;
  alertType: string;
  condition: string;
  country: Country;
  caseCount: number;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  firstCaseAt: string;
  alertFiredAt: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
}

export interface SyncPayload {
  consultations: Consultation[];
  threatEvents: ThreatEvent[];
  chwProfile: CHWProfile;
  syncToken?: string;
}

export interface SyncResponse {
  success: boolean;
  syncedCount: number;
  newSyncToken: string;
  outbreakAlerts: OutbreakAlert[];
}

export interface Facility {
  id: string;
  name: string;
  operator?: string;
  country: Country;
  latitude?: number;
  longitude?: number;
  services?: string[];
  operational: boolean;
  lastVerifiedAt?: string;
}

export default 'types';
