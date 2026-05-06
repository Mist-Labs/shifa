import React, { useState } from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity, Alert } from 'react-native';
import { onThreatConfirmed } from '../modules/guard/threatConfirmation';

export default function GuardScreen() {
  const [guardEnabled, setGuardEnabled] = useState(false);
  const [threatDetected, setThreatDetected] = useState(false);

  const handleToggle = () => {
    setGuardEnabled(!guardEnabled);
  };

  const triggerFieldTest = async () => {
    try {
      setThreatDetected(true);
      await onThreatConfirmed('Armed convoy + gunfire', 'CRITICAL', 0.91);
      Alert.alert('Alert processed', 'SMS dispatch was attempted or queued, and the event was logged.');
    } catch {
      Alert.alert('Guard alert failed', 'Check CHW profile, location permission, and alert recipients.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>SHIFA Guard</Text>
        <Text style={styles.subtitle}>Threat Detection System</Text>

        <View style={styles.toggleSection}>
          <Text style={styles.label}>Enable threat monitoring</Text>
          <Switch
            value={guardEnabled}
            onValueChange={handleToggle}
            trackColor={{ false: '#30363D', true: '#16A34A' }}
            thumbColor={guardEnabled ? '#FFF' : '#8B949E'}
          />
        </View>

        {guardEnabled && (
          <View style={styles.statusSection}>
            <Text style={[styles.status, threatDetected ? styles.statusAlert : styles.statusOk]}>
              {threatDetected ? '🔴 THREAT DETECTED' : '🟢 Monitoring...'}
            </Text>

            {threatDetected && (
              <View style={styles.alertBox}>
                <Text style={styles.alertText}>Armed convoy detected</Text>
                <Text style={styles.alertText}>SMS alert sent to recipients</Text>
                <TouchableOpacity style={styles.dismissButton}>
                  <Text style={styles.dismissText}>Clear Alert</Text>
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity style={styles.testButton} onPress={triggerFieldTest}>
              <Text style={styles.dismissText}>Run Guard Alert Test</Text>
            </TouchableOpacity>
          </View>
        )}

        {!guardEnabled && <Text style={styles.disabledText}>Enable to start monitoring</Text>}
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>How it works:</Text>
        <Text style={styles.infoText}>• Camera detects armed individuals and convoys</Text>
        <Text style={styles.infoText}>• Microphone detects gunshots and explosions</Text>
        <Text style={styles.infoText}>• SMS alerts sent via Africa's Talking (2G)</Text>
        <Text style={styles.infoText}>• Location tagged with each event</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D1117',
    padding: 16,
  },
  card: {
    backgroundColor: '#161B22',
    borderRadius: 8,
    padding: 20,
    marginBottom: 16,
  },
  title: {
    color: '#F0F6FC',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    color: '#8B949E',
    fontSize: 14,
    marginBottom: 20,
  },
  toggleSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  label: {
    color: '#F0F6FC',
    fontSize: 16,
    fontWeight: '500',
  },
  statusSection: {
    marginTop: 10,
  },
  status: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
  },
  statusOk: {
    color: '#16A34A',
  },
  statusAlert: {
    color: '#DC2626',
  },
  alertBox: {
    backgroundColor: '#2C1B1B',
    borderColor: '#DC2626',
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
    marginTop: 10,
  },
  alertText: {
    color: '#FCA5A5',
    fontSize: 14,
    marginBottom: 8,
  },
  dismissButton: {
    backgroundColor: '#DC2626',
    padding: 8,
    borderRadius: 4,
    alignItems: 'center',
  },
  testButton: {
    backgroundColor: '#B45309',
    padding: 10,
    borderRadius: 4,
    alignItems: 'center',
    marginTop: 12,
  },
  dismissText: {
    color: '#FFF',
    fontWeight: '600',
  },
  disabledText: {
    color: '#8B949E',
    fontSize: 14,
    marginTop: 10,
    fontStyle: 'italic',
  },
  infoCard: {
    backgroundColor: '#161B22',
    borderRadius: 8,
    padding: 16,
  },
  infoTitle: {
    color: '#F0F6FC',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  infoText: {
    color: '#8B949E',
    fontSize: 14,
    marginBottom: 8,
  },
});
