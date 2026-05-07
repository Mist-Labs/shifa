/**
 * NORTHERN NIGERIA Protocol Module
 * Hausa-first IDP context with Meningitis Belt escalation rules.
 */

import { DangerSign } from '../types/index.js';

export const NIGERIA_DANGER_SIGNS: DangerSign[] = [
  { sign: 'neck stiffness', triggersUrgent: true },
  { sign: 'bulging fontanelle', triggersUrgent: true },
  { sign: 'photophobia', triggersUrgent: true },
  { sign: 'altered consciousness', triggersUrgent: true },
  { sign: 'unable to drink or breastfeed', triggersUrgent: true },
  { sign: 'vomits everything', triggersUrgent: true },
  { sign: 'convulsions', triggersUrgent: true },
  { sign: 'lethargic or unconscious', triggersUrgent: true },
  { sign: 'MUAC below 11.5 cm or bilateral pitting edema', triggersUrgent: true },
];

export const NIGERIA_CONDITIONS: Record<string, any> = {
  MEN: {
    name: 'Meningococcal Meningitis',
    symptoms: ['fever', 'neck stiffness', 'photophobia', 'bulging fontanelle', 'altered consciousness'],
    protocol: 'Nigeria Meningitis Belt / WHO epidemic meningitis protocol',
    treatment: {
      steps: [
        'Treat fever with meningitis danger signs as an emergency',
        'Give ceftriaxone IM pre-referral if available and protocol-authorized',
        'Refer immediately regardless of apparent improvement',
        'Warn caregiver about seizures, worsening confusion, or breathing difficulty en route',
      ],
      drugDoses: [
        { drug: 'Ceftriaxone', dose: 'requires age and weight confirmation', frequency: 'single pre-referral dose per local protocol' },
      ],
      followUpHours: 0,
      returnTriggers: ['any delay in referral', 'seizure', 'confusion', 'poor feeding'],
    },
  },
  SAM: {
    name: 'Severe Acute Malnutrition',
    symptoms: ['MUAC < 11.5cm', 'bilateral edema', 'visible wasting', 'poor appetite'],
    protocol: 'CMAM / Sphere Standards',
  },
  MAL: { name: 'Malaria (hyperendemic)', symptoms: ['fever', 'chills', 'headache', 'vomiting'] },
  AWD: { name: 'Acute Watery Diarrhea / Cholera', symptoms: ['watery diarrhea', 'vomiting', 'dehydration'] },
  ARI: { name: 'Acute Respiratory Infection', symptoms: ['cough', 'fast breathing', 'chest indrawing'] },
  MEA: { name: 'Measles', symptoms: ['fever', 'rash', 'cough', 'red eyes'] },
  NEO: { name: 'Neonatal Emergency', symptoms: ['unable to feed', 'hypothermia', 'convulsions', 'fast breathing'] },
};

export const NIGERIA_SYSTEM_PROMPT = `
You are SHIFA, a clinical decision support assistant for community health workers in Northern Nigeria.
You operate under WHO IMCI protocols, Sphere Humanitarian Standards, and meningitis belt emergency practice.

ABSOLUTE RULES:
1. You support health workers. You do not replace doctors.
2. Default to REFER whenever confidence is below 0.70.
3. Never prescribe drug doses without confirming patient age and weight.
4. Always list danger signs requiring immediate escalation.
5. Respond ONLY in Hausa. Use simple words the CHW can relay to the patient.
6. Neck stiffness, bulging fontanelle, photophobia, altered consciousness, or convulsions force REFER_URGENT.

NORTHERN NIGERIA CONTEXT:
- IDP communities across Borno, Zamfara, Kaduna, and the Lake Chad Basin
- Priority risks: meningococcal meningitis, SAM, malaria, cholera/AWD, ARI, measles, neonatal danger signs
- Referral may be delayed by insecurity; pre-referral treatment must be conservative and protocol-based

Respond in JSON format with a voiceResponse in Hausa.
`;

export default {
  NIGERIA_DANGER_SIGNS,
  NIGERIA_CONDITIONS,
  NIGERIA_SYSTEM_PROMPT,
};
