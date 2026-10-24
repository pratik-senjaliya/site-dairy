import { addDays, isoDate } from '@site-diary/shared';
import { spacing } from '@site-diary/ui-tokens';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { PhotoThumb } from '../components/Photo';
import { Banner, Chips, Empty, Section, Screen } from '../components/ui';
import { db, useDb } from '../lib/db';
import { useOnline } from '../lib/hooks';
import { useDayName, useT, type MessageKey } from '../lib/i18n';
import { useSession } from '../lib/session';

type Kind = 'all' | 'attendance' | 'grn' | 'progress' | 'issue';
type Photo = { id: string; sourceType: string; takenAt: string; uploaded: boolean; [k: string]: unknown };
const LABEL: Record<Exclude<Kind, 'all'>, MessageKey> = { attendance: 'home.attendance', grn: 'home.materialIn', progress: 'home.progress', issue: 'home.issues' };

// A site's photos of the last 30 days, day by day: the record the diary book never had. Tap one to see it large.
export default function Photos() {
  const t = useT();
  const dayName = useDayName();
  const { me } = useSession();
  const { site } = useLocalSearchParams<{ site: string }>();
  const today = useDb(() => db.today);
  const [kind, setKind] = useState<Kind>('all');
  const { data, error, reload } = useOnline<Photo[]>(site ? `/registers/photos?projectId=${site}&from=${addDays(today, -30)}&to=${today}` : null);
  const shown = (data ?? []).filter((p) => p.uploaded && (kind === 'all' || p.sourceType === kind));
  const dayOf = (p: Photo) => isoDate(new Date(p.takenAt)); // the site's (India) date, not UTC
  const days = [...new Set(shown.map(dayOf))];

  return (
    <Screen title={t('photos.title')} subtitle={me?.projects.find((p) => p.id === site)?.name}>
      {error ? <Banner tone="error" text={error === 'offline' ? t('common.offlineOnline') : error} onPress={() => void reload()} /> : null}
      <Chips<Kind> options={[{ value: 'all', label: t('photos.all') }, ...(Object.keys(LABEL) as Exclude<Kind, 'all'>[]).map((k) => ({ value: k, label: t(LABEL[k]) }))]} value={kind} onChange={setKind} />
      {data && !shown.length ? <Empty icon="image-off-outline" text={t('photos.none')} /> : null}
      {days.map((d) => (
        <View key={d} style={{ gap: spacing.sm }}>
          <Section title={dayName(d)} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {shown.filter((p) => dayOf(p) === d).map((p) => <PhotoThumb key={p.id} photo={p} size={108} />)}
          </View>
        </View>
      ))}
    </Screen>
  );
}
