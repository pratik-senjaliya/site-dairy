import { router } from 'expo-router';
import { Button, Card, Empty, flush, ListRow, Screen } from '../../components/ui';
import { db, useDb } from '../../lib/db';
import { useOnline } from '../../lib/hooks';
import { useName, useT } from '../../lib/i18n';
import { TRADES, type Rate } from '../../lib/setup';

// Contractors with what they do and their daily rates; a contractor with no rate shows it, since the hisab needs one.
export default function Contractors() {
  const t = useT();
  const name = useName();
  const list = useDb(() => db.rows('contractor').slice().sort((a, b) => String(a.name).localeCompare(String(b.name))));
  const rates = useOnline<Rate[]>('/masters/contractorRate');
  const tradeName = (v: unknown) => ((TRADES as readonly string[]).includes(String(v)) ? t(`trade.${v as (typeof TRADES)[number]}`) : String(v ?? ''));
  const rateText = (id: string) => {
    if (!rates.data) return '';
    const latest = new Map<string, Rate>();
    for (const r of rates.data) if (r.contractorId === id && !latest.has(r.skillId)) latest.set(r.skillId, r);
    if (!latest.size) return t('setup.noRates');
    return [...latest.values()].map((r) => `${name(db.find('skill', r.skillId))} ₹${r.dailyRatePaise / 100}`).join(' · ');
  };
  return (
    <Screen title={t('setup.contractors')} footer={<Button icon="plus" label={t('setup.addContractor')} onPress={() => router.push('/setup/contractor')} />}>
      {list.length ? (
        <Card style={flush}>
          {list.map((c, i) => {
            const rt = rateText(c.id);
            return (
              <ListRow
                key={c.id}
                icon="account-hard-hat-outline"
                tone={rt === t('setup.noRates') ? 'warn' : 'primary'}
                title={String(c.name)}
                detail={[tradeName(c.trade), rt].filter(Boolean).join(' · ')}
                onPress={() => router.push({ pathname: '/setup/contractor', params: { id: c.id } })}
                last={i === list.length - 1}
              />
            );
          })}
        </Card>
      ) : <Empty icon="account-hard-hat-outline" text={t('start.contractors')} />}
    </Screen>
  );
}
