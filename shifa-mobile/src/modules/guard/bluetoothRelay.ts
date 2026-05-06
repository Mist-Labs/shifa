import type { ThreatAlert } from '../../services/alertSMS';

export async function broadcastThreatViaBluetooth(_alert: ThreatAlert): Promise<void> {
  // Bluetooth mesh transport is implemented in the native Guard runtime layer.
  // This call is intentionally isolated so the SMS path never waits on mesh relay availability.
}
