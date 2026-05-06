/**
 * SUDAN Protocol Module
 * Top killers: SAM, Cholera, Malaria, ARI, Conflict wounds, Neonatal
 * Based on WHO IMCI adapted for Sudan context (70%+ health facilities non-functional)
 */

import { DangerSign, TreatmentProtocol, ReferralInfo, MonitoringPlan } from '../types/index.js';

export const SUDAN_DANGER_SIGNS: DangerSign[] = [
  { sign: 'unable to drink or breastfeed', triggersUrgent: true },
  { sign: 'vomits everything', triggersUrgent: true },
  { sign: 'convulsions', triggersUrgent: true },
  { sign: 'lethargic or unconscious', triggersUrgent: true },
  { sign: 'stridor at rest', triggersUrgent: true },
  { sign: 'severe chest indrawing', triggersUrgent: true },
  { sign: 'MUAC below 11.5 cm with bilateral pitting edema', triggersUrgent: true },
  { sign: 'signs of shock', triggersUrgent: true },
];

export const SUDAN_CONDITIONS: Record<string, any> = {
  SAM: {
    name: 'Severe Acute Malnutrition',
    symptoms: ['weight loss', 'bilateral edema', 'MUAC < 11.5cm'],
    protocol: 'CMAM / Sphere Standards',
    treatment: {
      steps: [
        'Assess for bilateral pitting edema',
        'Measure MUAC tape',
        'If MUAC 11.5-12.5cm (uncomplicated SAM): distribute RUTF',
        'If MUAC <11.5cm OR edema present: REFER to therapeutic feeding center',
        'Check for infection, fever, poor appetite',
      ],
      drugDoses: [
        { drug: 'RUTF (Plumpy Nut)', dose: '500kcal/day increasing to 2000kcal/day', frequency: 'divided doses' },
      ],
      followUpHours: 336, // 2 weeks
      returnTriggers: ['fever', 'no appetite improvement', 'edema worsening', 'diarrhea onset'],
    },
  },
  CHOLERA: {
    name: 'Cholera / Acute Watery Diarrhea',
    symptoms: ['watery diarrhea', 'vomiting', 'rapid weight loss', 'dry mouth', 'lethargy'],
    protocol: 'WHO ORS Protocol',
    treatment: {
      steps: [
        'Assess dehydration grade (A: no signs, B: some signs, C: severe signs)',
        'If Grade A: ORS Plan A at home',
        'If Grade B: ORS Plan B (clinic or hospital)',
        'If Grade C: REFER IMMEDIATELY for IV fluids',
      ],
      drugDoses: [
        { drug: 'ORS sachets', dose: '50-100mL/kg/day', frequency: 'in small, frequent amounts' },
      ],
      followUpHours: 24,
      returnTriggers: ['inability to drink', 'lethargy', 'sunken eyes', 'ongoing diarrhea >7 days'],
    },
  },
  MALARIA: {
    name: 'Malaria (Darfur endemic)',
    symptoms: ['fever', 'headache', 'body aches', 'chills', 'vomiting'],
    protocol: 'RDT + WHO IMCI Artemisinin',
    treatment: {
      steps: [
        'Perform RDT if available; if negative but high suspicion, treat anyway in endemic areas',
        'If uncomplicated (alert, able to take oral): AL (Artemether-Lumefantrine)',
        'If severe (unconscious, seizures, severe anemia): REFER for artesunate IV',
      ],
      drugDoses: [
        { drug: 'AL (Artemether-Lumefantrine)', dose: 'by body weight (consult chart)', frequency: 'twice daily x 3 days' },
      ],
      followUpHours: 72,
      returnTriggers: ['fever >3 days after treatment', 'inability to take oral', 'worsening lethargy'],
    },
  },
  NEONATAL: {
    name: 'Neonatal Danger Signs',
    symptoms: ['convulsions', 'unable to feed', 'hypothermia', 'fast breathing', 'chest indrawing'],
    protocol: 'IMCI Neonatal Module',
    treatment: {
      steps: [
        'Check for danger signs immediately',
        'If ANY danger sign present: REFER IMMEDIATELY',
        'Do not delay for testing or treatment in field',
      ],
      drugDoses: [],
      followUpHours: 0,
      returnTriggers: [],
    },
  },
};

export const SUDAN_SYSTEM_PROMPT = `
You are SHIFA, a clinical decision support assistant for community health workers in Sudan.
You operate under WHO IMCI protocols and Sudan-specific Sphere Humanitarian Standards.

ABSOLUTE RULES:
1. You support health workers. You do not replace doctors.
2. Default to REFER whenever confidence is below 0.70.
3. Never prescribe drug doses without confirming patient age and weight.
4. Always list danger signs requiring immediate escalation.
5. Respond ONLY in Arabic. Use simple words the CHW can relay to the patient.
6. If uncertain about diagnosis, REFER.

SUDAN CONTEXT:
- 70%+ of health facilities are non-functional (UNICEF Sudan 2025)
- Top killers: SAM, cholera, malaria, conflict wounds, neonatal emergencies
- Many CHWs work in displacement camps or remote areas
- ORS, RUTF, antimalarial drugs, and basic wound care are available
- Referral may take hours or days; consider pre-referral treatment carefully

CRITICAL THRESHOLDS:
- MUAC <11.5cm with bilateral edema → SAM with complications → REFER URGENT
- Watery diarrhea + severe dehydration → REFER URGENT
- Fever + inability to take oral → Possible severe malaria → REFER URGENT
- ANY neonatal danger sign → REFER IMMEDIATE

Respond in JSON format with a voiceResponse in Arabic.
`;

export default {
  SUDAN_DANGER_SIGNS,
  SUDAN_CONDITIONS,
  SUDAN_SYSTEM_PROMPT,
};
