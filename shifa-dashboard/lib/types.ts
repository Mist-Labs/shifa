export type Country = 'sudan' | 'drc' | 'somalia' | 'nigeria' | 'rwanda';
export type Decision = 'TREAT' | 'REFER_URGENT' | 'REFER_ROUTINE' | 'MONITOR';
export type ThreatUrgency = 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';

export interface ClinicalDecision {
  decision: Decision;
  primaryDiagnosis: string;
  differentialDiagnoses: string[];
  confidence: number;
  referral?: {
    urgency: 'IMMEDIATE' | 'WITHIN_6H' | 'WITHIN_24H' | 'WITHIN_72H';
    facilityType: string;
    messageForFacility: string;
  };
  voiceResponse: string;
}

export interface ShifaCase {
  id: string;
  chwId: string;
  patient?: {
    ageMonths?: number;
    sex?: 'M' | 'F';
    weightKg?: number;
    muacCm?: number;
    bilateralEdema?: boolean;
  };
  symptomText: string;
  decision: ClinicalDecision;
  latitude?: number;
  longitude?: number;
  country: Country;
  language: string;
  createdAt: string;
  synced: boolean;
}

export interface ThreatEvent {
  id: string;
  chwId: string;
  threatType: string;
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

export interface BackendReady {
  status: 'ready' | 'degraded';
  dependencies: Record<string, string>;
}

export interface DashboardData {
  cases: ShifaCase[];
  threats: ThreatEvent[];
  outbreaks: OutbreakAlert[];
  ready: BackendReady | null;
}

export interface ChwActivity {
  chwId: string;
  casesToday: number;
  threatsToday: number;
  lastSeen: string;
  countries: Country[];
  status: 'active' | 'quiet' | 'offline';
}

export interface FacilityStatus {
  id: string;
  name: string;
  country: Country;
  services: string[];
  urgentReferrals: number;
  operational: boolean;
  lastSignal: string;
}
