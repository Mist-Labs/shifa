import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, Alert, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import {
  CheckCircle,
  ChevronRight,
  FileText,
  Globe,
  Settings,
  Shield,
  Stethoscope,
} from 'lucide-react-native';
import ClinicScreen from './screens/ClinicScreen';
import GuardScreen from './screens/GuardScreen';
import SettingsScreen from './screens/SettingsScreen';
import CasesScreen from './screens/CasesScreen';
import { initDatabase } from './db/sqlite';
import { flushSMSQueue } from './services/alertSMS';
import { syncHealthReports } from './services/syncReports';
import { colors } from './design/system';
import { UIPreferencesProvider } from './services/uiPreferences';
import { I18nProvider, saveLanguagePreference, toAppLanguage } from './services/i18n';

const Tab = createBottomTabNavigator();

type OnboardingStep = 'splash' | 'country' | 'language' | 'done';
const SPLASH_DURATION_MS = 1500;

const countries = [
  { label: 'Sudan', local: 'السودان', flag: '🇸🇩' },
  { label: 'DR Congo', local: 'Kongo ya Boleki', flag: '🇨🇩' },
  { label: 'Somalia', local: 'Soomaaliya', flag: '🇸🇴' },
  { label: 'Nigeria', local: 'Arewa', flag: '🇳🇬' },
];

const languages = [
  { label: 'Hausa', local: 'Hausa' },
  { label: 'Lingala', local: 'Lingala' },
  { label: 'Français', local: 'Français' },
  { label: 'Kinyarwanda', local: 'Kinyarwanda' },
  { label: 'Somali', local: 'Soomaali' },
  { label: 'English', local: 'English' },
  { label: 'العربية', local: 'Arabic' },
];

export default function App() {
  const [loading, setLoading] = useState(true);
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>('splash');
  const [selectedLanguage, setSelectedLanguage] = useState('Lingala');

  useEffect(() => {
    const initialize = async () => {
      try {
        await initDatabase();
      } catch (error) {
        console.error('Failed to initialize database:', error);
      } finally {
        setLoading(false);
      }
    };
    initialize();
  }, []);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.type !== 'none') {
        void flushSMSQueue();
        void syncHealthReports().then((result) => {
          if (result.success && result.syncedCount > 0) {
            Alert.alert('SHIFA reports sent', result.message);
          }
        });
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (loading || onboardingStep !== 'splash') return;

    const timer = setTimeout(() => {
      setOnboardingStep('done');
    }, SPLASH_DURATION_MS);

    return () => clearTimeout(timer);
  }, [loading, onboardingStep]);

  if (loading) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator size="large" color={colors.green} />
        <Text style={styles.loadingText}>Initializing SHIFA</Text>
      </SafeAreaView>
    );
  }

  if (onboardingStep !== 'done') {
    return (
      <SafeAreaView style={[styles.onboarding, onboardingStep === 'splash' && styles.splash]}>
        {onboardingStep === 'splash' && (
          <View style={styles.splashInner}>
            <View style={styles.logoBox}>
              <Text style={styles.logoCross}>+</Text>
            </View>
            <Text style={styles.brand}>SHIFA</Text>
            <Text style={styles.arabic}>شفاء</Text>
            <Text style={styles.tagline}>For the people the world forgot to heal</Text>
            <View style={styles.dots}>
              <View style={[styles.dot, styles.dotActive]} />
              <View style={styles.dot} />
              <View style={styles.dot} />
            </View>
            <Text style={styles.splashStatus}>Offline • Private • Secure</Text>
            <TouchableOpacity
              accessibilityLabel="Continue to patient consultation"
              accessibilityRole="button"
              style={styles.hiddenAdvance}
              onPress={() => setOnboardingStep('done')}
            />
          </View>
        )}

        {onboardingStep === 'country' && (
          <View style={styles.setupPage}>
            <Globe color={colors.green} size={42} />
            <Text style={styles.setupTitle}>Select your country</Text>
            <Text style={styles.setupSubtitle}>This helps SHIFA localize care</Text>
            {countries.map((country) => (
              <TouchableOpacity key={country.label} style={styles.optionRow} onPress={() => setOnboardingStep('language')}>
                <Text style={styles.flag}>{country.flag}</Text>
                <View style={styles.optionText}>
                  <Text style={styles.optionLabel}>{country.label}</Text>
                  <Text style={styles.optionLocal}>{country.local}</Text>
                </View>
                <ChevronRight color={colors.green} size={20} />
              </TouchableOpacity>
            ))}
            <Text style={styles.setupFooter}>You can change this later</Text>
          </View>
        )}

        {onboardingStep === 'language' && (
          <View style={styles.setupPage}>
            <Globe color={colors.green} size={42} />
            <Text style={styles.setupTitle}>Choose language</Text>
            <Text style={styles.setupSubtitle}>SHIFA will speak this language</Text>
            {languages.map((language) => {
              const active = selectedLanguage === language.label;
              return (
                <TouchableOpacity
                  key={language.label}
                  style={[styles.optionRow, active && styles.optionRowActive]}
                  onPress={() => setSelectedLanguage(language.label)}
                >
                  <View style={[styles.radio, active && styles.radioActive]}>{active && <CheckCircle color={colors.white} size={14} />}</View>
                  <View style={styles.optionText}>
                    <Text style={styles.optionLabel}>{language.label}</Text>
                    <Text style={styles.optionLocal}>{language.local}</Text>
                  </View>
                  {active && <CheckCircle color={colors.green} size={20} />}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={styles.continueButton}
              onPress={() => {
                void saveLanguagePreference(toAppLanguage(languageCodeFromLabel(selectedLanguage)));
                setOnboardingStep('done');
              }}
            >
              <Text style={styles.continueText}>Continue</Text>
              <ChevronRight color={colors.white} size={22} />
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    );
  }

  return (
    <I18nProvider>
      <UIPreferencesProvider>
        <StatusBar barStyle="light-content" backgroundColor={colors.night} />
        <NavigationContainer>
          <Tab.Navigator
            screenOptions={{
              headerShown: false,
              tabBarActiveTintColor: colors.green,
              tabBarInactiveTintColor: '#7A8780',
              tabBarStyle: styles.tabBar,
              tabBarLabelStyle: styles.tabLabel,
              tabBarItemStyle: styles.tabItem,
            }}
          >
          <Tab.Screen
            name="Consult"
            component={ClinicScreen}
            options={{
              tabBarIcon: ({ color }) => <Stethoscope color={color} size={22} />,
            }}
          />
          <Tab.Screen
            name="Guard"
            component={GuardScreen}
            options={{
              tabBarIcon: ({ color }) => <Shield color={color} size={22} />,
            }}
          />
          <Tab.Screen
            name="Cases"
            component={CasesScreen}
            options={{
              tabBarIcon: ({ color }) => <FileText color={color} size={22} />,
            }}
          />
          <Tab.Screen
            name="Settings"
            component={SettingsScreen}
            options={{
              tabBarIcon: ({ color }) => <Settings color={color} size={22} />,
            }}
          />
          </Tab.Navigator>
        </NavigationContainer>
      </UIPreferencesProvider>
    </I18nProvider>
  );
}

function languageCodeFromLabel(label: string): string {
  if (label === 'Hausa') return 'ha';
  if (label === 'Lingala') return 'ln';
  if (label === 'Français') return 'fr';
  if (label === 'Kinyarwanda') return 'rw';
  if (label === 'Somali') return 'so';
  if (label === 'العربية') return 'ar';
  return 'en';
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.paper,
  },
  loadingText: {
    color: colors.ink,
    marginTop: 10,
    fontSize: 16,
    fontWeight: '700',
  },
  tabBar: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 12,
    minHeight: 66,
    paddingTop: 7,
    paddingBottom: 8,
    backgroundColor: 'rgba(252,255,252,0.96)',
    borderTopWidth: 0,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DDE7E0',
    shadowColor: '#0F2A1C',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '800',
  },
  tabItem: {
    borderRadius: 8,
  },
  onboarding: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  splash: {
    backgroundColor: colors.night,
  },
  splashInner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  logoBox: {
    width: 92,
    height: 92,
    borderRadius: 24,
    backgroundColor: colors.paperStrong,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#DFF8E8',
  },
  logoCross: {
    color: colors.green,
    fontSize: 72,
    fontWeight: '900',
    lineHeight: 78,
  },
  brand: {
    color: colors.white,
    fontSize: 42,
    fontWeight: '900',
    marginTop: 24,
  },
  arabic: {
    color: colors.white,
    fontSize: 26,
    fontWeight: '800',
    marginTop: 4,
  },
  tagline: {
    color: '#D8F7E3',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 22,
  },
  dots: {
    flexDirection: 'row',
    marginTop: 64,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#557A68',
    marginHorizontal: 5,
  },
  dotActive: {
    backgroundColor: '#22C55E',
  },
  splashStatus: {
    color: '#4ADE80',
    position: 'absolute',
    bottom: 30,
    fontWeight: '800',
  },
  hiddenAdvance: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  setupPage: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 36,
  },
  setupTitle: {
    color: colors.ink,
    fontSize: 26,
    fontWeight: '900',
    marginTop: 22,
  },
  setupSubtitle: {
    color: colors.muted,
    fontSize: 15,
    marginTop: 4,
    marginBottom: 18,
  },
  optionRow: {
    minHeight: 64,
    borderRadius: 8,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DDE7E0',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  optionRowActive: {
    backgroundColor: colors.greenSoft,
    borderColor: colors.green,
  },
  flag: {
    fontSize: 32,
    width: 48,
  },
  optionText: {
    flex: 1,
  },
  optionLabel: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  optionLocal: {
    color: colors.green,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  radioActive: {
    backgroundColor: colors.green,
    borderColor: colors.green,
  },
  setupFooter: {
    color: colors.ink,
    textAlign: 'center',
    marginTop: 20,
    fontSize: 13,
    fontWeight: '600',
  },
  continueButton: {
    marginTop: 16,
    height: 54,
    borderRadius: 8,
    backgroundColor: colors.green,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  continueText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '900',
    marginRight: 12,
  },
});
