const fs = require('fs');
const path = require('path');

const appJson = require('./app.json');

loadDotEnv();

const publicEnv = {
  africasTalkingUsername: process.env.EXPO_PUBLIC_AFRICAS_TALKING_USERNAME || '',
  africasTalkingApiKey: process.env.EXPO_PUBLIC_AFRICAS_TALKING_API_KEY || '',
  africasTalkingSenderId: process.env.EXPO_PUBLIC_AFRICAS_TALKING_SENDER_ID || 'SHIFA',
  googleApiKey: process.env.EXPO_PUBLIC_GOOGLE_API_KEY || process.env.EXPO_PUBLIC_GEMINI_API_KEY || '',
  geminiApiKey: process.env.EXPO_PUBLIC_GEMINI_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_API_KEY || '',
  geminiModel: process.env.EXPO_PUBLIC_GEMINI_MODEL || 'gemini-2.5-flash',
  shifaApiUrl: process.env.EXPO_PUBLIC_SHIFA_API_URL || 'http://10.0.2.2:3000',
  shifaModelBaseUrl: process.env.EXPO_PUBLIC_SHIFA_MODEL_BASE_URL || 'https://pub-b2b135c13b0a406c8a4dc9c60eadb248.r2.dev',
  shifaBleServiceUuid: process.env.EXPO_PUBLIC_SHIFA_BLE_SERVICE_UUID || '12345678-1234-1234-1234-1234567890ab',
  shifaBleAlertCharUuid: process.env.EXPO_PUBLIC_SHIFA_BLE_ALERT_CHAR_UUID || '12345678-1234-1234-1234-1234567890ac',
  shifaBleScanMs: process.env.EXPO_PUBLIC_SHIFA_BLE_SCAN_MS || '15000',
  shifaBleMaxPeers: process.env.EXPO_PUBLIC_SHIFA_BLE_MAX_PEERS || '8',
  shifaBleAlertTtlMs: process.env.EXPO_PUBLIC_SHIFA_BLE_ALERT_TTL_MS || '1800000',
};

module.exports = {
  ...appJson.expo,
  extra: {
    ...(appJson.expo.extra || {}),
    shifa: publicEnv,
  },
};

function loadDotEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}
