/**
 * PostgreSQL Schema for Backend (with PostGIS)
 * Enable PostGIS extension first: CREATE EXTENSION postgis;
 */

export const POSTGRESQL_SCHEMA = `
-- Enable PostGIS if not already
CREATE EXTENSION IF NOT EXISTS postgis;

-- CHW Workers table
CREATE TABLE IF NOT EXISTS chw_workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT UNIQUE,
  name TEXT,
  country TEXT,
  region TEXT,
  language TEXT,
  guard_enabled BOOLEAN DEFAULT false,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Clinical Cases table
CREATE TABLE IF NOT EXISTS cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chw_id UUID REFERENCES chw_workers(id),
  patient_age_months INTEGER,
  patient_sex TEXT,
  muac_cm NUMERIC(4,1),
  bilateral_edema BOOLEAN,
  decision TEXT,
  primary_diagnosis TEXT,
  confidence NUMERIC(4,3),
  full_json JSONB,
  location GEOMETRY(POINT, 4326),
  country TEXT,
  region TEXT,
  case_date TIMESTAMPTZ DEFAULT NOW(),
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Threat Events table
CREATE TABLE IF NOT EXISTS threat_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chw_id UUID REFERENCES chw_workers(id),
  threat_type TEXT,
  urgency TEXT,
  confidence NUMERIC(4,3),
  location GEOMETRY(POINT, 4326),
  country TEXT,
  sms_dispatched BOOLEAN DEFAULT false,
  sms_recipients TEXT[],
  event_at TIMESTAMPTZ DEFAULT NOW(),
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Outbreak Alerts table
CREATE TABLE IF NOT EXISTS outbreak_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT,
  condition TEXT,
  country TEXT,
  case_count INTEGER,
  location GEOMETRY(POINT, 4326),
  radius_km REAL,
  first_case_at TIMESTAMPTZ,
  alert_fired_at TIMESTAMPTZ DEFAULT NOW(),
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Facilities reference table
CREATE TABLE IF NOT EXISTS facilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  operator TEXT,
  country TEXT,
  location GEOMETRY(POINT, 4326),
  services TEXT[],
  operational BOOLEAN DEFAULT true,
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_cases_location ON cases USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_cases_date ON cases (case_date);
CREATE INDEX IF NOT EXISTS idx_cases_diagnosis ON cases (primary_diagnosis, country);
CREATE INDEX IF NOT EXISTS idx_cases_chw ON cases (chw_id);
CREATE INDEX IF NOT EXISTS idx_threats_location ON threat_events USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_threats_date ON threat_events (event_at);
CREATE INDEX IF NOT EXISTS idx_threats_country ON threat_events (country);
CREATE INDEX IF NOT EXISTS idx_outbreaks_condition ON outbreak_alerts (condition, country);
CREATE INDEX IF NOT EXISTS idx_outbreaks_date ON outbreak_alerts (alert_fired_at);
CREATE INDEX IF NOT EXISTS idx_facilities_country ON facilities (country);
CREATE INDEX IF NOT EXISTS idx_facilities_location ON facilities USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_chw_country ON chw_workers (country);
`;

export default POSTGRESQL_SCHEMA;
