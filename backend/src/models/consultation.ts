import { ClinicalDecisionResponse, Country, Language } from '../types/index.js';

export interface Consultation {
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

export default Consultation;
