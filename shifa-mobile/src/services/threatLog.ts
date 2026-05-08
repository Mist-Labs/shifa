import { executeSql } from './sqliteExec';
import type { ThreatAlert } from './alertSMS';

export async function logThreatEvent(
  alert: ThreatAlert & { smsDispatched: boolean; smsRecipients: string[] }
): Promise<void> {
  const id = `threat-${Date.now()}`;
  await executeSql(
    `INSERT INTO threat_events
      (id, chw_id, threat_type, urgency, confidence, latitude, longitude, sms_dispatched, sms_recipients, created_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      id,
      alert.chwId,
      alert.threatType,
      alert.urgency,
      alert.confidence / 100,
      alert.latitude,
      alert.longitude,
      alert.smsDispatched ? 1 : 0,
      JSON.stringify(alert.smsRecipients),
      Date.now(),
    ]
  );
  await executeSql(
    `INSERT INTO sync_queue (record_type, record_id, attempts, status, last_attempt) VALUES (?, ?, 0, 'pending', NULL)`,
    ['threat', id]
  );
}
