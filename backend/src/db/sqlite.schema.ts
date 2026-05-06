/**
 * SQLite Schema for Mobile (Offline)
 * Generated SQL for SHIFA mobile database
 */

export const SQLITE_SCHEMA = `
-- CHW Profile
CREATE TABLE IF NOT EXISTS chw_profile (
  id TEXT PRIMARY KEY,
  name TEXT,
  country TEXT NOT NULL,
  language TEXT NOT NULL,
  region TEXT,
  alert_recipients TEXT,  -- JSON array
  guard_enabled INTEGER DEFAULT 0,
  sync_token TEXT,
  created_at INTEGER
);

-- Consultations (clinical cases)
CREATE TABLE IF NOT EXISTS consultations (
  id TEXT PRIMARY KEY,
  chw_id TEXT NOT NULL,
  patient_age_months INTEGER,
  patient_sex TEXT,
  patient_weight_kg REAL,
  muac_cm REAL,
  bilateral_edema INTEGER,
  symptom_text TEXT NOT NULL,
  image_path TEXT,
  decision TEXT NOT NULL,
  primary_diagnosis TEXT,
  confidence REAL,
  full_response_json TEXT,
  voice_response_text TEXT,
  latitude REAL,
  longitude REAL,
  created_at INTEGER,
  synced INTEGER DEFAULT 0
);

-- Referral Cards
CREATE TABLE IF NOT EXISTS referral_cards (
  id TEXT PRIMARY KEY,
  consultation_id TEXT,
  card_html TEXT,
  shared INTEGER DEFAULT 0,
  created_at INTEGER,
  FOREIGN KEY (consultation_id) REFERENCES consultations(id)
);

-- Threat Events (SHIFA Guard)
CREATE TABLE IF NOT EXISTS threat_events (
  id TEXT PRIMARY KEY,
  chw_id TEXT NOT NULL,
  threat_type TEXT NOT NULL,
  urgency TEXT NOT NULL,
  confidence REAL,
  latitude REAL,
  longitude REAL,
  sms_dispatched INTEGER DEFAULT 0,
  sms_recipients TEXT,
  created_at INTEGER,
  synced INTEGER DEFAULT 0
);

-- Sync Queue
CREATE TABLE IF NOT EXISTS sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_type TEXT,
  record_id TEXT,
  attempts INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  last_attempt INTEGER
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_consultations_chw ON consultations(chw_id);
CREATE INDEX IF NOT EXISTS idx_consultations_created ON consultations(created_at);
CREATE INDEX IF NOT EXISTS idx_consultations_synced ON consultations(synced);
CREATE INDEX IF NOT EXISTS idx_threat_events_chw ON threat_events(chw_id);
CREATE INDEX IF NOT EXISTS idx_threat_events_created ON threat_events(created_at);
CREATE INDEX IF NOT EXISTS idx_threat_events_synced ON threat_events(synced);
`;

export default SQLITE_SCHEMA;
