import { formatNumber, shortDate } from '@site-diary/shared';
import { colors } from '@site-diary/ui-tokens';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { View } from 'react-native';
import { Banner, Button, Card, Row, Screen, T } from '../components/ui';
import { db, useDb } from '../lib/db';
import { useCan, useSite } from '../lib/hooks';
import { useName, useT } from '../lib/i18n';
import { awaitedMaterial, siteStock } from '../lib/stock';

// M11: stock at this site (lib/stock.ts), what runs out soonest first.
export default function Stock() {
  const t = useT();
  const can = useCan();
  const name = useName();
  const { siteId } = useSite();
  const rows = useDb(() => siteStock(siteId).sort((a, b) => Number(b.soon || b.low) - Number(a.soon || a.low) || (a.left?.days ?? 1e9) - (b.left?.days ?? 1e9) || name(a.material).localeCompare(name(b.material))));
  const lastSync = useDb(() => db.lastSync);
  // Already asked for and not come yet: no second request for the same material.
  const asked = useDb(() => awaitedMaterial(siteId, true));

  return (
    <Screen title={t('home.stock')} scroll={false}>
      <T.small>{lastSync ? t('stock.asOf', { time: new Date(lastSync).toLocaleString('en-IN', { timeStyle: 'short', dateStyle: 'medium' }) }) : t('home.firstSync')}</T.small>
      {rows.some((r) => r.low) ? <Banner text={t('home.lowCount', { count: rows.filter((r) => r.low).length })} /> : null}
      {rows.some((r) => r.soon) ? <Banner text={t('stock.runningOut', { count: rows.filter((r) => r.soon).length })} /> : null}
      <FlashList
        data={rows}
        keyExtractor={(r) => r.materialId}
        ItemSeparatorComponent={() => <Row style={{ height: 8 }}>{null}</Row>}
        renderItem={({ item: r }) => (
          <Card style={r.low || r.soon ? { borderColor: colors.warning, borderWidth: 2 } : undefined}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T.body bold>{name(r.material)}</T.body>
              <T.h2>{formatNumber(r.qty)} {String(r.material?.unit ?? '')}</T.h2>
            </Row>
            {asked.filter((x) => x.materialId === r.materialId).map((x) => (
              <T.small key={x.indentId} color={colors.primary}>📝 {t('stock.asked', { qty: formatNumber(x.qty), unit: String(r.material?.unit ?? ''), date: shortDate(x.neededBy) })}</T.small>
            ))}
            {r.left ? (
              <T.small color={r.soon ? colors.warning : undefined}>
                {t(r.left.days ? 'stock.daysLeft' : 'stock.outToday', { days: r.left.days, perDay: formatNumber(r.left.perDay), unit: String(r.material?.unit ?? '') })}
              </T.small>
            ) : null}
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <T.small color={r.low ? colors.warning : undefined}>
                  {r.min !== null ? t('stock.min', { qty: formatNumber(r.min) }) : ''}{r.pending ? ` · ${t('stock.unsent', { qty: formatNumber(r.pending) })}` : ''}
                </T.small>
              </View>
              {asked.some((x) => x.materialId === r.materialId) ? null : (r.soon || r.low) && can('indent', 'C') ? (
                <Button kind="secondary" small label={t('stock.request')} onPress={() => router.push({ pathname: '/indent', params: { material: r.materialId, qty: String(Math.ceil((r.left?.perDay ?? 0) * 7) || '') } })} />
              ) : null}
            </Row>
          </Card>
        )}
      />
    </Screen>
  );
}
