export const countrySchema = { type: 'string', enum: ['sudan', 'drc', 'somalia', 'nigeria'] };
export const languageSchema = { type: 'string', enum: ['ar', 'so', 'fr', 'ln', 'rw', 'ha'] };

export const patientSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ageMonths: { type: 'integer', minimum: 0, maximum: 1200 },
    sex: { type: 'string', enum: ['M', 'F'] },
    weightKg: { type: 'number', exclusiveMinimum: 0, maximum: 300 },
    muacCm: { type: 'number', exclusiveMinimum: 0, maximum: 60 },
    bilateralEdema: { type: 'boolean' },
  },
};

export const consultationRequestSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['chwId', 'patient', 'symptomText', 'country', 'language'],
  properties: {
    chwId: { type: 'string', minLength: 1, maxLength: 128 },
    patient: patientSchema,
    symptomText: { type: 'string', minLength: 1, maxLength: 10000 },
    imagePath: { type: 'string', maxLength: 2048 },
    country: countrySchema,
    language: languageSchema,
  },
};

export const threatEventSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    chwId: { type: 'string', minLength: 1, maxLength: 128 },
    threatType: {
      type: 'string',
      enum: [
        'armed_individuals',
        'vehicle_convoy',
        'motorbike_cluster',
        'gunfire_single',
        'gunfire_burst',
        'explosion',
        'combined',
      ],
    },
    urgency: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MODERATE', 'LOW'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    visualType: {
      type: 'string',
      enum: ['armed_individuals', 'vehicle_convoy', 'motorbike_cluster'],
    },
    visualConfidence: { type: 'number', minimum: 0, maximum: 1 },
    audioType: {
      type: 'string',
      enum: ['gunfire_single', 'gunfire_burst', 'explosion'],
    },
    audioConfidence: { type: 'number', minimum: 0, maximum: 1 },
    sustainedVisualSeconds: { type: 'integer', minimum: 0, maximum: 3600 },
    burstCount: { type: 'integer', minimum: 0, maximum: 1000 },
    latitude: { type: 'number', minimum: -90, maximum: 90 },
    longitude: { type: 'number', minimum: -180, maximum: 180 },
    smsRecipients: {
      type: 'array',
      maxItems: 50,
      items: { type: 'string', minLength: 3, maxLength: 32 },
    },
  },
  anyOf: [{ required: ['threatType'] }, { required: ['visualType'] }, { required: ['audioType'] }],
};

export const syncPayloadSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['chwProfile'],
  properties: {
    consultations: { type: 'array', maxItems: 1000, items: { type: 'object' } },
    threatEvents: { type: 'array', maxItems: 1000, items: { type: 'object' } },
    chwProfile: {
      type: 'object',
      required: ['id', 'country', 'language', 'alertRecipients', 'guardEnabled', 'createdAt'],
      additionalProperties: true,
      properties: {
        id: { type: 'string', minLength: 1, maxLength: 128 },
        name: { type: 'string', maxLength: 256 },
        country: countrySchema,
        language: languageSchema,
        alertRecipients: { type: 'array', items: { type: 'string' } },
        guardEnabled: { type: 'boolean' },
        createdAt: { type: 'string' },
      },
    },
    syncToken: { type: 'string' },
  },
};

export const idParamsSchema = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', minLength: 1, maxLength: 128 },
  },
};
