import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Consultation, ThreatEvent, OutbreakAlert } from '../types/index.js';

const consultations = new Map<string, Consultation>();
const threatEvents = new Map<string, ThreatEvent>();
const outbreakAlerts = new Map<string, OutbreakAlert>();
const storeFile = process.env.SHIFA_STORE_FILE;

loadFromDisk();

export function saveConsultations(records: Consultation[]): void {
  for (const record of records) {
    consultations.set(record.id, record);
  }
  persist();
}

export function listConsultations(): Consultation[] {
  return [...consultations.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getConsultation(id: string): Consultation | undefined {
  return consultations.get(id);
}

export function saveThreatEvent(event: ThreatEvent): void {
  threatEvents.set(event.id, event);
  persist();
}

export function saveThreatEvents(records: ThreatEvent[]): void {
  for (const record of records) {
    saveThreatEvent(record);
  }
}

export function listThreatEvents(): ThreatEvent[] {
  return [...threatEvents.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getThreatEvent(id: string): ThreatEvent | undefined {
  return threatEvents.get(id);
}

export function saveOutbreakAlerts(records: OutbreakAlert[]): void {
  for (const record of records) {
    outbreakAlerts.set(record.id, record);
  }
  persist();
}

export function listOutbreakAlerts(): OutbreakAlert[] {
  return [...outbreakAlerts.values()].sort(
    (a, b) => new Date(b.alertFiredAt).getTime() - new Date(a.alertFiredAt).getTime()
  );
}

export function acknowledgeOutbreakAlert(id: string, acknowledgedBy = 'coordinator'): OutbreakAlert | undefined {
  const found = outbreakAlerts.get(id);
  if (!found) return undefined;

  const updated = {
    ...found,
    acknowledged: true,
    acknowledgedBy,
  };
  outbreakAlerts.set(id, updated);
  persist();
  return updated;
}

export function clearStore(): void {
  consultations.clear();
  threatEvents.clear();
  outbreakAlerts.clear();
  persist();
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
