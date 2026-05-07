import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from './app.js';
import { clearStore } from './services/memoryStore.js';
import { signRequest } from './middleware/hmacAuth.js';

test('health and readiness endpoints are available', async () => {
  clearStore();
  const app = await buildApp({
    env: 'test',
    host: '127.0.0.1',
    port: 0,
    corsOrigins: true,
    jwtSecret: 'test_secret_test_secret_test_secret',
    maxUploadBytes: 1024 * 1024,
    clinicalAiModel: 'gemini-2.5-flash',
    requireHmac: false,
  });

  const health = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(health.statusCode, 200);
  assert.equal(health.json().status, 'ok');

  const ready = await app.inject({ method: 'GET', url: '/ready' });
  assert.equal(ready.statusCode, 200);
  assert.equal(ready.json().status, 'ready');

  await app.close();
});

test('case analysis validates input and applies urgent SAM referral', async () => {
  clearStore();
  const app = await buildApp({
    env: 'test',
    host: '127.0.0.1',
    port: 0,
    corsOrigins: true,
    jwtSecret: 'test_secret_test_secret_test_secret',
    maxUploadBytes: 1024 * 1024,
    clinicalAiModel: 'gemini-2.5-flash',
    requireHmac: false,
  });

  const invalid = await app.inject({
    method: 'POST',
    url: '/api/cases/analyze',
    payload: { symptomText: '' },
  });
  assert.equal(invalid.statusCode, 400);

  const valid = await app.inject({
    method: 'POST',
    url: '/api/cases/analyze',
    payload: {
      chwId: 'chw-test',
      country: 'sudan',
      language: 'ar',
      symptomText: 'Child is very weak and has watery diarrhea',
      patient: {
        ageMonths: 18,
        sex: 'F',
        weightKg: 7.8,
        muacCm: 10.4,
        bilateralEdema: true,
      },
    },
  });
  assert.equal(valid.statusCode, 200);
  assert.equal(valid.json().decision.decision, 'REFER_URGENT');
  assert.equal(valid.json().decision.referral.urgency, 'IMMEDIATE');

  const list = await app.inject({ method: 'GET', url: '/api/cases/list' });
  assert.equal(list.statusCode, 200);
  assert.equal(list.json().total, 1);

  await app.close();
});

test('Nigeria Hausa meningitis danger signs force urgent referral', async () => {
  clearStore();
  const app = await buildApp({
    env: 'test',
    host: '127.0.0.1',
    port: 0,
    corsOrigins: true,
    jwtSecret: 'test_secret_test_secret_test_secret',
    maxUploadBytes: 1024 * 1024,
    clinicalAiModel: 'gemini-2.5-flash',
    requireHmac: false,
  });

  const response = await app.inject({
    method: 'POST',
    url: '/api/cases/analyze',
    payload: {
      chwId: 'chw-ng',
      country: 'nigeria',
      language: 'ha',
      symptomText: 'Patient has fever, neck stiffness, photophobia, and confusion',
      patient: {
        ageMonths: 96,
        sex: 'M',
        weightKg: 21,
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().decision.decision, 'REFER_URGENT');
  assert.equal(response.json().decision.referral.urgency, 'IMMEDIATE');
  assert.match(response.json().decision.primaryDiagnosis, /Mening/i);
  assert.match(response.json().decision.voiceResponse, /asibiti/i);

  await app.close();
});

test('threat endpoint classifies combined threats without backend SMS dispatch', async () => {
  clearStore();
  const app = await buildApp({
    env: 'test',
    host: '127.0.0.1',
    port: 0,
    corsOrigins: true,
    jwtSecret: 'test_secret_test_secret_test_secret',
    maxUploadBytes: 1024 * 1024,
    clinicalAiModel: 'gemini-2.5-flash',
    requireHmac: false,
  });

  const response = await app.inject({
    method: 'POST',
    url: '/api/threat/events',
    payload: {
      chwId: 'chw-guard',
      visualType: 'vehicle_convoy',
      visualConfidence: 0.88,
      audioType: 'gunfire_burst',
      audioConfidence: 0.91,
      latitude: -4.3217,
      longitude: 15.3222,
      smsRecipients: ['+250700000000'],
    },
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.json().event.threatType, 'combined');
  assert.equal(response.json().event.urgency, 'CRITICAL');
  assert.equal(response.json().event.smsDispatched, false);

  await app.close();
});

test('sync computes outbreak alerts from clustered AWD cases', async () => {
  clearStore();
  const app = await buildApp({
    env: 'test',
    host: '127.0.0.1',
    port: 0,
    corsOrigins: true,
    jwtSecret: 'test_secret_test_secret_test_secret',
    maxUploadBytes: 1024 * 1024,
    clinicalAiModel: 'gemini-2.5-flash',
    requireHmac: false,
  });

  const now = Date.now();
  const consultations = Array.from({ length: 5 }, (_, index) => ({
    id: `case-${index}`,
    chwId: 'chw-sync',
    patient: {},
    symptomText: 'acute watery diarrhea',
    decision: {
      id: `decision-${index}`,
      decision: 'TREAT',
      primaryDiagnosis: 'Acute Watery Diarrhea possible cholera',
      differentialDiagnoses: ['Cholera'],
      confidence: 0.86,
      dangerSigns: [],
      reasoningTrace: 'test',
      voiceResponse: 'test',
    },
    latitude: -4.32 + index * 0.001,
    longitude: 15.32,
    country: 'drc',
    language: 'fr',
    createdAt: new Date(now + index * 60 * 60 * 1000).toISOString(),
    synced: false,
  }));

  const sync = await app.inject({
    method: 'POST',
    url: '/api/sync',
    payload: {
      chwProfile: {
        id: 'chw-sync',
        country: 'drc',
        language: 'fr',
        alertRecipients: [],
        guardEnabled: false,
        createdAt: new Date(now).toISOString(),
      },
      consultations,
      threatEvents: [],
    },
  });

  assert.equal(sync.statusCode, 200);
  assert.equal(sync.json().success, true);
  assert.equal(sync.json().outbreakAlerts.length, 1);
  assert.equal(sync.json().outbreakAlerts[0].condition, 'Cholera');

  await app.close();
});

test('sync computes Nigeria meningitis outbreak from two clustered cases', async () => {
  clearStore();
  const app = await buildApp({
    env: 'test',
    host: '127.0.0.1',
    port: 0,
    corsOrigins: true,
    jwtSecret: 'test_secret_test_secret_test_secret',
    maxUploadBytes: 1024 * 1024,
    clinicalAiModel: 'gemini-2.5-flash',
    requireHmac: false,
  });

  const now = Date.now();
  const consultations = Array.from({ length: 2 }, (_, index) => ({
    id: `meningitis-${index}`,
    chwId: 'chw-ng-sync',
    patient: {},
    symptomText: 'fever with neck stiffness and photophobia',
    decision: {
      id: `decision-meningitis-${index}`,
      decision: 'REFER_URGENT',
      primaryDiagnosis: 'Suspected Meningococcal Meningitis',
      differentialDiagnoses: ['Meningitis'],
      confidence: 0.9,
      dangerSigns: [{ sign: 'neck stiffness', triggersUrgent: true }],
      reasoningTrace: 'test',
      voiceResponse: 'test',
    },
    latitude: 11.85 + index * 0.001,
    longitude: 13.16,
    country: 'nigeria',
    language: 'ha',
    createdAt: new Date(now + index * 2 * 60 * 60 * 1000).toISOString(),
    synced: false,
  }));

  const sync = await app.inject({
    method: 'POST',
    url: '/api/sync',
    payload: {
      chwProfile: {
        id: 'chw-ng-sync',
        country: 'nigeria',
        language: 'ha',
        alertRecipients: [],
        guardEnabled: false,
        createdAt: new Date(now).toISOString(),
      },
      consultations,
      threatEvents: [],
    },
  });

  assert.equal(sync.statusCode, 200);
  assert.equal(sync.json().outbreakAlerts.length, 1);
  assert.equal(sync.json().outbreakAlerts[0].condition, 'Meningitis');
  assert.equal(sync.json().outbreakAlerts[0].country, 'nigeria');

  await app.close();
});

test('HMAC auth rejects unsigned API calls and accepts signed calls', async () => {
  clearStore();
  const secret = 'test_hmac_secret_test_hmac_secret_123';
  const app = await buildApp({
    env: 'test',
    host: '127.0.0.1',
    port: 0,
    corsOrigins: true,
    jwtSecret: 'test_secret_test_secret_test_secret',
    maxUploadBytes: 1024 * 1024,
    clinicalAiModel: 'gemini-2.5-flash',
    requireHmac: true,
    hmacSecret: secret,
  });

  const unsigned = await app.inject({ method: 'GET', url: '/api/cases/list' });
  assert.equal(unsigned.statusCode, 401);

  const timestamp = Date.now().toString();
  const signed = await app.inject({
    method: 'GET',
    url: '/api/cases/list',
    headers: {
      'x-shifa-timestamp': timestamp,
      'x-shifa-signature': signRequest(secret, 'GET', '/api/cases/list', timestamp),
    },
  });
  assert.equal(signed.statusCode, 200);

  const health = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(health.statusCode, 200);

  await app.close();
});
