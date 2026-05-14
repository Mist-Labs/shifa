import React, { useCallback, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Bell, Check, Cloud, Download, Globe2, Languages, MapPin, Moon, Plus, Server, Trash2, User } from 'lucide-react-native';
import { CountryCode, getActiveCHWProfile, normalizePhone, saveCHWProfile } from '../services/chwProfile';
import { colors } from '../design/system';
import { useUIPreferences } from '../services/uiPreferences';
import { saveLanguagePreference, toAppLanguage, useI18n } from '../services/i18n';
import { isGeminiConfigured } from '../services/gemini';
import { getHealthSyncSummary, HealthSyncSummary } from '../services/syncReports';
import { downloadClinicalModelArtifacts, getClinicalModelStatus, ModelArtifactStatus } from '../services/modelManager';

const COUNTRIES = [
  { label: 'Sudan', value: 'sudan', defaultLanguage: 'ar', code: 'SD' as CountryCode },
  { label: 'DR Congo', value: 'drc', defaultLanguage: 'ln', code: 'CD' as CountryCode },
  { label: 'Somalia', value: 'somalia', defaultLanguage: 'so', code: 'SO' as CountryCode },
  { label: 'Nigeria', value: 'nigeria', defaultLanguage: 'ha', code: 'NG' as CountryCode },
  { label: 'Rwanda', value: 'rwanda', defaultLanguage: 'rw', code: 'RW' as CountryCode },
];

const LANGUAGES = [
  { label: 'English', value: 'en' },
  { label: 'Arabic', value: 'ar' },
  { label: 'Somali', value: 'so' },
  { label: 'French', value: 'fr' },
  { label: 'Lingala', value: 'ln' },
  { label: 'Kinyarwanda', value: 'rw' },
  { label: 'Hausa', value: 'ha' },
];

const SELECTED_COUNTRY = (country: string) => COUNTRIES.find((item) => item.value === country) || COUNTRIES[0];
const SELECTED_LANGUAGE = (language: string) => LANGUAGES.find((item) => item.value === language) || LANGUAGES[0];

export default function SettingsScreen() {
  const [country, setCountry] = useState('sudan');
  const [language, setLanguage] = useState('ar');
  const [chwName, setCHWName] = useState('');
  const [region, setRegion] = useState('');
  const [alertPhone, setAlertPhone] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [guardEnabled, setGuardEnabled] = useState(false);
  const [syncSummary, setSyncSummary] = useState<HealthSyncSummary | null>(null);
  const [modelStatus, setModelStatus] = useState<ModelArtifactStatus | null>(null);
  const [modelDownloading, setModelDownloading] = useState(false);
  const [modelDownloadLabel, setModelDownloadLabel] = useState('');
  const [profileDirty, setProfileDirty] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { darkMode, setDarkMode } = useUIPreferences();
  const { t, setLanguage: setAppLanguage } = useI18n();

  const loadProfile = useCallback(async () => {
    const [profile, nextSyncSummary, nextModelStatus] = await Promise.all([getActiveCHWProfile(), getHealthSyncSummary(), getClinicalModelStatus()]);
    setSyncSummary(nextSyncSummary);
    setModelStatus(nextModelStatus);
    if (profile.id !== 'CHW-UNCONFIGURED') {
      setCountry(profile.country);
      setLanguage(profile.language);
      setCHWName(profile.name);
      setRegion(profile.region);
      setRecipients(profile.alertRecipients);
      setGuardEnabled(profile.guardEnabled);
      setProfileDirty(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadProfile().finally(() => {
        if (!active) return;
      });
      return () => {
        active = false;
      };
    }, [loadProfile])
  );

  const refreshSettings = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadProfile();
    } finally {
      setRefreshing(false);
    }
  }, [loadProfile]);

  const selectCountry = (value: string) => {
    const selected = COUNTRIES.find((item) => item.value === value);
    setCountry(value);
    if (selected) {
      setLanguage(selected.defaultLanguage);
      void setAppLanguage(toAppLanguage(selected.defaultLanguage));
    }
    setProfileDirty(true);
  };

  const downloadModelArtifacts = async () => {
    setModelDownloading(true);
    setModelDownloadLabel('Starting download');
    try {
      const status = await downloadClinicalModelArtifacts((done, total, filename) => {
        setModelDownloadLabel(`${done}/${total} ${filename}`);
      });
      setModelStatus(status);
      const readyMessage = status.liteRTRuntimeReady
        ? 'A LiteRT runtime model is stored on this device. SHIFA will try local inference before cloud or protocol fallback.'
        : status.ggufRuntimeReady
          ? 'The E2B GGUF runtime model is stored on this device. SHIFA will try offline local inference before cloud or protocol fallback.'
          : 'No local runtime model is stored on this device yet. Download the E2B GGUF model for offline clinical inference.';
      Alert.alert(
        'Model artifacts ready',
        readyMessage
      );
    } catch (error) {
      Alert.alert('Model download failed', error instanceof Error ? error.message : 'Unable to download model artifacts.');
    } finally {
      setModelDownloading(false);
    }
  };

  const addRecipient = () => {
    const selected = COUNTRIES.find((item) => item.value === country) || COUNTRIES[0];
    const phone = normalizePhone(alertPhone.trim(), selected.code);
    if (!phone) {
      Alert.alert('Invalid phone number', 'Use international E.164 format or a valid local number for this country.');
      return;
    }
    setRecipients((current) => (current.includes(phone) ? current : [...current, phone]));
    setAlertPhone('');
    setProfileDirty(true);
  };

  const saveProfile = async () => {
    const selected = COUNTRIES.find((item) => item.value === country) || COUNTRIES[0];
    const pendingPhone = alertPhone.trim() ? normalizePhone(alertPhone.trim(), selected.code) : null;
    if (alertPhone.trim() && !pendingPhone) {
      Alert.alert('Invalid phone number', 'Use international E.164 format or a valid local number for this country.');
      return;
    }
    const savedRecipients = pendingPhone
      ? Array.from(new Set([...recipients, pendingPhone]))
      : recipients;

    if (!chwName.trim() || !region.trim()) {
      Alert.alert('Missing profile fields', 'CHW name and region are required for Guard alerts.');
      return;
    }
    if (guardEnabled && savedRecipients.length === 0) {
      Alert.alert('Alert recipients required', 'Add at least one coordinator number before enabling SHIFA Guard.');
      return;
    }
    await saveCHWProfile({
      id: `CHW-${selected.code}-${chwName.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 24)}`,
      name: chwName.trim(),
      country: country as 'sudan' | 'drc' | 'somalia' | 'nigeria' | 'rwanda',
      countryCode: selected.code,
      language,
      region: region.trim(),
      alertRecipients: savedRecipients,
      guardEnabled,
    });
    await saveLanguagePreference(toAppLanguage(language));
    await setAppLanguage(toAppLanguage(language));
    setRecipients(savedRecipients);
    setAlertPhone('');
    setProfileDirty(false);
    Alert.alert(t('profileSaved'), t('profileSavedMessage'));
  };

  return (
    <SafeAreaView style={[styles.screen, darkMode && styles.dimScreen]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshSettings}
            tintColor={darkMode ? '#C4B5FD' : colors.green}
            colors={[colors.green]}
          />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, darkMode && styles.dimText]}>{t('settings')}</Text>
            <Text style={[styles.subtitle, darkMode && styles.dimMuted]}>
              {SELECTED_COUNTRY(country).label} • {SELECTED_LANGUAGE(language).label}
            </Text>
          </View>
          <View style={[styles.statusPill, profileDirty && styles.statusPillDirty, darkMode && styles.dimStatusPill]}>
            <Text style={[styles.statusPillText, profileDirty && styles.statusPillTextDirty]}>
              {profileDirty ? 'Unsaved' : 'Saved'}
            </Text>
          </View>
        </View>

        <Text style={[styles.sectionTitle, darkMode && styles.dimSectionTitle]}>PROFILE</Text>
        <View style={[styles.card, darkMode && styles.dimCard]}>
          <SettingRow icon={<User color={darkMode ? '#A7F3D0' : colors.green} size={20} />} label={t('chwName')} value={chwName} onChangeText={setCHWName} onDirty={() => setProfileDirty(true)} dim={darkMode} />
          <SettingRow icon={<MapPin color={darkMode ? '#A7F3D0' : colors.green} size={20} />} label={t('region')} value={region} onChangeText={setRegion} onDirty={() => setProfileDirty(true)} dim={darkMode} last />
        </View>

        <Text style={[styles.sectionTitle, darkMode && styles.dimSectionTitle]}>LOCALIZATION</Text>
        <View style={[styles.card, darkMode && styles.dimCard]}>
          <View style={styles.groupHeader}>
            <Globe2 color={darkMode ? '#A7F3D0' : colors.green} size={18} />
            <Text style={[styles.groupTitle, darkMode && styles.dimAccent]}>{t('country')}</Text>
          </View>
          <View style={styles.segmentGroup}>
            {COUNTRIES.map((item) => (
              <TouchableOpacity
                key={item.value}
                style={[
                  styles.segment,
                  country === item.value && styles.segmentActive,
                  darkMode && styles.dimSegment,
                  country === item.value && darkMode && styles.dimSegmentActive,
                ]}
                onPress={() => selectCountry(item.value)}
              >
                {country === item.value && <Check color={country === item.value && darkMode ? '#06391F' : colors.white} size={14} strokeWidth={3} />}
                <Text
                  style={[
                    styles.segmentText,
                    country === item.value && styles.segmentTextActive,
                    darkMode && styles.dimSegmentText,
                    country === item.value && darkMode && styles.dimSegmentTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={[styles.groupHeader, styles.groupHeaderSpaced]}>
            <Languages color={darkMode ? '#A7F3D0' : colors.green} size={18} />
            <Text style={[styles.groupTitle, darkMode && styles.dimAccent]}>{t('language')}</Text>
          </View>
          <View style={styles.segmentGroup}>
            {LANGUAGES.map((item) => (
              <TouchableOpacity
                key={item.value}
                style={[
                  styles.segment,
                  language === item.value && styles.segmentActive,
                  darkMode && styles.dimSegment,
                  language === item.value && darkMode && styles.dimSegmentActive,
                ]}
                onPress={() => {
                  setLanguage(item.value);
                  void setAppLanguage(toAppLanguage(item.value));
                  setProfileDirty(true);
                }}
              >
                {language === item.value && <Check color={language === item.value && darkMode ? '#06391F' : colors.white} size={14} strokeWidth={3} />}
                <Text
                  style={[
                    styles.segmentText,
                    language === item.value && styles.segmentTextActive,
                    darkMode && styles.dimSegmentText,
                    language === item.value && darkMode && styles.dimSegmentTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <Text style={[styles.sectionTitle, darkMode && styles.dimSectionTitle]}>{t('shifaGuard')}</Text>
        <View style={[styles.card, darkMode && styles.dimCard]}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleTextGroup}>
              <Bell color={darkMode ? '#C4B5FD' : colors.green} size={20} />
              <View style={styles.toggleCopy}>
              <Text style={[styles.toggleLabel, darkMode && styles.dimText]}>{t('guardActive')}</Text>
              <Text style={[styles.toggleHint, darkMode && styles.dimMuted]}>{t('guardActiveHint')}</Text>
              </View>
            </View>
            <Switch
              value={guardEnabled}
              onValueChange={(enabled) => {
                setGuardEnabled(enabled);
                setProfileDirty(true);
              }}
              trackColor={{ false: colors.lineStrong, true: colors.green }}
              thumbColor={colors.white}
            />
          </View>

          <Text style={[styles.groupTitle, darkMode && styles.dimAccent]}>{t('alertRecipients')}</Text>
          {recipients.length === 0 && (
            <View style={[styles.emptyRecipients, darkMode && styles.dimRecipient]}>
              <Text style={[styles.emptyRecipientsText, darkMode && styles.dimMuted]}>No alert recipients saved</Text>
            </View>
          )}
          {recipients.map((recipient) => (
            <View key={recipient} style={[styles.recipientRow, darkMode && styles.dimRecipient]}>
              <Text style={[styles.recipientText, darkMode && styles.dimText]}>{recipient}</Text>
              <TouchableOpacity
                onPress={() => {
                  setRecipients((current) => current.filter((item) => item !== recipient));
                  setProfileDirty(true);
                }}
              >
                <Trash2 color={darkMode ? '#C4B5FD' : colors.red} size={20} />
              </TouchableOpacity>
            </View>
          ))}

          <View style={styles.addRow}>
            <TextInput
              style={[styles.phoneInput, darkMode && styles.dimInput]}
              placeholder={t('phoneNumber')}
              placeholderTextColor={darkMode ? '#A79BB8' : colors.muted}
              value={alertPhone}
              onChangeText={(value) => {
                setAlertPhone(value);
                setProfileDirty(true);
              }}
              keyboardType="phone-pad"
            />
            <TouchableOpacity style={styles.addButton} onPress={addRecipient}>
              <Plus color={colors.white} size={22} />
            </TouchableOpacity>
          </View>
        </View>

        <Text style={[styles.sectionTitle, darkMode && styles.dimSectionTitle]}>READINESS</Text>
        <View style={[styles.card, darkMode && styles.dimCard]}>
          <ReadinessRow
            icon={<Cloud color={isGeminiConfigured() ? colors.green : colors.amber} size={20} />}
            label="Clinical AI"
            value={modelStatus?.liteRTRuntimeReady ? 'LiteRT runtime model on device' : modelStatus?.ggufRuntimeReady ? 'Offline E2B GGUF ready' : isGeminiConfigured() ? 'Cloud fallback configured' : 'Protocol rules only'}
            tone={modelStatus?.liteRTRuntimeReady || modelStatus?.ggufRuntimeReady || isGeminiConfigured() ? 'good' : 'warn'}
            dim={darkMode}
          />
          <ReadinessRow
            icon={<Download color={modelStatus?.runtimeReady ? colors.green : modelStatus?.ready ? colors.amber : colors.amber} size={20} />}
            label="Model files"
            value={
              modelStatus?.configured
                ? `${modelStatus.liteRTRuntimeReady ? 'LiteRT ready' : modelStatus.ggufRuntimeReady ? 'E2B GGUF ready' : 'runtime missing'} • ${modelStatus.requiredDownloadedCount}/${modelStatus.requiredCount} required files • ${formatBytes(modelStatus.totalBytes)}`
                : 'Set EXPO_PUBLIC_SHIFA_MODEL_BASE_URL'
            }
            tone={modelStatus?.runtimeReady ? 'good' : 'warn'}
            dim={darkMode}
          />
          <ReadinessRow
            icon={<Server color={(syncSummary?.failedReports ?? 0) > 0 ? colors.red : colors.green} size={20} />}
            label="Data center"
            value={syncSummary?.destination ?? 'Not loaded'}
            tone={(syncSummary?.failedReports ?? 0) > 0 ? 'bad' : 'good'}
            dim={darkMode}
          />
          <ReadinessRow
            icon={<Check color={(syncSummary?.queuedReports ?? 0) > 0 ? colors.amber : colors.green} size={20} />}
            label="Reports"
            value={`${syncSummary?.sentReports ?? 0} sent • ${syncSummary?.queuedReports ?? 0} queued • ${syncSummary?.failedReports ?? 0} failed`}
            tone={(syncSummary?.failedReports ?? 0) > 0 ? 'bad' : (syncSummary?.queuedReports ?? 0) > 0 ? 'warn' : 'good'}
            dim={darkMode}
            last
          />
          <TouchableOpacity
            style={[styles.modelDownloadButton, (!modelStatus?.configured || modelDownloading) && styles.modelDownloadButtonDisabled]}
            onPress={downloadModelArtifacts}
            disabled={!modelStatus?.configured || modelDownloading}
          >
            <Download color={colors.white} size={18} />
            <Text style={styles.modelDownloadText}>{modelDownloading ? modelDownloadLabel : modelStatus?.runtimeReady ? 'Refresh offline model' : 'Download offline model'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionTitle, darkMode && styles.dimSectionTitle]}>{t('display')}</Text>
        <View style={[styles.card, darkMode && styles.dimCard]}>
          <View style={[styles.toggleRow, styles.toggleRowLast]}>
            <View style={styles.toggleTextGroup}>
              <Moon color={darkMode ? '#C4B5FD' : colors.purple} size={20} />
              <View style={styles.toggleCopy}>
              <Text style={[styles.toggleLabel, darkMode && styles.dimText]}>{t('darkMode')}</Text>
              </View>
            </View>
            <Switch
              value={darkMode}
              onValueChange={setDarkMode}
              trackColor={{ false: colors.lineStrong, true: colors.purple }}
              thumbColor={colors.white}
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.saveButton, !profileDirty && styles.saveButtonDisabled]}
          onPress={saveProfile}
          disabled={!profileDirty}
        >
          <Text style={[styles.saveText, !profileDirty && styles.saveTextDisabled]}>{t('saveProfile')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function SettingRow({
  icon,
  label,
  value,
  onChangeText,
  onDirty,
  dim,
  last,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  onDirty: () => void;
  dim: boolean;
  last?: boolean;
}) {
  return (
    <View style={[styles.settingRow, last && styles.settingRowLast, dim && styles.dimSettingRow]}>
      <View style={styles.settingIcon}>{icon}</View>
      <Text style={[styles.settingLabel, dim && styles.dimAccent]}>{label}</Text>
      <TextInput
        style={[styles.settingInput, dim && styles.dimText]}
        value={value}
        onChangeText={(nextValue) => {
          onChangeText(nextValue);
          onDirty();
        }}
        placeholder={label}
        placeholderTextColor={dim ? '#A79BB8' : colors.muted}
      />
    </View>
  );
}

function ReadinessRow({
  icon,
  label,
  value,
  tone,
  dim,
  last,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: 'good' | 'warn' | 'bad';
  dim: boolean;
  last?: boolean;
}) {
  return (
    <View style={[styles.readinessRow, last && styles.settingRowLast, dim && styles.dimSettingRow]}>
      <View style={styles.settingIcon}>{icon}</View>
      <View style={styles.readinessCopy}>
        <Text style={[styles.settingLabel, dim && styles.dimAccent]}>{label}</Text>
        <Text style={[styles.readinessValue, dim && styles.dimMuted]} numberOfLines={1}>{value}</Text>
      </View>
      <View style={[styles.readinessDot, styles[`readinessDot_${tone}`]]} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F6F8F5',
  },
  dimScreen: {
    backgroundColor: colors.night,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 160,
  },
  header: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    color: colors.ink,
    fontSize: 30,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.muted,
    marginTop: 3,
    fontSize: 14,
    fontWeight: '800',
  },
  statusPill: {
    minWidth: 76,
    height: 34,
    borderRadius: 999,
    backgroundColor: '#E8F5ED',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#C9EBD7',
  },
  statusPillDirty: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
  },
  dimStatusPill: {
    backgroundColor: '#062719',
    borderColor: '#145C39',
  },
  statusPillText: {
    color: colors.green,
    fontSize: 12,
    fontWeight: '900',
  },
  statusPillTextDirty: {
    color: '#B45309',
  },
  sectionTitle: {
    color: '#6B7970',
    fontSize: 12,
    fontWeight: '900',
    marginTop: 16,
    marginBottom: 7,
    marginLeft: 4,
    letterSpacing: 0,
  },
  dimSectionTitle: {
    color: '#A7F3D0',
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DDE7E0',
    overflow: 'hidden',
  },
  dimCard: {
    backgroundColor: colors.nightPanel,
    borderColor: '#145C39',
  },
  settingRow: {
    minHeight: 58,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5ECE7',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  settingRowLast: {
    borderBottomWidth: 0,
  },
  dimSettingRow: {
    borderBottomColor: '#145C39',
  },
  settingIcon: {
    width: 30,
    alignItems: 'flex-start',
  },
  settingLabel: {
    width: 96,
    color: colors.ink,
    fontWeight: '800',
    fontSize: 15,
  },
  settingInput: {
    flex: 1,
    color: colors.ink,
    fontWeight: '700',
    textAlign: 'right',
    fontSize: 15,
    paddingVertical: 12,
  },
  readinessRow: {
    minHeight: 64,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5ECE7',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  readinessCopy: {
    flex: 1,
    paddingRight: 10,
  },
  readinessValue: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  readinessDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  readinessDot_good: {
    backgroundColor: colors.green,
  },
  readinessDot_warn: {
    backgroundColor: colors.amber,
  },
  readinessDot_bad: {
    backgroundColor: colors.red,
  },
  modelDownloadButton: {
    minHeight: 46,
    margin: 12,
    borderRadius: 8,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  modelDownloadButtonDisabled: {
    backgroundColor: colors.lineStrong,
  },
  modelDownloadText: {
    color: colors.white,
    fontWeight: '900',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 8,
    gap: 8,
  },
  groupHeaderSpaced: {
    paddingTop: 8,
  },
  groupTitle: {
    color: colors.green,
    fontWeight: '900',
    fontSize: 13,
  },
  segmentGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  segment: {
    minHeight: 36,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DDE7E0',
    backgroundColor: '#F7FAF8',
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    marginRight: 7,
    marginBottom: 7,
  },
  segmentActive: {
    backgroundColor: colors.green,
    borderColor: colors.green,
  },
  dimSegment: {
    backgroundColor: '#062719',
    borderColor: '#145C39',
  },
  dimSegmentActive: {
    backgroundColor: '#BDF7D0',
    borderColor: '#86EFAC',
  },
  segmentText: {
    color: colors.ink,
    fontWeight: '800',
    fontSize: 13,
  },
  segmentTextActive: {
    color: colors.white,
  },
  dimSegmentText: {
    color: '#86EFAC',
  },
  dimSegmentTextActive: {
    color: '#06391F',
  },
  toggleRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5ECE7',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  toggleRowLast: {
    borderBottomWidth: 0,
  },
  toggleTextGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 16,
  },
  toggleCopy: {
    flex: 1,
    marginLeft: 10,
  },
  toggleLabel: {
    color: colors.ink,
    fontWeight: '800',
    fontSize: 15,
  },
  toggleHint: {
    color: colors.muted,
    fontWeight: '600',
    marginTop: 3,
    fontSize: 12,
    lineHeight: 16,
  },
  recipientRow: {
    minHeight: 44,
    backgroundColor: '#F7FAF8',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5ECE7',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  dimRecipient: {
    backgroundColor: '#062719',
    borderColor: '#145C39',
  },
  recipientText: {
    color: colors.ink,
    fontWeight: '800',
    fontSize: 14,
  },
  emptyRecipients: {
    minHeight: 42,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5ECE7',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  emptyRecipientsText: {
    color: colors.muted,
    fontWeight: '700',
    fontSize: 13,
  },
  addRow: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5ECE7',
  },
  phoneInput: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DDE7E0',
    backgroundColor: '#F7FAF8',
    color: colors.ink,
    paddingHorizontal: 12,
    fontWeight: '700',
  },
  dimInput: {
    backgroundColor: '#062719',
    borderColor: '#145C39',
    color: colors.white,
  },
  addButton: {
    width: 46,
    height: 44,
    borderRadius: 8,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  saveButton: {
    minHeight: 52,
    borderRadius: 8,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  saveButtonDisabled: {
    backgroundColor: '#D6E2DA',
    borderWidth: 1,
    borderColor: colors.line,
  },
  saveText: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '900',
  },
  saveTextDisabled: {
    color: '#7A8A82',
  },
  dimText: {
    color: colors.white,
  },
  dimMuted: {
    color: '#A7F3D0',
  },
  dimAccent: {
    color: '#86EFAC',
  },
});
