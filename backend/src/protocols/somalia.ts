/**
 * SOMALIA Protocol Module
 * IDP camp / drought + conflict context
 * Top killers: SAM, AWD, Malaria, Neonatal danger signs, Measles, Maternal emergencies
 * Timed with Somalia Community Health Strategy 2025-2029 (launched April 2026)
 */

import { DangerSign } from '../types/index.js';

export const SOMALIA_DANGER_SIGNS: DangerSign[] = [
  { sign: 'unable to drink or breastfeed', triggersUrgent: true },
  { sign: 'vomits everything', triggersUrgent: true },
  { sign: 'convulsions', triggersUrgent: true },
  { sign: 'lethargic or unconscious', triggersUrgent: true },
  { sign: 'stridor at rest', triggersUrgent: true },
  { sign: 'severe chest indrawing', triggersUrgent: true },
  { sign: 'severe dehydration signs', triggersUrgent: true },
  { sign: 'MUAC <11.5cm', triggersUrgent: true },
  { sign: 'signs of shock', triggersUrgent: true },
];

export const SOMALIA_CONDITIONS: Record<string, any> = {
  SAM: {
    name: 'Severe Acute Malnutrition',
    symptoms: ['MUAC <11.5cm', 'bilateral edema', 'poor appetite', 'lethargy'],
    protocol: 'Appetite test + CMAM',
    notes: 'If appetite OK: outpatient RUTF. If no appetite: REFER for inpatient feeding.',
  },
  AWD: {
    name: 'Acute Watery Diarrhea (cholera-suspected)',
    symptoms: ['watery diarrhea', 'vomiting', 'rapid dehydration', 'lethargy'],
    protocol: 'Dehydration grading + ORS Plans A/B/C',
    notes: 'Somalia has ongoing cholera risk. Treat with ORS. Grade C (severe) → REFER URGENT.',
  },
  MALARIA: {
    name: 'Malaria',
    symptoms: ['fever', 'chills', 'headache', 'body aches'],
    protocol: 'RDT + AL or artesunate',
    notes: 'Uncomplicated → AL oral. Severe signs → REFER for artesunate IV.',
  },
  NEONATAL: {
    name: 'Neonatal Danger Signs',
    symptoms: ['convulsions', 'no feeding', 'hypothermia', 'abnormal breathing', 'umbilical infection'],
    protocol: 'IMCI Neonatal Module',
    notes: 'ANY danger sign → REFER IMMEDIATE. Do not delay.',
  },
  MATERNAL: {
    name: 'Maternal Danger Signs (antenatal/postnatal)',
    symptoms: ['heavy vaginal bleeding', 'severe headache + visual disturbance', 'convulsions', 'cord prolapse'],
    protocol: 'REFER EMERGENCY',
    notes: 'Somalia has high maternal mortality. Any danger sign → EMERGENCY referral.',
  },
  MEASLES: {
    name: 'Measles',
    symptoms: ['fever + cough', 'coryza', 'conjunctivitis', 'rash spreading from face'],
    protocol: 'Case definition + Isolation',
    notes: 'Isolate immediately. Refer for confirmation and contact tracing.',
  },
};

export const SOMALIA_SYSTEM_PROMPT = `
You are SHIFA, a clinical decision support assistant for community health workers in Somalia.
You operate under WHO IMCI protocols aligned with Somalia's Community Health Strategy 2025-2029
(launched April 2026).

ABSOLUTE RULES:
1. Support health workers. Do not replace doctors.
2. Default to REFER whenever confidence is below 0.70.
3. Always confirm patient age and weight before drug dosing.
4. Respond ONLY in Somali (primary) or Arabic (secondary).
5. Use simple language the CHW can relay to patients.

SOMALIA CONTEXT (May 2026):
- IDP camps around Mogadishu, Baidoa, Kismayo
- Ongoing cholera risk due to poor sanitation
- High maternal and neonatal mortality
- Somalia just launched national CHW Strategy 2025-2029
- Al-Shabaab controls some territory
- Climate + conflict displacement compounding

CRITICAL THRESHOLDS:
- MUAC <11.5cm: appetite test. If appetite OK → RUTF outpatient. If no appetite → REFER
- Watery diarrhea + severe dehydration signs (lethargy, sunken eyes) → REFER URGENT + ORS
- Malaria confirmed (RDT+) + danger signs → REFER for artesunate IV
- ANY neonatal danger sign → REFER IMMEDIATE
- ANY maternal danger sign → EMERGENCY referral (heavy bleeding, severe headache + vision changes, seizures)
- Measles suspected → REFER + isolate + notify vaccination team

Respond in JSON with voice_response in Somali or Arabic.
`;

export default {
  SOMALIA_DANGER_SIGNS,
  SOMALIA_CONDITIONS,
  SOMALIA_SYSTEM_PROMPT,
};
