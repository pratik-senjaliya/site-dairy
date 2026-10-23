import { colors } from '@site-diary/ui-tokens';
import { randomUUID } from 'expo-crypto';
import { useState } from 'react';
import { View } from 'react-native';
import { PhotoThumb } from '../components/Photo';
import { RowChips, TextField } from '../components/pickers';
import { Ask, Button, Card, DiaryLine, Empty, Row, Screen, T } from '../components/ui';
import { db, useDb, type Row as DbRow } from '../lib/db';
import { notice, useSite } from '../lib/hooks';
import { useT } from '../lib/i18n';
import { takePhoto } from '../lib/photos';
import { daysSince } from '../lib/diary';

// M10: site problems — what is still open comes first (with how long), then a new one: what, photo, who fixes it.
export default function Issues() {
  const t = useT();
  const { siteId } = useSite();
  const open = useDb(() => db.rows('issue').filter((i) => i.projectId === siteId && i.status === 'open').sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''))));
  const photos = useDb(() => db.rows('photo').filter((p) => p.sourceType === 'issue'));
  const users = useDb(() => db.rows('user').filter((u) => u.isActive !== false));
  const [issueId, setIssueId] = useState(randomUUID);
  const [title, setTitle] = useState('');
  const [assignedToId, setAssigned] = useState<string | null>(null);
  const [newPhotos, setNewPhotos] = useState<DbRow[]>([]);
  const person = (id: unknown) => String(users.find((u) => u.id === id)?.name ?? '');
  const line = title.trim() ? (assignedToId ? t('issues.lineTo', { title: title.trim(), name: person(assignedToId) }) : t('issues.line', { title: title.trim() })) : null;

  return (
    <Screen title={t('home.issues')}>
      <T.h2>{t('issues.openList')}</T.h2>
      {open.length ? open.map((i) => {
        const days = daysSince(i.createdAt);
        return (
          <Card key={i.id}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <T.body bold>{String(i.title)}</T.body>
                <T.small color={days >= 3 ? colors.danger : undefined}>
                  {days ? t('issues.since', { days }) : t('issues.sinceToday')}{i.assignedToId ? ` · → ${person(i.assignedToId)}` : ''}
                </T.small>
              </View>
              <Button kind="secondary" small label={t('issues.resolve')} onPress={() => db.save('issue', { ...i, status: 'resolved' })} />
            </Row>
            <Row style={{ flexWrap: 'wrap' }}>{photos.filter((p) => p.sourceId === i.id).map((p) => <PhotoThumb key={p.id} photo={p} size={72} />)}</Row>
          </Card>
        );
      }) : <Empty text={t('issues.none')} />}

      <Card>
        <T.h2>{t('issues.new')}</T.h2>
        <Ask q={t('issues.what')}>
          <TextField label="" value={title} onChange={setTitle} multiline placeholder={t('progress.voiceHint')} />
        </Ask>
        <Ask q={t('report.photos')} optional>
          <Row style={{ flexWrap: 'wrap' }}>
            {newPhotos.map((p) => <PhotoThumb key={p.id} photo={p} />)}
            <Button kind="secondary" small label={newPhotos.length ? t('photo.another') : t('photo.take')} onPress={() => void takePhoto(siteId!, 'issue', issueId).then((p) => p && setNewPhotos((x) => [...x, p]))} />
          </Row>
        </Ask>
        <Ask q={t('issues.assign')} optional>
          <RowChips label="" rows={users} value={assignedToId} onChange={setAssigned} nameOf={(u) => String(u.name)} allowNone noneLabel={t('issues.nobody')} />
        </Ask>
        {line ? <DiaryLine text={line} /> : null}
        <Button label={t('common.save')} disabled={!line} onPress={() => {
          db.save('issue', { id: issueId, projectId: siteId, title: title.trim(), assignedToId, status: 'open' });
          setIssueId(randomUUID());
          setTitle('');
          setAssigned(null);
          setNewPhotos([]);
          notice(t('common.saved'));
        }} />
      </Card>
    </Screen>
  );
}
