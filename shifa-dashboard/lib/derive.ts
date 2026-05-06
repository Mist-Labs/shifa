import { differenceInHours, formatDistanceToNowStrict, isToday, parseISO } from 'date-fns';
import type { ChwActivity, Country, DashboardData, FacilityStatus, ShifaCase } from './types';

export function deriveChwActivity(data: DashboardData): ChwActivity[] {
  const byChw = new Map<string, ChwActivity>();

  for (const record of data.cases) {
    const current = ensureChw(byChw, record.chwId, record.createdAt);
    if (isToday(parseISO(record.createdAt))) current.casesToday += 1;
    current.countries = addCountry(current.countries, record.country);
    if (new Date(record.createdAt) > new Date(current.lastSeen)) current.lastSeen = record.createdAt;
  }

  for (const event of data.threats) {
    const current = ensureChw(byChw, event.chwId, event.createdAt);
    if (isToday(parseISO(event.createdAt))) current.threatsToday += 1;
    if (new Date(event.createdAt) > new Date(current.lastSeen)) current.lastSeen = event.createdAt;
  }

  return [...byChw.values()]
    .map((activity) => ({ ...activity, status: classifyStatus(activity.lastSeen) }))
    .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
}

export function deriveFacilityStatus(cases: ShifaCase[]): FacilityStatus[] {
  const facilities: FacilityStatus[] = [
    { id: 'sd-tfc', name: 'Darfur Therapeutic Feeding Network', country: 'sudan', services: ['SAM', 'RUTF', 'pediatrics'], urgentReferrals: 0, operational: true, lastSignal: '' },
    { id: 'sd-ctc', name: 'Sudan AWD / Cholera Treatment Cell', country: 'sudan', services: ['cholera', 'ORS', 'IV fluids'], urgentReferrals: 0, operational: true, lastSignal: '' },
    { id: 'drc-isolation', name: 'Eastern DRC Isolation & Vaccination Desk', country: 'drc', services: ['mpox', 'measles', 'isolation'], urgentReferrals: 0, operational: true, lastSignal: '' },
    { id: 'so-emoc', name: 'Somalia Emergency Obstetric Referral Desk', country: 'somalia', services: ['maternal', 'neonatal', 'emergency'], urgentReferrals: 0, operational: true, lastSignal: '' },
  ];

  for (const record of cases) {
    if (!record.decision?.decision?.startsWith('REFER')) continue;
    const facility = selectFacility(facilities, record);
    facility.urgentReferrals += record.decision.decision === 'REFER_URGENT' ? 1 : 0;
    if (!facility.lastSignal || new Date(record.createdAt) > new Date(facility.lastSignal)) {
      facility.lastSignal = record.createdAt;
    }
  }

  return facilities;
}

export function formatLastSeen(iso: string): string {
  return `${formatDistanceToNowStrict(parseISO(iso))} ago`;
}

function ensureChw(map: Map<string, ChwActivity>, chwId: string, lastSeen: string): ChwActivity {
  if (!map.has(chwId)) {
    map.set(chwId, {
      chwId,
      casesToday: 0,
      threatsToday: 0,
      lastSeen,
      countries: [],
      status: 'offline',
    });
  }
  return map.get(chwId)!;
}

function classifyStatus(lastSeen: string): ChwActivity['status'] {
  const hours = differenceInHours(new Date(), parseISO(lastSeen));
  if (hours <= 6) return 'active';
  if (hours <= 24) return 'quiet';
  return 'offline';
}

function addCountry(countries: Country[], country: Country): Country[] {
  return countries.includes(country) ? countries : [...countries, country];
}

function selectFacility(facilities: FacilityStatus[], record: ShifaCase): FacilityStatus {
  const diagnosis = record.decision.primaryDiagnosis.toLowerCase();
  if (record.country === 'drc') return facilities.find((f) => f.id === 'drc-isolation')!;
  if (record.country === 'somalia' && diagnosis.includes('maternal')) return facilities.find((f) => f.id === 'so-emoc')!;
  if (diagnosis.includes('diarrhea') || diagnosis.includes('cholera')) return facilities.find((f) => f.id === 'sd-ctc')!;
  return facilities.find((f) => f.country === record.country) || facilities[0];
}
