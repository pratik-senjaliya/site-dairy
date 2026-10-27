import { formatPaise, shortDate, type BookLine } from '@site-diary/shared';
import { colors, spacing } from '@site-diary/ui-tokens';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useModeText } from '../components/pickers';
import { Banner, Button, Card, Chips, Empty, flush, IconBadge, ListRow, Row, Screen, Section, T, Text, Totals } from '../components/ui';
import { del } from '../lib/api';
import { confirm, useCan, useOnline } from '../lib/hooks';
import { useT } from '../lib/i18n';
import { useSession } from '../lib/session';
import type { Book } from '../lib/setup';
import { useSave } from '../lib/setup';
import { shareMessage } from '../lib/share';

type Tab = 'book' | 'flats';
type Filter = 'all' | 'in' | 'out';

/** A book line as one plain sentence part: what the money was, and for whom. */
export function useLineText() {
  const t = useT();
  return (l: BookLine, flat?: { name: string; buyerName: string | null }) => {
    if (l.source === 'supplier') return `${l.party ?? ''} · ${t('accounts.auto.supplier')}`;
    if (l.source === 'upad') return `${t('accounts.auto.upad')} · ${l.party ?? ''}`;
    if (l.source === 'wages') return `${t('accounts.auto.wages')} · ${l.party ?? ''}`;
    const kind = t(`money.${l.direction}.${l.kind}` as 'money.in.flat');
    const who = flat ? [flat.name, flat.buyerName].filter(Boolean).join(' · ') : l.party;
    return who ? `${kind} · ${who}` : kind;
  };
}

// The partners' book: every rupee in and out of a site, who wrote it, flats and what each buyer still owes.
// Supplier payments, upad and paid wages come in by themselves, so the book is never entered twice.
export default function Accounts() {
  const t = useT();
  const can = useCan();
  const { me } = useSession();
  const params = useLocalSearchParams<{ site?: string }>();
  const sites = me?.projects.filter((p) => p.status === 'active') ?? [];
  const [site, setSite] = useState<string>(params.site ?? (sites.length === 1 ? sites[0]!.id : 'all'));
  const [tab, setTab] = useState<Tab>('book');
  const [filter, setFilter] = useState<Filter>('all');
  const { data, error, reload } = useOnline<Book>(`/accounts${site === 'all' ? '' : `?projectId=${site}`}`);
  const lineText = useLineText();
  const modeText = useModeText();
  const { run } = useSave();
  const write = can('accounts', 'C');
  const siteName = (id: string | null) => sites.find((p) => p.id === id)?.name ?? '';
  const flatOf = (id: string | null) => data?.units.find((u) => u.id === id);
  const lines = (data?.lines ?? []).filter((l) => filter === 'all' || l.direction === filter);
  const flatsDue = (data?.units ?? []).reduce((x, u) => x + (u.duePaise ?? 0), 0);

  const remove = async (l: BookLine) => {
    if (!(await confirm(t('accounts.remove'), `${formatPaise(l.amountPaise)} — ${lineText(l, flatOf(l.unitId))}\n${t('accounts.removeHint')}`, t('accounts.removeOk'), t('common.cancel')))) return;
    if (await run(async () => void (await del(`/accounts/entries/${l.id}`)))) void reload();
  };
  const share = () => {
    const title = t('accounts.statement', { company: me?.company.name ?? '', site: site === 'all' ? t('common.allSites') : siteName(site) });
    const body = (data?.lines ?? []).filter((l) => !l.removed).map((l) => `${shortDate(l.date)} ${l.direction === 'in' ? '+' : '−'}${formatPaise(l.amountPaise)} ${lineText(l, flatOf(l.unitId))}${l.mode ? ` (${modeText(l.mode, l.reference)})` : ''}`);
    const tot = data ? [`*${t('accounts.in')} ${formatPaise(data.totals.inPaise)} · ${t('accounts.out')} ${formatPaise(data.totals.outPaise)} · ${t('accounts.inHand')} ${formatPaise(data.totals.balancePaise)}*`] : [];
    void shareMessage([`*${title}*`, ...tot, '', ...body].join('\n'));
  };
  const add = (dir: 'in' | 'out') => router.push({ pathname: '/money', params: { dir, ...(site !== 'all' && { site }) } });

  return (
    <Screen
      title={t('accounts.title')}
      subtitle={site === 'all' ? t('common.allSites') : siteName(site)}
      footer={write ? (
        <Row>
          <Button style={{ flex: 1 }} kind="success" icon="arrow-down-bold" label={t('accounts.addIn')} onPress={() => add('in')} />
          <Button style={{ flex: 1 }} kind="secondary" icon="arrow-up-bold" label={t('accounts.addOut')} onPress={() => add('out')} />
        </Row>
      ) : undefined}
    >
      {sites.length > 1 ? <Chips options={[{ value: 'all', label: t('common.allSites') }, ...sites.map((p) => ({ value: p.id, label: p.name }))]} value={site} onChange={setSite} /> : null}
      {error ? <Banner tone="error" text={error === 'offline' ? t('common.offlineOnline') : error} onPress={() => void reload()} /> : null}
      {data ? (
        <Totals rows={[
          { label: t('accounts.in'), value: `+${formatPaise(data.totals.inPaise)}`, tone: 'ok', onPress: () => { setTab('book'); setFilter('in'); } },
          { label: t('accounts.out'), value: `−${formatPaise(data.totals.outPaise)}`, onPress: () => { setTab('book'); setFilter('out'); } },
          { label: t('accounts.inHand'), value: formatPaise(data.totals.balancePaise), tone: data.totals.balancePaise < 0 ? 'danger' : 'primary', bold: true },
        ]} />
      ) : null}

      <Chips<Tab> options={[{ value: 'book', label: t('accounts.book') }, { value: 'flats', label: `${t('accounts.flats')}${data?.units.length ? ` (${data.units.length})` : ''}` }]} value={tab} onChange={setTab} />

      {tab === 'book' && data ? (
        <>
          <Section title={t('accounts.book')} action={data.lines.length ? t('common.share') : undefined} onAction={share} />
          <Chips<Filter> options={[{ value: 'all', label: t('accounts.all') }, { value: 'in', label: t('accounts.in') }, { value: 'out', label: t('accounts.out') }]} value={filter} onChange={setFilter} />
          {!lines.length ? <Empty icon="book-open-variant" text={t('accounts.empty')} /> : (
            <Card style={flush}>
              {lines.map((l, i) => {
                const removable = write && l.source === 'entry' && !l.removed && (l.byId === me?.user.id || me?.user.role === 'owner');
                const struck = l.removed ? { textDecorationLine: 'line-through' as const, color: colors.faint } : null;
                return (
                  <Pressable key={`${l.source}:${l.id}`} disabled={!removable} onLongPress={() => void remove(l)} onPress={() => void remove(l)} style={({ pressed }) => [{ flexDirection: 'row', gap: spacing.md, padding: spacing.lg, paddingVertical: spacing.md }, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }, pressed && { backgroundColor: colors.surfaceAlt }]}>
                    <IconBadge name={l.direction === 'in' ? 'arrow-down-bold' : l.source === 'entry' ? 'arrow-up-bold' : 'link-variant'} tone={l.removed ? 'muted' : l.direction === 'in' ? 'ok' : 'warn'} size={36} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[{ fontSize: 16, fontWeight: '700', color: colors.ink, lineHeight: 22 }, struck]}>{lineText(l, flatOf(l.unitId))}</Text>
                      <T.small>{[shortDate(l.date), modeText(l.mode, l.reference), site === 'all' ? siteName(l.projectId) : ''].filter(Boolean).join(' · ')}</T.small>
                      {l.note ? <T.small>{l.note}</T.small> : null}
                      <T.small color={l.removed ? colors.danger : colors.faint}>{l.removed ? t('accounts.removedBy', { name: l.removed.by ?? '', date: shortDate(l.removed.at.slice(0, 10)) }) : t('accounts.by', { name: l.by ?? '—' })}</T.small>
                    </View>
                    <Text style={[{ fontSize: 16, fontWeight: '800', color: l.direction === 'in' ? colors.success : colors.ink }, struck]}>{l.direction === 'in' ? '+' : '−'}{formatPaise(l.amountPaise)}</Text>
                  </Pressable>
                );
              })}
            </Card>
          )}
          <Banner tone="info" text={t('accounts.trust')} />
        </>
      ) : null}

      {tab === 'flats' && data ? (
        <>
          {flatsDue ? <Banner tone="warn" text={t('accounts.flatsDue', { amount: formatPaise(flatsDue) })} /> : null}
          {!data.units.length ? <Empty icon="home-city-outline" text={t('accounts.noFlats')} /> : (
            <Card style={flush}>
              {data.units.map((u, i) => (
                <ListRow
                  key={u.id}
                  icon="home-city-outline"
                  tone={u.buyerName ? (u.duePaise ? 'warn' : 'ok') : 'muted'}
                  title={[u.name, u.buyerName].filter(Boolean).join(' — ')}
                  detail={u.buyerName ? [u.dealPaise != null ? t('accounts.deal', { amount: formatPaise(u.dealPaise) }) : '', t('accounts.received', { amount: formatPaise(u.receivedPaise) })].filter(Boolean).join(' · ') : t('accounts.unsold')}
                  value={u.duePaise ? formatPaise(u.duePaise) : undefined}
                  onPress={() => router.push({ pathname: '/unit', params: { id: u.id } })}
                  last={i === data.units.length - 1}
                />
              ))}
            </Card>
          )}
          {write ? <Button kind="secondary" icon="plus" label={t('accounts.addFlat')} onPress={() => router.push({ pathname: '/unit', params: site === 'all' ? {} : { site } })} /> : null}
        </>
      ) : null}
    </Screen>
  );
}
