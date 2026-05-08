import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Animated,
  Image,
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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useNetInfo } from '@react-native-community/netinfo';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as DocumentPicker from 'expo-document-picker';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { AlertTriangle, Camera, CheckCircle, Cloud, CloudOff, FileUp, FileText, Mic, Square, Video, Volume2, X } from 'lucide-react-native';
import { ClinicalDecision, logConsultation } from '../services/caseLog';
import { getActiveCHWProfile } from '../services/chwProfile';
import { colors, decisionColor, decisionSoftColor, fieldShadow, highContrastShadow } from '../design/system';
import { useUIPreferences } from '../services/uiPreferences';
import { analyzeClinicalCase, buildEvidenceAsset, EvidenceAsset, getFieldSafeAIMessage, isGeminiConfigured } from '../services/gemini';
import { getHealthDataCenterUrl, getHealthSyncSummary, HealthSyncSummary, syncHealthReports } from '../services/syncReports';
import { useI18n } from '../services/i18n';

type ConsultStage = 'ready' | 'photo' | 'upload' | 'listening' | 'processing' | 'result' | 'playback';

const recordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
};

const processingSteps = [
  'Extracting symptoms',
  'Protocol: Sudan SAM',
  'Checking danger signs',
  'Differential diagnosis',
  'Calculating treatment',
];

export default function ClinicScreen() {
  const [stage, setStage] = useState<ConsultStage>('ready');
  const [symptoms, setSymptoms] = useState('');
  const [age, setAge] = useState('');
  const [weight, setWeight] = useState('');
  const [muac, setMuac] = useState('');
  const [bilateralEdema, setBilateralEdema] = useState(false);
  const [decision, setDecision] = useState<ClinicalDecision | null>(null);
  const [logged, setLogged] = useState(false);
  const [clinicalPhotoUri, setClinicalPhotoUri] = useState<string | null>(null);
  const [clinicalUpload, setClinicalUpload] = useState<{ uri: string; name: string; mimeType?: string } | null>(null);
  const [clinicalEvidence, setClinicalEvidence] = useState<EvidenceAsset[]>([]);
  const [audioRecordingUri, setAudioRecordingUri] = useState<string | null>(null);
  const [recordingLevels, setRecordingLevels] = useState<number[]>(Array.from({ length: 36 }, () => 0.12));
  const [cameraMode, setCameraMode] = useState<'picture' | 'video'>('picture');
  const [recordingClinicalVideo, setRecordingClinicalVideo] = useState(false);
  const [patientMenuOpen, setPatientMenuOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [syncSummary, setSyncSummary] = useState<HealthSyncSummary | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [cameraMicrophonePermission, requestCameraMicrophonePermission] = useMicrophonePermissions();
  const audioRecorder = useAudioRecorder(recordingOptions);
  const audioState = useAudioRecorderState(audioRecorder, 250);
  const audioPlayer = useAudioPlayer(audioRecordingUri ? { uri: audioRecordingUri } : null, { updateInterval: 250 });
  const audioPlayerStatus = useAudioPlayerStatus(audioPlayer);
  const recorderActionInFlight = useRef(false);
  const pulseOne = useRef(new Animated.Value(0)).current;
  const pulseTwo = useRef(new Animated.Value(0)).current;
  const pulseThree = useRef(new Animated.Value(0)).current;
  const cameraRef = useRef<CameraView>(null);
  const navigation = useNavigation<any>();
  const netInfo = useNetInfo();
  const { darkMode } = useUIPreferences();
  const { t } = useI18n();

  const clearPatientFields = useCallback(() => {
    setSymptoms('');
    setAge('');
    setWeight('');
    setMuac('');
    setBilateralEdema(false);
    setDecision(null);
    setLogged(false);
  }, []);

  const clearEvidence = useCallback(() => {
    setClinicalPhotoUri(null);
    setClinicalUpload(null);
    setClinicalEvidence([]);
    setAudioRecordingUri(null);
    setRecordingLevels(Array.from({ length: 36 }, () => 0.12));
  }, []);

  const handleMenuAction = (action: () => void) => {
    action();
    setPatientMenuOpen(false);
  };

  const resetToPatientDetails = useCallback(() => {
    setStage('ready');
    setDecision(null);
    setLogged(false);
  }, []);

  const refreshPatientScreen = useCallback(() => {
    setRefreshing(true);
    setPatientMenuOpen(false);
    resetToPatientDetails();
    void getHealthSyncSummary().then(setSyncSummary).finally(() => setRefreshing(false));
  }, [resetToPatientDetails]);

  useFocusEffect(resetToPatientDetails);

  useFocusEffect(
    useCallback(() => {
      void getHealthSyncSummary().then(setSyncSummary);
    }, [])
  );

  useEffect(() => {
    return navigation.addListener('tabPress', resetToPatientDetails);
  }, [navigation, resetToPatientDetails]);

  useEffect(() => {
    if (stage !== 'listening' || !audioState.isRecording) return;
    setRecordingLevels((previous) => {
      const next = [...previous.slice(-35), normalizeMetering(audioState.metering)];
      return next.length < 36 ? [...Array.from({ length: 36 - next.length }, () => 0.08), ...next] : next;
    });
  }, [audioState.durationMillis, audioState.isRecording, audioState.metering, stage]);

  useEffect(() => {
    const shouldPulse = stage === 'listening' || stage === 'ready';
    if (!shouldPulse) {
      pulseOne.stopAnimation();
      pulseTwo.stopAnimation();
      pulseThree.stopAnimation();
      pulseOne.setValue(0);
      pulseTwo.setValue(0);
      pulseThree.setValue(0);
      return;
    }

    const loops = [
      createPulseLoop(pulseOne, 0),
      createPulseLoop(pulseTwo, 520),
      createPulseLoop(pulseThree, 1040),
    ];
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [pulseOne, pulseThree, pulseTwo, stage]);

  const parsed = useMemo(
    () => ({
      ageMonths: age ? Number(age) : undefined,
      weightKg: weight ? Number(weight) : undefined,
      muacCm: muac ? Number(muac) : undefined,
    }),
    [age, weight, muac]
  );

  const hasClinicalInput =
    symptoms.trim().length > 0 ||
    (Number.isFinite(parsed.ageMonths) && parsed.ageMonths !== 0) ||
    (Number.isFinite(parsed.weightKg) && parsed.weightKg !== 0) ||
    (Number.isFinite(parsed.muacCm) && parsed.muacCm !== 0) ||
    bilateralEdema ||
    clinicalEvidence.length > 0;
  const online = Boolean(netInfo.isConnected && netInfo.type !== 'none');

  const beginConsult = async () => {
    if (recorderActionInFlight.current || audioState.isRecording || stage === 'listening') return;
    recorderActionInFlight.current = true;
    if (!isGeminiConfigured()) {
      Alert.alert('Google AI key missing', 'Add EXPO_PUBLIC_GOOGLE_API_KEY or EXPO_PUBLIC_GEMINI_API_KEY to shifa-mobile/.env before clinical AI analysis.');
      recorderActionInFlight.current = false;
      return;
    }
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microphone permission required', 'Microphone access is required to record the consultation audio.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      const recorderStatus = audioRecorder.getStatus();
      if (!recorderStatus.canRecord) {
        await audioRecorder.prepareToRecordAsync();
      }
      audioRecorder.record();
      setLogged(false);
      setAudioRecordingUri(null);
      setRecordingLevels(Array.from({ length: 36 }, () => 0.08));
      setStage('listening');
    } catch (error) {
      Alert.alert('Recording unavailable', error instanceof Error ? error.message : 'Unable to start consultation recording.');
    } finally {
      recorderActionInFlight.current = false;
    }
  };

  const openClinicalCamera = async (mode: 'picture' | 'video' = 'picture') => {
    if (!cameraPermission?.granted) {
      const nextPermission = await requestCameraPermission();
      if (!nextPermission.granted) {
        Alert.alert('Camera permission required', 'Camera access is required to capture clinical photos for the case record.');
        return;
      }
    }
    if (mode === 'video' && !cameraMicrophonePermission?.granted) {
      const nextPermission = await requestCameraMicrophonePermission();
      if (!nextPermission.granted) {
        Alert.alert('Microphone permission required', 'Video evidence needs microphone access for audio clinical context.');
        return;
      }
    }
    setCameraMode(mode);
    setStage('photo');
  };

  const captureClinicalPhoto = async () => {
    const photo = await cameraRef.current?.takePictureAsync({ quality: 0.82, skipProcessing: false, base64: true });
    if (photo?.uri) {
      Alert.alert('Store clinical image?', 'Save this image to the case evidence for AI analysis?', [
        { text: 'Discard', style: 'destructive', onPress: () => setStage('ready') },
        {
          text: 'Save',
          onPress: async () => {
            const asset = await buildEvidenceAsset({
              uri: photo.uri,
              kind: 'image',
              name: `clinical-photo-${Date.now()}.jpg`,
              mimeType: 'image/jpeg',
              base64: photo.base64,
            });
            setClinicalEvidence((items) => [...items, asset]);
            setClinicalPhotoUri(photo.uri);
            setStage('ready');
          },
        },
      ]);
    }
  };

  const recordClinicalVideo = async () => {
    if (recordingClinicalVideo) {
      cameraRef.current?.stopRecording();
      setRecordingClinicalVideo(false);
      return;
    }
    try {
      setRecordingClinicalVideo(true);
      const video = await cameraRef.current?.recordAsync({ maxDuration: 8, maxFileSize: 18_000_000 });
      setRecordingClinicalVideo(false);
      if (video?.uri) {
        Alert.alert('Store clinical video?', 'Save this video to the case evidence for AI analysis?', [
          { text: 'Discard', style: 'destructive', onPress: () => setStage('ready') },
          {
            text: 'Save',
            onPress: async () => {
              const asset = await buildEvidenceAsset({
                uri: video.uri,
                kind: 'video',
                name: `clinical-video-${Date.now()}.mp4`,
                mimeType: 'video/mp4',
              });
              setClinicalEvidence((items) => [...items, asset]);
              setStage('ready');
            },
          },
        ]);
      }
    } catch (error) {
      setRecordingClinicalVideo(false);
      Alert.alert('Video recording failed', error instanceof Error ? error.message : 'Unable to record clinical video.');
    }
  };

  const pickClinicalFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/png', 'image/jpeg'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (!result.canceled) {
      const asset = result.assets[0];
      const kind = asset.mimeType === 'application/pdf' ? 'pdf' : asset.mimeType?.startsWith('image/') ? 'image' : 'file';
      const evidence = await buildEvidenceAsset({
        uri: asset.uri,
        kind,
        name: asset.name,
        mimeType: asset.mimeType || 'application/octet-stream',
      });
      setClinicalUpload({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType });
      setClinicalEvidence((items) => [...items, evidence]);
      setStage('ready');
    } else {
      setStage('upload');
    }
  };

  const stopListening = async () => {
    if (recorderActionInFlight.current) return;
    recorderActionInFlight.current = true;
    let nextAudioUri: string | null = null;
    try {
      const recorderStatus = audioRecorder.getStatus();
      if (audioState.isRecording || recorderStatus.isRecording) {
        await audioRecorder.stop();
        nextAudioUri = audioRecorder.uri ?? audioState.url ?? null;
        setAudioRecordingUri(nextAudioUri);
      }
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      if (nextAudioUri) {
        const audioEvidence = await buildEvidenceAsset({
          uri: nextAudioUri,
          kind: 'file',
          name: `consultation-audio-${Date.now()}.m4a`,
          mimeType: 'audio/mp4',
        });
        setClinicalEvidence((items) => [...items, audioEvidence]);
      }
      setStage('ready');
    } catch (error) {
      setStage('ready');
      Alert.alert('Audio attachment failed', error instanceof Error ? error.message : 'Unable to attach consultation audio.');
    } finally {
      recorderActionInFlight.current = false;
    }
  };

  const runClinicalAnalysis = async () => {
    if (!isGeminiConfigured()) {
      Alert.alert('Google AI key missing', 'Add EXPO_PUBLIC_GOOGLE_API_KEY or EXPO_PUBLIC_GEMINI_API_KEY to shifa-mobile/.env before clinical AI analysis.');
      return;
    }
    if (!hasClinicalInput) {
      Alert.alert('Case details required', 'Enter symptoms, measurements, edema status, or attach evidence before analysis.');
      return;
    }
    setStage('processing');
    try {
      const nextDecision = await analyzeClinicalCase({
        symptomText: symptoms,
        ageMonths: Number.isFinite(parsed.ageMonths) && parsed.ageMonths !== 0 ? parsed.ageMonths : undefined,
        weightKg: Number.isFinite(parsed.weightKg) && parsed.weightKg !== 0 ? parsed.weightKg : undefined,
        muacCm: Number.isFinite(parsed.muacCm) && parsed.muacCm !== 0 ? parsed.muacCm : undefined,
        bilateralEdema,
        evidence: clinicalEvidence,
      });
      setDecision(nextDecision);
      setStage('result');
    } catch (error) {
      setStage('ready');
      Alert.alert('Analysis unavailable', getFieldSafeAIMessage(error));
    }
  };

  const handleLogCase = async () => {
    if (!decision) return;
    const chw = await getActiveCHWProfile();
    await logConsultation({
      chwId: chw.id,
      ageMonths: Number.isFinite(parsed.ageMonths) ? parsed.ageMonths : undefined,
      weightKg: Number.isFinite(parsed.weightKg) ? parsed.weightKg : undefined,
      muacCm: Number.isFinite(parsed.muacCm) ? parsed.muacCm : undefined,
      bilateralEdema,
      symptomText: symptoms,
      decision,
      clinicalPhotoUri: clinicalPhotoUri ?? undefined,
      clinicalUpload: clinicalUpload ?? undefined,
      evidenceAssets: clinicalEvidence.map(({ base64, ...asset }) => asset),
      audioRecordingUri: audioRecordingUri ?? undefined,
    });
    setLogged(true);
    const syncResult = await syncHealthReports();
    await getHealthSyncSummary().then(setSyncSummary);
    if (syncResult.offline) {
      Alert.alert('Case saved offline', syncResult.message);
      return;
    }
    if (!syncResult.success) {
      Alert.alert('Case saved locally', `${syncResult.message}\n\nDestination: ${getHealthDataCenterUrl()}`);
      return;
    }
    Alert.alert(
      syncResult.syncedCount > 0 ? 'Report sent' : 'Case saved',
      syncResult.syncedCount > 0
        ? `${syncResult.message}${syncResult.outbreakCount ? ` ${syncResult.outbreakCount} outbreak alert returned.` : ''}`
        : 'This consultation is already synced.'
    );
  };

  if (stage === 'listening') {
    const liveLevel = recordingLevels[recordingLevels.length - 1] ?? 0.08;
    const waveformHeights = getListeningWaveformHeights(recordingLevels);
    const ringLift = Math.min(1, Math.max(0.08, liveLevel));
    return (
      <SafeAreaView style={styles.darkScreen}>
        <Text style={styles.darkKicker}>LISTENING</Text>
        <View style={styles.voiceStage}>
          <Animated.View
            style={[
              styles.pulseRing,
              styles.pulseRingOuter,
              {
                opacity: pulseOne.interpolate({ inputRange: [0, 1], outputRange: [0.34, 0] }),
                transform: [{ scale: pulseOne.interpolate({ inputRange: [0, 1], outputRange: [0.86 + ringLift * 0.1, 1.72 + ringLift * 0.24] }) }],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.pulseRing,
              styles.pulseRingMiddle,
              {
                opacity: pulseTwo.interpolate({ inputRange: [0, 1], outputRange: [0.46, 0] }),
                transform: [{ scale: pulseTwo.interpolate({ inputRange: [0, 1], outputRange: [0.78 + ringLift * 0.08, 1.48 + ringLift * 0.18] }) }],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.pulseRing,
              styles.pulseRingInner,
              {
                opacity: pulseThree.interpolate({ inputRange: [0, 1], outputRange: [0.58, 0] }),
                transform: [{ scale: pulseThree.interpolate({ inputRange: [0, 1], outputRange: [0.7 + ringLift * 0.06, 1.26 + ringLift * 0.14] }) }],
              },
            ]}
          />
          <View style={[styles.micOrb, { transform: [{ scale: 1 + ringLift * 0.08 }] }]}>
            <Mic color={colors.white} size={58} strokeWidth={2.6} />
          </View>
        </View>
        <View style={styles.listeningWaveform}>
          {waveformHeights.map((height, index) => (
            <View
              key={index}
              style={[
                styles.listeningWaveBar,
                {
                  height,
                  opacity: 0.38 + Math.min(0.56, height / 86),
                },
              ]}
            />
          ))}
        </View>
        <Text style={styles.timer}>{formatDuration(audioState.durationMillis)}</Text>
        <Text style={styles.darkBody}>{audioState.isRecording ? 'Recording audio...' : 'Preparing microphone...'}</Text>
        <TouchableOpacity style={styles.stopButton} onPress={stopListening}>
          <Square color={colors.red} fill={colors.red} size={14} />
          <Text style={styles.stopButtonText}>Stop</Text>
        </TouchableOpacity>
        <Text style={styles.languageText}>Language: Lingala</Text>
      </SafeAreaView>
    );
  }

  if (stage === 'photo') {
    return (
      <SafeAreaView style={styles.photoScreen}>
        <View style={styles.cameraShell}>
          <CameraView ref={cameraRef} style={styles.clinicalCamera} facing="back" mode={cameraMode} mute={cameraMode === 'video'} />
          <View style={styles.photoOverlay}>
            <TouchableOpacity style={styles.photoCloseButton} onPress={() => setStage('ready')}>
              <Text style={styles.photoCloseText}>Cancel</Text>
            </TouchableOpacity>
            <View style={styles.photoGuide}>
              <Text style={styles.photoGuideTitle}>Capture clinical evidence</Text>
              <Text style={styles.photoGuideText}>
                Use photo or short video to capture the affected body part clearly for AI analysis.
              </Text>
            </View>
            <View style={styles.cameraModeSwitch}>
              <TouchableOpacity
                style={[styles.cameraModeButton, cameraMode === 'picture' && styles.cameraModeButtonActive]}
                onPress={() => setCameraMode('picture')}
              >
                <Camera color={cameraMode === 'picture' ? colors.white : colors.green} size={18} />
                <Text style={[styles.cameraModeText, cameraMode === 'picture' && styles.cameraModeTextActive]}>Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.cameraModeButton, cameraMode === 'video' && styles.cameraModeButtonActive]}
                onPress={() => setCameraMode('video')}
              >
                <Video color={cameraMode === 'video' ? colors.white : colors.green} size={18} />
                <Text style={[styles.cameraModeText, cameraMode === 'video' && styles.cameraModeTextActive]}>Video</Text>
              </TouchableOpacity>
            </View>
            {cameraMode === 'picture' ? (
              <TouchableOpacity style={styles.shutterButton} onPress={captureClinicalPhoto}>
                <View style={styles.shutterInner} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.videoShutterButton, recordingClinicalVideo && styles.videoShutterButtonActive]} onPress={recordClinicalVideo}>
                <Text style={styles.videoShutterText}>{recordingClinicalVideo ? 'Stop Video' : 'Record Video'}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (stage === 'upload') {
    return (
      <SafeAreaView style={[styles.screen, darkMode && styles.homeDarkScreen]}>
        <View style={styles.uploadPage}>
          <TouchableOpacity style={[styles.uploadTopCancel, darkMode && styles.uploadTopCancelDark]} onPress={() => setStage('ready')}>
            <Text style={[styles.uploadTopCancelText, darkMode && styles.homeDarkAccent]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.title, darkMode && styles.homeDarkText]}>Upload case file</Text>
          <Text style={[styles.subtitle, darkMode && styles.homeDarkMuted]}>
            Choose a PDF, PNG, JPEG, or JPG file from this device for analysis.
          </Text>
          <TouchableOpacity style={styles.uploadPrimaryButton} onPress={pickClinicalFile}>
            <FileUp color={colors.white} size={22} />
            <Text style={styles.uploadPrimaryText}>Choose File</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.uploadCancelButton, darkMode && styles.uploadCancelButtonDark]} onPress={() => setStage('ready')}>
            <Text style={[styles.uploadCancelText, darkMode && styles.homeDarkText]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (stage === 'processing') {
    return (
      <SafeAreaView style={styles.darkScreen}>
        <Text style={styles.processingTitle}>SHIFA is analyzing</Text>
        <ActivityIndicator color="#34D97B" size="large" style={styles.processingSpinner} />
        <View style={styles.processingList}>
          {processingSteps.map((step, index) => {
            const done = index < 3;
            const active = index === 3;
            return (
              <View key={step} style={styles.processingRow}>
                <View style={[styles.stepIcon, done && styles.stepIconDone, active && styles.stepIconActive]}>
                  {done && <CheckCircle color={colors.white} size={14} />}
                </View>
                <View style={styles.stepTextGroup}>
                  <Text style={styles.stepTitle}>{step}</Text>
                  <Text style={styles.stepStatus}>{done ? 'Complete' : active ? 'In progress...' : 'Waiting...'}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </SafeAreaView>
    );
  }

  if (stage === 'result' && decision) {
    return (
      <ResultScreen
        decision={decision}
        patient={{
          ageMonths: Number.isFinite(parsed.ageMonths) && parsed.ageMonths !== 0 ? parsed.ageMonths : undefined,
          weightKg: Number.isFinite(parsed.weightKg) && parsed.weightKg !== 0 ? parsed.weightKg : undefined,
          muacCm: Number.isFinite(parsed.muacCm) && parsed.muacCm !== 0 ? parsed.muacCm : undefined,
          bilateralEdema,
        }}
        onLogCase={handleLogCase}
        logged={logged}
        syncSummary={syncSummary}
        hasAudio={Boolean(audioRecordingUri)}
        onListen={() => {
          if (!audioRecordingUri) {
            Alert.alert('No recording available', 'Record consultation audio before using Listen.');
            return;
          }
          setStage('playback');
        }}
      />
    );
  }

  if (stage === 'playback') {
    return (
      <AudioPlaybackScreen
        status={audioPlayerStatus}
        levels={recordingLevels}
        onBack={() => setStage(decision ? 'result' : 'ready')}
        onPlayPause={() => {
          if (audioPlayerStatus.playing) {
            audioPlayer.pause();
          } else {
            audioPlayer.play();
          }
        }}
        onSeek={(seconds) => {
          void audioPlayer.seekTo(seconds);
        }}
      />
    );
  }

  return (
    <SafeAreaView style={[styles.screen, darkMode && styles.homeDarkScreen]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshPatientScreen}
            tintColor={colors.green}
            colors={[colors.green]}
          />
        }
      >
        <View style={styles.topRow}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Patient page actions"
            style={[styles.menuButton, patientMenuOpen && styles.menuButtonActive]}
            onPress={() => setPatientMenuOpen((open) => !open)}
          >
            {patientMenuOpen ? (
              <X color={colors.white} size={28} strokeWidth={3.2} />
            ) : (
              <Text style={[styles.menuText, darkMode && styles.homeDarkText]}>☰</Text>
            )}
          </TouchableOpacity>
          <View style={[styles.signalPill, !online && styles.signalPillOffline]}>
            {online ? <Cloud color={colors.green} size={15} /> : <CloudOff color={colors.amber} size={15} />}
            <Text style={[styles.signalText, !online && styles.signalTextOffline]}>{online ? 'Online' : 'Offline'}</Text>
          </View>
          <View style={styles.guardPill}>
            <Text style={styles.guardText}>GUARD ON</Text>
          </View>
        </View>

        {patientMenuOpen && (
          <View style={[styles.patientMenu, darkMode && styles.patientMenuDark]}>
            <TouchableOpacity style={styles.patientMenuItem} onPress={() => handleMenuAction(clearPatientFields)}>
            <Text style={[styles.patientMenuText, darkMode && styles.homeDarkText]}>{t('resetPatientFields')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.patientMenuItem} onPress={() => handleMenuAction(clearEvidence)}>
              <Text style={styles.patientMenuDangerText}>{t('clearEvidence')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.patientMenuItem} onPress={() => handleMenuAction(() => navigation.navigate('Cases'))}>
              <Text style={[styles.patientMenuText, darkMode && styles.homeDarkText]}>{t('openCasesLog')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.patientMenuItem, styles.patientMenuItemLast]} onPress={() => handleMenuAction(() => navigation.navigate('Settings'))}>
              <Text style={[styles.patientMenuText, darkMode && styles.homeDarkText]}>{t('openSettings')}</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={[styles.title, darkMode && styles.homeDarkText]}>{t('patientDetails')}</Text>
        <Text style={[styles.subtitle, darkMode && styles.homeDarkMuted]}>
          {t('consultSubtitle')}
        </Text>

        <View style={[styles.workflowCard, darkMode && styles.homeDarkCard]}>
          <WorkflowStep index={1} label="Patient details" active={hasClinicalInput} dark={darkMode} />
          <WorkflowStep index={2} label="Evidence" active={clinicalEvidence.length > 0 || Boolean(audioRecordingUri)} dark={darkMode} />
          <WorkflowStep index={3} label="AI analysis" active={Boolean(decision)} dark={darkMode} />
          <WorkflowStep index={4} label={logged ? 'Saved' : 'Log & sync'} active={logged} dark={darkMode} last />
        </View>

        <View style={[styles.formCard, darkMode && styles.homeDarkCard]}>
          <Text style={[styles.formTitle, darkMode && styles.homeDarkText]}>{t('fieldMeasurements')}</Text>
          <TextInput
            style={[styles.input, darkMode && styles.homeDarkInput]}
            value={symptoms}
            onChangeText={setSymptoms}
            multiline
            placeholder={t('symptoms')}
            placeholderTextColor={darkMode ? '#A7F3D0' : colors.muted}
          />
          <View style={styles.inputGrid}>
            <MeasurementInput label={t('age')} value={age} onChangeText={setAge} keyboardType="numeric" suffix={t('months')} dark={darkMode} />
            <MeasurementInput label={t('weight')} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" suffix={t('kg')} dark={darkMode} />
            <MeasurementInput label={t('muac')} value={muac} onChangeText={setMuac} keyboardType="decimal-pad" suffix={t('cm')} dark={darkMode} />
          </View>
          <View style={styles.switchRow}>
            <Text style={[styles.switchLabel, darkMode && styles.homeDarkText]}>{t('edema')}</Text>
            <Switch
              value={bilateralEdema}
              onValueChange={setBilateralEdema}
              trackColor={{ false: colors.lineStrong, true: colors.red }}
              thumbColor={colors.white}
            />
          </View>
          {clinicalPhotoUri && (
            <View style={styles.photoSavedRow}>
              <CheckCircle color={colors.green} size={18} />
              <Text style={styles.photoSavedText}>{t('clinicalPhotoAttached')}</Text>
            </View>
          )}
          {clinicalUpload && (
            <View style={styles.photoSavedRow}>
              <FileText color={colors.green} size={18} />
              <Text style={styles.photoSavedText} numberOfLines={1}>{clinicalUpload.name}</Text>
            </View>
          )}
          <EvidenceGallery
            evidence={clinicalEvidence}
            onDelete={(id) => {
              setClinicalEvidence((items) => {
                const removed = items.find((item) => item.id === id);
                if (removed?.uri === clinicalPhotoUri) setClinicalPhotoUri(null);
                if (removed?.uri === clinicalUpload?.uri) setClinicalUpload(null);
                return items.filter((item) => item.id !== id);
              });
            }}
          />
          {audioRecordingUri && (
            <View style={styles.photoSavedRow}>
              <Mic color={colors.green} size={18} />
              <Text style={styles.photoSavedText}>{t('audioAttached')}</Text>
            </View>
          )}
        </View>

        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.quickButton} onPress={() => openClinicalCamera('picture')}>
            <Camera color={colors.green} size={20} />
            <Text style={styles.quickText}>{clinicalPhotoUri ? t('retake') : t('camera')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickButton} onPress={() => setStage('upload')}>
            <FileUp color={colors.green} size={20} />
            <Text style={styles.quickText}>{t('upload')}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity activeOpacity={0.9} style={styles.micOuter} onPress={beginConsult}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.patientPulseRing,
              styles.patientPulseOuter,
              {
                opacity: pulseOne.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0] }),
                transform: [{ scale: pulseOne.interpolate({ inputRange: [0, 1], outputRange: [0.84, 1.62] }) }],
              },
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.patientPulseRing,
              styles.patientPulseMiddle,
              {
                opacity: pulseTwo.interpolate({ inputRange: [0, 1], outputRange: [0.38, 0] }),
                transform: [{ scale: pulseTwo.interpolate({ inputRange: [0, 1], outputRange: [0.78, 1.42] }) }],
              },
            ]}
          />
          <View style={styles.micInner}>
            <Mic color={colors.white} size={66} strokeWidth={2.5} />
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.analyzeButton, !hasClinicalInput && styles.analyzeButtonDisabled]} onPress={runClinicalAnalysis}>
          <Text style={styles.analyzeButtonText}>{t('analyzeCase')}</Text>
        </TouchableOpacity>

        <View style={[styles.readinessBanner, darkMode && styles.homeDarkCard]}>
          <Text style={[styles.readinessBannerTitle, darkMode && styles.homeDarkText]}>
            {online ? 'Reports will send after logging' : 'Offline mode active'}
          </Text>
          <Text style={[styles.readinessBannerText, darkMode && styles.homeDarkMuted]} numberOfLines={2}>
            {online
              ? `${syncSummary?.queuedReports ?? 0} queued • Data center ${getHealthDataCenterUrl()}`
              : `${syncSummary?.queuedReports ?? 0} reports queued. SHIFA will retry when internet returns.`}
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

function ResultScreen({
  decision,
  patient,
  onLogCase,
  onListen,
  logged,
  syncSummary,
  hasAudio,
}: {
  decision: ClinicalDecision;
  patient: {
    ageMonths?: number;
    weightKg?: number;
    muacCm?: number;
    bilateralEdema: boolean;
  };
  onLogCase: () => Promise<void>;
  onListen: () => void;
  logged: boolean;
  syncSummary: HealthSyncSummary | null;
  hasAudio: boolean;
}) {
  const urgent = decision.decision === 'REFER_URGENT';
  const monitor = decision.decision === 'MONITOR';
  const mainColor = decisionColor(decision.decision);
  const soft = decisionSoftColor(decision.decision);

  return (
    <SafeAreaView style={styles.resultScreen}>
      <ScrollView contentContainerStyle={styles.resultContent}>
        <View style={[styles.resultHeader, { backgroundColor: mainColor }, urgent && styles.urgentHeader]}>
          <View>
            <Text style={styles.resultDecision}>{urgent ? 'REFER URGENT' : monitor ? 'MONITOR' : 'TREAT'}</Text>
            <Text style={styles.resultSummary}>{decision.summary}</Text>
          </View>
          {urgent ? <AlertTriangle color={colors.white} size={34} /> : <CheckCircle color={colors.white} size={34} />}
        </View>

        <View style={[styles.diagnosisCard, { backgroundColor: soft, borderColor: mainColor }]}>
          <Text style={[styles.diagnosisTitle, { color: mainColor }]}>{decision.primaryDiagnosis}</Text>
          <Text style={styles.diagnosisText}>Confidence: {Math.round(decision.confidence * 100)}% • {decision.dangerSigns.length} danger sign{decision.dangerSigns.length === 1 ? '' : 's'}</Text>
        </View>

        <View style={styles.resultTriageGrid}>
          <ResultMetric label="Decision" value={urgent ? 'Urgent referral' : monitor ? 'Monitor' : 'Treat here'} color={mainColor} />
          <ResultMetric label="Audio" value={hasAudio ? 'Attached' : 'None'} color={hasAudio ? colors.green : colors.amber} />
          <ResultMetric label="Report" value={logged ? 'Saved' : 'Not saved'} color={logged ? colors.green : colors.amber} />
        </View>

        <Text style={styles.sectionHeader}>{urgent ? 'BEFORE YOU GO' : monitor ? 'HOME CARE' : 'TREATMENT STEPS'}</Text>
        {decision.treatmentSteps.map((step, index) => (
          <View key={step} style={styles.instructionRow}>
            <Text style={[styles.instructionNumber, { backgroundColor: mainColor }]}>{index + 1}</Text>
            <Text style={styles.instructionText}>{step}</Text>
          </View>
        ))}

        <Text style={[styles.sectionHeader, urgent && styles.dangerHeader]}>
          {urgent ? 'DANGER SIGNS EN ROUTE' : 'RETURN IF YOU SEE:'}
        </Text>
        {decision.dangerSigns.map((sign) => (
          <View key={sign} style={[styles.dangerRow, urgent && styles.dangerRowUrgent]}>
            <AlertTriangle color={urgent ? colors.red : colors.amber} size={16} />
            <Text style={styles.dangerText}>{sign}</Text>
          </View>
        ))}

        {urgent && (
          <View style={styles.referralCard}>
            <View style={styles.referralHeader}>
              <Text style={styles.referralTitle}>REFERRAL CARD</Text>
              <Text style={styles.referralBadge}>URGENT</Text>
            </View>
            <View style={styles.referralGrid}>
              <InfoBlock label="Sex" value="Not recorded" />
              <InfoBlock label="Age" value={patient.ageMonths ? `~${patient.ageMonths} months` : 'Not recorded'} />
              <InfoBlock label="Weight" value={patient.weightKg ? `${patient.weightKg} kg` : 'Not recorded'} />
              <InfoBlock label="MUAC" value={patient.muacCm ? `${patient.muacCm} cm` : 'Not recorded'} />
            </View>
            <View style={styles.referralDiagnosis}>
              <Text style={styles.referralDiagnosisLabel}>Diagnosis</Text>
              <Text style={styles.referralDiagnosisText}>{decision.primaryDiagnosis}</Text>
              <Text style={styles.referralDiagnosisDetail}>
                {patient.bilateralEdema ? 'Bilateral edema recorded' : 'Bilateral edema not recorded'}
                {patient.muacCm ? ` • MUAC ${patient.muacCm} cm` : ''}
              </Text>
            </View>
            <Text style={styles.referralMeta}>CHW: Field profile • Time: {new Date().toISOString().substring(0, 16)} UTC</Text>
          </View>
        )}

        <View style={styles.reportStatusCard}>
          <Text style={styles.reportStatusTitle}>Report status</Text>
          <Text style={styles.reportStatusText}>
            {logged
              ? `${syncSummary?.queuedReports ?? 0} queued locally • ${syncSummary?.sentReports ?? 0} sent to data center`
              : 'Log this case to save it locally and send it to the SHIFA data center.'}
          </Text>
          <Text style={styles.reportStatusDestination} numberOfLines={1}>{syncSummary?.destination ?? getHealthDataCenterUrl()}</Text>
        </View>
      </ScrollView>

      <View style={styles.stickyActions}>
        <TouchableOpacity style={[styles.secondaryAction, !hasAudio && styles.secondaryActionDisabled]} onPress={onListen} disabled={!hasAudio}>
          <Volume2 color={colors.ink} size={20} />
          <Text style={styles.secondaryActionText}>Listen</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.primaryAction} onPress={onLogCase}>
          <FileText color={colors.white} size={20} />
          <Text style={styles.primaryActionText}>{logged ? 'Saved' : 'Log Case'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function WorkflowStep({ index, label, active, dark, last }: { index: number; label: string; active: boolean; dark: boolean; last?: boolean }) {
  return (
    <View style={[styles.workflowStep, last && styles.workflowStepLast]}>
      <View style={[styles.workflowNumber, active && styles.workflowNumberActive]}>
        <Text style={[styles.workflowNumberText, active && styles.workflowNumberTextActive]}>{active ? '✓' : index}</Text>
      </View>
      <Text style={[styles.workflowLabel, dark && styles.homeDarkMuted]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function ResultMetric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.resultMetric}>
      <Text style={styles.resultMetricLabel}>{label}</Text>
      <Text style={[styles.resultMetricValue, { color }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoBlock}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function MeasurementInput({
  label,
  value,
  onChangeText,
  keyboardType,
  suffix,
  dark,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType: 'numeric' | 'decimal-pad';
  suffix: string;
  dark: boolean;
}) {
  return (
    <View style={[styles.measurementBox, dark && styles.homeDarkInput]}>
      <Text style={[styles.measurementLabel, dark && styles.homeDarkAccent]}>{label}</Text>
      <TextInput
        style={[styles.measurementInput, dark && styles.homeDarkText]}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder="0"
        placeholderTextColor={dark ? '#A7F3D0' : colors.muted}
      />
      <Text style={[styles.measurementSuffix, dark && styles.homeDarkMuted]}>{suffix}</Text>
    </View>
  );
}

function EvidenceGallery({
  evidence,
  onDelete,
}: {
  evidence: EvidenceAsset[];
  onDelete: (id: string) => void;
}) {
  const { t } = useI18n();
  if (evidence.length === 0) return null;

  return (
    <View style={styles.evidenceGallery}>
      <Text style={styles.evidenceTitle}>{t('evidenceForAI')}</Text>
      {evidence.map((item) => (
        <View key={item.id} style={styles.evidenceRow}>
          {item.kind === 'image' ? (
            <Image source={{ uri: item.uri }} style={styles.evidenceThumb} />
          ) : (
            <View style={styles.evidenceFileIcon}>
              <FileText color={colors.green} size={22} />
            </View>
          )}
          <View style={styles.evidenceTextGroup}>
            <Text style={styles.evidenceName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.evidenceType}>{item.mimeType}</Text>
          </View>
          <TouchableOpacity style={styles.evidenceDeleteButton} onPress={() => onDelete(item.id)}>
            <Text style={styles.evidenceDeleteText}>{t('delete')}</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

function AudioPlaybackScreen({
  status,
  levels,
  onBack,
  onPlayPause,
  onSeek,
}: {
  status: { currentTime: number; duration: number; playing: boolean };
  levels: number[];
  onBack: () => void;
  onPlayPause: () => void;
  onSeek: (seconds: number) => void;
}) {
  const duration = Math.max(status.duration || 0, 1);
  const currentTime = Math.min(status.currentTime || 0, duration);
  const progress = currentTime / duration;
  const waveformHeights = getPlaybackWaveformHeights(levels);

  return (
    <SafeAreaView style={styles.playbackScreen}>
      <View style={styles.playbackContent}>
        <Text style={styles.playbackTitle}>Consultation audio</Text>
        <Text style={styles.playbackTime}>
          {formatSeconds(currentTime)} / {formatSeconds(duration)}
        </Text>
        <View style={styles.playbackWaveform}>
          {waveformHeights.map((height, index) => {
            const active = index / Math.max(waveformHeights.length - 1, 1) <= progress;
            return (
              <View
                key={index}
                style={[
                  styles.playbackBar,
                  { height, backgroundColor: active ? '#34D97B' : '#1B5B39' },
                ]}
              />
            );
          })}
        </View>
        <TouchableOpacity
          activeOpacity={0.9}
          style={styles.progressTrack}
          onPress={() => onSeek(Math.min(duration, currentTime + Math.max(2, duration * 0.08)))}
        >
          <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
          <View style={[styles.progressThumb, { left: `${Math.round(progress * 100)}%` }]} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.playButton} onPress={onPlayPause}>
          <Text style={styles.playButtonText}>{status.playing ? 'Pause' : 'Play'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.playbackBackButton} onPress={onBack}>
          <Text style={styles.playbackBackText}>Back</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function formatDuration(durationMillis: number): string {
  const totalSeconds = Math.floor(durationMillis / 1000);
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function formatSeconds(seconds: number): string {
  return formatDuration(seconds * 1000);
}

function normalizeMetering(metering?: number): number {
  if (typeof metering !== 'number' || Number.isNaN(metering)) return 0.08;
  return Math.max(0.06, Math.min(1, (metering + 58) / 58));
}

function createPulseLoop(value: Animated.Value, delay: number) {
  return Animated.loop(
    Animated.sequence([
      Animated.delay(delay),
      Animated.timing(value, {
        toValue: 1,
        duration: 1680,
        useNativeDriver: true,
      }),
      Animated.timing(value, {
        toValue: 0,
        duration: 0,
        useNativeDriver: true,
      }),
    ])
  );
}

function getListeningWaveformHeights(levels: number[]): number[] {
  const source = levels.slice(-28);
  const padded = source.length >= 28 ? source : [...Array.from({ length: 28 - source.length }, () => 0.08), ...source];
  return padded.map((level, index) => {
    const rhythm = 0.62 + Math.sin(index * 0.72) * 0.24;
    return 10 + Math.max(0.06, Math.min(1, level * rhythm)) * 54;
  });
}

function getPlaybackWaveformHeights(levels: number[]): number[] {
  const source = levels.length > 0 ? levels : Array.from({ length: 36 }, () => 0.08);
  return source.map((level) => 10 + Math.max(0.06, Math.min(1, level)) * 54);
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  homeDarkScreen: {
    backgroundColor: colors.night,
  },
  homeDarkCard: {
    backgroundColor: colors.nightPanel,
    borderColor: '#145C39',
  },
  homeDarkText: {
    color: colors.white,
  },
  homeDarkMuted: {
    color: '#A7F3D0',
  },
  homeDarkAccent: {
    color: '#86EFAC',
  },
  homeDarkInput: {
    backgroundColor: '#062719',
    borderColor: '#145C39',
    color: colors.white,
  },
  photoScreen: {
    flex: 1,
    backgroundColor: colors.ink,
  },
  clinicalCamera: {
    flex: 1,
  },
  cameraShell: {
    flex: 1,
  },
  photoOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    flex: 1,
    justifyContent: 'space-between',
    padding: 20,
  },
  photoCloseButton: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.58)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  photoCloseText: {
    color: colors.white,
    fontWeight: '900',
  },
  photoGuide: {
    backgroundColor: 'rgba(0,0,0,0.58)',
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
  },
  photoGuideTitle: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '900',
  },
  photoGuideText: {
    color: '#D8F7E3',
    marginTop: 4,
    fontWeight: '700',
  },
  cameraModeSwitch: {
    alignSelf: 'center',
    minHeight: 54,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.58)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
    flexDirection: 'row',
    padding: 5,
  },
  cameraModeButton: {
    minWidth: 112,
    borderRadius: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  cameraModeButtonActive: {
    backgroundColor: colors.green,
  },
  cameraModeText: {
    color: '#D8F7E3',
    fontWeight: '900',
    marginLeft: 8,
  },
  cameraModeTextActive: {
    color: colors.white,
  },
  shutterButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 5,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 14,
  },
  shutterInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.white,
  },
  videoShutterButton: {
    minWidth: 172,
    minHeight: 58,
    borderRadius: 8,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 14,
  },
  videoShutterButtonActive: {
    backgroundColor: colors.red,
  },
  videoShutterText: {
    color: colors.white,
    fontWeight: '900',
    fontSize: 16,
  },
  content: {
    padding: 20,
    paddingBottom: 92,
  },
  uploadPage: {
    flex: 1,
    padding: 22,
    justifyContent: 'center',
  },
  uploadTopCancel: {
    position: 'absolute',
    top: 22,
    left: 22,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    backgroundColor: colors.paperStrong,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  uploadTopCancelDark: {
    backgroundColor: colors.nightPanel,
    borderColor: '#145C39',
  },
  uploadTopCancelText: {
    color: colors.green,
    fontWeight: '900',
  },
  uploadPrimaryButton: {
    minHeight: 58,
    borderRadius: 8,
    backgroundColor: colors.green,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
    ...fieldShadow,
  },
  uploadPrimaryText: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '900',
    marginLeft: 10,
  },
  uploadCancelButton: {
    minHeight: 56,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    backgroundColor: colors.paperStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  uploadCancelButtonDark: {
    backgroundColor: colors.nightPanel,
    borderColor: '#145C39',
  },
  uploadCancelText: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 30,
  },
  menuButton: {
    width: 52,
    height: 52,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 'auto',
  },
  menuButtonActive: {
    backgroundColor: colors.green,
  },
  menuText: {
    color: colors.ink,
    fontSize: 26,
    fontWeight: '800',
  },
  patientMenu: {
    borderRadius: 8,
    backgroundColor: colors.paperStrong,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    marginTop: -18,
    marginBottom: 18,
    overflow: 'hidden',
    ...fieldShadow,
  },
  patientMenuDark: {
    backgroundColor: colors.nightPanel,
    borderColor: '#145C39',
  },
  patientMenuItem: {
    minHeight: 50,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  patientMenuItemLast: {
    borderBottomWidth: 0,
  },
  patientMenuText: {
    color: colors.ink,
    fontWeight: '900',
  },
  patientMenuDangerText: {
    color: colors.red,
    fontWeight: '900',
  },
  signalPill: {
    backgroundColor: colors.greenSoft,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  signalPillOffline: {
    backgroundColor: colors.amberSoft,
  },
  signalText: {
    color: colors.green,
    fontWeight: '900',
    marginLeft: 6,
  },
  signalTextOffline: {
    color: colors.amber,
  },
  guardPill: {
    backgroundColor: colors.green,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  guardText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '900',
  },
  title: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
    marginTop: 4,
    marginBottom: 18,
  },
  workflowCard: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DDE7E0',
    backgroundColor: colors.paperStrong,
    padding: 12,
    marginBottom: 14,
  },
  workflowStep: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5ECE7',
    paddingVertical: 5,
  },
  workflowStepLast: {
    borderBottomWidth: 0,
  },
  workflowNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#EEF4F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  workflowNumberActive: {
    backgroundColor: colors.green,
  },
  workflowNumberText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '900',
  },
  workflowNumberTextActive: {
    color: colors.white,
  },
  workflowLabel: {
    flex: 1,
    color: colors.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  micOuter: {
    width: 164,
    height: 164,
    borderRadius: 82,
    alignSelf: 'center',
    marginVertical: 30,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  patientPulseRing: {
    position: 'absolute',
    borderRadius: 82,
    borderWidth: 2,
  },
  patientPulseOuter: {
    width: 164,
    height: 164,
    borderColor: '#22C55E',
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
  },
  patientPulseMiddle: {
    width: 132,
    height: 132,
    borderColor: '#A7F3D0',
    backgroundColor: 'rgba(167, 243, 208, 0.12)',
  },
  micInner: {
    width: 116,
    height: 116,
    borderRadius: 58,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green,
    borderWidth: 2,
    borderColor: '#DDFCE7',
    shadowColor: '#18C66A',
    shadowOpacity: 0.34,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  analyzeButton: {
    minHeight: 58,
    borderRadius: 8,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    marginBottom: 22,
    ...fieldShadow,
  },
  analyzeButtonDisabled: {
    opacity: 0.58,
  },
  analyzeButtonText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '900',
  },
  readinessBanner: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DDE7E0',
    backgroundColor: colors.paperStrong,
    padding: 12,
    marginBottom: 8,
  },
  readinessBannerTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  readinessBannerText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
    lineHeight: 17,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 22,
    marginBottom: 22,
  },
  quickButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: colors.paperStrong,
    borderWidth: 1.5,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 6,
  },
  quickText: {
    color: colors.ink,
    marginLeft: 8,
    fontWeight: '800',
  },
  formCard: {
    backgroundColor: colors.paperStrong,
    borderRadius: 8,
    padding: 14,
    borderWidth: 1.5,
    borderColor: colors.line,
    marginTop: 2,
    ...highContrastShadow,
  },
  formTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 10,
  },
  input: {
    minHeight: 78,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    borderRadius: 8,
    padding: 12,
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
    backgroundColor: colors.paper,
    textAlignVertical: 'top',
  },
  inputGrid: {
    flexDirection: 'row',
    marginTop: 10,
  },
  measurementBox: {
    flex: 1,
    minHeight: 86,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginRight: 8,
    backgroundColor: colors.paper,
    justifyContent: 'center',
  },
  measurementLabel: {
    color: colors.green,
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 2,
  },
  measurementInput: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: '900',
    padding: 0,
  },
  measurementSuffix: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  switchRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  switchLabel: {
    color: colors.ink,
    fontWeight: '900',
  },
  photoSavedRow: {
    minHeight: 40,
    borderRadius: 8,
    backgroundColor: colors.greenSoft,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    marginTop: 8,
  },
  photoSavedText: {
    color: colors.green,
    fontWeight: '900',
    marginLeft: 8,
  },
  evidenceGallery: {
    marginTop: 10,
  },
  evidenceTitle: {
    color: colors.green,
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 8,
  },
  evidenceRow: {
    minHeight: 64,
    borderRadius: 8,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    marginBottom: 8,
  },
  evidenceThumb: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: colors.line,
  },
  evidenceFileIcon: {
    width: 48,
    height: 48,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.greenSoft,
  },
  evidenceTextGroup: {
    flex: 1,
    marginLeft: 10,
  },
  evidenceName: {
    color: colors.ink,
    fontWeight: '900',
  },
  evidenceType: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  evidenceDeleteButton: {
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.red,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  evidenceDeleteText: {
    color: colors.red,
    fontWeight: '900',
  },
  bottomStatus: {
    position: 'absolute',
    bottom: 14,
    alignSelf: 'center',
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EDEFEA',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
  },
  bottomStatusText: {
    color: colors.green,
    fontWeight: '900',
    marginLeft: 8,
  },
  darkScreen: {
    flex: 1,
    backgroundColor: colors.night,
    padding: 22,
    justifyContent: 'center',
  },
  darkKicker: {
    color: '#34D97B',
    position: 'absolute',
    top: 56,
    left: 22,
    fontSize: 18,
    fontWeight: '900',
  },
  voiceStage: {
    width: 248,
    height: 248,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  pulseRing: {
    position: 'absolute',
    borderRadius: 124,
    borderWidth: 2,
  },
  pulseRingOuter: {
    width: 222,
    height: 222,
    borderColor: '#56E391',
    backgroundColor: 'rgba(52, 217, 123, 0.04)',
  },
  pulseRingMiddle: {
    width: 182,
    height: 182,
    borderColor: '#94F2B8',
    backgroundColor: 'rgba(148, 242, 184, 0.06)',
  },
  pulseRingInner: {
    width: 138,
    height: 138,
    borderColor: '#D5FFE0',
    backgroundColor: 'rgba(213, 255, 224, 0.08)',
  },
  micOrb: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: '#18C66A',
    borderWidth: 2,
    borderColor: '#BDF7D0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#34D97B',
    shadowOpacity: 0.55,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  listeningWaveform: {
    height: 74,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  listeningWaveBar: {
    width: 4,
    borderRadius: 3,
    backgroundColor: '#A7F3D0',
    marginHorizontal: 3,
  },
  timer: {
    color: colors.white,
    textAlign: 'center',
    fontSize: 44,
    fontWeight: '500',
    marginTop: 28,
  },
  darkBody: {
    color: colors.white,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 6,
  },
  stopButton: {
    alignSelf: 'center',
    width: 190,
    height: 58,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#1D6A44',
    backgroundColor: '#EAF6EE',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 42,
  },
  stopButtonText: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '900',
    marginLeft: 10,
  },
  languageText: {
    color: '#86EFAC',
    textAlign: 'center',
    marginTop: 54,
    fontWeight: '800',
  },
  processingTitle: {
    color: colors.white,
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 18,
  },
  processingSpinner: {
    marginBottom: 16,
  },
  processingList: {
    width: '100%',
  },
  processingRow: {
    minHeight: 70,
    borderRadius: 8,
    backgroundColor: colors.nightPanel,
    borderWidth: 1,
    borderColor: '#145C39',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginBottom: 9,
  },
  stepIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#5F7169',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  stepIconDone: {
    backgroundColor: colors.greenBright,
  },
  stepIconActive: {
    backgroundColor: '#BFEBD0',
    borderWidth: 3,
    borderColor: colors.greenBright,
  },
  stepTextGroup: {
    flex: 1,
  },
  stepTitle: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '900',
  },
  stepStatus: {
    color: '#BEEACE',
    fontSize: 13,
    marginTop: 2,
    fontWeight: '700',
  },
  offlinePill: {
    position: 'absolute',
    bottom: 28,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
  },
  offlineText: {
    color: '#BBF7D0',
    marginLeft: 8,
    fontWeight: '800',
  },
  resultScreen: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  resultContent: {
    paddingBottom: 104,
  },
  resultHeader: {
    minHeight: 132,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  urgentHeader: {
    minHeight: 158,
  },
  resultDecision: {
    color: colors.white,
    fontSize: 31,
    fontWeight: '900',
  },
  resultSummary: {
    color: colors.white,
    fontSize: 15,
    marginTop: 4,
    fontWeight: '800',
  },
  diagnosisCard: {
    margin: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    padding: 16,
    ...fieldShadow,
  },
  diagnosisTitle: {
    fontSize: 19,
    fontWeight: '900',
    marginBottom: 4,
  },
  diagnosisText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  resultTriageGrid: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  resultMetric: {
    flex: 1,
    minHeight: 58,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DDE7E0',
    backgroundColor: colors.paperStrong,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  resultMetricLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
  },
  resultMetricValue: {
    fontSize: 13,
    fontWeight: '900',
    marginTop: 4,
  },
  sectionHeader: {
    color: colors.green,
    fontSize: 14,
    fontWeight: '900',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 8,
  },
  dangerHeader: {
    color: colors.red,
  },
  instructionRow: {
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: colors.paperStrong,
    borderWidth: 1,
    borderColor: colors.line,
    marginHorizontal: 16,
    marginBottom: 7,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  instructionNumber: {
    width: 20,
    height: 20,
    borderRadius: 10,
    color: colors.white,
    textAlign: 'center',
    overflow: 'hidden',
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 20,
    marginRight: 10,
  },
  instructionText: {
    flex: 1,
    color: colors.ink,
    fontWeight: '800',
  },
  dangerRow: {
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: colors.amberSoft,
    marginHorizontal: 16,
    marginBottom: 7,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dangerRowUrgent: {
    backgroundColor: colors.redSoft,
  },
  dangerText: {
    flex: 1,
    color: colors.ink,
    fontWeight: '800',
    marginLeft: 10,
  },
  referralCard: {
    margin: 16,
    backgroundColor: colors.paperStrong,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    padding: 14,
    ...highContrastShadow,
  },
  referralHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  referralTitle: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '900',
  },
  referralBadge: {
    backgroundColor: colors.red,
    color: colors.white,
    overflow: 'hidden',
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontWeight: '900',
  },
  referralGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  infoBlock: {
    width: '48%',
    backgroundColor: colors.greenSoft,
    borderRadius: 8,
    padding: 10,
    marginRight: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.line,
  },
  infoLabel: {
    color: colors.green,
    fontSize: 12,
    fontWeight: '800',
  },
  infoValue: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 4,
  },
  referralDiagnosis: {
    backgroundColor: colors.redSoft,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#F5B5B5',
  },
  referralDiagnosisLabel: {
    color: colors.red,
    fontWeight: '900',
  },
  referralDiagnosisText: {
    color: colors.red,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 4,
  },
  referralDiagnosisDetail: {
    color: colors.red,
    fontWeight: '800',
    marginTop: 4,
  },
  referralMeta: {
    color: colors.ink,
    marginTop: 12,
    fontWeight: '700',
  },
  reportStatusCard: {
    marginHorizontal: 16,
    marginBottom: 18,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DDE7E0',
    backgroundColor: colors.paperStrong,
    padding: 14,
  },
  reportStatusTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  reportStatusText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 5,
  },
  reportStatusDestination: {
    color: colors.green,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 7,
  },
  stickyActions: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 92,
    backgroundColor: colors.paper,
    borderTopWidth: 1.5,
    borderTopColor: colors.line,
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  resultOfflineNotice: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 98,
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: '#EDEFEA',
    borderWidth: 1,
    borderColor: colors.lineStrong,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 18,
    paddingRight: 8,
  },
  resultOfflineText: {
    flex: 1,
    color: colors.green,
    fontWeight: '900',
    marginLeft: 8,
  },
  resultOfflineOk: {
    minWidth: 52,
    minHeight: 36,
    borderRadius: 18,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultOfflineOkText: {
    color: colors.white,
    fontWeight: '900',
  },
  secondaryAction: {
    flex: 1,
    height: 56,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    backgroundColor: colors.paperStrong,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  secondaryActionDisabled: {
    opacity: 0.42,
  },
  secondaryActionText: {
    color: colors.ink,
    fontWeight: '900',
    marginLeft: 8,
  },
  primaryAction: {
    flex: 1,
    height: 56,
    borderRadius: 8,
    backgroundColor: colors.green,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryActionText: {
    color: colors.white,
    fontWeight: '900',
    marginLeft: 8,
  },
  playbackScreen: {
    flex: 1,
    backgroundColor: colors.night,
  },
  playbackContent: {
    flex: 1,
    padding: 22,
    justifyContent: 'center',
  },
  playbackTitle: {
    color: colors.white,
    fontSize: 25,
    fontWeight: '900',
    textAlign: 'center',
  },
  playbackTime: {
    color: '#BBF7D0',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 8,
  },
  playbackWaveform: {
    height: 94,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 30,
  },
  playbackBar: {
    width: 4,
    borderRadius: 3,
    marginHorizontal: 1.5,
  },
  progressTrack: {
    height: 14,
    borderRadius: 7,
    backgroundColor: '#0F3B28',
    borderWidth: 1,
    borderColor: '#1D6A44',
    justifyContent: 'center',
    marginTop: 24,
    overflow: 'visible',
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 7,
    backgroundColor: '#34D97B',
  },
  progressThumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    marginLeft: -10,
    backgroundColor: colors.white,
    borderWidth: 3,
    borderColor: '#34D97B',
  },
  playButton: {
    height: 58,
    borderRadius: 8,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
  },
  playButtonText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '900',
  },
  playbackBackButton: {
    height: 54,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#1D6A44',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  playbackBackText: {
    color: '#BBF7D0',
    fontSize: 16,
    fontWeight: '900',
  },
});
