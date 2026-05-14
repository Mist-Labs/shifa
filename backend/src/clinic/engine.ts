import {
  ConsultationRequest,
  ClinicalDecisionResponse,
  ClinicalDecision,
  PatientData,
  Language,
  ReferralUrgency,
} from '../types/index.js';
import { getSystemPrompt, getDangerSigns } from '../protocols/manager.js';
import { ClinicalAiUnavailableError, GoogleClinicalAi } from '../ai/engine.js';

type RuleDecision = Omit<
  ClinicalDecisionResponse,
  'id' | 'confidence' | 'dangerSigns' | 'reasoningTrace' | 'voiceResponse'
>;

const CLINICAL_SYNONYMS: Record<string, string[]> = {
  unable_to_drink: ['unable to drink', 'cannot drink', 'not drinking', 'unable to breastfeed', 'not breastfeeding', 'refuses breast'],
  vomits_everything: ['vomits everything', 'keeps vomiting', 'vomiting everything', 'cannot keep fluids'],
  convulsions: ['convulsion', 'convulsions', 'seizure', 'seizures', 'fits'],
  lethargy: ['lethargic', 'unconscious', 'very weak', 'not waking', 'drowsy'],
  stridor: ['stridor', 'noisy breathing at rest'],
  chest_indrawing: ['severe chest indrawing', 'chest indrawing', 'ribs pulling in'],
  shock: ['shock', 'cold clammy', 'rapid weak pulse', 'very cold hands', 'very cold feet'],
  bleeding: ['heavy bleeding', 'bleeding cannot be controlled', 'postpartum bleeding', 'vaginal bleeding'],
  pregnancy_headache: ['severe headache with visual disturbance', 'blurred vision in pregnancy', 'vision changes in pregnancy'],
  cord_prolapse: ['cord prolapse'],
  meningitis: ['neck stiffness', 'stiff neck', 'photophobia', 'bulging fontanelle', 'altered consciousness'],
};

export class ClinicalEngine {
  private readonly clinicalAi?: GoogleClinicalAi;

  constructor(clinicalAi?: GoogleClinicalAi) {
    this.clinicalAi = clinicalAi ?? this.createConfiguredAi();
  }

  async processConsultation(request: ConsultationRequest): Promise<ClinicalDecisionResponse> {
    const { patient, symptomText, country, language, imagePath } = request;

    // Get country-specific protocols
    const systemPrompt = getSystemPrompt(country, language);
    const dangerSigns = getDangerSigns(country);

    const matchedDangerSigns = this.checkDangerSigns(symptomText, dangerSigns, patient);
    const preliminary = await this.decide(patient, symptomText, country, request);
    const confidence = this.calculateConfidence(symptomText, patient, imagePath);
    const decision = this.applySafetyOverrides(preliminary, confidence, matchedDangerSigns.length > 0);

    // Build response
    const response: ClinicalDecisionResponse = {
      id: `d-${Date.now()}`,
      decision: decision.decision,
      primaryDiagnosis: decision.primaryDiagnosis,
      differentialDiagnoses: decision.differentialDiagnoses,
      confidence: confidence,
      dangerSigns: matchedDangerSigns,
      reasoningTrace: [
        this.clinicalAi ? '[Google clinical AI + SHIFA protocol safety layer]' : '[SHIFA offline protocol safety layer]',
        `System prompt loaded: ${systemPrompt.split('\n').find((line) => line.trim().startsWith('You are SHIFA'))?.trim() || 'SHIFA clinical prompt'}`,
        `Country=${country}; language=${language}; symptoms="${symptomText}".`,
        `Patient age=${patient.ageMonths ?? 'unknown'}mo; weight=${patient.weightKg ?? 'unknown'}kg; MUAC=${patient.muacCm ?? 'unknown'}cm; edema=${patient.bilateralEdema ?? 'unknown'}.`,
        matchedDangerSigns.length > 0 ? `Danger sign override: ${matchedDangerSigns.map((d) => d.sign).join(', ')}.` : 'No explicit danger sign override matched.',
        confidence < 0.7 ? 'Confidence below 0.70, defaulted to referral per SHIFA safety rule.' : 'Confidence meets SHIFA protocol threshold.',
      ].join(' '),
      voiceResponse: this.buildVoiceResponse(decision, language),
      treatment: decision.treatment,
      referral: decision.referral,
      monitoring: decision.monitoring || undefined,
      imageAnalysis: imagePath
        ? {
            finding: this.clinicalAi
              ? 'Image metadata accepted by backend; field image inference is performed by the mobile LiteRT Gemma vision runtime.'
              : 'Image requires the mobile LiteRT Gemma vision runtime for pixel-level interpretation.',
            confidence: this.clinicalAi ? 0.7 : 0.4,
            recommendation: 'If visual interpretation is unavailable or uncertain, use the SHIFA safety rule: REFER.',
          }
        : undefined,
    };

    return response;
  }

  private async decide(
    patient: PatientData,
    symptoms: string,
    country: string,
    request: ConsultationRequest
  ): Promise<RuleDecision> {
    const protocolDecision = this.decideBasedOnRules(patient, symptoms, country);
    if (!this.clinicalAi) return protocolDecision;

    try {
      const aiResult = await this.clinicalAi.consult(request);
      return {
        decision: aiResult.response.decision,
        primaryDiagnosis: aiResult.response.primaryDiagnosis,
        differentialDiagnoses: aiResult.response.differentialDiagnoses,
        treatment: aiResult.response.treatment,
        referral: aiResult.response.referral,
        monitoring: aiResult.response.monitoring,
        imageAnalysis: aiResult.response.imageAnalysis,
      };
    } catch {
      return protocolDecision;
    }
  }

  private createConfiguredAi(): GoogleClinicalAi | undefined {
    try {
      return new GoogleClinicalAi();
    } catch (error) {
      if (error instanceof ClinicalAiUnavailableError) return undefined;
      throw error;
    }
  }

  private decideBasedOnRules(patient: PatientData, symptoms: string, country: string): RuleDecision {
    const symLower = symptoms.toLowerCase();
    const muac = patient.muacCm;
    const edema = patient.bilateralEdema === true;
    const severeDehydration = this.includesAny(symLower, ['lethargic', 'unconscious', 'sunken eyes', 'unable to drink', 'skin pinch very slow', 'shock']);
    const hasFever = this.includesAny(symLower, ['fever', 'hot body', 'high temperature']);
    const hasRash = this.includesAny(symLower, ['rash', 'lesion', 'blister', 'spots']);
    const hasRespiratory = this.includesAny(symLower, ['cough', 'fast breathing', 'difficulty breathing', 'chest indrawing', 'pneumonia']);
    const hasMeningitisSign = this.includesAny(symLower, CLINICAL_SYNONYMS.meningitis);

    // SAM detection (any country)
    if ((muac !== undefined && muac < 11.5) || edema) {
      const urgent = edema || this.includesAny(symLower, ['poor appetite', 'not eating', 'lethargic', 'diarrhea', 'fever']);
      return {
        decision: urgent ? 'REFER_URGENT' : 'REFER_ROUTINE',
        primaryDiagnosis: urgent ? 'Severe Acute Malnutrition with Complications' : 'Severe Acute Malnutrition',
        differentialDiagnoses: ['Protein-energy malnutrition', 'Infection secondary to malnutrition'],
        referral: this.referral(
          urgent ? 'IMMEDIATE' : 'WITHIN_24H',
          'Therapeutic Feeding Center / Hospital',
          ['Keep child warm', 'Give ORS if diarrhea and able to drink', 'Give RUTF only if alert and able to swallow'],
          `${urgent ? 'Complicated' : 'Severe'} acute malnutrition. MUAC ${muac ?? 'not measured'}cm. Bilateral edema: ${edema ? 'yes' : 'no'}.`,
          ['Convulsions', 'Unconsciousness', 'Inability to drink', 'Severe diarrhea']
        ),
        treatment: urgent ? undefined : {
          steps: [
            'Perform appetite test if safe',
            'Give RUTF according to local CMAM schedule',
            'Recheck weight, edema, and MUAC at follow-up',
          ],
          followUpHours: 168,
          returnTriggers: ['poor appetite', 'edema appears or worsens', 'fever', 'diarrhea'],
        },
      };
    }

    if (muac !== undefined && muac >= 11.5 && muac < 12.5) {
      return {
        decision: 'TREAT',
        primaryDiagnosis: 'Moderate Acute Malnutrition',
        differentialDiagnoses: ['Early severe acute malnutrition', 'Chronic undernutrition'],
        treatment: {
          steps: ['Provide nutrition counseling', 'Give supplementary/RUTF ration if available', 'Repeat MUAC at follow-up'],
          followUpHours: 168,
          returnTriggers: ['MUAC falls below 11.5cm', 'bilateral edema', 'poor appetite', 'fever or diarrhea'],
        },
      };
    }

    if (country === 'nigeria' && hasFever && hasMeningitisSign) {
      return {
        decision: 'REFER_URGENT',
        primaryDiagnosis: 'Suspected Meningococcal Meningitis',
        differentialDiagnoses: ['Cerebral malaria', 'Sepsis', 'Meningitis'],
        referral: this.referral(
          'IMMEDIATE',
          'Hospital / meningitis treatment facility',
          ['Give ceftriaxone IM only if available, authorized, and age/weight are confirmed', 'Keep patient cool and protected during transport'],
          'Northern Nigeria meningitis belt danger signs: fever with neck stiffness, photophobia, bulging fontanelle, or altered consciousness. Immediate referral required.',
          ['Convulsions', 'Worsening confusion', 'Unconsciousness', 'Breathing difficulty']
        ),
      };
    }

    // Cholera / AWD detection
    if (this.includesAny(symLower, ['diarrhea', 'diarrhoea', 'watery stool', 'acute watery', 'cholera'])) {
      return {
        decision: severeDehydration ? 'REFER_URGENT' : 'TREAT',
        primaryDiagnosis: 'Acute Watery Diarrhea (possible cholera)',
        differentialDiagnoses: ['Viral gastroenteritis', 'Bacterial infection', 'Cholera'],
        treatment: severeDehydration ? undefined : {
          steps: [
            'Assess dehydration: pinch skin, eyes, drinking',
            'If able to drink: give ORS frequently, small amounts',
            'If unable or severe: REFER',
          ],
          drugDoses: [
            { drug: 'ORS', dose: '50-100mL/kg over 4 hours', frequency: 'small frequent amounts' },
          ],
          followUpHours: 24,
          returnTriggers: ['inability to drink', 'persistent diarrhea >7 days', 'fever'],
        },
        referral: severeDehydration
          ? this.referral('IMMEDIATE', 'Cholera treatment center / Hospital', ['ORS en route if able to drink', 'Keep warm'], 'Acute watery diarrhea with severe dehydration signs.', ['Signs of shock', 'Inability to drink', 'Lethargy'])
          : undefined,
      };
    }

    if (country === 'drc' && hasRash) {
      const measlesLike = hasFever && this.includesAny(symLower, ['cough', 'coryza', 'runny nose', 'conjunctivitis', 'red eyes']);
      const mpoxLike = this.includesAny(symLower, ['central dimpling', 'umbilicated', 'lymph node', 'lymphadenopathy', 'painful lesions']);
      return {
        decision: 'REFER_URGENT',
        primaryDiagnosis: mpoxLike ? 'Mpox suspected' : measlesLike ? 'Measles suspected' : 'Rash illness requiring visual confirmation',
        differentialDiagnoses: ['Mpox', 'Measles', 'Chickenpox', 'Bacterial skin infection'],
        referral: this.referral(
          mpoxLike ? 'WITHIN_6H' : 'WITHIN_24H',
          'Isolation-capable clinic',
          ['Isolate patient', 'Avoid touching lesions', 'Use mask/hand hygiene if available'],
          'Rash illness in Eastern DRC. Needs confirmation and public health notification.',
          ['Breathing difficulty', 'Lethargy', 'Dehydration', 'Rash near eyes']
        ),
      };
    }

    if (hasRespiratory) {
      const severe = this.includesAny(symLower, ['chest indrawing', 'stridor', 'unable to drink', 'cyanosis', 'blue lips']);
      return {
        decision: severe ? 'REFER_URGENT' : 'TREAT',
        primaryDiagnosis: severe ? 'Severe Pneumonia / Respiratory Danger Sign' : 'Pneumonia or acute respiratory infection',
        differentialDiagnoses: ['Pneumonia', 'Malaria with respiratory distress', 'Viral respiratory infection'],
        treatment: severe ? undefined : {
          steps: ['Count respiratory rate for one full minute', 'Give amoxicillin only after confirming age and weight', 'Recheck in 48 hours'],
          drugDoses: patient.ageMonths && patient.weightKg
            ? [{ drug: 'Amoxicillin', dose: 'Use national IMCI weight-band dose', frequency: 'twice daily x5 days' }]
            : undefined,
          followUpHours: 48,
          returnTriggers: ['chest indrawing', 'stridor', 'unable to drink', 'worsening fever'],
        },
        referral: severe ? this.referral('IMMEDIATE', 'Hospital / respiratory care facility', ['Keep airway clear', 'Keep child warm'], 'Severe respiratory danger sign.', ['Unable to drink', 'Worsening breathing', 'Unconsciousness']) : undefined,
      };
    }

    // Fever (malaria)
    if (hasFever) {
      const severe = this.includesAny(symLower, ['convulsion', 'unconscious', 'unable to drink', 'vomits everything', 'severe anemia', 'dark urine']);
      return {
        decision: severe ? 'REFER_URGENT' : 'TREAT',
        primaryDiagnosis: 'Suspected Malaria (RDT confirmation recommended)',
        differentialDiagnoses: ['Typhoid', 'Measles', 'Other febrile illness'],
        treatment: severe ? undefined : {
          steps: [
            'If RDT available: perform test',
            'If positive or strong suspicion in endemic area: start AL',
            'Confirm age and weight for dosing',
          ],
          drugDoses: [
            { drug: 'AL (Artemether-Lumefantrine)', dose: 'by weight (consult table)', frequency: 'twice daily x3 days' },
          ],
          followUpHours: 72,
          returnTriggers: ['fever persists >3 days after treatment', 'inability to take oral'],
        },
        referral: severe ? this.referral('IMMEDIATE', 'Hospital / malaria treatment facility', ['Treat fever', 'Give sugar water if alert and hypoglycemia suspected'], 'Possible severe malaria with danger signs. Needs injectable artesunate assessment.', ['Convulsions', 'Unconsciousness', 'Shock']) : undefined,
      };
    }

    if (country === 'somalia' && this.includesAny(symLower, ['pregnant', 'pregnancy', 'postpartum', 'delivery', 'cord prolapse'])) {
      return {
        decision: 'REFER_URGENT',
        primaryDiagnosis: 'Maternal danger sign',
        differentialDiagnoses: ['Postpartum hemorrhage', 'Pre-eclampsia/eclampsia', 'Obstructed labor'],
        referral: this.referral('IMMEDIATE', 'Emergency obstetric care facility', ['Keep patient lying on left side if possible', 'Do not delay transport'], 'Maternal danger sign in Somalia IDP/camp context.', ['Heavy bleeding', 'Convulsions', 'Loss of consciousness']),
      };
    }

    // Default: monitor
    return {
      decision: 'MONITOR',
      primaryDiagnosis: 'Condition requires monitoring',
      differentialDiagnoses: [],
      treatment: {
        steps: ['Monitor at home', 'Return if symptoms worsen'],
        drugDoses: [],
        followUpHours: 48,
        returnTriggers: ['fever >38.5°C', 'worsening symptoms', 'inability to take fluids'],
      },
      monitoring: {
        watchSigns: ['fever', 'difficulty breathing'],
        returnIf: ['fever >38.5°C', 'worsening symptoms'],
        homeCare: ['rest', 'fluids'],
        recheckHours: 48,
      },
    };
  }

  private applySafetyOverrides(decision: RuleDecision, confidence: number, hasDangerSign: boolean): RuleDecision {
    if (hasDangerSign && decision.decision !== 'REFER_URGENT') {
      return {
        ...decision,
        decision: 'REFER_URGENT',
        referral: decision.referral || this.referral('IMMEDIATE', 'Nearest hospital / emergency facility', ['Keep patient warm', 'Continue ORS only if alert and able to drink'], 'Universal danger sign detected. Immediate referral required.', ['Worsening consciousness', 'Convulsions', 'Shock']),
        monitoring: undefined,
      };
    }

    if (confidence < 0.7 && !decision.decision.startsWith('REFER')) {
      return {
        ...decision,
        decision: 'REFER_ROUTINE',
        referral: this.referral('WITHIN_24H', 'Nearest health facility', decision.treatment?.steps.slice(0, 2) || [], 'SHIFA confidence below 0.70. Facility assessment requested.', ['Any danger sign', 'Worsening symptoms']),
        monitoring: undefined,
      };
    }

    return decision;
  }

  private checkDangerSigns(symptoms: string, dangerSigns: any[], patient: PatientData) {
    const symLower = symptoms.toLowerCase();
    const matches = dangerSigns
      .filter((ds) => this.matchesDangerSign(symLower, ds.sign, patient))
      .map((ds) => ({ sign: ds.sign, triggersUrgent: ds.triggersUrgent }));

    if (patient.muacCm !== undefined && patient.muacCm < 11.5 && patient.bilateralEdema && !matches.some((m) => m.sign.includes('MUAC'))) {
      matches.push({ sign: 'MUAC below 11.5 cm with bilateral pitting edema', triggersUrgent: true });
    }

    return matches;
  }

  private matchesDangerSign(symptoms: string, sign: string, patient: PatientData): boolean {
    const signLower = sign.toLowerCase();
    if (symptoms.includes(signLower)) return true;
    if (signLower.includes('muac') && patient.muacCm !== undefined && patient.muacCm < 11.5) return true;

    const synonymGroups: string[][] = [];
    if (signLower.includes('drink') || signLower.includes('breastfeed')) synonymGroups.push(CLINICAL_SYNONYMS.unable_to_drink);
    if (signLower.includes('vomit')) synonymGroups.push(CLINICAL_SYNONYMS.vomits_everything);
    if (signLower.includes('convulsion')) synonymGroups.push(CLINICAL_SYNONYMS.convulsions);
    if (signLower.includes('lethargic') || signLower.includes('unconscious')) synonymGroups.push(CLINICAL_SYNONYMS.lethargy);
    if (signLower.includes('stridor')) synonymGroups.push(CLINICAL_SYNONYMS.stridor);
    if (signLower.includes('chest indrawing')) synonymGroups.push(CLINICAL_SYNONYMS.chest_indrawing);
    if (signLower.includes('shock')) synonymGroups.push(CLINICAL_SYNONYMS.shock);
    if (signLower.includes('bleeding')) synonymGroups.push(CLINICAL_SYNONYMS.bleeding);
    if (signLower.includes('headache') || signLower.includes('visual')) synonymGroups.push(CLINICAL_SYNONYMS.pregnancy_headache);
    if (signLower.includes('cord prolapse')) synonymGroups.push(CLINICAL_SYNONYMS.cord_prolapse);
    if (signLower.includes('neck stiffness') || signLower.includes('fontanelle') || signLower.includes('photophobia') || signLower.includes('consciousness')) {
      synonymGroups.push(CLINICAL_SYNONYMS.meningitis);
    }

    return synonymGroups.some((terms) => terms.some((term) => symptoms.includes(term)));
  }

  private calculateConfidence(symptoms: string, patient: PatientData, imagePath?: string): number {
    let confidence = 0.6; // baseline
    if (symptoms.trim().length > 50) confidence += 0.1;
    if (patient.ageMonths && patient.weightKg) confidence += 0.15;
    if (patient.muacCm) confidence += 0.1;
    if (patient.bilateralEdema !== undefined) confidence += 0.05;
    if (imagePath) confidence -= 0.1;
    return Math.min(confidence, 0.95);
  }

  private buildVoiceResponse(decision: RuleDecision, language: Language): string {
    const urgent = decision.decision === 'REFER_URGENT';
    const routineRefer = decision.decision === 'REFER_ROUTINE';
    const responseMap: Record<Language, string> = {
      en: urgent
        ? `Refer the patient now. Reason: ${decision.primaryDiagnosis}. Watch for danger signs during transport.`
        : routineRefer
          ? `The patient should be assessed at the nearest health facility. Reason: ${decision.primaryDiagnosis}.`
          : `Plan: ${decision.primaryDiagnosis}. Follow the steps and return immediately if danger signs appear.`,
      ar: urgent
        ? `يجب تحويل المريض الآن. السبب: ${decision.primaryDiagnosis}. راقب علامات الخطر أثناء الطريق.`
        : routineRefer
          ? `يحتاج المريض إلى مراجعة أقرب مركز صحي. السبب: ${decision.primaryDiagnosis}.`
          : `الخطة: ${decision.primaryDiagnosis}. اتبع الخطوات وارجع فوراً إذا ظهرت علامات الخطر.`,
      so: urgent
        ? `Bukaanka hadda u gudbi xarun caafimaad. Sabab: ${decision.primaryDiagnosis}.`
        : routineRefer
          ? `Bukaanku wuxuu u baahan yahay qiimeyn xarun caafimaad. Sabab: ${decision.primaryDiagnosis}.`
          : `Qorshaha: ${decision.primaryDiagnosis}. Raac tallaabooyinka, kana soo celi haddii xaaladdu xumaato.`,
      fr: urgent
        ? `Référez le patient maintenant. Motif: ${decision.primaryDiagnosis}. Surveillez les signes de danger pendant le trajet.`
        : routineRefer
          ? `Le patient doit être vu dans un centre de santé. Motif: ${decision.primaryDiagnosis}.`
          : `Plan: ${decision.primaryDiagnosis}. Suivez les étapes et revenez si un signe de danger apparaît.`,
      ln: urgent
        ? `Tinda moto ya maladi sikoyo na lopital. Ntina: ${decision.primaryDiagnosis}.`
        : routineRefer
          ? `Moto ya maladi asengeli komonana na centre de santé. Ntina: ${decision.primaryDiagnosis}.`
          : `Mwango: ${decision.primaryDiagnosis}. Landa matambe mpe zonga soki bilembo ya likama ebimi.`,
      rw: urgent
        ? `Ohereza umurwayi kwa muganga ako kanya. Impamvu: ${decision.primaryDiagnosis}.`
        : routineRefer
          ? `Umurwayi akeneye gusuzumwa ku kigo nderabuzima. Impamvu: ${decision.primaryDiagnosis}.`
          : `Gahunda: ${decision.primaryDiagnosis}. Kurikiza intambwe, agaruke nibiba bibi.`,
      ha: urgent
        ? `A tura mara lafiya asibiti yanzu. Dalili: ${decision.primaryDiagnosis}. A kula da alamomin hadari a hanya.`
        : routineRefer
          ? `Mara lafiya yana bukatar a duba shi a cibiyar lafiya. Dalili: ${decision.primaryDiagnosis}.`
          : `Tsari: ${decision.primaryDiagnosis}. Bi matakan, a dawo nan take idan alamar hadari ta bayyana.`,
    };
    return responseMap[language] || 'Refer patient to nearest facility.';
  }

  private referral(
    urgency: ReferralUrgency,
    facilityType: string,
    preReferralTreatment: string[],
    messageForFacility: string,
    dangerSignsEnRoute: string[]
  ) {
    return {
      urgency,
      facilityType,
      preReferralTreatment,
      messageForFacility,
      dangerSignsEnRoute,
    };
  }

  private includesAny(value: string, terms: string[]): boolean {
    return terms.some((term) => value.includes(term));
  }
}

export default ClinicalEngine;
