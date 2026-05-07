import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabaseSync('shifa.db');

export async function initDatabase() {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS chw_profile (
      id TEXT PRIMARY KEY,
      name TEXT,
      country TEXT NOT NULL,
      language TEXT NOT NULL,
      region TEXT,
      alert_recipients TEXT,
      guard_enabled INTEGER DEFAULT 0,
      sync_token TEXT,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS consultations (
      id TEXT PRIMARY KEY,
      chw_id TEXT,
      patient_age_months INTEGER,
      patient_sex TEXT,
      patient_weight_kg REAL,
      muac_cm REAL,
      bilateral_edema INTEGER,
      symptom_text TEXT,
      decision TEXT,
      primary_diagnosis TEXT,
      confidence REAL,
      full_response_json TEXT,
      voice_response_text TEXT,
      latitude REAL,
      longitude REAL,
      created_at INTEGER,
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS threat_events (
      id TEXT PRIMARY KEY,
      chw_id TEXT,
      threat_type TEXT,
      urgency TEXT,
      confidence REAL,
      latitude REAL,
      longitude REAL,
      sms_dispatched INTEGER DEFAULT 0,
      sms_recipients TEXT,
      created_at INTEGER,
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS referral_cards (
      id TEXT PRIMARY KEY,
      consultation_id TEXT,
      card_html TEXT,
      shared INTEGER DEFAULT 0,
      created_at INTEGER,
      FOREIGN KEY (consultation_id) REFERENCES consultations(id)
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_type TEXT,
      record_id TEXT,
      attempts INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      last_attempt INTEGER
    );

    CREATE TABLE IF NOT EXISTS sms_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alert_json TEXT NOT NULL,
      attempts INTEGER DEFAULT 0,
      last_attempt INTEGER,
      status TEXT DEFAULT 'pending',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_consultations_chw ON consultations(chw_id);
    CREATE INDEX IF NOT EXISTS idx_consultations_created ON consultations(created_at);
    CREATE INDEX IF NOT EXISTS idx_consultations_synced ON consultations(synced);
    CREATE INDEX IF NOT EXISTS idx_consultations_sync_order ON consultations(synced, created_at);
    CREATE INDEX IF NOT EXISTS idx_threat_events_chw ON threat_events(chw_id);
    CREATE INDEX IF NOT EXISTS idx_threat_events_created ON threat_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_threat_events_synced ON threat_events(synced);
    CREATE INDEX IF NOT EXISTS idx_threats_sync_order ON threat_events(synced, created_at);
    CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status, attempts);
    CREATE INDEX IF NOT EXISTS idx_sms_queue_status ON sms_queue(status, attempts);
  `);

  console.log('✓ Database initialized');
}

export async function getDatabase() {
  return db;
}

export default { initDatabase, getDatabase };
