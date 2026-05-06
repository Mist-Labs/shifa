import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Switch,
} from 'react-native';
import { CountryCode, normalizePhone, saveCHWProfile } from '../services/chwProfile';

const COUNTRIES = [
  { label: 'Sudan', value: 'sudan', defaultLanguage: 'ar', code: 'SD' as CountryCode },
  { label: 'DRC', value: 'drc', defaultLanguage: 'ln', code: 'CD' as CountryCode },
  { label: 'Somalia', value: 'somalia', defaultLanguage: 'so', code: 'SO' as CountryCode },
];

const LANGUAGES = [
  { label: 'Arabic', value: 'ar' },
  { label: 'Somali', value: 'so' },
  { label: 'French', value: 'fr' },
  { label: 'Lingala', value: 'ln' },
  { label: 'Kinyarwanda', value: 'rw' },
];

export default function SettingsScreen() {
  const [country, setCountry] = useState('sudan');
  const [language, setLanguage] = useState('ar');
  const [chwName, setCHWName] = useState('');
  const [region, setRegion] = useState('');
  const [alertPhone, setAlertPhone] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [guardEnabled, setGuardEnabled] = useState(false);

  const selectCountry = (value: string) => {
    const selected = COUNTRIES.find((item) => item.value === value);
    setCountry(value);
    if (selected) setLanguage(selected.defaultLanguage);
  };

  const addRecipient = () => {
    const selected = COUNTRIES.find((item) => item.value === country) || COUNTRIES[0];
    const phone = normalizePhone(alertPhone.trim(), selected.code);
    if (!phone) {
      Alert.alert('Invalid phone number', 'Use an international number or a valid local field number.');
      return;
    }
    setRecipients((current) => (current.includes(phone) ? current : [...current, phone]));
    setAlertPhone('');
  };

  const saveProfile = async () => {
    const selected = COUNTRIES.find((item) => item.value === country) || COUNTRIES[0];
    if (!chwName.trim() || !region.trim()) {
      Alert.alert('Missing profile fields', 'CHW name and region are required for Guard alerts.');
      return;
    }
    await saveCHWProfile({
      id: `CHW-${selected.code}-${chwName.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 24)}`,
      name: chwName.trim(),
      country: country as any,
      countryCode: selected.code,
      language,
      region: region.trim(),
      alertRecipients: recipients,
      guardEnabled,
    });
    Alert.alert('Profile saved', 'SHIFA Guard alert recipients and profile are stored on this device.');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Profile</Text>
        <TextInput
          style={styles.input}
          placeholder="CHW Name"
          placeholderTextColor="#8B949E"
          value={chwName}
          onChangeText={setCHWName}
        />
        <TextInput
          style={styles.input}
          placeholder="Region / camp / field zone"
          placeholderTextColor="#8B949E"
          value={region}
          onChangeText={setRegion}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Location & Language</Text>
        <Text style={styles.label}>Country</Text>
        <View style={styles.segmentGroup}>
          {COUNTRIES.map((item) => (
            <TouchableOpacity
              key={item.value}
              style={[styles.segmentButton, country === item.value && styles.segmentButtonActive]}
              onPress={() => selectCountry(item.value)}
            >
              <Text style={[styles.segmentText, country === item.value && styles.segmentTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Language</Text>
        <View style={styles.segmentGroup}>
          {LANGUAGES.map((item) => (
            <TouchableOpacity
              key={item.value}
              style={[styles.segmentButton, language === item.value && styles.segmentButtonActive]}
              onPress={() => setLanguage(item.value)}
            >
              <Text style={[styles.segmentText, language === item.value && styles.segmentTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Guard Alert Recipients</Text>
        <View style={styles.toggleRow}>
          <Text style={styles.label}>Enable Guard alerts</Text>
          <Switch
            value={guardEnabled}
            onValueChange={setGuardEnabled}
            trackColor={{ false: '#30363D', true: '#16A34A' }}
            thumbColor={guardEnabled ? '#FFF' : '#8B949E'}
          />
        </View>
        <TextInput
          style={styles.input}
          placeholder="Phone number (e.g., +250700000000)"
          placeholderTextColor="#8B949E"
          value={alertPhone}
          onChangeText={setAlertPhone}
          keyboardType="phone-pad"
        />
        <TouchableOpacity style={styles.addButton} onPress={addRecipient}>
          <Text style={styles.addButtonText}>+ Add Recipient</Text>
        </TouchableOpacity>
        {recipients.map((recipient) => (
          <View key={recipient} style={styles.recipientRow}>
            <Text style={styles.infoText}>{recipient}</Text>
            <TouchableOpacity onPress={() => setRecipients((current) => current.filter((item) => item !== recipient))}>
              <Text style={styles.removeText}>Remove</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <Text style={styles.infoText}>SHIFA v1.0.0</Text>
        <Text style={styles.infoText}>Clinical decision support for CHWs</Text>
        <Text style={styles.infoText}>Built on Gemma 4 + LiteRT</Text>
      </View>

      <TouchableOpacity style={styles.syncButton} onPress={saveProfile}>
        <Text style={styles.syncButtonText}>Save Field Profile</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D1117',
  },
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#F0F6FC',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  label: {
    color: '#F0F6FC',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#161B22',
    borderColor: '#30363D',
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
    color: '#F0F6FC',
    fontSize: 14,
    marginBottom: 8,
  },
  segmentGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  segmentButton: {
    backgroundColor: '#161B22',
    borderColor: '#30363D',
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  segmentButtonActive: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
  },
  segmentText: {
    color: '#8B949E',
    fontSize: 13,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: '#FFF',
  },
  addButton: {
    backgroundColor: '#0284C7',
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  recipientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  removeText: {
    color: '#FCA5A5',
    fontWeight: '600',
  },
  addButtonText: {
    color: '#FFF',
    fontWeight: '600',
  },
  infoText: {
    color: '#8B949E',
    fontSize: 14,
    marginBottom: 4,
  },
  syncButton: {
    backgroundColor: '#16A34A',
    padding: 16,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
  },
  syncButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
