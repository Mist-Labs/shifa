import NetInfo from '@react-native-community/netinfo';
import { executeSql, selectRows } from './sqliteExec';
import { envValue } from './runtimeEnv';

const AT_API_URL = 'https://api.africastalking.com/version1/messaging';
const AT_USERNAME = envValue('EXPO_PUBLIC_AFRICAS_TALKING_USERNAME', 'africasTalkingUsername');
const AT_API_KEY = envValue('EXPO_PUBLIC_AFRICAS_TALKING_API_KEY', 'africasTalkingApiKey');
const AT_SENDER = envValue('EXPO_PUBLIC_AFRICAS_TALKING_SENDER_ID', 'africasTalkingSenderId', 'SHIFA');

export interface ThreatAlert {
  threatType: string;
  urgency: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
  latitude: number;
  longitude: number;
  confidence: number;
  chwId: string;
  chwName: string;
  region: string;
  recipients: string[];
}

export interface SMSResult {
  success: boolean;
  delivered: string[];
  failed: string[];
  messageId?: string;
  queued: boolean;
}

export function buildThreatMessage(alert: ThreatAlert): string {
  const time = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
  return [
    `[SHIFA GUARD - ${alert.urgency}]`,
    `Threat: ${alert.threatType}`,
    `Location: ${alert.latitude.toFixed(4)}, ${alert.longitude.toFixed(4)}`,
    `Time: ${time}`,
    `Device: ${alert.chwId} (${alert.chwName}, ${alert.region})`,
    `Confidence: ${alert.confidence}%`,
    '',
    'Reply CONFIRM to acknowledge.',
    'Reply SAFE if false alarm.',
    '',
    '- SHIFA by Mist Labs',
  ].join('\n');
}

export async function dispatchThreatSMS(alert: ThreatAlert, queueOnFailure = true): Promise<SMSResult> {
  const message = buildThreatMessage(alert);
  const net = await NetInfo.fetch();
  const hasData = Boolean(net.isConnected && net.type !== 'none');

  if (!hasData || !AT_USERNAME || !AT_API_KEY) {
    if (queueOnFailure) await queueSMSForRetry(alert);
    return { success: false, delivered: [], failed: alert.recipients, queued: queueOnFailure };
  }

  const body = new URLSearchParams({
    username: AT_USERNAME,
    to: alert.recipients.join(','),
    message,
    from: AT_SENDER,
  }).toString();

  try {
    const response = await fetch(AT_API_URL, {
      method: 'POST',
      headers: {
        apiKey: AT_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
    });

    if (!response.ok) {
      if (queueOnFailure) await queueSMSForRetry(alert);
      return { success: false, delivered: [], failed: alert.recipients, queued: queueOnFailure };
    }

    const data = await response.json();
    const recipients = data.SMSMessageData?.Recipients ?? [];
    const delivered = recipients
      .filter((recipient: any) => recipient.status === 'Success')
      .map((recipient: any) => recipient.number);
    const failed = recipients
      .filter((recipient: any) => recipient.status !== 'Success')
      .map((recipient: any) => recipient.number);

    if (failed.length > 0 && delivered.length === 0 && queueOnFailure) {
      await queueSMSForRetry(alert);
    }

    return {
      success: delivered.length > 0,
      delivered,
      failed,
      messageId: data.SMSMessageData?.Message,
      queued: delivered.length === 0 && queueOnFailure,
    };
  } catch {
    if (queueOnFailure) await queueSMSForRetry(alert);
    return { success: false, delivered: [], failed: alert.recipients, queued: queueOnFailure };
  }
}

export async function queueSMSForRetry(alert: ThreatAlert): Promise<void> {
  await executeSql(
    `INSERT INTO sms_queue (alert_json, created_at) VALUES (?, ?)`,
    [JSON.stringify(alert), Date.now()]
  );
}

export async function flushSMSQueue(): Promise<void> {
  const net = await NetInfo.fetch();
  if (!net.isConnected || net.type === 'none') return;

  const rows = await selectRows<{ id: number; alert_json: string; attempts: number }>(
    `SELECT id, alert_json, attempts FROM sms_queue WHERE status = 'pending' AND attempts < 5 ORDER BY created_at ASC`
  );

  for (const row of rows) {
    const alert: ThreatAlert = JSON.parse(row.alert_json);
    const result = await dispatchThreatSMS(alert, false);
    const status = result.success ? 'sent' : row.attempts + 1 >= 5 ? 'failed' : 'pending';
    await executeSql(
      `UPDATE sms_queue SET attempts = attempts + 1, last_attempt = ?, status = ? WHERE id = ?`,
      [Date.now(), status, row.id]
    );
  }
}
