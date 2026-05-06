import * as Location from 'expo-location';
import { dispatchThreatSMS, ThreatAlert } from '../../services/alertSMS';
import { getActiveCHWProfile } from '../../services/chwProfile';
import { logThreatEvent } from '../../services/threatLog';
import { broadcastThreatViaBluetooth } from './bluetoothRelay';

export async function onThreatConfirmed(
  threatType: string,
  urgency: ThreatAlert['urgency'],
  confidence: number
): Promise<void> {
  const chw = await getActiveCHWProfile();
  if (!chw.guardEnabled || chw.alertRecipients.length === 0) return;

  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  const alert: ThreatAlert = {
    threatType,
    urgency,
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    confidence: Math.round(confidence * 100),
    chwId: chw.id,
    chwName: chw.name,
    region: chw.region,
    recipients: chw.alertRecipients,
  };

  const result = await dispatchThreatSMS(alert);
  await logThreatEvent({
    ...alert,
    smsDispatched: result.success,
    smsRecipients: result.delivered,
  });
  await broadcastThreatViaBluetooth(alert);
}
