import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { CheckCircle, Clock, RotateCcw, Trash2 } from 'lucide-react-native';
import { CaseLogItem, deleteCaseLogItem, getCaseCounts, listCaseLog } from '../services/caseLog';
import { colors, decisionColor } from '../design/system';
import { flushSMSQueue } from '../services/alertSMS';
import { useI18n } from '../services/i18n';

function formatTime(timestamp: number): string {
  if (!timestamp) return '--:--';
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function readableDecision(decision: string, t: (key: string) => string): string {
  if (decision.includes('REFER')) return t('referUrgent');
  if (decision.includes('MONITOR')) return t('monitor');
  if (decision.includes('THREAT')) return t('threat');
  return t('treat');
}

export default function CasesScreen() {
  const [items, setItems] = useState<CaseLogItem[]>([]);
  const [counts, setCounts] = useState({ total: 0, synced: 0 });
  const { t } = useI18n();

  const load = useCallback(async () => {
    const [nextItems, nextCounts] = await Promise.all([listCaseLog(), getCaseCounts()]);
    setItems(nextItems);
    setCounts(nextCounts);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const syncNow = async () => {
    await flushSMSQueue();
    await load();
  };

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
        <Text style={styles.title}>{t('todayCases')}</Text>
        <Text style={styles.subtitle}>
          {counts.total} {t('total')} • {counts.synced} {t('synced')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {items.length === 0 && (
          <View style={styles.emptyCard}>
            <Clock color={colors.green} size={28} />
            <Text style={styles.emptyTitle}>{t('noCasesLogged')}</Text>
            <Text style={styles.emptyText}>{t('noCasesText')}</Text>
          </View>
        )}

        {items.map((item) => {
          const color = decisionColor(item.decision);
          return (
            <View key={item.id} style={styles.caseRow}>
              <View style={[styles.severityEdge, { backgroundColor: color }]} />
              <View style={styles.caseBody}>
                <View style={styles.caseTop}>
                  <Text style={[styles.caseTime, { color }]}>{formatTime(item.createdAt)}</Text>
                  <Text style={styles.caseTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  {item.synced ? (
                    <CheckCircle color={colors.green} size={18} />
                  ) : (
                    <Clock color={colors.muted} size={18} />
                  )}
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${item.kind === 'consultation' ? 'consultation' : 'Guard event'}`}
                    style={styles.deleteButton}
                    onPress={() => confirmDelete(item)}
                  >
                    <Trash2 color={colors.red} size={18} />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.decisionText, { color }]}>{readableDecision(item.decision, t)}</Text>
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  header: {
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 10,
  },
  title: {
    color: colors.ink,
    fontSize: 25,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.green,
    marginTop: 4,
    fontSize: 15,
    fontWeight: '900',
  },
  list: {
    padding: 16,
    paddingBottom: 106,
  },
  emptyCard: {
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.paperStrong,
    padding: 18,
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
    minHeight: 60,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.paperStrong,
    flexDirection: 'row',
    overflow: 'hidden',
    marginBottom: 9,
  },
  severityEdge: {
    width: 5,
  },
  caseBody: {
    flex: 1,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  caseTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  caseTime: {
    width: 54,
    fontWeight: '900',
    fontSize: 13,
  },
  caseTitle: {
    flex: 1,
    color: colors.ink,
    fontWeight: '800',
    fontSize: 14,
  },
  deleteButton: {
    width: 38,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F3B4B4',
    backgroundColor: colors.redSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  decisionText: {
    marginLeft: 54,
    marginTop: 4,
    fontSize: 13,
    fontWeight: '900',
  },
  footer: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 18,
    height: 62,
    borderRadius: 8,
    backgroundColor: '#EEF1ED',
    flexDirection: 'row',
    padding: 5,
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
