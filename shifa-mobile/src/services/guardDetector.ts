import { NativeModules, Platform } from 'react-native';
import { EvidenceAsset, GuardThreatAnalysis } from './gemini';
import { getGuardDetectorModelPath } from './modelManager';

export type GuardDetectorClass = 'GUN' | 'KNIFE' | 'PERSON';

export interface GuardDetection {
  className: GuardDetectorClass;
  confidence: number;
  box: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface GuardDetectorNativeModule {
  detect(imageUri: string, modelPath: string, minConfidence: number, iouThreshold: number): Promise<{
    detections: GuardDetection[];
    threatDetected: boolean;
  }>;
}

export interface OfflineGuardResult {
  available: boolean;
  analysis?: GuardThreatAnalysis;
  detections: GuardDetection[];
  reason?: string;
}

const nativeGuardDetector = NativeModules.ShifaGuardDetector as GuardDetectorNativeModule | undefined;
const GUN_ALERT_CONFIDENCE = 0.65;
const DETECTION_CONFIDENCE = 0.35;
const NMS_IOU = 0.5;

export async function analyzeGuardEvidenceOffline(evidence: EvidenceAsset[]): Promise<OfflineGuardResult> {
  if (Platform.OS !== 'android') {
    return { available: false, detections: [], reason: 'Offline Guard detector is Android-only in this build.' };
  }
  if (!nativeGuardDetector) {
    return { available: false, detections: [], reason: 'Native Guard detector bridge is not available in this build.' };
  }

  const modelPath = await getGuardDetectorModelPath();
  if (!modelPath) {
    return { available: false, detections: [], reason: 'Guard detector model is not installed.' };
  }

  const imageEvidence = evidence.filter((item) => item.kind === 'image' || item.mimeType.startsWith('image/'));
  if (imageEvidence.length === 0) {
    return { available: false, detections: [], reason: 'Offline Guard detector currently supports still images only.' };
  }

  const detections: GuardDetection[] = [];
  for (const item of imageEvidence) {
    const result = await nativeGuardDetector.detect(item.uri, modelPath, DETECTION_CONFIDENCE, NMS_IOU);
    detections.push(...normalizeDetections(result.detections ?? []));
  }

  const gunDetections = detections.filter((item) => item.className === 'GUN');
  const bestGun = gunDetections.reduce<GuardDetection | null>(
    (best, item) => (!best || item.confidence > best.confidence ? item : best),
    null
  );
  const threatDetected = Boolean(bestGun && bestGun.confidence >= GUN_ALERT_CONFIDENCE);
  const analysis: GuardThreatAnalysis = threatDetected
    ? {
        threatDetected: true,
        threatType: 'visible firearm',
        confidence: bestGun?.confidence ?? 0,
        urgency: bestGun && bestGun.confidence >= 0.85 ? 'CRITICAL' : 'HIGH',
        rationale: `Offline Guard detector found ${gunDetections.length} firearm detection${gunDetections.length === 1 ? '' : 's'}; strongest confidence ${Math.round((bestGun?.confidence ?? 0) * 100)}%.`,
        recommendedAction: 'Move to safety if possible, alert coordinators, and avoid confronting armed individuals.',
      }
    : {
        threatDetected: false,
        threatType: 'none',
        confidence: Math.max(0, bestGun?.confidence ?? 0),
        urgency: 'LOW',
        rationale: detections.length
          ? `Offline Guard detector found no firearm above dispatch threshold. Detected classes: ${summarizeDetections(detections)}.`
          : 'Offline Guard detector found no visible firearm in the attached image evidence.',
        recommendedAction: 'Keep monitoring and capture clearer evidence if the situation changes.',
      };

  return { available: true, analysis, detections };
}

function normalizeDetections(detections: GuardDetection[]): GuardDetection[] {
  return detections
    .filter((item) => item && ['GUN', 'KNIFE', 'PERSON'].includes(item.className))
    .map((item) => ({
      className: item.className,
      confidence: Number(item.confidence) || 0,
      box: {
        x: Number(item.box?.x) || 0,
        y: Number(item.box?.y) || 0,
        width: Number(item.box?.width) || 0,
        height: Number(item.box?.height) || 0,
      },
    }));
}

function summarizeDetections(detections: GuardDetection[]): string {
  const counts = detections.reduce<Record<string, number>>((acc, item) => {
    acc[item.className] = (acc[item.className] ?? 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts)
    .map(([name, count]) => `${count} ${name}`)
    .join(', ');
}
