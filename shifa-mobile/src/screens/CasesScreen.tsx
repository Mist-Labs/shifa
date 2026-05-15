import React, { useCallback, useState } from 'react';
import { Alert, Modal, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { AlertTriangle, CheckCircle, Clock, RotateCcw, Trash2, UploadCloud, X } from 'lucide-react-native';
import { CaseLogDetail, CaseLogItem, deleteCaseLogItem, getCaseCounts, getCaseLogDetail, listCaseLog } from '../services/caseLog';
import { colors, decisionColor } from '../design/system';
import { flushSMSQueue } from '../services/alertSMS';
import { getHealthDataCenterUrl, getHealthSyncSummary, HealthSyncSummary, syncHealthReports } from '../services/syncReports';
import { useI18n } from '../services/i18n';

function formatTime(timestamp: number): string {
  if (!timestamp) return '--:--';
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function readableDecision(decision: string, t: (key: string) => string): string {
  if (decision.includes('REFER_URGENT')) return t('referUrgent');
  if (decision.includes('REFER_ROUTINE')) return 'Routine referral';
  if (decision.includes('MONITOR')) return t('monitor');
  if (decision.includes('THREAT')) return t('threat');
  return t('treat');
}

export default function CasesScreen() {
  const [items, setItems] = useState<CaseLogItem[]>([]);
  const [counts, setCounts] = useState({ total: 0, synced: 0 });
  const [syncSummary, setSyncSummary] = useState<HealthSyncSummary | null>(null);
  const [selectedCase, setSelectedCase] = useState<CaseLogDetail | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { t } = useI18n();

  const load = useCallback(async () => {
    const [nextItems, nextCounts, nextSyncSummary] = await Promise.all([listCaseLog(), getCaseCounts(), getHealthSyncSummary()]);
    setItems(nextItems);
    setCounts(nextCounts);
    setSyncSummary(nextSyncSummary);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const syncNow = async () => {
    const result = await syncHealthReports();
    await flushSMSQueue();
    await load();
    if (result.offline) {
      Alert.alert('Reports queued offline', result.message);
      return;
    }
    if (!result.success) {
      Alert.alert('Sync failed', `${result.message}\n\nDestination: ${getHealthDataCenterUrl()}`);
      return;
    }
    Alert.alert(
      result.syncedCount > 0 ? 'Reports sent' : 'Nothing pending',
      result.outbreakCount > 0
        ? `${result.message} ${result.outbreakCount} outbreak alert${result.outbreakCount === 1 ? '' : 's'} returned.`
        : result.message
    );
  };

  const refreshCases = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const confirmDelete = (item: CaseLogItem) => {
    Alert.alert(
      item.kind === 'consultation' ? t('deleteConsultationTitle') : t('deleteGuardTitle'),
      t('deleteRecordMessage'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            await deleteCaseLogItem(item);
            await load();
          },
        },
      ]
    );
  };

  const openCase = async (item: CaseLogItem) => {
    const detail = await getCaseLogDetail(item);
    if (!detail) {
      Alert.alert('Record unavailable', 'This record could not be opened on this device.');
      return;
    }
    setSelectedCase(detail);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.pageContent}
        keyboardShouldPersistTaps="handled"
        alwaysBounceVertical
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshCases}
            tintColor={colors.green}
            colors={[colors.green]}
          />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{t('todayCases')}</Text>
            <Text style={styles.subtitle}>
              {counts.total} {t('total')} • {counts.synced} {t('synced')}
            </Text>
          </View>
          <View style={styles.headerMetric}>
            <Text style={styles.headerMetricValue}>{syncSummary?.queuedReports ?? Math.max(counts.total - counts.synced, 0)}</Text>
            <Text style={styles.headerMetricLabel}>queued</Text>
          </View>
        </View>

        <View style={styles.syncPanel}>
          <View style={styles.syncPanelTop}>
            <Text style={styles.syncPanelTitle}>Data center sync</Text>
            <Text style={[styles.syncPanelState, syncSummary?.failedReports ? styles.syncPanelStateFailed : styles.syncPanelStateReady]}>
              {syncSummary?.failedReports ? 'Needs attention' : syncSummary?.queuedReports ? 'Queued' : 'Current'}
            </Text>
          </View>
          <Text style={styles.syncPanelDestination} numberOfLines={1}>{syncSummary?.destination ?? getHealthDataCenterUrl()}</Text>
          <View style={styles.syncStats}>
            <SyncStat label="Sent" value={syncSummary?.sentReports ?? counts.synced} />
            <SyncStat label="Retrying" value={syncSummary?.retryingReports ?? 0} />
            <SyncStat label="Failed" value={syncSummary?.failedReports ?? 0} danger />
          </View>
          <Text style={styles.syncPanelFoot}>
            {syncSummary?.lastAttemptAt ? `Last attempt ${formatDateTime(syncSummary.lastAttemptAt)}` : 'No sync attempt yet'}
          </Text>
          <TouchableOpacity style={styles.syncNowButton} onPress={syncNow}>
            <RotateCcw color={colors.white} size={18} />
            <Text style={styles.syncNowText}>{t('sync')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.list}>
          {items.length === 0 && (
            <View style={styles.emptyCard}>
              <UploadCloud color={colors.green} size={30} />
              <Text style={styles.emptyTitle}>{t('noCasesLogged')}</Text>
              <Text style={styles.emptyText}>{t('noCasesText')}</Text>
            </View>
          )}

          {items.map((item) => {
            const color = decisionColor(item.decision);
            return (
              <TouchableOpacity key={item.id} style={styles.caseRow} onPress={() => openCase(item)} activeOpacity={0.86}>
                <View style={styles.caseBody}>
                  <View style={styles.caseTop}>
                    <View style={[styles.decisionDot, { backgroundColor: color }]} />
                    <View style={styles.caseTitleGroup}>
                      <Text style={styles.caseTitle} numberOfLines={1}>{item.title}</Text>
                      <Text style={styles.caseTime}>{formatTime(item.createdAt)}</Text>
                    </View>
                    <View style={[styles.iconBadge, item.synced ? styles.iconBadgeSent : styles.iconBadgePending]}>
                      {item.synced ? (
                        <CheckCircle color={colors.green} size={16} />
                      ) : (
                        <Clock color="#64748B" size={16} />
                      )}
                    </View>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${item.kind === 'consultation' ? 'consultation' : 'Guard event'}`}
                      style={styles.deleteButton}
                      onPress={() => confirmDelete(item)}
                    >
                      <Trash2 color={colors.red} size={18} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.caseStatusRow}>
                    <Text style={[styles.decisionText, { color }]}>{readableDecision(item.decision, t)}</Text>
                    <Text style={[styles.syncBadge, item.synced ? styles.syncBadgeSent : styles.syncBadgePending]}>
                      {item.synced ? 'Sent to data center' : 'Queued for sync'}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <Modal visible={Boolean(selectedCase)} animationType="slide" transparent onRequestClose={() => setSelectedCase(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.caseDetailSheet}>
            <View style={styles.caseDetailHeader}>
              <View>
                <Text style={styles.caseDetailKicker}>{selectedCase?.kind === 'threat' ? 'Guard record' : 'Patient record'}</Text>
                <Text style={styles.caseDetailTitle}>{selectedCase?.title}</Text>
              </View>
              <TouchableOpacity style={styles.caseDetailClose} onPress={() => setSelectedCase(null)}>
                <X color={colors.ink} size={22} />
              </TouchableOpacity>
            </View>
            {selectedCase && (
              <ScrollView contentContainerStyle={styles.caseDetailBody}>
                <View style={styles.caseDetailDecisionRow}>
                  <Text style={[styles.caseDetailDecision, { color: decisionColor(selectedCase.decision) }]}>
                    {readableDecision(selectedCase.decision, t)}
                  </Text>
                  <Text style={styles.caseDetailSync}>{selectedCase.synced ? 'Synced' : 'Queued'}</Text>
                </View>
                <Text style={styles.caseDetailMeta}>
                  {formatDateTime(selectedCase.createdAt)} • {Math.round(selectedCase.confidence * 100)}% confidence
                </Text>
                <Text style={styles.caseDetailSection}>Symptoms</Text>
                <Text style={styles.caseDetailText}>{selectedCase.detail || 'No symptom text recorded.'}</Text>
                {selectedCase.kind === 'consultation' && (
                  <>
                    <View style={styles.caseDetailGrid}>
                      <DetailMetric label="Age" value={selectedCase.ageMonths ? `${selectedCase.ageMonths} months` : 'Not recorded'} />
                      <DetailMetric label="Weight" value={selectedCase.weightKg ? `${selectedCase.weightKg} kg` : 'Not recorded'} />
                      <DetailMetric label="MUAC" value={selectedCase.muacCm ? `${selectedCase.muacCm} cm` : 'Not recorded'} />
                      <DetailMetric label="Edema" value={selectedCase.bilateralEdema ? 'Recorded' : 'Not recorded'} />
                    </View>
                    <Text style={styles.caseDetailSection}>Clinical analysis</Text>
                    <Text style={styles.caseDetailText}>{selectedCase.fullResponse?.summary || selectedCase.fullResponse?.voiceResponse || 'No analysis summary stored.'}</Text>
                    {selectedCase.fullResponse?.guardrailOverrideReason && (
                      <View style={styles.caseDetailWarning}>
                        <AlertTriangle color={colors.red} size={16} />
                        <Text style={styles.caseDetailWarningText}>{selectedCase.fullResponse.guardrailOverrideReason}</Text>
                      </View>
                    )}
                    {selectedCase.fullResponse?.treatmentSteps?.map((step: string, index: number) => (
                      <View key={`${step}-${index}`} style={styles.caseDetailStep}>
                        <Text style={styles.caseDetailStepNumber}>{index + 1}</Text>
                        <Text style={styles.caseDetailStepText}>{step}</Text>
                      </View>
                    ))}
                  </>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailMetric}>
      <Text style={styles.detailMetricLabel}>{label}</Text>
      <Text style={styles.detailMetricValue}>{value}</Text>
    </View>
  );
}

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function SyncStat({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <View style={styles.syncStat}>
      <Text style={[styles.syncStatValue, danger && value > 0 && styles.syncStatDanger]}>{value}</Text>
      <Text style={styles.syncStatLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F6F8F5',
  },
  pageContent: {
    paddingBottom: 150,
  },
  header: {
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 8,
  },
  title: {
    color: colors.ink,
    fontSize: 25,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.muted,
    marginTop: 4,
    fontSize: 15,
    fontWeight: '800',
  },
  headerMetric: {
    minWidth: 66,
    height: 52,
    borderRadius: 8,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DDE7E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerMetricValue: {
    color: colors.green,
    fontSize: 18,
    fontWeight: '900',
  },
  headerMetricLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
  },
  list: {
    padding: 16,
    paddingTop: 14,
  },
  syncPanel: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 2,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DDE7E0',
    backgroundColor: colors.white,
    padding: 14,
  },
  syncPanelTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  syncPanelTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  syncPanelState: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '900',
  },
  syncPanelStateReady: {
    color: colors.green,
    backgroundColor: colors.greenSoft,
  },
  syncPanelStateFailed: {
    color: colors.red,
    backgroundColor: colors.redSoft,
  },
  syncPanelDestination: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 5,
  },
  syncStats: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  syncStat: {
    flex: 1,
    minHeight: 52,
    borderRadius: 8,
    backgroundColor: '#F7FAF8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncStatValue: {
    color: colors.green,
    fontSize: 18,
    fontWeight: '900',
  },
  syncStatDanger: {
    color: colors.red,
  },
  syncStatLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
  },
  syncPanelFoot: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 10,
  },
  syncNowButton: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  syncNowText: {
    color: colors.white,
    fontWeight: '900',
  },
  emptyCard: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DDE7E0',
    backgroundColor: colors.white,
    padding: 22,
    alignItems: 'center',
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 10,
  },
  emptyText: {
    color: colors.muted,
    textAlign: 'center',
    marginTop: 6,
    fontWeight: '700',
  },
  caseRow: {
    minHeight: 72,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DDE7E0',
    backgroundColor: colors.white,
    flexDirection: 'row',
    overflow: 'hidden',
    marginBottom: 10,
  },
  caseBody: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  caseTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  decisionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  caseTitleGroup: {
    flex: 1,
  },
  caseTitle: {
    color: colors.ink,
    fontWeight: '900',
    fontSize: 15,
  },
  caseTime: {
    color: colors.muted,
    fontWeight: '700',
    fontSize: 12,
    marginTop: 2,
  },
  iconBadge: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  iconBadgeSent: {
    backgroundColor: '#E8F5ED',
  },
  iconBadgePending: {
    backgroundColor: '#EFF3F1',
  },
  deleteButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#FFF1F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  decisionText: {
    fontSize: 13,
    fontWeight: '900',
  },
  caseStatusRow: {
    marginLeft: 20,
    marginTop: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  syncBadge: {
    flexShrink: 0,
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 10,
    fontWeight: '900',
  },
  syncBadgeSent: {
    color: colors.green,
    backgroundColor: '#DCFCE7',
  },
  syncBadgePending: {
    color: colors.muted,
    backgroundColor: '#E5E7EB',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 28, 18, 0.42)',
    justifyContent: 'flex-end',
  },
  caseDetailSheet: {
    maxHeight: '86%',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: colors.paper,
    paddingTop: 16,
  },
  caseDetailHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DDE7E0',
  },
  caseDetailKicker: {
    color: colors.green,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  caseDetailTitle: {
    color: colors.ink,
    fontSize: 21,
    fontWeight: '900',
    marginTop: 4,
    maxWidth: 260,
  },
  caseDetailClose: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: '#F1F5F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  caseDetailBody: {
    padding: 18,
    paddingBottom: 42,
  },
  caseDetailDecisionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  caseDetailDecision: {
    fontSize: 16,
    fontWeight: '900',
  },
  caseDetailSync: {
    color: colors.green,
    fontSize: 12,
    fontWeight: '900',
    backgroundColor: '#E8F5ED',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  caseDetailMeta: {
    color: colors.muted,
    fontWeight: '800',
    marginTop: 6,
  },
  caseDetailSection: {
    color: colors.green,
    fontWeight: '900',
    marginTop: 18,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  caseDetailText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
  },
  caseDetailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  detailMetric: {
    flexBasis: '48%',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DDE7E0',
    borderRadius: 8,
    padding: 10,
    backgroundColor: colors.paperStrong,
  },
  detailMetricLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '900',
  },
  detailMetricValue: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '900',
    marginTop: 4,
  },
  caseDetailWarning: {
    marginTop: 12,
    borderRadius: 8,
    backgroundColor: colors.redSoft,
    borderWidth: 1,
    borderColor: '#F3B4B4',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  caseDetailWarningText: {
    flex: 1,
    color: colors.ink,
    fontWeight: '800',
    marginLeft: 8,
  },
  caseDetailStep: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DDE7E0',
    padding: 10,
    marginTop: 8,
  },
  caseDetailStepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.green,
    color: colors.white,
    textAlign: 'center',
    lineHeight: 28,
    fontWeight: '900',
    marginRight: 10,
  },
  caseDetailStepText: {
    flex: 1,
    color: colors.ink,
    fontWeight: '800',
    lineHeight: 20,
  },
  footer: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 18,
    height: 60,
    borderRadius: 8,
    backgroundColor: 'rgba(252,255,252,0.96)',
    flexDirection: 'row',
    padding: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DDE7E0',
  },
  activeFooterButton: {
    flex: 1,
    borderRadius: 6,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeFooterText: {
    color: colors.white,
    fontWeight: '900',
  },
  footerButton: {
    flex: 1,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  footerText: {
    color: colors.ink,
    fontWeight: '900',
    marginLeft: 8,
  },
});
