import type { ViewStyle } from 'react-native';

export const colors = {
  paper: '#FAFAF7',
  paperStrong: '#FFFFFF',
  ink: '#102019',
  muted: '#52635C',
  line: '#CAD8D0',
  lineStrong: '#9FB5A9',
  green: '#166534',
  greenBright: '#159447',
  greenSoft: '#EAF6EE',
  red: '#B91C1C',
  redSoft: '#FDECEC',
  blue: '#1D4ED8',
  blueSoft: '#EAF1FF',
  purple: '#5B21B6',
  purpleDeep: '#211035',
  purpleSoft: '#F2EAFE',
  amber: '#B45309',
  amberSoft: '#FFF4D7',
  night: '#032016',
  nightPanel: '#07321F',
  white: '#FFFFFF',
};

export const fieldShadow: ViewStyle = {
  shadowColor: '#0B1A12',
  shadowOpacity: 0.16,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};

export const highContrastShadow: ViewStyle = {
  shadowColor: '#06120C',
  shadowOpacity: 0.24,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 5,
};

export function decisionColor(decision: string) {
  const normalized = decision.toUpperCase();
  if (normalized.includes('REFER')) return colors.red;
  if (normalized.includes('MONITOR')) return colors.blue;
  if (normalized.includes('THREAT')) return colors.purple;
  return colors.green;
}

export function decisionSoftColor(decision: string) {
  const normalized = decision.toUpperCase();
  if (normalized.includes('REFER')) return colors.redSoft;
  if (normalized.includes('MONITOR')) return colors.blueSoft;
  if (normalized.includes('THREAT')) return colors.purpleSoft;
  return colors.greenSoft;
}
