declare const process: {
  env: {
    EXPO_PUBLIC_AFRICAS_TALKING_USERNAME?: string;
    EXPO_PUBLIC_AFRICAS_TALKING_API_KEY?: string;
    EXPO_PUBLIC_AFRICAS_TALKING_SENDER_ID?: string;
    EXPO_PUBLIC_GOOGLE_API_KEY?: string;
    EXPO_PUBLIC_GEMINI_API_KEY?: string;
    EXPO_PUBLIC_GEMINI_MODEL?: string;
    EXPO_PUBLIC_SHIFA_API_URL?: string;
    EXPO_PUBLIC_SHIFA_MODEL_BASE_URL?: string;
    EXPO_PUBLIC_SHIFA_BLE_SERVICE_UUID?: string;
    EXPO_PUBLIC_SHIFA_BLE_ALERT_CHAR_UUID?: string;
    EXPO_PUBLIC_SHIFA_BLE_SCAN_MS?: string;
    EXPO_PUBLIC_SHIFA_BLE_MAX_PEERS?: string;
    EXPO_PUBLIC_SHIFA_BLE_ALERT_TTL_MS?: string;
    GOOGLE_API_KEY?: string;
    GEMINI_API_KEY?: string;
  };
};

declare module 'expo-constants' {
  const Constants: {
    expoConfig?: {
      extra?: {
        shifa?: {
          africasTalkingUsername?: string;
          africasTalkingApiKey?: string;
          africasTalkingSenderId?: string;
          googleApiKey?: string;
          geminiApiKey?: string;
          geminiModel?: string;
          shifaApiUrl?: string;
          shifaModelBaseUrl?: string;
          shifaBleServiceUuid?: string;
          shifaBleAlertCharUuid?: string;
          shifaBleScanMs?: string;
          shifaBleMaxPeers?: string;
          shifaBleAlertTtlMs?: string;
        };
      };
    };
  };
  export default Constants;
}
