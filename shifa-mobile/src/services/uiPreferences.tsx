import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { executeSql, selectRows } from './sqliteExec';

interface UIPreferencesContextValue {
  darkMode: boolean;
  setDarkMode: (enabled: boolean) => Promise<void>;
}

const UIPreferencesContext = createContext<UIPreferencesContextValue>({
  darkMode: false,
  setDarkMode: async () => {},
});

export function UIPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [darkMode, setDarkModeState] = useState(false);

  useEffect(() => {
    let active = true;
    getDarkModePreference().then((enabled) => {
      if (active) setDarkModeState(enabled);
    });
    return () => {
      active = false;
    };
  }, []);

  const setDarkMode = useCallback(async (enabled: boolean) => {
    setDarkModeState(enabled);
    await saveDarkModePreference(enabled);
  }, []);

  const value = useMemo(() => ({ darkMode, setDarkMode }), [darkMode, setDarkMode]);
  return <UIPreferencesContext.Provider value={value}>{children}</UIPreferencesContext.Provider>;
}

export function useUIPreferences() {
  return useContext(UIPreferencesContext);
}

async function getDarkModePreference(): Promise<boolean> {
  const rows = await selectRows<{ value: string }>(
    `SELECT value FROM app_settings WHERE key = ? LIMIT 1`,
    ['dark_mode']
  );
  return rows[0]?.value === '1';
}

async function saveDarkModePreference(enabled: boolean): Promise<void> {
  await executeSql(
    `INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)`,
    ['dark_mode', enabled ? '1' : '0', Date.now()]
  );
}
