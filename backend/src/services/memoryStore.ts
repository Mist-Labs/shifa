import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Consultation, ThreatEvent, OutbreakAlert } from '../types/index.js';
import { getPostgresPool } from './postgres.js';

const consultations = new Map<string, Consultation>();
const threatEvents = new Map<string, ThreatEvent>();
const outbreakAlerts = new Map<string, OutbreakAlert>();
const storeFile = process.env.SHIFA_STORE_FILE || 'data/shifa-store.json';

loadFromDisk();

let schemaReady: Promise<void> | undefined;

export async function saveConsultations(records: Consultation[]): Promise<void> {
  for (const record of records) {
    consultations.set(record.id, record);
  }
  persist();
  const db = getPostgresPool();
  if (!db || records.length === 0) return;
  await ensureSchema();
  for (const record of records) {
    await db.query(
      `INSERT INTO consultations
        (id, chw_id, patient, symptom_text, image_path, decision, latitude, longitude, country, language, created_at, synced, payload)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         chw_id = EXCLUDED.chw_id,
         patient = EXCLUDED.patient,
         symptom_text = EXCLUDED.symptom_text,
         image_path = EXCLUDED.image_path,
         decision = EXCLUDED.decision,
         latitude = EXCLUDED.latitude,
         longitude = EXCLUDED.longitude,
         country = EXCLUDED.country,
         language = EXCLUDED.language,
         created_at = EXCLUDED.created_at,
         synced = EXCLUDED.synced,
         payload = EXCLUDED.payload`,
      [
        record.id,
        record.chwId,
        JSON.stringify(record.patient || {}),
        record.symptomText,
        record.imagePath ?? null,
        JSON.stringify(record.decision),
        record.latitude ?? null,
        record.longitude ?? null,
        record.country,
        record.language,
        record.createdAt,
        record.synced,
        JSON.stringify(record),
      ]
    );
  }
}

export async function listConsultations(): Promise<Consultation[]> {
  const db = getPostgresPool();
  if (db) {
    await ensureSchema();
    const result = await db.query(`SELECT payload FROM consultations ORDER BY created_at DESC`);
    return result.rows.map((row) => row.payload as Consultation);
  }
  return listConsultationsLocal();
}

export async function getConsultation(id: string): Promise<Consultation | undefined> {
  const db = getPostgresPool();
  if (db) {
    await ensureSchema();
    const result = await db.query(`SELECT payload FROM consultations WHERE id = $1 LIMIT 1`, [id]);
    return result.rows[0]?.payload as Consultation | undefined;
  }
  return consultations.get(id);
}

export async function saveThreatEvent(event: ThreatEvent): Promise<void> {
  threatEvents.set(event.id, event);
  persist();
  const db = getPostgresPool();
  if (!db) return;
  await ensureSchema();
  await db.query(
    `INSERT INTO threat_events
      (id, chw_id, threat_type, urgency, confidence, latitude, longitude, sms_dispatched, sms_recipients, created_at, synced, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       chw_id = EXCLUDED.chw_id,
       threat_type = EXCLUDED.threat_type,
       urgency = EXCLUDED.urgency,
       confidence = EXCLUDED.confidence,
       latitude = EXCLUDED.latitude,
       longitude = EXCLUDED.longitude,
       sms_dispatched = EXCLUDED.sms_dispatched,
       sms_recipients = EXCLUDED.sms_recipients,
       created_at = EXCLUDED.created_at,
       synced = EXCLUDED.synced,
       payload = EXCLUDED.payload`,
    [
      event.id,
      event.chwId,
      event.threatType,
      event.urgency,
      event.confidence,
      event.latitude ?? null,
      event.longitude ?? null,
      event.smsDispatched,
      JSON.stringify(event.smsRecipients || []),
      event.createdAt,
      event.synced,
      JSON.stringify(event),
    ]
  );
}

export async function saveThreatEvents(records: ThreatEvent[]): Promise<void> {
  for (const record of records) {
    await saveThreatEvent(record);
  }
}

export async function listThreatEvents(): Promise<ThreatEvent[]> {
  const db = getPostgresPool();
  if (db) {
    await ensureSchema();
    const result = await db.query(`SELECT payload FROM threat_events ORDER BY created_at DESC`);
    return result.rows.map((row) => row.payload as ThreatEvent);
  }
  return listThreatEventsLocal();
}

export async function getThreatEvent(id: string): Promise<ThreatEvent | undefined> {
  const db = getPostgresPool();
  if (db) {
    await ensureSchema();
    const result = await db.query(`SELECT payload FROM threat_events WHERE id = $1 LIMIT 1`, [id]);
    return result.rows[0]?.payload as ThreatEvent | undefined;
  }
  return threatEvents.get(id);
}

export async function saveOutbreakAlerts(records: OutbreakAlert[]): Promise<void> {
  for (const record of records) {
    outbreakAlerts.set(record.id, record);
  }
  persist();
  const db = getPostgresPool();
  if (!db || records.length === 0) return;
  await ensureSchema();
  for (const record of records) {
    await db.query(
      `INSERT INTO outbreak_alerts
        (id, alert_type, condition, country, case_count, latitude, longitude, radius_km, first_case_at, alert_fired_at, acknowledged, acknowledged_by, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         alert_type = EXCLUDED.alert_type,
         condition = EXCLUDED.condition,
         country = EXCLUDED.country,
         case_count = EXCLUDED.case_count,
         latitude = EXCLUDED.latitude,
         longitude = EXCLUDED.longitude,
         radius_km = EXCLUDED.radius_km,
         first_case_at = EXCLUDED.first_case_at,
         alert_fired_at = EXCLUDED.alert_fired_at,
         acknowledged = EXCLUDED.acknowledged,
         acknowledged_by = EXCLUDED.acknowledged_by,
         payload = EXCLUDED.payload`,
      [
        record.id,
        record.alertType,
        record.condition,
        record.country,
        record.caseCount,
        record.latitude,
        record.longitude,
        record.radiusKm ?? null,
        record.firstCaseAt,
        record.alertFiredAt,
        record.acknowledged,
        record.acknowledgedBy ?? null,
        JSON.stringify(record),
      ]
    );
  }
}

export async function listOutbreakAlerts(): Promise<OutbreakAlert[]> {
  const db = getPostgresPool();
  if (db) {
    await ensureSchema();
    const result = await db.query(`SELECT payload FROM outbreak_alerts ORDER BY alert_fired_at DESC`);
    return result.rows.map((row) => row.payload as OutbreakAlert);
  }
  return listOutbreakAlertsLocal();
}

export async function acknowledgeOutbreakAlert(id: string, acknowledgedBy = 'coordinator'): Promise<OutbreakAlert | undefined> {
  const found = outbreakAlerts.get(id) || (await getOutbreakAlert(id));
  if (!found) return undefined;

  const updated = {
    ...found,
    acknowledged: true,
    acknowledgedBy,
  };
  outbreakAlerts.set(id, updated);
  persist();
  const db = getPostgresPool();
  if (db) {
    await ensureSchema();
    await db.query(
      `UPDATE outbreak_alerts
          SET acknowledged = true,
              acknowledged_by = $2,
              payload = $3::jsonb
        WHERE id = $1`,
      [id, acknowledgedBy, JSON.stringify(updated)]
    );
  }
  return updated;
}

export async function clearStore(): Promise<void> {
  consultations.clear();
  threatEvents.clear();
  outbreakAlerts.clear();
  persist();
  const db = getPostgresPool();
  if (!db) return;
  await ensureSchema();
  await db.query(`TRUNCATE consultations, threat_events, outbreak_alerts`);
}

function listConsultationsLocal(): Consultation[] {
  return [...consultations.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

function listThreatEventsLocal(): ThreatEvent[] {
  return [...threatEvents.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

function listOutbreakAlertsLocal(): OutbreakAlert[] {
  return [...outbreakAlerts.values()].sort(
    (a, b) => new Date(b.alertFiredAt).getTime() - new Date(a.alertFiredAt).getTime()
  );
}

async function getOutbreakAlert(id: string): Promise<OutbreakAlert | undefined> {
  const db = getPostgresPool();
  if (db) {
    await ensureSchema();
    const result = await db.query(`SELECT payload FROM outbreak_alerts WHERE id = $1 LIMIT 1`, [id]);
    return result.rows[0]?.payload as OutbreakAlert | undefined;
  }
  return outbreakAlerts.get(id);
}

function loadFromDisk(): void {
  if (!storeFile || !existsSync(storeFile)) return;

  const parsed = JSON.parse(readFileSync(storeFile, 'utf8')) as {
    consultations?: Consultation[];
    threatEvents?: ThreatEvent[];
    outbreakAlerts?: OutbreakAlert[];
  };

  for (const record of parsed.consultations || []) consultations.set(record.id, record);
  for (const record of parsed.threatEvents || []) threatEvents.set(record.id, record);
  for (const record of parsed.outbreakAlerts || []) outbreakAlerts.set(record.id, record);
}

function persist(): void {
  if (!storeFile) return;

  mkdirSync(dirname(storeFile), { recursive: true });
  writeFileSync(
    storeFile,
    JSON.stringify(
      {
        consultations: [...consultations.values()],
        threatEvents: [...threatEvents.values()],
        outbreakAlerts: [...outbreakAlerts.values()],
      },
      null,
      2
    )
  );
}

async function ensureSchema(): Promise<void> {
  const db = getPostgresPool();
  if (!db) return;
  schemaReady ??= db.query(`
    CREATE TABLE IF NOT EXISTS consultations (
      id TEXT PRIMARY KEY,
      chw_id TEXT NOT NULL,
      patient JSONB NOT NULL DEFAULT '{}'::jsonb,
      symptom_text TEXT NOT NULL,
      image_path TEXT,
      decision JSONB NOT NULL,
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      country TEXT NOT NULL,
      language TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      synced BOOLEAN NOT NULL DEFAULT false,
      payload JSONB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS threat_events (
      id TEXT PRIMARY KEY,
      chw_id TEXT NOT NULL,
      threat_type TEXT NOT NULL,
      urgency TEXT NOT NULL,
      confidence DOUBLE PRECISION,
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      sms_dispatched BOOLEAN NOT NULL DEFAULT false,
      sms_recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL,
      synced BOOLEAN NOT NULL DEFAULT false,
      payload JSONB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS outbreak_alerts (
      id TEXT PRIMARY KEY,
      alert_type TEXT NOT NULL,
      condition TEXT NOT NULL,
      country TEXT NOT NULL,
      case_count INTEGER NOT NULL,
      latitude DOUBLE PRECISION NOT NULL,
      longitude DOUBLE PRECISION NOT NULL,
      radius_km DOUBLE PRECISION,
      first_case_at TIMESTAMPTZ NOT NULL,
      alert_fired_at TIMESTAMPTZ NOT NULL,
      acknowledged BOOLEAN NOT NULL DEFAULT false,
      acknowledged_by TEXT,
      payload JSONB NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_consultations_created ON consultations(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_consultations_chw ON consultations(chw_id);
    CREATE INDEX IF NOT EXISTS idx_consultations_country ON consultations(country);
    CREATE INDEX IF NOT EXISTS idx_threat_events_created ON threat_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_outbreak_alerts_fired ON outbreak_alerts(alert_fired_at DESC);
  `).then(() => undefined);
  await schemaReady;
}
