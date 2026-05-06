/**
 * Protocol Manager
 * Selects and provides country-specific clinical protocols and system prompts
 */

import { Country, Language } from '../types/index.js';
import { SUDAN_SYSTEM_PROMPT, SUDAN_DANGER_SIGNS, SUDAN_CONDITIONS } from './sudan.js';
import { DRC_SYSTEM_PROMPT, DRC_DANGER_SIGNS, DRC_CONDITIONS } from './drc.js';
import { SOMALIA_SYSTEM_PROMPT, SOMALIA_DANGER_SIGNS, SOMALIA_CONDITIONS } from './somalia.js';

export function getSystemPrompt(country: Country, language: Language): string {
  switch (country) {
    case 'sudan':
      return SUDAN_SYSTEM_PROMPT;
    case 'drc':
      return DRC_SYSTEM_PROMPT;
    case 'somalia':
      return SOMALIA_SYSTEM_PROMPT;
    default:
      return 'You are SHIFA, a clinical decision support assistant.';
  }
}

export function getDangerSigns(country: Country) {
  switch (country) {
    case 'sudan':
      return SUDAN_DANGER_SIGNS;
    case 'drc':
      return DRC_DANGER_SIGNS;
    case 'somalia':
      return SOMALIA_DANGER_SIGNS;
    default:
      return [];
  }
}

export function getConditions(country: Country) {
  switch (country) {
    case 'sudan':
      return SUDAN_CONDITIONS;
    case 'drc':
      return DRC_CONDITIONS;
    case 'somalia':
      return SOMALIA_CONDITIONS;
    default:
      return {};
  }
}

export default {
  getSystemPrompt,
  getDangerSigns,
  getConditions,
};
