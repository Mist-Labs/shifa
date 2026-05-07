import { executeSql, selectRows } from './sqliteExec';

export type CountryCode = 'SD' | 'CD' | 'SO' | 'NG' | 'RW';

export interface CHWProfile {
  id: string;
  name: string;
  country: 'sudan' | 'drc' | 'somalia' | 'nigeria';
  countryCode: CountryCode;
  language: string;
  region: string;
  alertRecipients: string[];
  guardEnabled: boolean;
}

const DEFAULT_PROFILE: CHWProfile = {
  id: 'CHW-UNCONFIGURED',
  name: 'Unconfigured CHW',
  country: 'sudan',
  countryCode: 'SD',
  language: 'ar',
  region: 'Unconfigured',
  alertRecipients: [],
  guardEnabled: false,
};

export async function getActiveCHWProfile(): Promise<CHWProfile> {
  const rows = await selectRows<any>(
    `SELECT * FROM chw_profile ORDER BY created_at DESC LIMIT 1`
  );
  const row = rows[0];
  if (!row) return DEFAULT_PROFILE;

  return {
    id: row.id,
    name: row.name || DEFAULT_PROFILE.name,
    country: row.country,
    countryCode: toCountryCode(row.country),
    language: row.language,
    region: row.region || DEFAULT_PROFILE.region,
    alertRecipients: JSON.parse(row.alert_recipients || '[]'),
    guardEnabled: row.guard_enabled === 1,
  };
}

export async function saveCHWProfile(profile: CHWProfile): Promise<void> {
  await executeSql(
    `INSERT OR REPLACE INTO chw_profile
      (id, name, country, language, region, alert_recipients, guard_enabled, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      profile.id,
      profile.name,
      profile.country,
      profile.language,
      profile.region,
      JSON.stringify(profile.alertRecipients),
      profile.guardEnabled ? 1 : 0,
      Date.now(),
    ]
  );
}

export function normalizePhone(raw: string, countryCode: CountryCode): string | null {
  const cleaned = raw.replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('+')) return isValidE164(cleaned) ? cleaned : null;

  const prefixes: Record<CountryCode, string> = {
    SD: '+249',
    CD: '+243',
    SO: '+252',
    NG: '+234',
    RW: '+250',
  };
  const local = cleaned.startsWith('0') ? cleaned.slice(1) : cleaned;
  const normalized = `${prefixes[countryCode]}${local}`;
  return isValidE164(normalized) ? normalized : null;
}

export function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone);
}

function toCountryCode(country: string): CountryCode {
  if (country === 'drc') return 'CD';
  if (country === 'somalia') return 'SO';
  if (country === 'nigeria') return 'NG';
  return 'SD';
}
