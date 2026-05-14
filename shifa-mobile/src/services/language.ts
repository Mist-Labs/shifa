import type { ClinicalDecision } from './caseLog';

export type ShifaLanguage = 'en' | 'ar' | 'so' | 'fr' | 'ln' | 'rw' | 'ha';

const FALLBACK_LANGUAGE: ShifaLanguage = 'en';

export const LANGUAGE_LABELS: Record<ShifaLanguage, string> = {
  en: 'English',
  ar: 'Arabic',
  so: 'Somali',
  fr: 'French',
  ln: 'Lingala',
  rw: 'Kinyarwanda',
  ha: 'Hausa',
};

const PROMPT_LANGUAGE_NAMES: Record<ShifaLanguage, string> = {
  en: 'English',
  ar: 'Arabic',
  so: 'Somali',
  fr: 'French',
  ln: 'Lingala',
  rw: 'Kinyarwanda',
  ha: 'Hausa',
};

const TTS_LOCALES: Record<ShifaLanguage, string> = {
  en: 'en',
  ar: 'ar',
  so: 'so',
  fr: 'fr',
  ln: 'fr',
  rw: 'rw',
  ha: 'ha',
};

type TextPack = {
  cloudFallbackNotice: string;
  safetyProtocolTitle: string;
  safetyApplied: (reason: string) => string;
  referralSafetyMessage: (diagnosis: string, reason: string) => string;
  guardrailReasons: Record<string, string>;
  decisionLabels: Record<'REFER_URGENT' | 'REFER_ROUTINE' | 'TREAT', string>;
  triageLabels: Record<'urgent' | 'routine' | 'treat', string>;
  sectionLabels: Record<'beforeYouGo' | 'referralSteps' | 'treatmentSteps' | 'dangerEnRoute' | 'returnIfYouSee', string>;
  metricLabels: Record<'decision' | 'audio' | 'report' | 'engine' | 'attached' | 'none' | 'saved' | 'notSaved' | 'confidence' | 'dangerSigns', string>;
  engineLabels: Record<'local_model' | 'cloud_fallback' | 'protocol_fallback' | 'default', string>;
  resultVoiceTitle: string;
  speak: string;
  stop: string;
  recordingUnavailableTitle: string;
  recordingUnavailableMessage: string;
  protocol: {
    urgentDiagnosis: string;
    dangerDiagnosis: string;
    respiratoryDiagnosis: string;
    diarrheaDiagnosis: string;
    malariaDiagnosis: string;
    feverDiagnosis: string;
    malnutritionDiagnosis: string;
    minorDiagnosis: string;
    urgentSummary: string;
    treatMonitor: string;
    hydrateSummary: string;
    feverSummary: string;
    nutritionSummary: string;
    safeSummary: string;
    urgentVoice: string;
    respiratoryVoice: string;
    diarrheaVoice: string;
    feverVoice: string;
    nutritionVoice: string;
    safeVoice: string;
    dangerSigns: Record<string, string>;
    treatmentSteps: Record<string, string>;
    returnInstructions: Record<string, string>;
    referralMessages: Record<string, string>;
  };
};

const TEXT: Record<ShifaLanguage, TextPack> = {
  en: {
    cloudFallbackNotice: 'Cloud fallback was unavailable; deterministic SHIFA safety rules were applied.',
    safetyProtocolTitle: 'Safety protocol applied',
    safetyApplied: (reason) => `Safety protocol applied: ${reason}.`,
    referralSafetyMessage: (diagnosis, reason) => `${diagnosis}. Safety protocol applied: ${reason}.`,
    guardrailReasons: {
      'Bilateral edema': 'Bilateral edema',
      'Neonatal feeding danger': 'Neonatal feeding danger',
      'Neonatal breathing danger': 'Neonatal breathing danger',
      'Newborn feeding danger': 'Newborn feeding danger',
      'Sexual violence survivor': 'Sexual violence survivor',
      'Maternal danger sign': 'Maternal danger sign',
      Eclampsia: 'Eclampsia',
      Convulsions: 'Convulsions',
      'Meningitis sign': 'Meningitis sign',
      'Severe chest indrawing': 'Severe chest indrawing',
      'Altered consciousness': 'Altered consciousness',
      'Lethargic and unable to drink': 'Lethargic and unable to drink',
      'Unable to drink': 'Unable to drink',
      'Severe acute malnutrition': 'Severe acute malnutrition',
      'Severe pneumonia': 'Severe pneumonia',
      Meningitis: 'Meningitis',
      'Measles suspected without emergency danger signs': 'Measles suspected without emergency danger signs',
    },
    decisionLabels: { REFER_URGENT: 'REFER URGENT', REFER_ROUTINE: 'REFER ROUTINE', TREAT: 'TREAT' },
    triageLabels: { urgent: 'Urgent referral', routine: 'Routine referral', treat: 'Treat here' },
    sectionLabels: {
      beforeYouGo: 'BEFORE YOU GO',
      referralSteps: 'REFERRAL STEPS',
      treatmentSteps: 'TREATMENT STEPS',
      dangerEnRoute: 'DANGER SIGNS EN ROUTE',
      returnIfYouSee: 'RETURN IF YOU SEE:',
    },
    metricLabels: {
      decision: 'Decision',
      audio: 'Audio',
      report: 'Report',
      engine: 'Engine',
      confidence: 'Confidence',
      dangerSigns: 'danger signs',
      attached: 'Attached',
      none: 'None',
      saved: 'Saved',
      notSaved: 'Not saved',
    },
    engineLabels: {
      local_model: 'Offline model',
      cloud_fallback: 'Cloud fallback',
      protocol_fallback: 'Protocol rules',
      default: 'Clinical engine',
    },
    resultVoiceTitle: 'Voice guidance',
    speak: 'Speak',
    stop: 'Stop',
    recordingUnavailableTitle: 'No recording available',
    recordingUnavailableMessage: 'Record consultation audio before using Listen.',
    protocol: {
      urgentDiagnosis: 'Severe Acute Malnutrition with complications',
      dangerDiagnosis: 'Clinical danger sign',
      respiratoryDiagnosis: 'Mild Respiratory Infection',
      diarrheaDiagnosis: 'Acute watery diarrhea',
      malariaDiagnosis: 'Uncomplicated malaria or febrile illness',
      feverDiagnosis: 'Febrile illness',
      malnutritionDiagnosis: 'Moderate or uncomplicated acute malnutrition',
      minorDiagnosis: 'Minor illness or non-urgent symptoms',
      urgentSummary: 'Act now',
      treatMonitor: 'Treat and monitor',
      hydrateSummary: 'Treat and monitor hydration',
      feverSummary: 'Treat here and monitor danger signs',
      nutritionSummary: 'Nutrition support and follow-up',
      safeSummary: 'Safe to assess here',
      urgentVoice: 'Urgent referral required. Keep the patient safe during transport.',
      respiratoryVoice: 'Monitor at home. Recheck breathing in twenty four hours.',
      diarrheaVoice: 'Give oral rehydration solution and monitor closely for dehydration danger signs.',
      feverVoice: 'Treat according to fever protocol and return immediately if danger signs appear.',
      nutritionVoice: 'Provide nutrition support and monitor for severe malnutrition danger signs.',
      safeVoice: 'No urgent danger sign detected. Continue assessment and review return precautions.',
      dangerSigns: {
        Convulsions: 'Convulsions',
        'Altered consciousness': 'Altered consciousness',
        'Breathing stops': 'Breathing stops',
        'Unable to drink': 'Unable to drink',
        Lethargy: 'Lethargy',
        'Bilateral pitting edema': 'Bilateral pitting edema',
        'MUAC below 11.5cm': 'MUAC below 11.5cm',
        'Fast breathing develops': 'Fast breathing develops',
        'Refuses all food or drink': 'Refuses all food or drink',
        'Blood in stool': 'Blood in stool',
        'Repeated vomiting': 'Repeated vomiting',
        'Persistent vomiting': 'Persistent vomiting',
        'Worsening headache or stiff neck': 'Worsening headache or stiff neck',
        'Poor appetite with illness': 'Poor appetite with illness',
        'Breathing difficulty': 'Breathing difficulty',
      },
      treatmentSteps: {
        'Give RUTF only if alert and able to swallow': 'Give RUTF only if alert and able to swallow',
        'Keep warm during transport': 'Keep warm during transport',
        'Refer immediately for inpatient assessment': 'Refer immediately for inpatient assessment',
        'Keep patient safe and positioned for transport': 'Keep patient safe and positioned for transport',
        'Do not give oral medicine if unconscious or unable to swallow': 'Do not give oral medicine if unconscious or unable to swallow',
        'Refer immediately for emergency assessment': 'Refer immediately for emergency assessment',
        'Give fluids frequently': 'Give fluids frequently',
        'Continue breastfeeding': 'Continue breastfeeding',
        'Keep child warm and rested': 'Keep child warm and rested',
        'Give ORS frequently after each loose stool': 'Give ORS frequently after each loose stool',
        'Continue feeding and breastfeeding': 'Continue feeding and breastfeeding',
        'Give zinc if age-appropriate per local protocol': 'Give zinc if age-appropriate per local protocol',
        'Use national fever or malaria protocol before giving medicine': 'Use national fever or malaria protocol before giving medicine',
        'Give fluids and keep the patient comfortable': 'Give fluids and keep the patient comfortable',
        'Confirm MUAC and weight': 'Confirm MUAC and weight',
        'Provide nutrition counselling or RUTF per local protocol': 'Provide nutrition counselling or RUTF per local protocol',
        'Schedule follow-up measurement': 'Schedule follow-up measurement',
        'Assess with the local symptom protocol': 'Assess with the local symptom protocol',
        'Give supportive care and explain return precautions': 'Give supportive care and explain return precautions',
      },
      returnInstructions: {
        'Keep child warm during transport': 'Keep child warm during transport',
        'Send referral card with caregiver': 'Send referral card with caregiver',
        'Recheck in 24 hours': 'Recheck in 24 hours',
        'Return immediately if breathing worsens': 'Return immediately if breathing worsens',
        'Return immediately if any danger sign appears': 'Return immediately if any danger sign appears',
        'Recheck if diarrhea continues or dehydration worsens': 'Recheck if diarrhea continues or dehydration worsens',
        'Recheck in 24 hours if fever persists': 'Recheck in 24 hours if fever persists',
        'Refer urgently if edema or low MUAC appears': 'Refer urgently if edema or low MUAC appears',
        'Recheck nutrition status at follow-up': 'Recheck nutrition status at follow-up',
        'Log case before leaving': 'Log case before leaving',
      },
      referralMessages: {
        sam: 'SAM with complications. Bilateral edema or MUAC below urgent threshold.',
        danger: 'Emergency danger sign observed.',
      },
    },
  },
  fr: {
    cloudFallbackNotice: 'Le recours cloud etait indisponible; les regles de securite SHIFA ont ete appliquees.',
    safetyProtocolTitle: 'Protocole de securite applique',
    safetyApplied: (reason) => `Protocole de securite applique : ${reason}.`,
    referralSafetyMessage: (diagnosis, reason) => `${diagnosis}. Protocole de securite applique : ${reason}.`,
    guardrailReasons: {
      'Bilateral edema': 'Oedeme bilateral',
      'Neonatal feeding danger': 'Danger neonatal: alimentation impossible',
      'Neonatal breathing danger': 'Danger neonatal: respiration rapide',
      'Newborn feeding danger': 'Nouveau-ne qui ne tete pas',
      'Sexual violence survivor': 'Survivant de violence sexuelle',
      'Maternal danger sign': 'Signe de danger maternel',
      Eclampsia: 'Eclampsie',
      Convulsions: 'Convulsions',
      'Meningitis sign': 'Signe de meningite',
      'Severe chest indrawing': 'Tirage thoracique severe',
      'Altered consciousness': 'Alteration de conscience',
      'Lethargic and unable to drink': 'Lethargique et incapable de boire',
      'Unable to drink': 'Incapable de boire',
      'Severe acute malnutrition': 'Malnutrition aigue severe',
      'Severe pneumonia': 'Pneumonie severe',
      Meningitis: 'Meningite',
      'Measles suspected without emergency danger signs': 'Suspicion de rougeole sans signe de danger urgent',
    },
    decisionLabels: { REFER_URGENT: 'REFERER URGENT', REFER_ROUTINE: 'REFERER', TREAT: 'TRAITER' },
    triageLabels: { urgent: 'Reference urgente', routine: 'Reference de routine', treat: 'Traiter ici' },
    sectionLabels: {
      beforeYouGo: 'AVANT DE PARTIR',
      referralSteps: 'ETAPES DE REFERENCE',
      treatmentSteps: 'ETAPES DE TRAITEMENT',
      dangerEnRoute: 'SIGNES DE DANGER EN ROUTE',
      returnIfYouSee: 'REVENIR SI VOUS VOYEZ :',
    },
    metricLabels: { decision: 'Decision', audio: 'Audio', report: 'Rapport', engine: 'Moteur', attached: 'Joint', none: 'Aucun', saved: 'Enregistre', notSaved: 'Non enregistre', confidence: 'Confiance', dangerSigns: 'signes de danger' },
    engineLabels: { local_model: 'Modele hors ligne', cloud_fallback: 'Cloud secours', protocol_fallback: 'Regles protocole', default: 'Moteur clinique' },
    resultVoiceTitle: 'Guidage vocal',
    speak: 'Parler',
    stop: 'Arreter',
    recordingUnavailableTitle: 'Aucun enregistrement',
    recordingUnavailableMessage: 'Enregistrez le son de la consultation avant ecoute.',
    protocol: {} as TextPack['protocol'],
  },
  ar: {} as TextPack,
  so: {} as TextPack,
  ln: {} as TextPack,
  rw: {} as TextPack,
  ha: {} as TextPack,
};

TEXT.fr = clonePack('fr', {
  protocol: {
    urgentDiagnosis: 'Malnutrition aigue severe avec complications',
    dangerDiagnosis: 'Signe de danger clinique',
    respiratoryDiagnosis: 'Infection respiratoire legere',
    diarrheaDiagnosis: 'Diarrhee aqueuse aigue',
    malariaDiagnosis: 'Paludisme non complique ou maladie febrile',
    feverDiagnosis: 'Maladie febrile',
    malnutritionDiagnosis: 'Malnutrition aigue moderee ou non compliquee',
    minorDiagnosis: 'Maladie mineure ou symptomes non urgents',
    urgentSummary: 'Agir maintenant',
    treatMonitor: 'Traiter et surveiller',
    hydrateSummary: 'Traiter et surveiller lhydratation',
    feverSummary: 'Traiter ici et surveiller les signes de danger',
    nutritionSummary: 'Soutien nutritionnel et suivi',
    safeSummary: 'Evaluation possible ici',
    urgentVoice: 'Reference urgente necessaire. Gardez le patient en securite pendant le transport.',
    respiratoryVoice: 'Surveiller a domicile. Recontroler la respiration dans vingt-quatre heures.',
    diarrheaVoice: 'Donner la solution de rehydratation orale et surveiller les signes de danger de deshydratation.',
    feverVoice: 'Traiter selon le protocole de fievre et revenir immediatement si un signe de danger apparait.',
    nutritionVoice: 'Fournir un soutien nutritionnel et surveiller les signes de malnutrition severe.',
    safeVoice: 'Aucun signe de danger urgent detecte. Continuer levaluation et revoir les precautions de retour.',
  },
});

TEXT.ar = clonePack('ar', {
  cloudFallbackNotice: 'تعذر استخدام السحابة؛ تم تطبيق قواعد السلامة الحتمية في شفاء.',
  safetyProtocolTitle: 'تم تطبيق بروتوكول السلامة',
  safetyApplied: (reason) => `تم تطبيق بروتوكول السلامة: ${reason}.`,
  referralSafetyMessage: (diagnosis, reason) => `${diagnosis}. تم تطبيق بروتوكول السلامة: ${reason}.`,
  resultVoiceTitle: 'إرشاد صوتي',
  speak: 'تشغيل الصوت',
  stop: 'إيقاف',
  recordingUnavailableTitle: 'لا يوجد تسجيل',
  recordingUnavailableMessage: 'سجل صوت الاستشارة قبل الاستماع.',
  decisionLabels: { REFER_URGENT: 'إحالة عاجلة', REFER_ROUTINE: 'إحالة روتينية', TREAT: 'عالج' },
  triageLabels: { urgent: 'إحالة عاجلة', routine: 'إحالة روتينية', treat: 'علاج هنا' },
  sectionLabels: { beforeYouGo: 'قبل المغادرة', referralSteps: 'خطوات الإحالة', treatmentSteps: 'خطوات العلاج', dangerEnRoute: 'علامات الخطر أثناء الطريق', returnIfYouSee: 'ارجع إذا ظهر:' },
  metricLabels: { decision: 'القرار', audio: 'الصوت', report: 'التقرير', engine: 'المحرك', attached: 'مرفق', none: 'لا يوجد', saved: 'محفوظ', notSaved: 'غير محفوظ', confidence: 'الثقة', dangerSigns: 'علامات خطر' },
  engineLabels: { local_model: 'نموذج دون إنترنت', cloud_fallback: 'سحابة احتياطية', protocol_fallback: 'قواعد البروتوكول', default: 'محرك سريري' },
  protocol: {
    urgentDiagnosis: 'سوء تغذية حاد شديد مع مضاعفات',
    dangerDiagnosis: 'علامة خطر سريرية',
    respiratoryDiagnosis: 'عدوى تنفسية خفيفة',
    diarrheaDiagnosis: 'إسهال مائي حاد',
    malariaDiagnosis: 'ملاريا غير معقدة أو مرض حمى',
    feverDiagnosis: 'مرض حمى',
    malnutritionDiagnosis: 'سوء تغذية حاد متوسط أو غير معقد',
    minorDiagnosis: 'أعراض بسيطة أو غير عاجلة',
    urgentSummary: 'تصرف الآن',
    treatMonitor: 'عالج وراقب',
    hydrateSummary: 'عالج وراقب الترطيب',
    feverSummary: 'عالج هنا وراقب علامات الخطر',
    nutritionSummary: 'دعم غذائي ومتابعة',
    safeSummary: 'آمن للتقييم هنا',
    urgentVoice: 'الإحالة العاجلة مطلوبة. حافظ على سلامة المريض أثناء النقل.',
    respiratoryVoice: 'راقب في المنزل. أعد فحص التنفس خلال أربع وعشرين ساعة.',
    diarrheaVoice: 'أعط محلول الإماهة الفموية وراقب علامات الجفاف الخطيرة.',
    feverVoice: 'عالج حسب بروتوكول الحمى وارجع فوراً إذا ظهرت علامات خطر.',
    nutritionVoice: 'قدم الدعم الغذائي وراقب علامات سوء التغذية الشديد.',
    safeVoice: 'لم يتم اكتشاف علامة خطر عاجلة. أكمل التقييم وراجع علامات العودة.',
  },
});

TEXT.so = clonePack('so', {
  cloudFallbackNotice: 'Adeeggii cloud-ka lama heli karin; xeerarka badbaadada SHIFA ayaa la adeegsaday.',
  safetyProtocolTitle: 'Hab-maamuus badbaado ayaa la adeegsaday',
  safetyApplied: (reason) => `Hab-maamuus badbaado ayaa la adeegsaday: ${reason}.`,
  referralSafetyMessage: (diagnosis, reason) => `${diagnosis}. Hab-maamuus badbaado ayaa la adeegsaday: ${reason}.`,
  resultVoiceTitle: 'Tilmaam cod ah',
  speak: 'Ku hadal',
  stop: 'Jooji',
  recordingUnavailableTitle: 'Cod ma jiro',
  recordingUnavailableMessage: 'Duub codka la-talinta ka hor dhageysiga.',
  decisionLabels: { REFER_URGENT: 'DIR DEGDEG AH', REFER_ROUTINE: 'DIR JOOGTO AH', TREAT: 'DAAWEE' },
  triageLabels: { urgent: 'Diris degdeg ah', routine: 'Diris joogto ah', treat: 'Halkan ku daawee' },
  sectionLabels: { beforeYouGo: 'KA HOR INTAAD BIXIN', referralSteps: 'TALLAABOOYINKA DIRISTA', treatmentSteps: 'TALLAABOOYINKA DAAWEYNTA', dangerEnRoute: 'CALAAMADAHA KHATARTA JIDKA', returnIfYouSee: 'SOO NOQO HADDII AAD ARAGTO:' },
  metricLabels: { decision: 'Goaan', audio: 'Cod', report: 'Warbixin', engine: 'Matoor', attached: 'Ku lifaaqan', none: 'Ma jiro', saved: 'La kaydiyay', notSaved: 'Lama kaydin', confidence: 'Kalsooni', dangerSigns: 'calaamado khatar' },
  engineLabels: { local_model: 'Moodal offline ah', cloud_fallback: 'Cloud kayd ah', protocol_fallback: 'Xeerar hab-maamuus', default: 'Matoor caafimaad' },
  protocol: {
    urgentDiagnosis: 'Nafaqo darro daran oo leh dhibaatooyin',
    dangerDiagnosis: 'Calaamad khatar caafimaad',
    respiratoryDiagnosis: 'Caabuq neef-mareen fudud',
    diarrheaDiagnosis: 'Shuban biyo ah oo degdeg ah',
    malariaDiagnosis: 'Duumada aan adkeyn ama xanuun qandho leh',
    feverDiagnosis: 'Xanuun qandho leh',
    malnutritionDiagnosis: 'Nafaqo darro dhexdhexaad ah ama aan dhib lahayn',
    minorDiagnosis: 'Xanuun fudud ama aan degdeg ahayn',
    urgentSummary: 'Hadda tallaabo qaad',
    treatMonitor: 'Daawee oo la soco',
    hydrateSummary: 'Daawee oo la soco fuuq-celinta',
    feverSummary: 'Halkan ku daawee oo la soco calaamadaha khatarta',
    nutritionSummary: 'Taageero nafaqo iyo dabagal',
    safeSummary: 'Waa lagu qiimeyn karaa halkan',
    urgentVoice: 'Diris degdeg ah ayaa loo baahan yahay. Bukaanka ammaan ku hay inta la qaadayo.',
    respiratoryVoice: 'Guriga ku la soco. Neefsashada dib u eeg 24 saacadood gudahood.',
    diarrheaVoice: 'Sii ORS oo si dhow ula soco calaamadaha khatarta fuuqbaxa.',
    feverVoice: 'Raac hab-maamuuska qandhada oo degdeg u soo noqo haddii calaamado khatar ah yimaadaan.',
    nutritionVoice: 'Sii taageero nafaqo oo la soco calaamadaha nafaqo darrada daran.',
    safeVoice: 'Calaamad khatar degdeg ah lama arag. Sii wad qiimeynta iyo tilmaamaha soo noqoshada.',
  },
});

TEXT.rw = clonePack('rw', {
  cloudFallbackNotice: 'Uburyo bwa cloud ntibwabashije gukora; amategeko yumutekano ya SHIFA yakoreshejwe.',
  safetyProtocolTitle: 'Amategeko yumutekano yakoreshejwe',
  safetyApplied: (reason) => `Amategeko yumutekano yakoreshejwe: ${reason}.`,
  referralSafetyMessage: (diagnosis, reason) => `${diagnosis}. Amategeko yumutekano yakoreshejwe: ${reason}.`,
  resultVoiceTitle: 'Ubutumwa bwo kuvuga',
  speak: 'Vuga',
  stop: 'Hagarika',
  recordingUnavailableTitle: 'Nta majwi ahari',
  recordingUnavailableMessage: 'Banza ufate amajwi yikiganiro mbere yo kuyumva.',
  decisionLabels: { REFER_URGENT: 'OHEREZA BYIHUTIRWA', REFER_ROUTINE: 'OHEREZA', TREAT: 'VURA' },
  triageLabels: { urgent: 'Kohereza byihutirwa', routine: 'Kohereza bisanzwe', treat: 'Vurira hano' },
  sectionLabels: { beforeYouGo: 'MBERE YO KUGENDA', referralSteps: 'INTAMBWE ZO KOHEREZA', treatmentSteps: 'INTAMBWE ZO KUVURA', dangerEnRoute: 'IBIMENYETSO BYAKAGA MU NZIRA', returnIfYouSee: 'GARUKA NIBA UBONYE:' },
  metricLabels: { decision: 'Icyemezo', audio: 'Ijwi', report: 'Raporo', engine: 'Moteri', attached: 'Byongeweho', none: 'Nta cyo', saved: 'Byabitswe', notSaved: 'Ntibirabikwa', confidence: 'Icyizere', dangerSigns: 'ibimenyetso byakaga' },
  engineLabels: { local_model: 'Modeli ikorera offline', cloud_fallback: 'Cloud yinyongera', protocol_fallback: 'Amategeko ya protokole', default: 'Moteri yubuvuzi' },
  protocol: {
    urgentDiagnosis: 'Imirire mibi ikabije ifite ingorane',
    dangerDiagnosis: 'Ikimenyetso cyakaga kivura',
    respiratoryDiagnosis: 'Indwara yoroheje yubuhumekero',
    diarrheaDiagnosis: 'Impiswi yamazi ikabije',
    malariaDiagnosis: 'Malariya itagoye cyangwa indwara yumuriro',
    feverDiagnosis: 'Indwara yumuriro',
    malnutritionDiagnosis: 'Imirire mibi iri hagati cyangwa itagoye',
    minorDiagnosis: 'Indwara yoroheje cyangwa ibimenyetso bitihutirwa',
    urgentSummary: 'Kora ubu',
    treatMonitor: 'Vura kandi ukurikirane',
    hydrateSummary: 'Vura kandi ukurikirane amazi mumubiri',
    feverSummary: 'Vurira hano kandi ukurikirane ibimenyetso byakaga',
    nutritionSummary: 'Inkunga yimirire no gukurikirana',
    safeSummary: 'Birashoboka gusuzumira hano',
    urgentVoice: 'Kohereza byihutirwa birakenewe. Rinda umurwayi mu gihe cyo kumujyana.',
    respiratoryVoice: 'Mukurikiranire mu rugo. Ongera usuzume guhumeka mu masaha 24.',
    diarrheaVoice: 'Tanga ORS kandi ukurikirane ibimenyetso byakaga byo kubura amazi.',
    feverVoice: 'Kurikiza protokole yumuriro kandi mugaruke ako kanya niba hari ibimenyetso byakaga.',
    nutritionVoice: 'Tanga inkunga yimirire kandi ukurikirane imirire mibi ikabije.',
    safeVoice: 'Nta kimenyetso cyakaga cyihutirwa kibonetse. Komeza isuzuma nimpanuro zo kugaruka.',
  },
});

TEXT.ha = clonePack('ha', {
  cloudFallbackNotice: 'Ba a samu cloud ba; an yi amfani da dokokin kariyar SHIFA.',
  safetyProtocolTitle: 'An yi amfani da kaidar kariya',
  safetyApplied: (reason) => `An yi amfani da kaidar kariya: ${reason}.`,
  referralSafetyMessage: (diagnosis, reason) => `${diagnosis}. An yi amfani da kaidar kariya: ${reason}.`,
  resultVoiceTitle: 'Jagorar murya',
  speak: 'Yi magana',
  stop: 'Tsaya',
  recordingUnavailableTitle: 'Babu rikodin murya',
  recordingUnavailableMessage: 'Yi rikodin shawarar kafin sauraro.',
  decisionLabels: { REFER_URGENT: 'TURA GAGGAWA', REFER_ROUTINE: 'TURA', TREAT: 'YI MAGANI' },
  triageLabels: { urgent: 'Tura gaggawa', routine: 'Tura na yau da kullum', treat: 'Yi magani a nan' },
  sectionLabels: { beforeYouGo: 'KAFIN KA TAFI', referralSteps: 'MATAKAN TURA', treatmentSteps: 'MATAKAN MAGANI', dangerEnRoute: 'ALAMOMIN HADARI A HANYA', returnIfYouSee: 'KOMA IDAN KA GA:' },
  metricLabels: { decision: 'Hukunci', audio: 'Murya', report: 'Rahoto', engine: 'Inji', attached: 'An makala', none: 'Babu', saved: 'An ajiye', notSaved: 'Ba a ajiye ba', confidence: 'Tabbaci', dangerSigns: 'alamomin hadari' },
  engineLabels: { local_model: 'Samfurin offline', cloud_fallback: 'Cloud madadin', protocol_fallback: 'Dokokin protokol', default: 'Injin asibiti' },
  protocol: {
    urgentDiagnosis: 'Tsananin rashin abinci mai gina jiki da matsaloli',
    dangerDiagnosis: 'Alamar hadari ta lafiya',
    respiratoryDiagnosis: 'Saukin cutar numfashi',
    diarrheaDiagnosis: 'Zawo mai ruwa mai tsanani',
    malariaDiagnosis: 'Zazzabin cizon sauro mara rikitarwa ko zazzabi',
    feverDiagnosis: 'Cutar zazzabi',
    malnutritionDiagnosis: 'Matsakaicin rashin abinci mai gina jiki ko mara rikitarwa',
    minorDiagnosis: 'Saukin rashin lafiya ko alamomi marasa gaggawa',
    urgentSummary: 'Yi aiki yanzu',
    treatMonitor: 'Yi magani kuma ka sa ido',
    hydrateSummary: 'Yi magani kuma ka sa ido kan ruwa a jiki',
    feverSummary: 'Yi magani a nan kuma ka sa ido kan alamomin hadari',
    nutritionSummary: 'Tallafin abinci da bin diddigi',
    safeSummary: 'Ana iya duba shi a nan',
    urgentVoice: 'Ana bukatar tura gaggawa. Ka kiyaye lafiyar mara lafiya yayin tafiya.',
    respiratoryVoice: 'A sa ido a gida. A sake duba numfashi cikin awa ashirin da hudu.',
    diarrheaVoice: 'Ba ORS kuma a sa ido sosai kan alamomin bushewar jiki.',
    feverVoice: 'Bi protokol din zazzabi kuma a dawo nan da nan idan alamomin hadari sun bayyana.',
    nutritionVoice: 'Ba tallafin abinci kuma a sa ido kan tsananin rashin abinci.',
    safeVoice: 'Ba a ga alamar hadari ta gaggawa ba. Ci gaba da dubawa da bayanin lokacin dawowa.',
  },
});

TEXT.ln = clonePack('ln', {
  cloudFallbackNotice: 'Cloud ezalaki te; mibeko ya bokengi ya SHIFA esalelami.',
  safetyProtocolTitle: 'Mobeko ya bokengi esalelami',
  safetyApplied: (reason) => `Mobeko ya bokengi esalelami: ${reason}.`,
  referralSafetyMessage: (diagnosis, reason) => `${diagnosis}. Mobeko ya bokengi esalelami: ${reason}.`,
  resultVoiceTitle: 'Toli ya mongongo',
  speak: 'Loba',
  stop: 'Tika',
  recordingUnavailableTitle: 'Mongongo ezali te',
  recordingUnavailableMessage: 'Kanga mongongo ya consultation liboso ya koyoka.',
  decisionLabels: { REFER_URGENT: 'TINDA NOKI', REFER_ROUTINE: 'TINDA', TREAT: 'SILISA' },
  triageLabels: { urgent: 'Kotinda noki', routine: 'Kotinda ya momesano', treat: 'Kosilisa awa' },
  sectionLabels: { beforeYouGo: 'LIBOSO YA KOKENDE', referralSteps: 'MATAMBELO YA KOTINDA', treatmentSteps: 'MATAMBELO YA KOSILISA', dangerEnRoute: 'BILEMBO YA LIKAMA NA NZELA', returnIfYouSee: 'ZONGA SOKI OMONI:' },
  metricLabels: { decision: 'Mokano', audio: 'Mongongo', report: 'Raporo', engine: 'Moteur', attached: 'Ebakisami', none: 'Ezali te', saved: 'Ebombami', notSaved: 'Ebombami te', confidence: 'Bondimi', dangerSigns: 'bilembo ya likama' },
  engineLabels: { local_model: 'Model offline', cloud_fallback: 'Cloud ya secours', protocol_fallback: 'Mibeko ya protocole', default: 'Moteur ya clinique' },
  protocol: {
    urgentDiagnosis: 'Malnutrition makasi na mikakatano',
    dangerDiagnosis: 'Elembo ya likama ya clinique',
    respiratoryDiagnosis: 'Maladi ya kopema ya pete',
    diarrheaDiagnosis: 'Pulu-pulu ya mayi ya makasi',
    malariaDiagnosis: 'Malaria ya pete to maladi ya fievre',
    feverDiagnosis: 'Maladi ya fievre',
    malnutritionDiagnosis: 'Malnutrition ya kati to oyo ezangi likama',
    minorDiagnosis: 'Maladi ya pete to bilembo ezangi urgence',
    urgentSummary: 'Sala sikoyo',
    treatMonitor: 'Silisa mpe landa',
    hydrateSummary: 'Silisa mpe landa mayi ya nzoto',
    feverSummary: 'Silisa awa mpe tala bilembo ya likama',
    nutritionSummary: 'Lisungi ya bilei mpe bolandi',
    safeSummary: 'Ekoki kotangama awa',
    urgentVoice: 'Esengeli kotinda noki. Bomba mobeli na bokengi na nzela.',
    respiratoryVoice: 'Landa na ndako. Tala lisusu kopema na sima ya ngonga 24.',
    diarrheaVoice: 'Pesa ORS mpe landa bilembo ya likama ya kozanga mayi.',
    feverVoice: 'Salela protocole ya fievre mpe zonga noki soki bilembo ya likama ebimi.',
    nutritionVoice: 'Pesa lisungi ya bilei mpe landa bilembo ya malnutrition makasi.',
    safeVoice: 'Elembo ya likama ya urgence emonani te. Koba kotala mpe pesa toli ya kozonga.',
  },
});

export function normalizeLanguage(language?: string | null): ShifaLanguage {
  const value = String(language ?? '').trim().toLowerCase();
  if (value in LANGUAGE_LABELS) return value as ShifaLanguage;
  if (value.includes('arab')) return 'ar';
  if (value.includes('som')) return 'so';
  if (value.includes('fren') || value.includes('fran')) return 'fr';
  if (value.includes('ling')) return 'ln';
  if (value.includes('kin') || value.includes('rwa')) return 'rw';
  if (value.includes('hau')) return 'ha';
  return FALLBACK_LANGUAGE;
}

export function languageDisplayName(language?: string | null): string {
  return LANGUAGE_LABELS[normalizeLanguage(language)];
}

export function promptLanguageName(language?: string | null): string {
  return PROMPT_LANGUAGE_NAMES[normalizeLanguage(language)];
}

export function ttsLocale(language?: string | null): string {
  return TTS_LOCALES[normalizeLanguage(language)];
}

export function textPack(language?: string | null): TextPack {
  return TEXT[normalizeLanguage(language)];
}

export function localizeGuardrailReason(reason: string | null | undefined, language?: string | null): string {
  if (!reason) return '';
  const pack = textPack(language);
  const muac = reason.match(/MUAC\s+([0-9.]+cm)\s*<\s*11\.5cm/i);
  if (muac) {
    if (normalizeLanguage(language) === 'ar') return `محيط الذراع ${muac[1]} أقل من حد 11.5 سم`;
    if (normalizeLanguage(language) === 'fr') return `PB ${muac[1]} sous le seuil de 11,5 cm`;
    if (normalizeLanguage(language) === 'so') return `MUAC ${muac[1]} wuu ka hooseeyaa 11.5cm`;
    if (normalizeLanguage(language) === 'rw') return `MUAC ${muac[1]} iri munsi ya 11.5cm`;
    if (normalizeLanguage(language) === 'ha') return `MUAC ${muac[1]} ya kasa da 11.5cm`;
    if (normalizeLanguage(language) === 'ln') return `MUAC ${muac[1]} ezali na nse ya 11.5cm`;
  }
  return pack.guardrailReasons[reason] ?? reason;
}

export function localizeProtocolDecision(decision: ClinicalDecision, language?: string | null): ClinicalDecision {
  const lang = normalizeLanguage(language);
  if (lang === 'en') return decision;
  const pack = TEXT[lang].protocol;
  const english = TEXT.en.protocol;
  const diagnosisMap: Record<string, string> = {
    [english.urgentDiagnosis]: pack.urgentDiagnosis,
    [english.dangerDiagnosis]: pack.dangerDiagnosis,
    [english.respiratoryDiagnosis]: pack.respiratoryDiagnosis,
    [english.diarrheaDiagnosis]: pack.diarrheaDiagnosis,
    [english.malariaDiagnosis]: pack.malariaDiagnosis,
    [english.feverDiagnosis]: pack.feverDiagnosis,
    [english.malnutritionDiagnosis]: pack.malnutritionDiagnosis,
    [english.minorDiagnosis]: pack.minorDiagnosis,
  };
  const summaryMap: Record<string, string> = {
    [english.urgentSummary]: pack.urgentSummary,
    [english.treatMonitor]: pack.treatMonitor,
    [english.hydrateSummary]: pack.hydrateSummary,
    [english.feverSummary]: pack.feverSummary,
    [english.nutritionSummary]: pack.nutritionSummary,
    [english.safeSummary]: pack.safeSummary,
  };
  const voiceMap: Record<string, string> = {
    [english.urgentVoice]: pack.urgentVoice,
    [english.respiratoryVoice]: pack.respiratoryVoice,
    [english.diarrheaVoice]: pack.diarrheaVoice,
    [english.feverVoice]: pack.feverVoice,
    [english.nutritionVoice]: pack.nutritionVoice,
    [english.safeVoice]: pack.safeVoice,
  };

  return {
    ...decision,
    primaryDiagnosis: diagnosisMap[decision.primaryDiagnosis] ?? decision.primaryDiagnosis,
    summary: summaryMap[decision.summary] ?? decision.summary,
    treatmentSteps: decision.treatmentSteps.map((step) => localizeProtocolLine(step, pack.treatmentSteps, lang)),
    dangerSigns: decision.dangerSigns.map((sign) => localizeProtocolLine(sign, pack.dangerSigns, lang)),
    returnInstructions: decision.returnInstructions.map((line) => localizeProtocolLine(line, pack.returnInstructions, lang)),
    referral: decision.referral
      ? {
          ...decision.referral,
          messageForFacility: decision.referral.messageForFacility.includes('SAM with complications')
            ? pack.referralMessages.sam
            : decision.referral.messageForFacility.includes('Emergency danger sign observed')
              ? pack.referralMessages.danger
              : decision.referral.messageForFacility,
        }
      : undefined,
    voiceResponse: voiceMap[decision.voiceResponse] ?? decision.voiceResponse,
  };
}

function localizeProtocolLine(line: string, map: Record<string, string>, language: ShifaLanguage): string {
  if (map[line]) return map[line];
  const weight = line.match(/Confirm weight: child is (.+)/);
  if (weight) {
    if (language === 'ar') return `أكد الوزن: الطفل ${weight[1]}`;
    if (language === 'fr') return `Confirmer le poids : enfant ${weight[1]}`;
    if (language === 'so') return `Xaqiiji miisaanka: ilmaha waa ${weight[1]}`;
    if (language === 'rw') return `Emeza ibiro: umwana ni ${weight[1]}`;
    if (language === 'ha') return `Tabbatar da nauyi: yaro ${weight[1]}`;
    if (language === 'ln') return `Ndima kilo: mwana azali ${weight[1]}`;
  }
  return line;
}

function clonePack(language: ShifaLanguage, overrides: Omit<Partial<TextPack>, 'protocol'> & { protocol: Partial<TextPack['protocol']> }): TextPack {
  const base = TEXT.fr.protocol && Object.keys(TEXT.fr.protocol).length ? TEXT.fr : TEXT.en;
  const protocol = {
    ...TEXT.en.protocol,
    ...overrides.protocol,
    dangerSigns: translateProtocolMap(language, TEXT.en.protocol.dangerSigns, overrides.protocol.dangerSigns),
    treatmentSteps: translateProtocolMap(language, TEXT.en.protocol.treatmentSteps, overrides.protocol.treatmentSteps),
    returnInstructions: translateProtocolMap(language, TEXT.en.protocol.returnInstructions, overrides.protocol.returnInstructions),
    referralMessages: translateProtocolMap(language, TEXT.en.protocol.referralMessages, overrides.protocol.referralMessages),
  };
  return {
    ...base,
    ...overrides,
    guardrailReasons: translateGuardrailReasons(language, overrides.guardrailReasons),
    protocol,
  };
}

function translateGuardrailReasons(language: ShifaLanguage, overrides?: Record<string, string>): Record<string, string> {
  const source = TEXT.en.guardrailReasons;
  const automatic: Record<ShifaLanguage, Record<string, string>> = {
    en: source,
    fr: TEXT.fr.guardrailReasons,
    ar: {
      'Bilateral edema': 'وذمة ثنائية',
      'Neonatal feeding danger': 'خطر ولادي: غير قادر على الرضاعة',
      'Neonatal breathing danger': 'خطر ولادي: تنفس سريع',
      'Newborn feeding danger': 'مولود لا يرضع',
      'Sexual violence survivor': 'ناجية/ناج من عنف جنسي',
      'Maternal danger sign': 'علامة خطر للأم',
      Eclampsia: 'ارتعاج',
      Convulsions: 'تشنجات',
      'Meningitis sign': 'علامة التهاب السحايا',
      'Severe chest indrawing': 'انكماش صدري شديد',
      'Altered consciousness': 'اضطراب الوعي',
      'Lethargic and unable to drink': 'خمول وعدم القدرة على الشرب',
      'Unable to drink': 'غير قادر على الشرب',
      'Severe acute malnutrition': 'سوء تغذية حاد شديد',
      'Severe pneumonia': 'التهاب رئوي شديد',
      Meningitis: 'التهاب السحايا',
      'Measles suspected without emergency danger signs': 'اشتباه حصبة دون علامات خطر طارئة',
    },
    so: {
      'Bilateral edema': 'Barar labada dhinac ah',
      'Neonatal feeding danger': 'Khatarta ilmaha cusub: ma quudan karo',
      'Neonatal breathing danger': 'Khatarta ilmaha cusub: neef degdeg ah',
      'Newborn feeding danger': 'Ilmo cusub oo aan quudan',
      'Sexual violence survivor': 'Ka badbaaday xadgudub galmo',
      'Maternal danger sign': 'Calaamad khatar hooyo',
      Eclampsia: 'Eclampsia',
      Convulsions: 'Suuxdin',
      'Meningitis sign': 'Calaamad qoorgooye',
      'Severe chest indrawing': 'Laab jiidasho daran',
      'Altered consciousness': 'Miyir doorsoon',
      'Lethargic and unable to drink': 'Daal badan oo aan cabbi karin',
      'Unable to drink': 'Ma cabbi karo',
      'Severe acute malnutrition': 'Nafaqo darro daran',
      'Severe pneumonia': 'Oof wareen daran',
      Meningitis: 'Qoorgooye',
      'Measles suspected without emergency danger signs': 'Shaki jadeeco oo aan lahayn calaamado khatar degdeg ah',
    },
    rw: {
      'Bilateral edema': 'Kubyimba impande zombi',
      'Neonatal feeding danger': 'Akaga kumwana ukivuka: ntashobora konka',
      'Neonatal breathing danger': 'Akaga kumwana ukivuka: guhumeka vuba',
      'Newborn feeding danger': 'Umwana ukivuka utonka',
      'Sexual violence survivor': 'Warokotse ihohoterwa rishingiye ku gitsina',
      'Maternal danger sign': 'Ikimenyetso cyakaga kumubyeyi',
      Eclampsia: 'Eclampsia',
      Convulsions: 'Kugagara',
      'Meningitis sign': 'Ikimenyetso cya meningite',
      'Severe chest indrawing': 'Kwinjira cyane mu gituza',
      'Altered consciousness': 'Kuba adakangutse neza',
      'Lethargic and unable to drink': 'Intege nke kandi ntashobora kunywa',
      'Unable to drink': 'Ntashobora kunywa',
      'Severe acute malnutrition': 'Imirire mibi ikabije',
      'Severe pneumonia': 'Umusonga ukabije',
      Meningitis: 'Meningite',
      'Measles suspected without emergency danger signs': 'Gukeka iseru nta bimenyetso byakaga byihutirwa',
    },
    ha: {
      'Bilateral edema': 'Kumburi bangarori biyu',
      'Neonatal feeding danger': 'Hadarin jariri: baya iya sha',
      'Neonatal breathing danger': 'Hadarin jariri: numfashi da sauri',
      'Newborn feeding danger': 'Jariri baya sha',
      'Sexual violence survivor': "Wanda ya tsira daga cin zarafin jima'i",
      'Maternal danger sign': 'Alamar hadarin uwa',
      Eclampsia: 'Eclampsia',
      Convulsions: 'Farfaɗiya',
      'Meningitis sign': 'Alamar sankarau',
      'Severe chest indrawing': 'Ja kirji mai tsanani',
      'Altered consciousness': 'Sauyin hankali',
      'Lethargic and unable to drink': 'Kasala kuma baya iya sha',
      'Unable to drink': 'Baya iya sha',
      'Severe acute malnutrition': 'Tsananin rashin abinci',
      'Severe pneumonia': 'Tsananin ciwon huhu',
      Meningitis: 'Sankarau',
      'Measles suspected without emergency danger signs': 'Zargin kyanda ba tare da alamomin hadari na gaggawa ba',
    },
    ln: {
      'Bilateral edema': 'Kovimba na makolo mibale',
      'Neonatal feeding danger': 'Likama ya bebe: akoki komela te',
      'Neonatal breathing danger': 'Likama ya bebe: kopema noki',
      'Newborn feeding danger': 'Bebe amelaka te',
      'Sexual violence survivor': 'Moto abiki na violence sexuelle',
      'Maternal danger sign': 'Elembo ya likama ya mama',
      Eclampsia: 'Eclampsie',
      Convulsions: 'Kokangama',
      'Meningitis sign': 'Elembo ya meningite',
      'Severe chest indrawing': 'Kobendama ya ntolo makasi',
      'Altered consciousness': 'Mayele ebongwani',
      'Lethargic and unable to drink': 'Alembi makasi mpe akoki komela te',
      'Unable to drink': 'Akoki komela te',
      'Severe acute malnutrition': 'Malnutrition makasi',
      'Severe pneumonia': 'Pneumonie makasi',
      Meningitis: 'Meningite',
      'Measles suspected without emergency danger signs': 'Kokeka rougeole kozanga bilembo ya urgence',
    },
  };
  return { ...automatic[language], ...overrides };
}

function translateProtocolMap(language: ShifaLanguage, source: Record<string, string>, overrides?: Record<string, string>): Record<string, string> {
  if (language === 'en') return { ...source, ...overrides };
  const common: Record<ShifaLanguage, Record<string, string>> = {
    en: {},
    fr: {
      Convulsions: 'Convulsions',
      'Altered consciousness': 'Alteration de conscience',
      'Breathing stops': 'Arret respiratoire',
      'Unable to drink': 'Incapable de boire',
      Lethargy: 'Lethargie',
      'Bilateral pitting edema': 'Oedeme bilateral prenant le godet',
      'MUAC below 11.5cm': 'PB inferieur a 11,5 cm',
      'Fast breathing develops': 'Respiration rapide apparait',
      'Refuses all food or drink': 'Refuse toute nourriture ou boisson',
      'Blood in stool': 'Sang dans les selles',
      'Repeated vomiting': 'Vomissements repetes',
      'Persistent vomiting': 'Vomissements persistants',
      'Worsening headache or stiff neck': 'Cephalee aggravee ou raideur de nuque',
      'Poor appetite with illness': 'Mauvais appetit avec maladie',
      'Breathing difficulty': 'Difficulte respiratoire',
      'Give RUTF only if alert and able to swallow': 'Donner RUTF seulement si alerte et capable davaler',
      'Keep warm during transport': 'Garder au chaud pendant le transport',
      'Refer immediately for inpatient assessment': 'Referer immediatement pour evaluation hospitaliere',
      'Keep patient safe and positioned for transport': 'Installer le patient en securite pour le transport',
      'Do not give oral medicine if unconscious or unable to swallow': 'Ne pas donner de medicament oral si inconscient ou incapable davaler',
      'Refer immediately for emergency assessment': 'Referer immediatement pour evaluation durgence',
      'Give fluids frequently': 'Donner souvent des liquides',
      'Continue breastfeeding': 'Continuer lallaitement',
      'Keep child warm and rested': 'Garder lenfant au chaud et au repos',
      'Give ORS frequently after each loose stool': 'Donner SRO souvent apres chaque selle liquide',
      'Continue feeding and breastfeeding': 'Continuer lalimentation et lallaitement',
      'Give zinc if age-appropriate per local protocol': 'Donner du zinc si lage convient selon le protocole local',
      'Use national fever or malaria protocol before giving medicine': 'Utiliser le protocole national fievre/paludisme avant medicament',
      'Give fluids and keep the patient comfortable': 'Donner des liquides et garder le patient confortable',
      'Confirm MUAC and weight': 'Confirmer PB et poids',
      'Provide nutrition counselling or RUTF per local protocol': 'Donner conseil nutritionnel ou RUTF selon protocole local',
      'Schedule follow-up measurement': 'Planifier une mesure de suivi',
      'Assess with the local symptom protocol': 'Evaluer avec le protocole local des symptomes',
      'Give supportive care and explain return precautions': 'Donner soins de soutien et expliquer quand revenir',
      'Keep child warm during transport': 'Garder lenfant au chaud pendant le transport',
      'Send referral card with caregiver': 'Envoyer la fiche de reference avec laccompagnant',
      'Recheck in 24 hours': 'Recontroler dans 24 heures',
      'Return immediately if breathing worsens': 'Revenir immediatement si la respiration empire',
      'Return immediately if any danger sign appears': 'Revenir immediatement si un signe de danger apparait',
      'Recheck if diarrhea continues or dehydration worsens': 'Recontroler si la diarrhee continue ou si la deshydratation empire',
      'Recheck in 24 hours if fever persists': 'Recontroler dans 24 heures si la fievre persiste',
      'Refer urgently if edema or low MUAC appears': 'Referer en urgence si oedeme ou PB bas apparait',
      'Recheck nutrition status at follow-up': 'Recontroler letat nutritionnel au suivi',
      'Log case before leaving': 'Enregistrer le cas avant de partir',
      sam: 'MAS avec complications. Oedeme bilateral ou PB sous le seuil urgent.',
      danger: 'Signe de danger urgent observe.',
    },
    ar: {
      Convulsions: 'تشنجات',
      'Altered consciousness': 'اضطراب الوعي',
      'Breathing stops': 'توقف التنفس',
      'Unable to drink': 'غير قادر على الشرب',
      Lethargy: 'خمول',
      'Bilateral pitting edema': 'وذمة ثنائية ضاغطة',
      'MUAC below 11.5cm': 'محيط الذراع أقل من 11.5 سم',
      'Fast breathing develops': 'ظهور تنفس سريع',
      'Refuses all food or drink': 'يرفض كل الطعام أو الشراب',
      'Blood in stool': 'دم في البراز',
      'Repeated vomiting': 'قيء متكرر',
      'Persistent vomiting': 'قيء مستمر',
      'Worsening headache or stiff neck': 'صداع يزداد أو تيبس الرقبة',
      'Poor appetite with illness': 'ضعف شهية مع مرض',
      'Breathing difficulty': 'صعوبة التنفس',
      'Give RUTF only if alert and able to swallow': 'أعط RUTF فقط إذا كان واعياً وقادراً على البلع',
      'Keep warm during transport': 'حافظ على الدفء أثناء النقل',
      'Refer immediately for inpatient assessment': 'أحله فوراً للتقييم داخل المنشأة',
      'Keep patient safe and positioned for transport': 'ضع المريض بأمان للنقل',
      'Do not give oral medicine if unconscious or unable to swallow': 'لا تعط دواء فموياً إذا كان فاقد الوعي أو غير قادر على البلع',
      'Refer immediately for emergency assessment': 'أحله فوراً لتقييم طارئ',
      'Give fluids frequently': 'أعط سوائل بشكل متكرر',
      'Continue breastfeeding': 'استمر في الرضاعة',
      'Keep child warm and rested': 'أبق الطفل دافئاً ومرتاحاً',
      'Give ORS frequently after each loose stool': 'أعط ORS بعد كل براز مائي',
      'Continue feeding and breastfeeding': 'استمر في التغذية والرضاعة',
      'Give zinc if age-appropriate per local protocol': 'أعط الزنك إذا كان مناسباً للعمر حسب البروتوكول المحلي',
      'Use national fever or malaria protocol before giving medicine': 'استخدم بروتوكول الحمى أو الملاريا الوطني قبل إعطاء الدواء',
      'Give fluids and keep the patient comfortable': 'أعط سوائل واجعل المريض مرتاحاً',
      'Confirm MUAC and weight': 'أكد محيط الذراع والوزن',
      'Provide nutrition counselling or RUTF per local protocol': 'قدم إرشاداً غذائياً أو RUTF حسب البروتوكول المحلي',
      'Schedule follow-up measurement': 'حدد موعد قياس متابعة',
      'Assess with the local symptom protocol': 'قيّم حسب بروتوكول الأعراض المحلي',
      'Give supportive care and explain return precautions': 'قدم رعاية داعمة واشرح متى يجب الرجوع',
      'Keep child warm during transport': 'أبق الطفل دافئاً أثناء النقل',
      'Send referral card with caregiver': 'أرسل بطاقة الإحالة مع المرافق',
      'Recheck in 24 hours': 'أعد الفحص خلال 24 ساعة',
      'Return immediately if breathing worsens': 'ارجع فوراً إذا ساء التنفس',
      'Return immediately if any danger sign appears': 'ارجع فوراً إذا ظهرت أي علامة خطر',
      'Recheck if diarrhea continues or dehydration worsens': 'أعد الفحص إذا استمر الإسهال أو ساء الجفاف',
      'Recheck in 24 hours if fever persists': 'أعد الفحص خلال 24 ساعة إذا استمرت الحمى',
      'Refer urgently if edema or low MUAC appears': 'أحل عاجلاً إذا ظهرت وذمة أو محيط ذراع منخفض',
      'Recheck nutrition status at follow-up': 'أعد فحص الحالة الغذائية في المتابعة',
      'Log case before leaving': 'سجل الحالة قبل المغادرة',
      sam: 'سوء تغذية حاد شديد مع مضاعفات. وذمة ثنائية أو محيط ذراع أقل من حد الإحالة العاجلة.',
      danger: 'تمت ملاحظة علامة خطر طارئة.',
    },
    so: {
      Convulsions: 'Suuxdin',
      'Altered consciousness': 'Miyir doorsoon',
      'Breathing stops': 'Neefsashadu way joogsatay',
      'Unable to drink': 'Ma cabbi karo',
      Lethargy: 'Daal badan',
      'Bilateral pitting edema': 'Barar labada dhinac ah',
      'MUAC below 11.5cm': 'MUAC ka hooseeya 11.5cm',
      'Fast breathing develops': 'Neef degdeg ah ayaa bilaabma',
      'Refuses all food or drink': 'Wuu diiday cunto iyo cabitaan',
      'Blood in stool': 'Dhiig saxarada ku jira',
      'Repeated vomiting': 'Matag soo noqnoqda',
      'Persistent vomiting': 'Matag joogto ah',
      'Worsening headache or stiff neck': 'Madax xanuun sii xumaanaya ama qoorta oo adkaata',
      'Poor appetite with illness': 'Rabitaan cunto oo hooseeya iyo xanuun',
      'Breathing difficulty': 'Neefsasho dhib leh',
      'Give RUTF only if alert and able to swallow': 'Sii RUTF kaliya haddii uu feejigan yahay oo liqi karo',
      'Keep warm during transport': 'Diirimaad ku hay inta la qaadayo',
      'Refer immediately for inpatient assessment': 'Isla markiiba u dir qiimeyn xarun caafimaad',
      'Keep patient safe and positioned for transport': 'Bukaanka ammaan u dhig inta la qaadayo',
      'Do not give oral medicine if unconscious or unable to swallow': 'Ha siin daawo afka ah haddii uusan miyir qabin ama liqi karin',
      'Refer immediately for emergency assessment': 'Isla markiiba u dir qiimeyn degdeg ah',
      'Give fluids frequently': 'Sii dareere si joogto ah',
      'Continue breastfeeding': 'Sii wad naasnuujinta',
      'Keep child warm and rested': 'Ilmaha diirran oo nasanaya ku hay',
      'Give ORS frequently after each loose stool': 'Sii ORS kadib saxaro kasta oo biyo ah',
      'Continue feeding and breastfeeding': 'Sii wad quudinta iyo naasnuujinta',
      'Give zinc if age-appropriate per local protocol': 'Sii zinc haddii daadu ku habboon tahay sida protokolka deegaanka',
      'Use national fever or malaria protocol before giving medicine': 'Raac protokolka qandhada ama duumada ka hor daawo',
      'Give fluids and keep the patient comfortable': 'Sii dareere oo bukaanka raaxo ku hay',
      'Confirm MUAC and weight': 'Xaqiiji MUAC iyo miisaanka',
      'Provide nutrition counselling or RUTF per local protocol': 'Sii talo nafaqo ama RUTF sida protokolka deegaanka',
      'Schedule follow-up measurement': 'Qorshee cabbir dabagal ah',
      'Assess with the local symptom protocol': 'Ku qiimee protokolka calaamadaha deegaanka',
      'Give supportive care and explain return precautions': 'Sii daryeel taageero ah oo sharax goorta la soo noqdo',
      'Keep child warm during transport': 'Ilmaha diirimaad ku hay inta la qaadayo',
      'Send referral card with caregiver': 'Kaarka dirista la sii daryeelaha',
      'Recheck in 24 hours': 'Dib u eeg 24 saacadood gudahood',
      'Return immediately if breathing worsens': 'Soo noqo degdeg haddii neefsashadu xumaato',
      'Return immediately if any danger sign appears': 'Soo noqo degdeg haddii calaamad khatar ah muuqato',
      'Recheck if diarrhea continues or dehydration worsens': 'Dib u eeg haddii shubanku sii socdo ama fuuqbaxu xumaado',
      'Recheck in 24 hours if fever persists': 'Dib u eeg 24 saacadood gudahood haddii qandhadu sii socoto',
      'Refer urgently if edema or low MUAC appears': 'U dir degdeg haddii barar ama MUAC hooseeya yimaado',
      'Recheck nutrition status at follow-up': 'Dib u eeg nafaqada waqtiga dabagalka',
      'Log case before leaving': 'Diiwaangeli kiiska ka hor intaadan bixin',
      sam: 'SAM oo dhibaato leh. Barar labada dhinac ah ama MUAC ka hooseeya heerka degdegga.',
      danger: 'Calaamad khatar degdeg ah ayaa la arkay.',
    },
    rw: {
      Convulsions: 'Kugagara',
      'Altered consciousness': 'Kuba adakangutse neza',
      'Breathing stops': 'Guhumeka byahagaze',
      'Unable to drink': 'Ntashobora kunywa',
      Lethargy: 'Intege nke cyane',
      'Bilateral pitting edema': 'Kubyimba impande zombi',
      'MUAC below 11.5cm': 'MUAC iri munsi ya 11.5cm',
      'Fast breathing develops': 'Guhumeka vuba biratangiye',
      'Refuses all food or drink': 'Yanze kurya no kunywa',
      'Blood in stool': 'Amaraso mu musarani',
      'Repeated vomiting': 'Kuruka kenshi',
      'Persistent vomiting': 'Kuruka kudahagarara',
      'Worsening headache or stiff neck': 'Umutwe urushaho kubabara cyangwa ijosi rikomeye',
      'Poor appetite with illness': 'Kubura ubushake bwo kurya hamwe nindwara',
      'Breathing difficulty': 'Ingorane zo guhumeka',
      'Give RUTF only if alert and able to swallow': 'Tanga RUTF gusa niba akangutse kandi ashobora kumira',
      'Keep warm during transport': 'Mugumane ubushyuhe mu nzira',
      'Refer immediately for inpatient assessment': 'Muhite mumwohereza kwisuzumisha mu kigo',
      'Keep patient safe and positioned for transport': 'Shyira umurwayi neza kandi umurinze mu nzira',
      'Do not give oral medicine if unconscious or unable to swallow': 'Ntutange umuti unyobwa niba atumva cyangwa adashobora kumira',
      'Refer immediately for emergency assessment': 'Ohereza ako kanya kwisuzumisha byihutirwa',
      'Give fluids frequently': 'Tanga ibinyobwa kenshi',
      'Continue breastfeeding': 'Komeza konsa',
      'Keep child warm and rested': 'Umwana agume ashyushye kandi aruhuke',
      'Give ORS frequently after each loose stool': 'Tanga ORS nyuma ya buri mpiswi yamazi',
      'Continue feeding and breastfeeding': 'Komeza kugaburira no konsa',
      'Give zinc if age-appropriate per local protocol': 'Tanga zinc niba imyaka ibimwemerera hakurikijwe protokole',
      'Use national fever or malaria protocol before giving medicine': 'Kurikiza protokole yigihugu yumuriro cyangwa malariya mbere yumuti',
      'Give fluids and keep the patient comfortable': 'Tanga ibinyobwa kandi umurwayi amerwe neza',
      'Confirm MUAC and weight': 'Emeza MUAC nibiro',
      'Provide nutrition counselling or RUTF per local protocol': 'Tanga inama zimirire cyangwa RUTF hakurikijwe protokole',
      'Schedule follow-up measurement': 'Teganya gupima mu gukurikirana',
      'Assess with the local symptom protocol': 'Suzuma ukoresheje protokole yibimenyetso',
      'Give supportive care and explain return precautions': 'Tanga ubufasha kandi usobanure igihe cyo kugaruka',
      'Keep child warm during transport': 'Umwana agume ashyushye mu nzira',
      'Send referral card with caregiver': 'Tanga ifishi yo kohereza kumurwaza',
      'Recheck in 24 hours': 'Ongera usuzume mu masaha 24',
      'Return immediately if breathing worsens': 'Garuka ako kanya niba guhumeka bikomera',
      'Return immediately if any danger sign appears': 'Garuka ako kanya niba ikimenyetso cyakaga kibonetse',
      'Recheck if diarrhea continues or dehydration worsens': 'Ongera usuzume niba impiswi ikomeje cyangwa kubura amazi bikomera',
      'Recheck in 24 hours if fever persists': 'Ongera usuzume mu masaha 24 niba umuriro ukomeje',
      'Refer urgently if edema or low MUAC appears': 'Ohereza byihutirwa niba kubyimba cyangwa MUAC iri hasi bigaragaye',
      'Recheck nutrition status at follow-up': 'Ongera usuzume imirire mu gukurikirana',
      'Log case before leaving': 'Andika iki kibazo mbere yo kugenda',
      sam: 'SAM ifite ingorane. Kubyimba impande zombi cyangwa MUAC iri munsi yurugero rwihutirwa.',
      danger: 'Ikimenyetso cyakaga cyihutirwa cyabonetse.',
    },
    ha: {
      Convulsions: 'Farfaɗiya',
      'Altered consciousness': 'Sauyin hankali',
      'Breathing stops': 'Numfashi ya tsaya',
      'Unable to drink': 'Baya iya sha',
      Lethargy: 'Kasala mai tsanani',
      'Bilateral pitting edema': 'Kumburi bangarori biyu',
      'MUAC below 11.5cm': 'MUAC kasa da 11.5cm',
      'Fast breathing develops': 'Numfashi da sauri ya fara',
      'Refuses all food or drink': 'Ya ki abinci ko ruwa',
      'Blood in stool': 'Jini a bayan gida',
      'Repeated vomiting': 'Amai akai-akai',
      'Persistent vomiting': 'Amai mai ci gaba',
      'Worsening headache or stiff neck': 'Ciwon kai yana tsananta ko wuya ta kangare',
      'Poor appetite with illness': 'Rashin cin abinci tare da rashin lafiya',
      'Breathing difficulty': 'Wahalar numfashi',
      'Give RUTF only if alert and able to swallow': 'Ba RUTF kawai idan yana sane kuma yana iya hadiya',
      'Keep warm during transport': 'A sa shi dumi yayin tafiya',
      'Refer immediately for inpatient assessment': 'Tura nan da nan domin dubawa a asibiti',
      'Keep patient safe and positioned for transport': 'A sa mara lafiya lafiya don tafiya',
      'Do not give oral medicine if unconscious or unable to swallow': 'Kar a ba maganin baki idan baya cikin hayyaci ko baya iya hadiya',
      'Refer immediately for emergency assessment': 'Tura nan da nan domin duba gaggawa',
      'Give fluids frequently': 'Ba ruwa akai-akai',
      'Continue breastfeeding': 'Ci gaba da shayarwa',
      'Keep child warm and rested': 'A sa yaro dumi kuma ya huta',
      'Give ORS frequently after each loose stool': 'Ba ORS bayan kowace bayan gida mai ruwa',
      'Continue feeding and breastfeeding': 'Ci gaba da ciyarwa da shayarwa',
      'Give zinc if age-appropriate per local protocol': 'Ba zinc idan shekaru sun dace bisa protokol na gida',
      'Use national fever or malaria protocol before giving medicine': 'Bi protokol na kasa na zazzabi ko malaria kafin magani',
      'Give fluids and keep the patient comfortable': 'Ba ruwa kuma a sa mara lafiya cikin jin dadi',
      'Confirm MUAC and weight': 'Tabbatar da MUAC da nauyi',
      'Provide nutrition counselling or RUTF per local protocol': 'Ba shawarar abinci ko RUTF bisa protokol na gida',
      'Schedule follow-up measurement': 'Tsara auna bin diddigi',
      'Assess with the local symptom protocol': 'Duba da protokol na alamomi na gida',
      'Give supportive care and explain return precautions': 'Ba kulawa ta tallafi kuma bayyana lokacin dawowa',
      'Keep child warm during transport': 'A sa yaro dumi yayin tafiya',
      'Send referral card with caregiver': 'A aika katin tura tare da mai kulawa',
      'Recheck in 24 hours': 'A sake dubawa cikin awa 24',
      'Return immediately if breathing worsens': 'A dawo nan da nan idan numfashi ya tsananta',
      'Return immediately if any danger sign appears': 'A dawo nan da nan idan alamar hadari ta bayyana',
      'Recheck if diarrhea continues or dehydration worsens': 'A sake duba idan zawo ya ci gaba ko bushewar jiki ta tsananta',
      'Recheck in 24 hours if fever persists': 'A sake duba cikin awa 24 idan zazzabi ya ci gaba',
      'Refer urgently if edema or low MUAC appears': 'Tura gaggawa idan kumburi ko MUAC kasa ya bayyana',
      'Recheck nutrition status at follow-up': 'A sake duba matsayin abinci a bin diddigi',
      'Log case before leaving': 'A rubuta shariar kafin tafiya',
      sam: 'SAM da matsaloli. Kumburi bangarori biyu ko MUAC kasa da matakin gaggawa.',
      danger: 'An ga alamar hadari ta gaggawa.',
    },
    ln: {
      Convulsions: 'Kokangama',
      'Altered consciousness': 'Mayele ebongwani',
      'Breathing stops': 'Kopema etelemaki',
      'Unable to drink': 'Akoki komela te',
      Lethargy: 'Kolemba makasi',
      'Bilateral pitting edema': 'Kovimba na makolo mibale',
      'MUAC below 11.5cm': 'MUAC ezali na nse ya 11.5cm',
      'Fast breathing develops': 'Kopema noki ebandi',
      'Refuses all food or drink': 'Aboyi bilei mpe mayi',
      'Blood in stool': 'Makila na zongo',
      'Repeated vomiting': 'Kosanza mbala na mbala',
      'Persistent vomiting': 'Kosanza ezali kokoba',
      'Worsening headache or stiff neck': 'Mutu ezali kobeba to nkingo ekangami',
      'Poor appetite with illness': 'Mposa ya kolia moke na maladi',
      'Breathing difficulty': 'Pasi ya kopema',
      'Give RUTF only if alert and able to swallow': 'Pesa RUTF kaka soki azali koyeba mpe akoki komela',
      'Keep warm during transport': 'Bomba na molunge na nzela',
      'Refer immediately for inpatient assessment': 'Tinda noki mpo na botali na lopitalo',
      'Keep patient safe and positioned for transport': 'Tia mobeli na bokengi mpo na transport',
      'Do not give oral medicine if unconscious or unable to swallow': 'Kopesa kisi ya komela te soki azali na mayele te to akoki komela te',
      'Refer immediately for emergency assessment': 'Tinda noki mpo na botali ya urgence',
      'Give fluids frequently': 'Pesa mayi mbala mingi',
      'Continue breastfeeding': 'Koba komelisa mabwele',
      'Keep child warm and rested': 'Bomba mwana na molunge mpe apema',
      'Give ORS frequently after each loose stool': 'Pesa ORS sima ya zongo nyonso ya mayi',
      'Continue feeding and breastfeeding': 'Koba kopesa bilei mpe mabwele',
      'Give zinc if age-appropriate per local protocol': 'Pesa zinc soki age ebongi na protocole ya esika',
      'Use national fever or malaria protocol before giving medicine': 'Salela protocole ya fievre to malaria liboso ya kisi',
      'Give fluids and keep the patient comfortable': 'Pesa mayi mpe sala mobeli azala malamu',
      'Confirm MUAC and weight': 'Ndima MUAC mpe kilo',
      'Provide nutrition counselling or RUTF per local protocol': 'Pesa toli ya bilei to RUTF na protocole ya esika',
      'Schedule follow-up measurement': 'Bongisa komeka ya bolandi',
      'Assess with the local symptom protocol': 'Tala na protocole ya bilembo ya esika',
      'Give supportive care and explain return precautions': 'Pesa lisungi mpe limbola tango ya kozonga',
      'Keep child warm during transport': 'Bomba mwana na molunge na nzela',
      'Send referral card with caregiver': 'Pesa carte ya kotinda na mobateli',
      'Recheck in 24 hours': 'Tala lisusu na ngonga 24',
      'Return immediately if breathing worsens': 'Zonga noki soki kopema ebebi',
      'Return immediately if any danger sign appears': 'Zonga noki soki elembo ya likama ebimi',
      'Recheck if diarrhea continues or dehydration worsens': 'Tala lisusu soki pulu-pulu ekobi to kozanga mayi ebebi',
      'Recheck in 24 hours if fever persists': 'Tala lisusu na ngonga 24 soki fievre ekobi',
      'Refer urgently if edema or low MUAC appears': 'Tinda noki soki kovimba to MUAC ya nse ebimi',
      'Recheck nutrition status at follow-up': 'Tala lisusu nutrition na bolandi',
      'Log case before leaving': 'Bomba case liboso ya kokende',
      sam: 'SAM na mikakatano. Kovimba na makolo mibale to MUAC na nse ya seuil ya urgence.',
      danger: 'Elembo ya likama ya urgence emonani.',
    },
  };
  const fallback = Object.fromEntries(Object.keys(source).map((key) => [key, common[language][key] ?? source[key]]));
  return { ...fallback, ...overrides };
}
