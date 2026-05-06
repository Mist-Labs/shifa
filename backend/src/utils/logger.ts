export function log(...args: unknown[]) {
  // small wrapper so other modules can use project logger later
  // In future replace with pino or bunyan
  // eslint-disable-next-line no-console
  console.log('[shifa]', ...args);
}

export default log;
