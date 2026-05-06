import { create } from 'zustand';
import type { DashboardData } from './types';

interface DashboardStore {
  data: DashboardData;
  selectedCountry: 'all' | 'sudan' | 'drc' | 'somalia';
  setData: (data: DashboardData) => void;
  setSelectedCountry: (country: DashboardStore['selectedCountry']) => void;
}

export const useDashboardStore = create<DashboardStore>((set) => ({
  data: { cases: [], threats: [], outbreaks: [], ready: null },
  selectedCountry: 'all',
  setData: (data) => set({ data }),
  setSelectedCountry: (selectedCountry) => set({ selectedCountry }),
}));
