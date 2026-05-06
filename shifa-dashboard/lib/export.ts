import type { DashboardData, ShifaCase } from './types';

export type ExportFormat = 'json' | 'csv' | 'dhis2';

export function buildExport(data: DashboardData, format: ExportFormat): { filename: string; mime: string; content: string } {
  if (format === 'json') {
    return {
      filename: `shifa-surveillance-${stamp()}.json`,
      mime: 'application/json',
      content: JSON.stringify(data, null, 2),
    };
  }

  if (format === 'dhis2') {
    return {
      filename: `shifa-dhis2-events-${stamp()}.json`,
      mime: 'application/json',
      content: JSON.stringify({ events: data.cases.map(toDhis2Event) }, null, 2),
    };
  }

  const rows = data.cases.map((record) => ({
    id: record.id,
    chwId: record.chwId,
    country: record.country,
    createdAt: record.createdAt,
    decision: record.decision.decision,
    diagnosis: record.decision.primaryDiagnosis,
    confidence: record.decision.confidence,
    latitude: record.latitude ?? '',
    longitude: record.longitude ?? '',
    muacCm: record.patient?.muacCm ?? '',
  }));

  return {
    filename: `shifa-cases-${stamp()}.csv`,
    mime: 'text/csv',
    content: toCsv(rows),
  };
}

export function downloadExport(data: DashboardData, format: ExportFormat): void {
  const built = buildExport(data, format);
  const blob = new Blob([built.content], { type: built.mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = built.filename;
  link.click();
  URL.revokeObjectURL(url);
}

function toDhis2Event(record: ShifaCase) {
  return {
    event: record.id,
    program: 'SHIFA_SURVEILLANCE',
    orgUnit: `${record.country.toUpperCase()}_FIELD`,
    eventDate: record.createdAt.slice(0, 10),
    status: 'COMPLETED',
    coordinate:
      record.latitude !== undefined && record.longitude !== undefined
        ? { latitude: record.latitude, longitude: record.longitude }
        : undefined,
    dataValues: [
      { dataElement: 'SHIFA_CHW_ID', value: record.chwId },
      { dataElement: 'SHIFA_DECISION', value: record.decision.decision },
      { dataElement: 'SHIFA_DIAGNOSIS', value: record.decision.primaryDiagnosis },
      { dataElement: 'SHIFA_CONFIDENCE', value: record.decision.confidence },
      { dataElement: 'SHIFA_MUAC_CM', value: record.patient?.muacCm ?? '' },
    ],
  };
}

function toCsv(rows: Array<Record<string, string | number>>): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(',')),
  ].join('\n');
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}
