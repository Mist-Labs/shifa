import { Alert, NativeEventEmitter, NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { Buffer } from 'buffer';
import type { ThreatAlert } from '../../services/alertSMS';
import { dispatchThreatSMS } from '../../services/alertSMS';
import { logThreatEvent } from '../../services/threatLog';

const SHIFA_SERVICE_UUID =
  process.env.EXPO_PUBLIC_SHIFA_BLE_SERVICE_UUID || '12345678-1234-1234-1234-1234567890ab';
const ALERT_CHAR_UUID =
  process.env.EXPO_PUBLIC_SHIFA_BLE_ALERT_CHAR_UUID || '12345678-1234-1234-1234-1234567890ac';
const SCAN_MS = Number(process.env.EXPO_PUBLIC_SHIFA_BLE_SCAN_MS || 15_000);
const MAX_PEERS = Number(process.env.EXPO_PUBLIC_SHIFA_BLE_MAX_PEERS || 8);
const ALERT_TTL_MS = Number(process.env.EXPO_PUBLIC_SHIFA_BLE_ALERT_TTL_MS || 30 * 60_000);

const seenAlertIds = new Map<string, number>();
let bleManager: any | null = null;
let bleModule: any | null = null;

declare const require: (name: string) => any;

type NativeBluetoothMesh = {
  startAdvertising?: (serviceUuid: string, characteristicUuid: string, deviceName: string) => Promise<string>;
  stopAdvertising?: () => Promise<string>;
  addListener?: (eventName: string) => void;
  removeListeners?: (count: number) => void;
};

const nativeMesh: NativeBluetoothMesh | undefined = NativeModules.ShifaBluetoothMesh;

export interface MeshThreatAlert extends ThreatAlert {
  meshAlertId: string;
  originDeviceId: string;
  createdAt: number;
  hopCount: number;
}

export interface BluetoothRelayResult {
  attempted: boolean;
  deliveredPeers: string[];
  failedPeers: string[];
  nativeAdvertising: boolean;
  reason?: string;
}

export async function startBluetoothThreatRelay(deviceName = 'SHIFA-GUARD'): Promise<void> {
  if (!(await requestBLEPermissions())) return;

  if (!nativeMesh?.startAdvertising) {
    console.warn('BLE peripheral advertising is unavailable until the custom native module is installed.');
    return;
  }

  await nativeMesh.startAdvertising(SHIFA_SERVICE_UUID, ALERT_CHAR_UUID, deviceName);
  subscribeToNativeMeshAlerts();
}

export async function stopBluetoothThreatRelay(): Promise<void> {
  await nativeMesh?.stopAdvertising?.();
}

export async function broadcastThreatViaBluetooth(alert: ThreatAlert | MeshThreatAlert): Promise<BluetoothRelayResult> {
  const granted = await requestBLEPermissions();
  if (!granted) {
    return {
      attempted: false,
      deliveredPeers: [],
      failedPeers: [],
      nativeAdvertising: Boolean(nativeMesh?.startAdvertising),
      reason: 'BLE permissions denied',
    };
  }

  const manager = await getBleManager();
  if (!manager) {
    return {
      attempted: false,
      deliveredPeers: [],
      failedPeers: [],
      nativeAdvertising: Boolean(nativeMesh?.startAdvertising),
      reason: 'react-native-ble-plx native module unavailable; use a custom development build',
    };
  }

  const power = await ensurePoweredOn();
  if (!power.ok) {
    return {
      attempted: false,
      deliveredPeers: [],
      failedPeers: [],
      nativeAdvertising: Boolean(nativeMesh?.startAdvertising),
      reason: power.reason,
    };
  }

  const meshAlert = toMeshAlert(alert);
  markSeen(meshAlert.meshAlertId);
  const payload = encodePayload(meshAlert);
  const deliveredPeers: string[] = [];
  const failedPeers: string[] = [];
  const visited = new Set<string>();

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      manager.stopDeviceScan();
      resolve();
    }, SCAN_MS);

    manager.startDeviceScan([SHIFA_SERVICE_UUID], { allowDuplicates: false }, async (error: any, device: any) => {
      if (error) {
        failedPeers.push(error.message);
        clearTimeout(timeout);
        manager.stopDeviceScan();
        resolve();
        return;
      }

      if (!device || visited.has(device.id) || deliveredPeers.length >= MAX_PEERS) return;
      visited.add(device.id);

      const delivered = await writeAlertToDevice(device, payload);
      if (delivered) deliveredPeers.push(device.id);
      else failedPeers.push(device.id);

      if (deliveredPeers.length >= MAX_PEERS) {
        clearTimeout(timeout);
        manager.stopDeviceScan();
        resolve();
      }
    });
  });

  return {
    attempted: true,
    deliveredPeers,
    failedPeers,
    nativeAdvertising: Boolean(nativeMesh?.startAdvertising),
    reason: deliveredPeers.length > 0 ? undefined : 'No nearby SHIFA BLE peers accepted the alert',
  };
}

async function requestBLEPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  const permissions = [
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
  ].filter(Boolean);

  const result = await PermissionsAndroid.requestMultiple(permissions);
  return Object.values(result).every((value) => value === PermissionsAndroid.RESULTS.GRANTED);
}

async function getBleManager(): Promise<any | null> {
  if (bleManager) return bleManager;
  if (!NativeModules.BlePlx) return null;
  try {
    bleModule = require('react-native-ble-plx');
    bleManager = new bleModule.BleManager();
    return bleManager;
  } catch (error) {
    console.warn('BLE native module unavailable:', error);
    return null;
  }
}

async function ensurePoweredOn(): Promise<{ ok: true } | { ok: false; reason: string }> {
  const manager = await getBleManager();
  if (!manager || !bleModule) return { ok: false, reason: 'BLE native module unavailable' };
  const state = await manager.state();
  if (state === bleModule.State.PoweredOn) return { ok: true };
  if (Platform.OS === 'android') {
    try {
      await manager.enable();
      return { ok: true };
    } catch {
      return { ok: false, reason: 'Bluetooth is off' };
    }
  }
  return { ok: false, reason: `Bluetooth state is ${state}` };
}

async function writeAlertToDevice(device: any, payload: string): Promise<boolean> {
  let connected: any | null = null;
  try {
    connected = await device.connect({ timeout: 6_000 });
    await connected.discoverAllServicesAndCharacteristics();
    await connected.writeCharacteristicWithResponseForService(SHIFA_SERVICE_UUID, ALERT_CHAR_UUID, payload);
    return true;
  } catch (error) {
    console.warn('BLE alert write failed:', device.id, error);
    return false;
  } finally {
    try {
      await connected?.cancelConnection();
    } catch {
      // Connection is already closed.
    }
  }
}

function toMeshAlert(alert: ThreatAlert | MeshThreatAlert): MeshThreatAlert {
  if ('meshAlertId' in alert) {
    return {
      ...alert,
      hopCount: alert.hopCount + 1,
    };
  }

  const createdAt = Date.now();
  return {
    ...alert,
    meshAlertId: `mesh-${alert.chwId}-${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
    originDeviceId: alert.chwId,
    createdAt,
    hopCount: 0,
  };
}

function encodePayload(alert: MeshThreatAlert): string {
  const compact = {
    id: alert.meshAlertId,
    o: alert.originDeviceId,
    t: alert.threatType,
    u: alert.urgency,
    c: alert.confidence,
    lat: Number(alert.latitude.toFixed(5)),
    lng: Number(alert.longitude.toFixed(5)),
    chw: alert.chwId,
    n: alert.chwName,
    r: alert.region,
    to: alert.recipients,
    ts: alert.createdAt,
    h: alert.hopCount,
  };
  return Buffer.from(JSON.stringify(compact), 'utf8').toString('base64');
}

function decodePayload(value: string): MeshThreatAlert {
  const decoded = JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
  return {
    meshAlertId: decoded.id,
    originDeviceId: decoded.o,
    threatType: decoded.t,
    urgency: decoded.u,
    confidence: decoded.c,
    latitude: decoded.lat,
    longitude: decoded.lng,
    chwId: decoded.chw,
    chwName: decoded.n,
    region: decoded.r,
    recipients: decoded.to,
    createdAt: decoded.ts,
    hopCount: decoded.h,
  };
}

function subscribeToNativeMeshAlerts(): void {
  if (!nativeMesh) return;
  const emitter = new NativeEventEmitter(nativeMesh as any);
  emitter.addListener('ShifaMeshAlert', async (event: { value: string }) => {
    try {
      await handleInboundMeshAlert(decodePayload(event.value));
    } catch (error) {
      console.warn('Invalid inbound SHIFA BLE alert:', error);
    }
  });
}

async function handleInboundMeshAlert(alert: MeshThreatAlert): Promise<void> {
  pruneSeen();
  if (seenAlertIds.has(alert.meshAlertId)) return;
  if (Date.now() - alert.createdAt > ALERT_TTL_MS) return;

  markSeen(alert.meshAlertId);
  const result = await dispatchThreatSMS(alert);
  await logThreatEvent({
    ...alert,
    smsDispatched: result.success,
    smsRecipients: result.delivered,
  });

  if (alert.hopCount < 3) {
    await broadcastThreatViaBluetooth(alert);
  }

  if (result.success) {
    Alert.alert('SHIFA mesh alert relayed', 'This device received a nearby Guard alert and dispatched SMS to coordinators.');
  }
}

function markSeen(alertId: string): void {
  seenAlertIds.set(alertId, Date.now());
  pruneSeen();
}

function pruneSeen(): void {
  const cutoff = Date.now() - ALERT_TTL_MS;
  for (const [id, timestamp] of seenAlertIds.entries()) {
    if (timestamp < cutoff) seenAlertIds.delete(id);
  }
}
