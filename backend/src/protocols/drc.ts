/**
 * DRC Protocol Module (Eastern Congo)
 * Top killers: Malaria, Mpox, SAM, Cholera, Measles, Pneumonia
 * Context: 7M+ displaced, 82,000+ measles cases (2025), 58,000+ cholera cases (9mo 2025)
 */

import { DangerSign } from '../types/index.js';

export const DRC_DANGER_SIGNS: DangerSign[] = [
  { sign: 'unable to drink or breastfeed', triggersUrgent: true },
  { sign: 'vomits everything', triggersUrgent: true },
  { sign: 'convulsions', triggersUrgent: true },
  { sign: 'lethargic or unconscious', triggersUrgent: true },
  { sign: 'severe chest indrawing', triggersUrgent: true },
  { sign: 'signs of shock', triggersUrgent: true },
  { sign: 'MUAC below 11.5 cm', triggersUrgent: true },
];

export const DRC_CONDITIONS: Record<string, any> = {
  MALARIA: {
    name: 'Malaria (hyperendemic)',
    symptoms: ['fever', 'chills', 'headache', 'body aches', 'vomiting'],
    protocol: 'RDT + WHO IMCI + Artemisinin',
    notes: 'DRC is hyperendemic. Treat suspected malaria even with negative RDT if strong suspicion.',
  },
  MPOX: {
    name: 'Mpox (Monkeypox)',
    symptoms: ['rash (lesions with central dimpling)', 'fever', 'lymphadenopathy', 'spreading lesions'],
    protocol: 'Visual diagnosis + Isolation',
    notes: 'High transmission in conflict camps. Isolate immediately. Refer for confirmation and contact tracing.',
  },
  SAM: {
    name: 'Severe Acute Malnutrition with complications',
    symptoms: ['MUAC <11.5cm', 'bilateral edema', 'poor appetite', 'weakness'],
    protocol: 'CMAM + Therapeutic Feeding',
    notes: 'Often combined with malaria in DRC. Treat both. Appetite test to determine feeding modality.',
  },
  MEASLES: {
    name: 'Measles',
    symptoms: ['fever', 'cough or coryza', 'conjunctivitis', 'rash spreading cephalocaudal'],
    protocol: 'Case definition + Isolation + Vaccination',
    notes: '82,000+ suspected cases in DRC 2025. Isolate. Refer for confirmation and vaccination campaign notification.',
  },
  CHOLERA: {
    name: 'Cholera / Acute Watery Diarrhea',
    symptoms: ['watery diarrhea', 'vomiting', 'rapid weight loss', 'lethargy'],
    protocol: 'ORS grading + Referral',
    notes: '58,000+ cholera cases recorded in 9 months 2025 DRC. Water/sanitation critical.',
  },
  PNEUMONIA: {
    name: 'Pneumonia (general or severe)',
    symptoms: ['cough', 'fast breathing (tachypnea)', 'chest indrawing', 'fever'],
    protocol: 'IMCI breath count + Amoxicillin or Referral',
    notes: 'Count breaths per minute by age. Fast breathing alone → oral antibiotic. Chest indrawing → REFER.',
  },
};

export const DRC_SYSTEM_PROMPT = `
You are SHIFA, a clinical decision support assistant for community health workers in Eastern DRC.
You operate under WHO IMCI protocols and DRC-specific disease burden.

ABSOLUTE RULES:
1. Support health workers. Do not replace doctors.
2. Default to REFER whenever confidence is below 0.70.
3. For image analysis (rash): state your finding clearly. If unsure, REFER.
4. Respond in Lingala (primary) or French (secondary).
5. Use simple language the CHW can relay to patients.

DRC CONTEXT (May 2026):
- 7 million+ internally displaced
- Hyperendemic malaria — treat all suspected cases
- Mpox outbreak ongoing — isolate immediately
- 82,000+ measles cases in 2025 — vaccination campaigns active
- 58,000+ cholera cases recorded (9 months 2025) — water/sanitation crisis
- Limited referral access in some zones

CRITICAL THRESHOLDS:
- Any rash with fever + cough/coryza/conjunctivitis + spreading pattern → Measles → REFER + notify vaccination team
- Rash with central dimpling + fever + spreading → Mpox → REFER URGENT + isolate
- MUAC <11.5cm → SAM → REFER for therapeutic feeding
- Watery diarrhea + severe dehydration → Cholera → REFER URGENT + ORS en route
- Malaria (suspected or RDT+) + danger signs → REFER for artesunate IV
- Fast breathing alone (no chest indrawing) → Amoxicillin, recheck in 48h
- Chest indrawing → REFER URGENT

Respond in JSON with voice_response in Lingala or French.
`;

export default {
  DRC_DANGER_SIGNS,
  DRC_CONDITIONS,
  DRC_SYSTEM_PROMPT,
};
