import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native';
import axios from 'axios';

const API_BASE = 'http://localhost:3000/api';

export default function ClinicScreen() {
  const [symptoms, setSymptoms] = useState('');
  const [age, setAge] = useState('');
  const [weight, setWeight] = useState('');
  const [muac, setMuac] = useState('');
  const [bilateralEdema, setBilateralEdema] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleConsult = async () => {
    setLoading(true);
    try {
      const response = await axios.post(`${API_BASE}/cases/analyze`, {
        chwId: 'test-chw',
        country: 'sudan',
        language: 'ar',
        symptomText: symptoms,
        patient: {
          ageMonths: age ? parseInt(age) : undefined,
          weightKg: weight ? parseFloat(weight) : undefined,
          muacCm: muac ? parseFloat(muac) : undefined,
          bilateralEdema,
        },
      });
      setResult(response.data.decision);
    } catch (error) {
      console.error('Consultation error:', error);
      Alert.alert('Consultation failed', 'Unable to analyze this case right now.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.form}>
        <Text style={styles.label}>Symptoms (Arabic)</Text>
        <TextInput
          style={styles.input}
          placeholder="Describe symptoms..."
          placeholderTextColor="#8B949E"
          value={symptoms}
          onChangeText={setSymptoms}
          multiline
          numberOfLines={3}
        />

        <Text style={styles.label}>Age (months)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., 18"
          placeholderTextColor="#8B949E"
          value={age}
          onChangeText={setAge}
          keyboardType="numeric"
        />

        <Text style={styles.label}>Weight (kg)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., 8.5"
          placeholderTextColor="#8B949E"
          value={weight}
          onChangeText={setWeight}
          keyboardType="decimal-pad"
        />

        <Text style={styles.label}>MUAC (cm)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., 10.4"
          placeholderTextColor="#8B949E"
          value={muac}
          onChangeText={setMuac}
          keyboardType="decimal-pad"
        />

        <View style={styles.toggleRow}>
          <Text style={styles.label}>Bilateral pitting edema</Text>
          <Switch
            value={bilateralEdema}
            onValueChange={setBilateralEdema}
            trackColor={{ false: '#30363D', true: '#DC2626' }}
            thumbColor={bilateralEdema ? '#FFF' : '#8B949E'}
          />
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleConsult}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.buttonText}>🎙️ Consult</Text>
          )}
        </TouchableOpacity>
      </View>

      {result && (
        <View style={styles.resultContainer}>
          <Text style={styles.resultTitle}>Decision: {result.decision}</Text>
          <Text style={styles.resultText}>Diagnosis: {result.primaryDiagnosis}</Text>
          <Text style={styles.resultText}>Confidence: {(result.confidence * 100).toFixed(0)}%</Text>
          {result.referral && (
            <>
              <Text style={styles.resultText}>Referral: {result.referral.urgency}</Text>
              <Text style={styles.resultText}>{result.referral.messageForFacility}</Text>
            </>
          )}
          {result.treatment?.steps?.map((step: string) => (
            <Text key={step} style={styles.resultText}>
              - {step}
            </Text>
          ))}
          <Text style={styles.resultText}>{result.voiceResponse}</Text>
        </View>
      )}
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
  form: {
    marginBottom: 20,
  },
  label: {
    color: '#F0F6FC',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
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
  },
  button: {
    backgroundColor: '#0284C7',
    padding: 16,
    borderRadius: 6,
    marginTop: 20,
    alignItems: 'center',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  resultContainer: {
    backgroundColor: '#161B22',
    padding: 16,
    borderRadius: 6,
    marginTop: 20,
    borderLeftColor: '#16A34A',
    borderLeftWidth: 4,
  },
  resultTitle: {
    color: '#F0F6FC',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
  },
  resultText: {
    color: '#8B949E',
    fontSize: 14,
    marginBottom: 6,
  },
});
