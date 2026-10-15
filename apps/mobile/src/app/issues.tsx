import { randomUUID } from 'expo-crypto';
import { useState } from 'react';
import { PhotoThumb } from '../components/Photo';
import { RowChips, TextField } from '../components/pickers';
import { Button, Card, Empty, Row, Screen, T } from '../components/ui';
import { db, useDb, type Row as DbRow } from '../lib/db';
import { notice, useSite } from '../lib/hooks';
import { useT } from '../lib/i18n';
import { takePhoto } from '../lib/photos';

// M10: problem, photo, who should fix it; open → resolved.
export default function Issues() {
  const t = useT();
  const { siteId } = useSite();
  const open = useDb(() => db.rows('issue').filter((i) => i.projectId === siteId && i.status === 'open'));
  const photos = useDb(() => db.rows('photo').filter((p) => p.sourceType === 'issue'));
  const users = useDb(() => db.rows('user').filter((u) => u.isActive !== false));
  const [issueId, setIssueId] = useState(randomUUID);
  const [title, setTitle] = useState('');
  const [assignedToId, setAssigned] = useState<string | null>(null);
  const [newPhotos, setNewPhotos] = useState<DbRow[]>([]);

  return (
    <Screen title={t('home.issues')}>
      <Card>
        <T.h2>{t('issues.new')}</T.h2>
        <TextField label={t('issues.what')} value={title} onChange={setTitle} multiline />
        <Row style={{ flexWrap: 'wrap' }}>
          {newPhotos.map((p) => <PhotoThumb key={p.id} photo={p} />)}
          <Button kind="secondary" small label={t('photo.take')} onPress={() => void takePhoto(siteId!, 'issue', issueId).then((p) => p && setNewPhotos((x) => [...x, p]))} />
        </Row>
        <RowChips label={t('issues.assign')} rows={users} value={assignedToId} onChange={setAssigned} nameOf={(u) => String(u.name)} allowNone />
        <Button label={t('common.save')} disabled={!title.trim()} onPress={() => {
          db.save('issue', { id: issueId, projectId: siteId, title: title.trim(), assignedToId, status: 'open' });
          setIssueId(randomUUID());
          setTitle('');
          setAssigned(null);
          setNewPhotos([]);
          notice(t('common.saved'));
        }} />
      </Card>
      <T.h2>{t('report.openIssues')}</T.h2>
      {open.length ? open.map((i) => (
        <Card key={i.id}>
          <T.body bold>{String(i.title)}</T.body>
          {i.assignedToId ? <T.small>→ {String(users.find((u) => u.id === i.assignedToId)?.name ?? '')}</T.small> : null}
          <Row style={{ flexWrap: 'wrap' }}>{photos.filter((p) => p.sourceId === i.id).map((p) => <PhotoThumb key={p.id} photo={p} size={72} />)}</Row>
          <Button kind="secondary" small label={t('issues.resolve')} onPress={() => db.save('issue', { ...i, status: 'resolved' })} />
        </Card>
      )) : <Empty text={t('issues.none')} />}
    </Screen>
  );
}
