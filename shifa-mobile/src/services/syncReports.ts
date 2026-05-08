import NetInfo from '@react-native-community/netinfo';
import { getActiveCHWProfile } from './chwProfile';
import { executeSql, selectRows } from './sqliteExec';

const API_BASE_URL = (process.env.EXPO_PUBLIC_SHIFA_API_URL || 'http://10.0.2.2:3000').replace(/\/$/, '');

export interface HealthSyncResult {
  attempted: boolean;
  success: boolean;
  offline: boolean;
  pendingCount: number;
  syncedCount: number;
  outbreakCount: number;
  message: string;
}

export interface HealthSyncSummary {
  totalReports: number;
  sentReports: number;
  queuedReports: number;
  failedReports: number;
  retryingReports: number;
  lastAttemptAt?: number;
  destination: string;
}

export function getHealthDataCenterUrl(): string {
  return `${API_BASE_URL}/api/sync`;
}

export async function getHealthSyncSummary(): Promise<HealthSyncSummary> {
  const rows = await selectRows<{
    total_reports: number;
    sent_reports: number;
    queued_reports: number;
    failed_reports: number;
    retrying_reports: number;
    last_attempt_at: number | null;
  }>(
    `SELECT
       (SELECT COUNT(*) FROM consultations) + (SELECT COUNT(*) FROM threat_events) AS total_reports,
       (SELECT COUNT(*) FROM consultations WHERE synced = 1) + (SELECT COUNT(*) FROM threat_events WHERE synced = 1) AS sent_reports,
       (SELECT COUNT(*) FROM sync_queue WHERE status = 'pending') AS queued_reports,
       (SELECT COUNT(*) FROM sync_queue WHERE status = 'failed') AS failed_reports,
       (SELECT COUNT(*) FROM sync_queue WHERE status = 'pending' AND attempts > 0) AS retrying_reports,
       (SELECT MAX(last_attempt) FROM sync_queue WHERE last_attempt IS NOT NULL) AS last_attempt_at`
  );
  const row = rows[0];
  return {
    totalReports: Number(row?.total_reports ?? 0),
    sentReports: Number(row?.sent_reports ?? 0),
    queuedReports: Number(row?.queued_reports ?? 0),
    failedReports: Number(row?.failed_reports ?? 0),
    retryingReports: Number(row?.retrying_reports ?? 0),
    lastAttemptAt: row?.last_attempt_at ? Number(row.last_attempt_at) : undefined,
    destination: getHealthDataCenterUrl(),
  };
}

export async function syncHealthReports(): Promise<HealthSyncResult> {
  const pending = await loadPendingReports();
  const pendingCount = pending.consultations.length + pending.threatEvents.length;
  if (pendingCount === 0) {
    return {
      attempted: false,
      success: true,
      offline: false,
      pendingCount: 0,
      syncedCount: 0,
      outbreakCount: 0,
      message: 'All reports are already synced.',
    };
  }

  const net = await NetInfo.fetch();
  if (!net.isConnected || net.type === 'none') {
    return {
      attempted: false,
      success: false,
      offline: true,
      pendingCount,
      syncedCount: 0,
      outbreakCount: 0,
      message: `${pendingCount} report${pendingCount === 1 ? '' : 's'} saved offline. SHIFA will send when internet is available.`,
    };
  }

  const profile = await getActiveCHWProfile();
  const payload = {
    consultations: pending.consultations,
    threatEvents: pending.threatEvents,
    chwProfile: {
      id: profile.id,
      name: profile.name,
      country: profile.country,
      language: profile.language,
      region: profile.region,
      alertRecipients: profile.alertRecipients,
      guardEnabled: profile.guardEnabled,
      createdAt: new Date().toISOString(),
    },
  };

  try {
    const response = await fetch(getHealthDataCenterUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      await markQueueAttempt([...pending.consultations, ...pending.threatEvents].map((item) => item.id), false);
      return {
        attempted: true,
        success: false,
        offline: false,
        pendingCount,
        syncedCount: 0,
        outbreakCount: 0,
        message: `Data center rejected sync (${response.status}). Reports remain queued.`,
      };
    }

    const body = await response.json();
    await markSynced(pending.consultations.map((item) => item.id), pending.threatEvents.map((item) => item.id));
    const syncedCount = Number(body.syncedCount ?? pendingCount);
    const outbreakCount = Array.isArray(body.outbreakAlerts) ? body.outbreakAlerts.length : 0;
    return {
      attempted: true,
      success: true,
      offline: false,
      pendingCount: 0,
      syncedCount,
      outbreakCount,
      message: `${syncedCount} health report${syncedCount === 1 ? '' : 's'} sent to SHIFA data center.`,
    };
  } catch (error) {
    await markQueueAttempt([...pending.consultations, ...pending.threatEvents].map((item) => item.id), false);
    return {
      attempted: true,
      success: false,
      offline: false,
      pendingCount,
      syncedCount: 0,
      outbreakCount: 0,
      message: error instanceof Error ? error.message : 'Unable to reach SHIFA data center. Reports remain queued.',
    };
  }
}

async function loadPendingReports(): Promise<{ consultations: any[]; threatEvents: any[] }> {
  const consultationRows = await selectRows<any>(
    `SELECT * FROM consultations WHERE synced = 0 ORDER BY created_at ASC LIMIT 100`
  );
  const threatRows = await selectRows<any>(
    `SELECT * FROM threat_events WHERE synced = 0 ORDER BY created_at ASC LIMIT 100`
  );

  return {
    consultations: consultationRows.map((row) => {
      const full = parseJson(row.full_response_json);
      return {
        id: row.id,
        chwId: row.chw_id,
        patient: {
          ageMonths: nullToUndefined(row.patient_age_months),
          sex: nullToUndefined(row.patient_sex),
          weightKg: nullToUndefined(row.patient_weight_kg),
          muacCm: nullToUndefined(row.muac_cm),
          bilateralEdema: row.bilateral_edema === 1,
        },
        symptomText: row.symptom_text || '',
        decision: {
          id: row.id,
          decision: row.decision || full.decision || 'MONITOR',
          primaryDiagnosis: row.primary_diagnosis || full.primaryDiagnosis || 'Unspecified consultation',
          differentialDiagnoses: full.differentialDiagnoses || [],
          confidence: Number(row.confidence ?? full.confidence ?? 0),
          treatment: full.treatment ?? {
            steps: full.treatmentSteps || [],
            drugDoses: [],
            followUpHours: 24,
            returnTriggers: full.returnInstructions || [],
          },
          referral: full.referral
            ? {
                urgency: 'IMMEDIATE',
                facilityType: 'nearest SHIFA referral facility',
                preReferralTreatment: full.treatmentSteps || [],
                messageForFacility: full.referral.messageForFacility || full.summary || '',
                dangerSignsEnRoute: full.dangerSigns || [],
              }
            : undefined,
          monitoring: full.monitoring,
          dangerSigns: (full.dangerSigns || []).map((sign: string) => ({ sign, triggersUrgent: row.decision === 'REFER_URGENT' })),
          reasoningTrace: full.summary || '',
          voiceResponse: row.voice_response_text || full.voiceResponse || '',
        },
        latitude: nullToUndefined(row.latitude),
        longitude: nullToUndefined(row.longitude),
        country: inferCountry(row.chw_id),
        language: inferLanguage(row.chw_id),
        createdAt: new Date(Number(row.created_at || Date.now())).toISOString(),
        synced: false,
      };
    }),
    threatEvents: threatRows.map((row) => ({
      id: row.id,
      chwId: row.chw_id,
      threatType: row.threat_type || 'combined',
      urgency: row.urgency || 'HIGH',
      confidence: Number(row.confidence ?? 0),
      latitude: nullToUndefined(row.latitude),
      longitude: nullToUndefined(row.longitude),
      smsDispatched: row.sms_dispatched === 1,
      smsRecipients: parseJson(row.sms_recipients, []),
      createdAt: new Date(Number(row.created_at || Date.now())).toISOString(),
      synced: false,
    })),
  };
}

async function markSynced(consultationIds: string[], threatIds: string[]): Promise<void> {
  for (const id of consultationIds) {
    await executeSql(`UPDATE consultations SET synced = 1 WHERE id = ?`, [id]);
    await executeSql(`UPDATE sync_queue SET status = 'sent', last_attempt = ? WHERE record_id = ?`, [Date.now(), id]);
  }
  for (const id of threatIds) {
    await executeSql(`UPDATE threat_events SET synced = 1 WHERE id = ?`, [id]);
    await executeSql(`UPDATE sync_queue SET status = 'sent', last_attempt = ? WHERE record_id = ?`, [Date.now(), id]);
  }
}

async function markQueueAttempt(recordIds: string[], failed: boolean): Promise<void> {
  for (const id of recordIds) {
    await executeSql(
      `UPDATE sync_queue
          SET attempts = attempts + 1,
              last_attempt = ?,
              status = CASE WHEN attempts + 1 >= 5 AND ? = 1 THEN 'failed' ELSE 'pending' END
        WHERE record_id = ?`,
      [Date.now(), failed ? 1 : 0, id]
    );
  }
}

function parseJson(value: string | null | undefined, fallback: any = {}): any {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function nullToUndefined<T>(value: T | null | undefined): T | undefined {
  return value === null || value === undefined ? undefined : value;
}

function inferCountry(chwId: string): 'sudan' | 'drc' | 'somalia' | 'nigeria' {
  if (chwId.includes('-NG-')) return 'nigeria';
  if (chwId.includes('-CD-')) return 'drc';
  if (chwId.includes('-SO-')) return 'somalia';
  return 'sudan';
}

function inferLanguage(chwId: string): 'ar' | 'so' | 'fr' | 'ln' | 'rw' | 'ha' {
  if (chwId.includes('-NG-')) return 'ha';
  if (chwId.includes('-SO-')) return 'so';
  if (chwId.includes('-CD-')) return 'ln';
  return 'ar';
}
