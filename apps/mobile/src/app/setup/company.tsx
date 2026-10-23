import { companySettingsSchema, type CompanySettings } from '@site-diary/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Ask, Banner, Button, Chips, Input, Screen } from '../../components/ui';
import { patch } from '../../lib/api';
import { useOnline } from '../../lib/hooks';
import { useT } from '../../lib/i18n';
import { useSession } from '../../lib/session';
import { useSave } from '../../lib/setup';

interface Company { name: string; gstin: string | null; settings: CompanySettings; planStatus?: { label: string; daysLeft: number | null } }
const DAYS = [1, 2, 3, 4, 5, 6, 0] as const;

// The company's name and the rhythm of the week: wage day, when the nightly report comes, when to remind about entries.
export default function CompanySetup() {
  const t = useT();
  const { refreshMe } = useSession();
  const { data, error, reload } = useOnline<Company>('/company');
  const { busy, run } = useSave();
  const [name, setName] = useState('');
  const [settings, setSettings] = useState<CompanySettings>(companySettingsSchema.parse({}));
  useEffect(() => {
    if (!data) return;
    setName(data.name);
    setSettings(data.settings);
  }, [data]);
  const set = <K extends keyof CompanySettings>(k: K, v: CompanySettings[K]) => setSettings((x) => ({ ...x, [k]: v }));
  const save = () => void run(async () => {
    await patch('/company', { name: name.trim(), gstin: data?.gstin ?? null, settings });
    await refreshMe();
    router.back();
  });
  return (
    <Screen title={t('setup.company')} footer={<Button label={t('common.save')} icon="check" busy={busy} disabled={name.trim().length < 2 || !data} onPress={save} />}>
      {error ? <Banner tone="error" text={error === 'offline' ? t('setup.needsOnline') : error} onPress={() => void reload()} /> : null}
      {data?.planStatus?.daysLeft != null ? <Banner tone="info" text={t('setup.plan', { label: data.planStatus.label, days: data.planStatus.daysLeft })} /> : null}
      <Ask q={t('setup.qCompanyName')}>
        <Input value={name} onChangeText={setName} accessibilityLabel={t('setup.qCompanyName')} />
      </Ask>
      <Ask q={t('setup.qWageDay')}>
        <Chips options={DAYS.map((d) => ({ value: String(d), label: t(`day.${d}`) }))} value={String(settings.wageDay)} onChange={(v) => set('wageDay', Number(v))} />
      </Ask>
      <Ask q={t('setup.qReportTime')}>
        <Chips options={['18:00', '19:00', '20:00', '21:00', '22:00'].map((v) => ({ value: v, label: v }))} value={settings.reportTime} onChange={(v) => set('reportTime', v)} />
      </Ask>
      <Ask q={t('setup.qCutoff')}>
        <Chips options={['17:00', '18:00', '19:00', '20:00'].map((v) => ({ value: v, label: v }))} value={settings.noEntryCutoff} onChange={(v) => set('noEntryCutoff', v)} />
      </Ask>
    </Screen>
  );
}
