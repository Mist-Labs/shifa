import React, { useCallback, useState } from 'react';
import {
  Alert,
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
import { Plus, Trash2 } from 'lucide-react-native';
import { CountryCode, getActiveCHWProfile, normalizePhone, saveCHWProfile } from '../services/chwProfile';
import { colors, fieldShadow } from '../design/system';
import { useUIPreferences } from '../services/uiPreferences';
import { saveLanguagePreference, toAppLanguage, useI18n } from '../services/i18n';

const COUNTRIES = [
  { label: 'Sudan', value: 'sudan', defaultLanguage: 'ar', code: 'SD' as CountryCode },
  { label: 'DR Congo', value: 'drc', defaultLanguage: 'ln', code: 'CD' as CountryCode },
  { label: 'Somalia', value: 'somalia', defaultLanguage: 'so', code: 'SO' as CountryCode },
  { label: 'Nigeria', value: 'nigeria', defaultLanguage: 'ha', code: 'NG' as CountryCode },
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

export default function SettingsScreen() {
  const [country, setCountry] = useState('sudan');
  const [language, setLanguage] = useState('ar');
  const [chwName, setCHWName] = useState('');
  const [region, setRegion] = useState('');
  const [alertPhone, setAlertPhone] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [guardEnabled, setGuardEnabled] = useState(false);
  const [profileDirty, setProfileDirty] = useState(false);
  const { darkMode, setDarkMode } = useUIPreferences();
  const { t, setLanguage: setAppLanguage } = useI18n();

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getActiveCHWProfile().then((profile) => {
        if (!active || profile.id === 'CHW-UNCONFIGURED') return;
        setCountry(profile.country);
        setLanguage(profile.language);
        setCHWName(profile.name);
        setRegion(profile.region);
        setRecipients(profile.alertRecipients);
        setGuardEnabled(profile.guardEnabled);
        setProfileDirty(false);
      });
      return () => {
        active = false;
      };
    }, [])
  );

  const selectCountry = (value: string) => {
    const selected = COUNTRIES.find((item) => item.value === value);
    setCountry(value);
    if (selected) {
      setLanguage(selected.defaultLanguage);
      void setAppLanguage(toAppLanguage(selected.defaultLanguage));
    }
    setProfileDirty(true);
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
      country: country as 'sudan' | 'drc' | 'somalia' | 'nigeria',
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
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, darkMode && styles.dimText]}>{t('settings')}</Text>

        <View style={[styles.card, darkMode && styles.dimCard]}>
          <SettingRow label={t('chwName')} value={chwName} onChangeText={setCHWName} onDirty={() => setProfileDirty(true)} dim={darkMode} />
          <SettingRow label={t('region')} value={region} onChangeText={setRegion} onDirty={() => setProfileDirty(true)} dim={darkMode} />

          <Text style={[styles.groupTitle, darkMode && styles.dimAccent]}>{t('country')}</Text>
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

          <Text style={[styles.groupTitle, darkMode && styles.dimAccent]}>{t('language')}</Text>
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

        <Text style={[styles.sectionTitle, darkMode && styles.dimText]}>{t('shifaGuard')}</Text>
        <View style={[styles.card, darkMode && styles.dimCard]}>
          <View style={styles.toggleRow}>
            <View>
              <Text style={[styles.toggleLabel, darkMode && styles.dimText]}>{t('guardActive')}</Text>
              <Text style={[styles.toggleHint, darkMode && styles.dimMuted]}>{t('guardActiveHint')}</Text>
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

        <Text style={[styles.sectionTitle, darkMode && styles.dimText]}>{t('display')}</Text>
        <View style={[styles.card, darkMode && styles.dimCard]}>
          <View style={styles.toggleRow}>
            <View>
              <Text style={[styles.toggleLabel, darkMode && styles.dimText]}>{t('darkMode')}</Text>
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

function SettingRow({
  label,
  value,
  onChangeText,
  onDirty,
  dim,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  onDirty: () => void;
  dim: boolean;
}) {
  return (
    <View style={[styles.settingRow, dim && styles.dimSettingRow]}>
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  dimScreen: {
    backgroundColor: colors.night,
  },
  content: {
    padding: 18,
    paddingBottom: 44,
  },
  title: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 14,
  },
  sectionTitle: {
    color: colors.green,
    fontSize: 15,
    fontWeight: '900',
    marginTop: 18,
    marginBottom: 8,
  },
  card: {
    backgroundColor: colors.paperStrong,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.line,
    padding: 12,
    ...fieldShadow,
  },
  dimCard: {
    backgroundColor: colors.nightPanel,
    borderColor: '#145C39',
  },
  settingRow: {
    minHeight: 54,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dimSettingRow: {
    borderBottomColor: '#145C39',
  },
  settingLabel: {
    width: 110,
    color: colors.green,
    fontWeight: '900',
  },
  settingInput: {
    flex: 1,
    color: colors.ink,
    fontWeight: '900',
    textAlign: 'right',
  },
  groupTitle: {
    color: colors.green,
    fontWeight: '900',
    marginTop: 14,
    marginBottom: 8,
  },
  segmentGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  segment: {
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.paper,
    paddingHorizontal: 12,
    justifyContent: 'center',
    marginRight: 8,
    marginBottom: 8,
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
    fontWeight: '900',
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
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  toggleLabel: {
    color: colors.ink,
    fontWeight: '900',
    fontSize: 15,
  },
  toggleHint: {
    color: colors.muted,
    fontWeight: '700',
    marginTop: 3,
    maxWidth: 245,
  },
  recipientRow: {
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: colors.greenSoft,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    marginBottom: 7,
  },
  dimRecipient: {
    backgroundColor: '#062719',
    borderColor: '#145C39',
  },
  recipientText: {
    color: colors.green,
    fontWeight: '900',
  },
  addRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  phoneInput: {
    flex: 1,
    height: 50,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    backgroundColor: colors.paper,
    color: colors.ink,
    paddingHorizontal: 12,
    fontWeight: '800',
  },
  dimInput: {
    backgroundColor: '#062719',
    borderColor: '#145C39',
    color: colors.white,
  },
  addButton: {
    width: 54,
    height: 50,
    borderRadius: 8,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  saveButton: {
    minHeight: 58,
    borderRadius: 8,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
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
