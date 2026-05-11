import React, { useCallback, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { CheckCircle, Clock, RotateCcw, Trash2, UploadCloud } from 'lucide-react-native';
import { CaseLogItem, deleteCaseLogItem, getCaseCounts, listCaseLog } from '../services/caseLog';
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

  return (
    <SafeAreaView style={styles.screen}>
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
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshCases}
            tintColor={colors.green}
            colors={[colors.green]}
          />
        }
      >
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
            <View key={item.id} style={styles.caseRow}>
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
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.activeFooterButton}>
          <Text style={styles.activeFooterText}>{t('cases')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.footerButton} onPress={syncNow}>
          <RotateCcw color={colors.ink} size={18} />
          <Text style={styles.footerText}>{t('sync')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
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
    paddingBottom: 118,
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
