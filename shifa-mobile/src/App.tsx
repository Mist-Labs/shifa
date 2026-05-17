import React, { useCallback, useEffect, useRef, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, Alert, Animated, Platform, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import {
  CheckCircle,
  ChevronRight,
  Download,
  FileText,
  Globe,
  HardDrive,
  Settings,
  Shield,
  Stethoscope,
  Wifi,
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
import {
  dismissModelSetup,
  downloadClinicalModelArtifacts,
  getClinicalModelStatus,
  getFreeDiskBytes,
  ModelArtifactStatus,
  shouldShowModelSetup,
} from './services/modelManager';

const Tab = createBottomTabNavigator();

type OnboardingStep = 'splash' | 'modelSetup' | 'modelReady' | 'country' | 'language' | 'done';
const SPLASH_DURATION_MS = 2000;
const DOWNLOAD_BUFFER_BYTES = 1024 * 1024 * 1024;
const DEFAULT_OFFLINE_MODEL_BYTES = Platform.OS === 'ios' ? 3581190673 : 3424947569;
const SETUP_MESSAGES = [
  'Preparing WHO IMCI clinical protocols...',
  'Loading danger sign detection...',
  'Installing offline speech-to-text...',
  'Installing Guard firearm detection...',
  'Preparing multilingual field guidance...',
  'Configuring offline triage decisions...',
  'Securing local clinical inference...',
];

const countries = [
  { label: 'Sudan', local: 'السودان', flag: '🇸🇩' },
  { label: 'DR Congo', local: 'Kongo ya Boleki', flag: '🇨🇩' },
  { label: 'Somalia', local: 'Soomaaliya', flag: '🇸🇴' },
  { label: 'Nigeria', local: 'Arewa', flag: '🇳🇬' },
  { label: 'Rwanda', local: 'Rwanda', flag: '🇷🇼' },
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
  const [postSplashStep, setPostSplashStep] = useState<OnboardingStep>('done');
  const [selectedLanguage, setSelectedLanguage] = useState('English');
  const [modelStatus, setModelStatus] = useState<ModelArtifactStatus | null>(null);
  const [freeDiskBytes, setFreeDiskBytes] = useState<number | null>(null);
  const [modelDownloading, setModelDownloading] = useState(false);
  const [modelDownloadLabel, setModelDownloadLabel] = useState('');
  const [modelDownloadProgress, setModelDownloadProgress] = useState(0);
  const [modelDownloadBytes, setModelDownloadBytes] = useState({ written: 0, total: 0 });
  const [modelSetupMessage, setModelSetupMessage] = useState(SETUP_MESSAGES[0]);
  const onboardingOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const initialize = async () => {
      try {
        await initDatabase();
        const [status, freeBytes, showModelSetup] = await Promise.all([
          getClinicalModelStatus(),
          getFreeDiskBytes(),
          shouldShowModelSetup(),
        ]);
        setModelStatus(status);
        setFreeDiskBytes(freeBytes);
        setPostSplashStep(showModelSetup ? 'modelSetup' : 'done');
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

  const transitionFromSplash = useCallback((nextStep: OnboardingStep) => {
    Animated.timing(onboardingOpacity, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      setOnboardingStep(nextStep);
      if (nextStep === 'done') return;
      requestAnimationFrame(() => {
        Animated.timing(onboardingOpacity, {
          toValue: 1,
          duration: 260,
          useNativeDriver: true,
        }).start();
      });
    });
  }, [onboardingOpacity]);

  useEffect(() => {
    if (loading || onboardingStep !== 'splash') return;

    const timer = setTimeout(() => {
      transitionFromSplash(postSplashStep);
    }, SPLASH_DURATION_MS);

    return () => clearTimeout(timer);
  }, [loading, onboardingStep, postSplashStep, transitionFromSplash]);

  const continueWithoutOfflineModel = async () => {
    await dismissModelSetup();
    setOnboardingStep('done');
  };

  const downloadOfflineModel = async () => {
    if (modelDownloading) return;
    const neededBytes = modelStatus?.estimatedDownloadBytes ?? 0;
    if (freeDiskBytes && neededBytes && freeDiskBytes < neededBytes + DOWNLOAD_BUFFER_BYTES) {
      Alert.alert(
        'Not enough storage',
        `Free at least ${formatBytes(neededBytes + DOWNLOAD_BUFFER_BYTES - freeDiskBytes)} before downloading the offline clinical model.`
      );
      return;
    }

    setModelDownloading(true);
    setModelDownloadProgress(0);
    setModelDownloadLabel('Preparing download');
    try {
      const status = await downloadClinicalModelArtifacts((done, total, filename, percent, bytesWritten, totalBytes) => {
        const itemProgress = percent ?? 0;
        const overallProgress = total ? (done + itemProgress) / total : itemProgress;
        const boundedProgress = Math.min(1, overallProgress);
        setModelDownloadProgress(boundedProgress);
        setModelDownloadBytes({ written: bytesWritten ?? 0, total: totalBytes ?? neededBytes });
        setModelSetupMessage(SETUP_MESSAGES[Math.min(SETUP_MESSAGES.length - 1, Math.floor(boundedProgress * SETUP_MESSAGES.length))]);
        setModelDownloadLabel(`${filename} • ${Math.round(itemProgress * 100)}%`);
      });
      setModelStatus(status);
      setFreeDiskBytes(await getFreeDiskBytes());
      await dismissModelSetup();
      setModelDownloadProgress(1);
      setModelDownloadBytes({ written: status.estimatedDownloadBytes || neededBytes, total: status.estimatedDownloadBytes || neededBytes });
      setModelSetupMessage('SHIFA is ready to work offline.');
      setOnboardingStep('modelReady');
    } catch (error) {
      Alert.alert('Model download failed', error instanceof Error ? error.message : 'Unable to download the offline model.');
    } finally {
      setModelDownloading(false);
    }
  };

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
        <Animated.View style={[styles.onboardingFade, { opacity: onboardingOpacity }]}>
          {onboardingStep === 'splash' && (
          <View style={styles.splashInner}>
            <View style={styles.logoBox}>
              <Text style={styles.logoCross}>+</Text>
            </View>
            <Text style={styles.brand}>SHIFA</Text>
            <Text style={styles.arabic}>شفاء</Text>
            <Text style={styles.tagline}>Clinical guidance for care beyond the grid</Text>
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
              onPress={() => transitionFromSplash(postSplashStep)}
            />
          </View>
          )}

          {onboardingStep === 'modelSetup' && (
          <View style={styles.setupPage}>
            <View style={styles.modelSetupIcon}>
              <Download color={colors.white} size={34} strokeWidth={2.5} />
            </View>
            <Text style={styles.setupTitle}>Set up offline clinical AI</Text>
            <Text style={styles.setupSubtitle}>
              Download the mobile Gemma E2B model, offline voice input pack, and Guard firearm detector once. SHIFA will use them for field work when the device has no signal.
            </Text>

            <View style={styles.modelInfoCard}>
              <View style={styles.modelInfoRow}>
                <HardDrive color={colors.green} size={20} />
                <View style={styles.modelInfoCopy}>
                  <Text style={styles.modelInfoLabel}>Download size</Text>
                  <Text style={styles.modelInfoValue}>{formatBytes(modelStatus?.estimatedDownloadBytes ?? DEFAULT_OFFLINE_MODEL_BYTES)}</Text>
                </View>
              </View>
              <View style={styles.modelInfoRow}>
                <Wifi color={colors.green} size={20} />
                <View style={styles.modelInfoCopy}>
                  <Text style={styles.modelInfoLabel}>Recommended</Text>
                  <Text style={styles.modelInfoValue}>Wi-Fi or stable network, battery above 30%</Text>
                </View>
              </View>
              <View style={[styles.modelInfoRow, styles.modelInfoRowLast]}>
                <CheckCircle color={colors.green} size={20} />
                <View style={styles.modelInfoCopy}>
                  <Text style={styles.modelInfoLabel}>Available storage</Text>
                  <Text style={styles.modelInfoValue}>{freeDiskBytes ? formatBytes(freeDiskBytes) : 'Checking device storage'}</Text>
                </View>
              </View>
            </View>

            {modelDownloading && (
              <View style={styles.downloadProgressGroup}>
                <View style={styles.downloadProgressHeader}>
                  <Text style={styles.downloadPercent}>{Math.round(modelDownloadProgress * 100)}%</Text>
                  <Text style={styles.downloadBytes}>
                    {formatBytes(modelDownloadBytes.written)} / {formatBytes(modelDownloadBytes.total || modelStatus?.estimatedDownloadBytes || DEFAULT_OFFLINE_MODEL_BYTES)}
                  </Text>
                </View>
                <View style={styles.downloadTrack}>
                  <View style={[styles.downloadFill, { width: `${Math.round(modelDownloadProgress * 100)}%` }]} />
                </View>
                <Text style={styles.downloadPurpose}>{modelSetupMessage}</Text>
                <Text style={styles.downloadLabel}>{modelDownloadLabel}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.continueButton, modelDownloading && styles.disabledButton]}
              onPress={downloadOfflineModel}
              disabled={modelDownloading}
            >
              <Text style={styles.continueText}>{modelDownloading ? 'Downloading' : 'Download offline model'}</Text>
              <ChevronRight color={colors.white} size={22} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryButton} onPress={continueWithoutOfflineModel} disabled={modelDownloading}>
              <Text style={styles.secondaryButtonText}>Continue with cloud/protocol fallback</Text>
            </TouchableOpacity>
          </View>
          )}

          {onboardingStep === 'modelReady' && (
          <View style={styles.setupPage}>
            <View style={styles.readyIcon}>
              <CheckCircle color={colors.white} size={42} strokeWidth={2.5} />
            </View>
            <Text style={styles.setupTitle}>SHIFA is ready offline</Text>
            <Text style={styles.setupSubtitle}>
              The clinical AI model is stored on this device. You can assess patients even when the network drops.
            </Text>
            <View style={styles.readyCard}>
              <View style={styles.readyRow}>
                <CheckCircle color={colors.green} size={20} />
                <Text style={styles.readyText}>Offline clinical inference enabled</Text>
              </View>
              <View style={styles.readyRow}>
                <CheckCircle color={colors.green} size={20} />
                <Text style={styles.readyText}>Offline speech-to-text model installed</Text>
              </View>
              <View style={styles.readyRow}>
                <CheckCircle color={colors.green} size={20} />
                <Text style={styles.readyText}>Guard firearm detector model installed</Text>
              </View>
              <View style={styles.readyRow}>
                <CheckCircle color={colors.green} size={20} />
                <Text style={styles.readyText}>WHO/IMCI safety guardrails active</Text>
              </View>
              <View style={styles.readyRow}>
                <CheckCircle color={colors.green} size={20} />
                <Text style={styles.readyText}>Results can be spoken in the selected CHW language</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.continueButton} onPress={() => setOnboardingStep('done')}>
              <Text style={styles.continueText}>Enter SHIFA</Text>
              <ChevronRight color={colors.white} size={22} />
            </TouchableOpacity>
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
        </Animated.View>
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

function formatBytes(bytes: number): string {
  if (!bytes) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(0)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
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
    left: 18,
    right: 18,
    bottom: 8,
    minHeight: 58,
    paddingTop: 5,
    paddingBottom: 5,
    backgroundColor: 'rgba(252,255,252,0.94)',
    borderTopWidth: 0,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DDE7E0',
    shadowColor: '#0F2A1C',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 7,
  },
  tabLabel: {
    fontSize: 10,
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
  onboardingFade: {
    flex: 1,
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
  disabledButton: {
    opacity: 0.72,
  },
  secondaryButton: {
    height: 50,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    backgroundColor: colors.white,
  },
  secondaryButtonText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  modelSetupIcon: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  modelInfoCard: {
    backgroundColor: colors.white,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    marginTop: 8,
    marginBottom: 14,
  },
  modelInfoRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  modelInfoRowLast: {
    borderBottomWidth: 0,
  },
  modelInfoCopy: {
    flex: 1,
    marginLeft: 12,
  },
  modelInfoLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  modelInfoValue: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 3,
  },
  downloadProgressGroup: {
    marginBottom: 12,
    backgroundColor: colors.white,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    padding: 14,
  },
  downloadProgressHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  downloadPercent: {
    color: colors.green,
    fontSize: 24,
    fontWeight: '900',
  },
  downloadBytes: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  downloadTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: '#DCE8DF',
    overflow: 'hidden',
  },
  downloadFill: {
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.green,
  },
  downloadPurpose: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '900',
    marginTop: 12,
  },
  downloadLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 5,
  },
  readyIcon: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
  },
  readyCard: {
    backgroundColor: colors.white,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    marginTop: 10,
    marginBottom: 10,
    padding: 14,
  },
  readyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  readyText: {
    flex: 1,
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
    marginLeft: 10,
  },
});
