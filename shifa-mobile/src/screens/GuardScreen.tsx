import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, RefreshControl, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { AlertTriangle, Bell, Camera, FileText, Radio, Shield, Square, Video } from 'lucide-react-native';
import { onThreatConfirmed } from '../modules/guard/threatConfirmation';
import { startBluetoothThreatRelay, stopBluetoothThreatRelay } from '../modules/guard/bluetoothRelay';
import { CHWProfile, getActiveCHWProfile } from '../services/chwProfile';
import { colors, fieldShadow } from '../design/system';
import { analyzeGuardEvidence, buildEvidenceAsset, EvidenceAsset, getFieldSafeAIMessage, GuardThreatAnalysis, isGeminiConfigured } from '../services/gemini';
import { analyzeGuardEvidenceOffline } from '../services/guardDetector';
import { useI18n } from '../services/i18n';

export default function GuardScreen() {
  const [guardEnabled, setGuardEnabled] = useState(false);
  const [threatDetected, setThreatDetected] = useState(false);
  const [profile, setProfile] = useState<CHWProfile | null>(null);
  const [guardEvidence, setGuardEvidence] = useState<EvidenceAsset[]>([]);
  const [guardAnalysis, setGuardAnalysis] = useState<GuardThreatAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [recordingVideo, setRecordingVideo] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [cameraMode, setCameraMode] = useState<'picture' | 'video'>('picture');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();
  const cameraRef = useRef<CameraView>(null);
  const { t } = useI18n();

  const loadGuardProfile = useCallback(async () => {
    const nextProfile = await getActiveCHWProfile();
    setProfile(nextProfile);
    setGuardEnabled(nextProfile.guardEnabled);
    if (nextProfile.guardEnabled) {
      void startBluetoothThreatRelay(`SHIFA-${nextProfile.id}`);
    } else {
      void stopBluetoothThreatRelay();
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadGuardProfile().finally(() => {
        if (!active) return;
      });
      return () => {
        active = false;
        void stopBluetoothThreatRelay();
      };
    }, [loadGuardProfile])
  );

  const refreshGuard = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadGuardProfile();
    } finally {
      setRefreshing(false);
    }
  }, [loadGuardProfile]);

  const analyzeAndDispatchThreat = async () => {
    try {
      if (guardEvidence.length === 0) {
        Alert.alert('Evidence required', 'Capture a Guard image or video before running AI threat analysis.');
        return;
      }
      if ((profile?.alertRecipients ?? []).length === 0) {
        Alert.alert('Alert recipients required', 'Add and save at least one coordinator number in Settings before sending Guard alerts.');
        return;
      }
      setAnalyzing(true);
      const offlineResult = await analyzeGuardEvidenceOffline(guardEvidence).catch((error) => {
        console.warn('SHIFA offline Guard detector failed', error);
        return null;
      });
      if (offlineResult?.available && offlineResult.analysis?.threatDetected) {
        const analysis = offlineResult.analysis;
        setGuardAnalysis(analysis);
        setThreatDetected(true);
        await onThreatConfirmed(analysis.threatType, analysis.urgency, analysis.confidence);
        Alert.alert('Threat confirmed', 'Offline Guard confirmed a visible firearm. SMS was sent or queued directly from this device and the event was logged.');
        return;
      }

      if (!isGeminiConfigured()) {
        if (offlineResult?.available && offlineResult.analysis) {
          setGuardAnalysis(offlineResult.analysis);
          setThreatDetected(false);
          Alert.alert('No firearm detected offline', offlineResult.analysis.rationale);
          return;
        }
        Alert.alert('Guard analysis unavailable', offlineResult?.reason ?? 'Add EXPO_PUBLIC_GOOGLE_API_KEY or EXPO_PUBLIC_GEMINI_API_KEY for cloud Guard analysis.');
        return;
      }

      const analysis = await analyzeGuardEvidence(guardEvidence);
      setGuardAnalysis(analysis);
      setThreatDetected(analysis.threatDetected);
      if (analysis.threatDetected) {
        await onThreatConfirmed(analysis.threatType, analysis.urgency, analysis.confidence);
        Alert.alert('Threat confirmed', 'AI confirmed the threat. SMS was sent or queued directly from this device and the event was logged.');
      } else {
        Alert.alert('No credible threat detected', analysis.rationale);
      }
    } catch (error) {
      Alert.alert('Guard analysis unavailable', getFieldSafeAIMessage(error));
    } finally {
      setAnalyzing(false);
    }
  };

  const captureEvidencePhoto = async () => {
    if (!guardEnabled || !cameraPermission?.granted) {
      Alert.alert('Camera not active', 'Enable Guard and allow camera access before capturing evidence.');
      return;
    }
    setCameraMode('picture');
    const evidence = await cameraRef.current?.takePictureAsync({ quality: 0.78, skipProcessing: false, base64: true });
    if (evidence?.uri) {
      Alert.alert('Store Guard image?', 'Save this image for AI threat analysis?', [
        { text: 'Discard', style: 'destructive' },
        {
          text: 'Save',
          onPress: async () => {
            const asset = await buildEvidenceAsset({
              uri: evidence.uri,
              kind: 'image',
              name: `guard-photo-${Date.now()}.jpg`,
              mimeType: 'image/jpeg',
              base64: evidence.base64,
            });
            setGuardEvidence((items) => [...items, asset]);
          },
        },
      ]);
    }
  };

  const recordEvidenceVideo = async () => {
    if (!guardEnabled || !cameraPermission?.granted) {
      Alert.alert('Camera not active', 'Enable Guard and allow camera access before recording evidence.');
      return;
    }
    if (!microphonePermission?.granted) {
      const nextPermission = await requestMicrophonePermission();
      if (!nextPermission.granted) {
        Alert.alert('Microphone permission required', 'Video evidence needs microphone access for audio threat cues.');
        return;
      }
    }
    if (recordingVideo) {
      cameraRef.current?.stopRecording();
      setRecordingVideo(false);
      return;
    }

    try {
      setCameraMode('video');
      await new Promise<void>((resolve) => setTimeout(resolve, 250));
      setRecordingVideo(true);
      const video = await cameraRef.current?.recordAsync({ maxDuration: 8, maxFileSize: 18_000_000 });
      setRecordingVideo(false);
      setCameraMode('picture');
      if (video?.uri) {
        Alert.alert('Store Guard video?', 'Save this video clip for AI threat analysis?', [
          { text: 'Discard', style: 'destructive' },
          {
            text: 'Save',
            onPress: async () => {
              const asset = await buildEvidenceAsset({
                uri: video.uri,
                kind: 'video',
                name: `guard-video-${Date.now()}.mp4`,
                mimeType: 'video/mp4',
              });
              setGuardEvidence((items) => [...items, asset]);
            },
          },
        ]);
      }
    } catch (error) {
      setRecordingVideo(false);
      setCameraMode('picture');
      Alert.alert('Video recording failed', error instanceof Error ? error.message : 'Unable to record video evidence.');
    }
  };

  const handleGuardToggle = async (enabled: boolean) => {
    if (!enabled) {
      setGuardEnabled(false);
      void stopBluetoothThreatRelay();
      return;
    }

    if (!cameraPermission?.granted) {
      const nextPermission = await requestCameraPermission();
      if (!nextPermission.granted) {
        Alert.alert('Camera permission required', 'SHIFA Guard needs camera access before monitoring can start.');
        return;
      }
    }

    setGuardEnabled(true);
    void startBluetoothThreatRelay(profile?.id ? `SHIFA-${profile.id}` : 'SHIFA-GUARD');
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshGuard}
            tintColor="#C4B5FD"
            colors={[colors.purple]}
          />
        }
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>{t('shifaGuard')}</Text>
            <Text style={styles.subtitle}>{guardEnabled ? t('active') : t('standby')}</Text>
          </View>
          <View style={styles.smsBadge}>
            <Text style={styles.smsText}>2G • SMS</Text>
            <Text style={styles.smsReady}>{t('ready')}</Text>
          </View>
        </View>

        <View style={styles.cameraPanel}>
          {guardEnabled && cameraPermission?.granted ? (
            <View style={styles.guardCameraShell}>
              <CameraView ref={cameraRef} style={styles.guardCamera} facing="back" mode={cameraMode} mute={cameraMode === 'video'} />
              <GuardCrosshair />
            </View>
          ) : (
            <View style={styles.cameraPermissionPanel}>
              <Shield color="#C4B5FD" size={34} />
              <Text style={styles.cameraText}>{t('cameraInactive')}</Text>
              <Text style={styles.cameraHint}>{t('cameraInactiveHint')}</Text>
            </View>
          )}
        </View>

        <View style={styles.statusPanel}>
          <Radio color="#C4B5FD" size={20} />
          <View style={styles.statusTextGroup}>
            <Text style={styles.statusTitle}>{guardEnabled ? t('monitoringActive') : t('monitoringPaused')}</Text>
            <Text style={styles.statusDetail}>{guardEnabled ? t('cameraStreamActive') : t('cameraPaused')}</Text>
          </View>
          <Switch
            value={guardEnabled}
            onValueChange={handleGuardToggle}
            trackColor={{ false: '#4B3966', true: '#7C3AED' }}
            thumbColor={colors.white}
          />
        </View>
        {guardEnabled && cameraPermission?.granted && (
          <View style={styles.evidenceActions}>
            <TouchableOpacity style={styles.captureButton} onPress={captureEvidencePhoto}>
              <Camera color={colors.white} size={20} />
              <Text style={styles.captureButtonText}>{t('captureImage')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.captureButton, recordingVideo && styles.recordingButton]} onPress={recordEvidenceVideo}>
              <Video color={colors.white} size={20} />
              <Text style={styles.captureButtonText}>{recordingVideo ? t('stopVideo') : t('recordVideo')}</Text>
            </TouchableOpacity>
          </View>
        )}

        <GuardEvidenceGallery evidence={guardEvidence} onDelete={(id) => setGuardEvidence((items) => items.filter((item) => item.id !== id))} />

        <Text style={styles.sectionLabel}>{t('alertRecipients')}:</Text>
        <View style={styles.recipients}>
          {(profile?.alertRecipients ?? []).length === 0 && (
            <Text style={styles.emptyRecipients}>{t('configureRecipients')}</Text>
          )}
          {(profile?.alertRecipients ?? []).map((recipient) => (
            <View key={recipient} style={styles.recipientChip}>
              <Text style={styles.recipientText}>{recipient}</Text>
            </View>
          ))}
        </View>

        {threatDetected && (
          <View style={styles.threatCard}>
            <View style={styles.threatTitleRow}>
              <AlertTriangle color={colors.purple} size={28} />
              <View>
                <Text style={styles.threatTitle}>{t('threatDetected')}</Text>
                <Text style={styles.threatSubtitle}>{guardAnalysis?.threatType ?? 'AI-confirmed threat'}</Text>
              </View>
            </View>
            <View style={styles.threatMeta}>
              <View>
                <Text style={styles.metaLabel}>{t('type')}</Text>
                <Text style={styles.metaValue}>{guardAnalysis?.threatType ?? 'Threat'}</Text>
              </View>
              <View>
                <Text style={styles.metaLabel}>{t('confidence')}</Text>
                <Text style={styles.metaValue}>{Math.round((guardAnalysis?.confidence ?? 0) * 100)}%</Text>
              </View>
            </View>
            <Text style={styles.smsSentLabel}>{t('smsHandled')}</Text>
            <Text style={styles.evidenceLabel}>{guardAnalysis?.rationale ?? t('evidenceAnalyzed')}</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.stickyActions}>
        <TouchableOpacity style={[styles.testButton, analyzing && styles.disabledButton]} onPress={analyzeAndDispatchThreat} disabled={!guardEnabled || analyzing}>
          {analyzing ? <ActivityIndicator color={colors.white} /> : <Bell color={colors.white} size={20} />}
          <Text style={styles.testButtonText}>{guardEnabled ? t('runThreatAnalysis') : t('enableGuardFirst')}</Text>
        </TouchableOpacity>
        {threatDetected && (
          <TouchableOpacity style={styles.falseAlarmButton} onPress={() => setThreatDetected(false)}>
            <Square color={colors.white} size={16} />
            <Text style={styles.falseAlarmText}>{t('falseAlarm')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

function GuardCrosshair() {
  const { t } = useI18n();
  return (
    <View style={styles.crosshairLayer}>
      <View style={styles.crosshairTop} />
      <View style={styles.crosshairLeft} />
      <Text style={styles.cameraLiveText}>{t('liveCamera')}</Text>
      <View style={styles.crosshairRight} />
      <View style={styles.crosshairBottom} />
    </View>
  );
}

function GuardEvidenceGallery({
  evidence,
  onDelete,
}: {
  evidence: EvidenceAsset[];
  onDelete: (id: string) => void;
}) {
  const { t } = useI18n();
  if (evidence.length === 0) return null;

  return (
    <View style={styles.guardEvidencePanel}>
      <Text style={styles.guardEvidenceTitle}>{t('capturedEvidence')}</Text>
      {evidence.map((item) => (
        <View key={item.id} style={styles.guardEvidenceRow}>
          {item.kind === 'image' ? (
            <Image source={{ uri: item.uri }} style={styles.guardEvidenceThumb} />
          ) : (
            <View style={styles.guardEvidenceFile}>
              <FileText color="#DDD6FE" size={22} />
            </View>
          )}
          <View style={styles.guardEvidenceTextGroup}>
            <Text style={styles.guardEvidenceName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.guardEvidenceType}>{item.mimeType}</Text>
          </View>
          <TouchableOpacity style={styles.guardDeleteButton} onPress={() => onDelete(item.id)}>
            <Text style={styles.guardDeleteText}>{t('delete')}</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.purpleDeep,
  },
  content: {
    padding: 18,
    paddingBottom: 118,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  title: {
    color: colors.white,
    fontSize: 26,
    fontWeight: '900',
  },
  subtitle: {
    color: '#C4B5FD',
    fontSize: 16,
    fontWeight: '900',
    marginTop: 2,
  },
  smsBadge: {
    backgroundColor: '#130820',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#513075',
  },
  smsText: {
    color: '#FACC15',
    fontWeight: '900',
    fontSize: 13,
  },
  smsReady: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 12,
    marginTop: 2,
  },
  cameraPanel: {
    height: 236,
    borderRadius: 8,
    backgroundColor: '#130820',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#6D54A3',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...fieldShadow,
  },
  guardCamera: {
    width: '100%',
    height: '100%',
  },
  guardCameraShell: {
    width: '100%',
    height: '100%',
  },
  cameraPermissionPanel: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  crosshairLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  crosshairTop: {
    position: 'absolute',
    top: 58,
    width: 2,
    height: 42,
    backgroundColor: colors.white,
  },
  crosshairBottom: {
    position: 'absolute',
    bottom: 58,
    width: 2,
    height: 42,
    backgroundColor: colors.white,
  },
  crosshairLeft: {
    position: 'absolute',
    left: 52,
    height: 2,
    width: 28,
    backgroundColor: colors.white,
  },
  crosshairRight: {
    position: 'absolute',
    right: 52,
    height: 2,
    width: 28,
    backgroundColor: colors.white,
  },
  cameraText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 10,
  },
  cameraHint: {
    color: '#DDD6FE',
    textAlign: 'center',
    fontWeight: '700',
    marginTop: 6,
  },
  cameraLiveText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '900',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  statusPanel: {
    marginTop: 12,
    minHeight: 72,
    borderRadius: 8,
    backgroundColor: '#4C238C',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#8B5CF6',
  },
  evidenceActions: {
    flexDirection: 'row',
    marginTop: 10,
  },
  captureButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#8B5CF6',
    backgroundColor: '#2D1249',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  recordingButton: {
    backgroundColor: '#7F1D1D',
    borderColor: '#FCA5A5',
  },
  captureButtonText: {
    color: colors.white,
    fontWeight: '900',
    marginLeft: 8,
  },
  statusTextGroup: {
    flex: 1,
    marginLeft: 12,
  },
  statusTitle: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '900',
  },
  statusDetail: {
    color: '#DDD6FE',
    marginTop: 4,
    fontWeight: '700',
  },
  sectionLabel: {
    color: '#DDD6FE',
    fontWeight: '900',
    fontSize: 12,
    marginTop: 20,
    marginBottom: 8,
    letterSpacing: 0,
  },
  recipients: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  recipientChip: {
    borderRadius: 8,
    backgroundColor: '#2D1249',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#6D54A3',
  },
  recipientText: {
    color: colors.white,
    fontWeight: '800',
  },
  emptyRecipients: {
    color: '#DDD6FE',
    fontWeight: '800',
  },
  guardEvidencePanel: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#6D54A3',
    backgroundColor: '#241039',
    padding: 10,
    marginTop: 12,
  },
  guardEvidenceTitle: {
    color: colors.white,
    fontWeight: '900',
    marginBottom: 8,
  },
  guardEvidenceRow: {
    minHeight: 60,
    borderRadius: 8,
    backgroundColor: '#2D1249',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    marginBottom: 8,
  },
  guardEvidenceThumb: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: '#130820',
  },
  guardEvidenceFile: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: '#3B1A64',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guardEvidenceTextGroup: {
    flex: 1,
    marginLeft: 10,
  },
  guardEvidenceName: {
    color: colors.white,
    fontWeight: '900',
  },
  guardEvidenceType: {
    color: '#DDD6FE',
    fontSize: 12,
    marginTop: 2,
    fontWeight: '700',
  },
  guardDeleteButton: {
    minHeight: 38,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FCA5A5',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  guardDeleteText: {
    color: '#FCA5A5',
    fontWeight: '900',
  },
  threatCard: {
    backgroundColor: colors.paperStrong,
    borderRadius: 8,
    padding: 16,
    marginTop: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#C4B5FD',
  },
  threatTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  threatTitle: {
    color: colors.purple,
    fontSize: 24,
    fontWeight: '900',
    marginLeft: 10,
  },
  threatSubtitle: {
    color: colors.purple,
    marginLeft: 10,
    fontWeight: '700',
  },
  threatMeta: {
    backgroundColor: colors.purpleSoft,
    borderRadius: 8,
    padding: 12,
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaLabel: {
    color: colors.purple,
    fontSize: 12,
    fontWeight: '800',
  },
  metaValue: {
    color: colors.purpleDeep,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 4,
  },
  smsSentLabel: {
    color: colors.purple,
    marginTop: 14,
    fontWeight: '900',
  },
  evidenceLabel: {
    color: colors.green,
    marginTop: 8,
    fontWeight: '900',
  },
  stickyActions: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    backgroundColor: 'rgba(26,11,46,0.96)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#513075',
  },
  testButton: {
    minHeight: 56,
    borderRadius: 8,
    backgroundColor: colors.purple,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.58,
  },
  testButtonText: {
    color: colors.white,
    fontWeight: '900',
    marginLeft: 10,
  },
  falseAlarmButton: {
    minHeight: 50,
    borderRadius: 8,
    marginTop: 10,
    backgroundColor: '#321550',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#7C3AED',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  falseAlarmText: {
    color: colors.white,
    fontWeight: '900',
    marginLeft: 8,
  },
});
