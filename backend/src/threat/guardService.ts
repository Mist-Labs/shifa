import { randomUUID } from 'node:crypto';
import { ThreatEvent, ThreatType, ThreatUrgency } from '../types/index.js';

type ThreatReportInput = Partial<ThreatEvent> & {
  visualType?: ThreatType;
  visualConfidence?: number;
  audioType?: ThreatType;
  audioConfidence?: number;
  sustainedVisualSeconds?: number;
  burstCount?: number;
};

const VISUAL_THREATS: ThreatType[] = ['armed_individuals', 'vehicle_convoy', 'motorbike_cluster'];
const AUDIO_THREATS: ThreatType[] = ['gunfire_single', 'gunfire_burst', 'explosion'];

export async function reportThreat(data: ThreatReportInput) {
  const now = new Date().toISOString();
  const threatType = classifyThreatType(data);
  const confidence = clampConfidence(
    data.confidence ?? Math.max(data.visualConfidence ?? 0, data.audioConfidence ?? 0)
  );
  const urgency = classifyUrgency(threatType, confidence, data);
  const smsRecipients = data.smsRecipients || [];

  const event: ThreatEvent = {
    id: randomUUID(),
    chwId: data.chwId || 'unknown',
    threatType,
    urgency,
    confidence,
    latitude: data.latitude,
    longitude: data.longitude,
    smsDispatched: false,
    smsRecipients,
    createdAt: now,
    synced: false,
  };

  return {
    success: true,
    event,
    confirmationRequired: urgency === 'LOW',
  };
}

function classifyThreatType(data: ThreatReportInput): ThreatType {
  if (data.threatType) return data.threatType;

  const visualConfirmed =
    data.visualType && VISUAL_THREATS.includes(data.visualType) && (data.visualConfidence ?? 0) >= 0.75;
  const audioConfirmed =
    data.audioType && AUDIO_THREATS.includes(data.audioType) && (data.audioConfidence ?? 0) >= 0.75;

  if (visualConfirmed && audioConfirmed) return 'combined';
  if (audioConfirmed) return data.audioType as ThreatType;
  if (visualConfirmed) return data.visualType as ThreatType;
  return data.visualType || data.audioType || 'armed_individuals';
}

function classifyUrgency(
  threatType: ThreatType,
  confidence: number,
  data: ThreatReportInput
): ThreatUrgency {
  if (threatType === 'combined' || threatType === 'explosion' || threatType === 'gunfire_burst') {
    return confidence >= 0.65 ? 'CRITICAL' : 'HIGH';
  }
  if ((data.sustainedVisualSeconds ?? 0) >= 45 && confidence >= 0.75) return 'HIGH';
  if ((data.burstCount ?? 0) >= 3) return 'CRITICAL';
  if (threatType === 'armed_individuals' && confidence >= 0.75) return 'HIGH';
  if (confidence >= 0.6) return 'MODERATE';
  return 'LOW';
}

function clampConfidence(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export default { reportThreat };
