import { formatPaise } from '@site-diary/shared';
import { colors } from '@site-diary/ui-tokens';
import { useState } from 'react';
import { Banner, Button, Card, Empty, Input, Row, Screen, T } from '../components/ui';
import { post } from '../lib/api';
import { notice, useOnline } from '../lib/hooks';
import { useName, useT } from '../lib/i18n';

interface Approval {
  id: string; entityType: string; status: string; project: string | null; requestedBy: string | null; createdAt: string;
  details?: {
    lines?: { material?: { nameGu: string; nameEn: string; unit: string }; qty: number }[]; neededBy?: string; note?: string;
    poNo?: string; totalPaise?: number; supplier?: string; contractor?: string; periodFrom?: string; periodTo?: string; grossPaise?: number; advancesPaise?: number; netPaise?: number;
    current?: { count: number; halfDayCount: number; otHours: number } | null; proposed?: { date: string; count: number; halfDayCount: number; otHours: number }; skill?: string;
  };
}

// M13: approve or reject with a note. Online only (decisions must be on the server at once).
export default function Approvals() {
  const t = useT();
  const name = useName();
  const { data, error, reload } = useOnline<Approval[]>('/approvals?status=pending');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const decide = async (a: Approval, decision: 'approve' | 'reject') => {
    if (decision === 'reject' && !notes[a.id]?.trim()) {
      notice(t('approvals.reasonNeeded'));
      return;
    }
    setBusy(a.id);
    try {
      await post(`/approvals/${a.id}/decide`, { decision, reason: notes[a.id]?.trim() || undefined });
      await reload();
    } catch (e) {
      notice(t('common.error'), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen title={t('home.approvals')}>
      {error ? <Banner tone="error" text={error === 'offline' ? t('common.offlineOnline') : error} onPress={reload} /> : null}
      {data && !data.length ? <Empty text={t('approvals.none')} /> : null}
      {data?.map((a) => {
        const d = a.details ?? {};
        return (
          <Card key={a.id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T.h2>{t(`approval.${a.entityType}` as 'approval.indent')}</T.h2>
              <T.small>{a.project}</T.small>
            </Row>
            <T.small>{t('approvals.from', { name: a.requestedBy ?? '' })} · {new Date(a.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</T.small>
            {d.lines?.map((l, i) => <T.body key={i}>• {name(l.material)} {l.qty} {l.material?.unit}</T.body>)}
            {d.neededBy ? <T.small>{t('indent.neededBy')}: {d.neededBy}</T.small> : null}
            {d.poNo ? <T.body>{d.poNo} · {d.supplier} · <T.body bold>{formatPaise(Number(d.totalPaise))}</T.body></T.body> : null}
            {d.netPaise !== undefined ? (
              <T.body>{d.contractor} · {d.periodFrom} → {d.periodTo}{'\n'}{formatPaise(Number(d.grossPaise))} − {formatPaise(Number(d.advancesPaise))} = <T.body bold>{formatPaise(Number(d.netPaise))}</T.body></T.body>
            ) : null}
            {d.proposed ? (
              <T.body>
                {d.proposed.date} · {d.contractor} · {d.skill}{'\n'}
                {d.current ? `${d.current.count} + ${d.current.halfDayCount}½ → ` : ''}<T.body bold color={colors.primary}>{d.proposed.count} + {d.proposed.halfDayCount}½</T.body> · OT {d.proposed.otHours}
              </T.body>
            ) : null}
            {d.note ? <T.small>{d.note}</T.small> : null}
            <Input placeholder={t('approvals.note')} value={notes[a.id] ?? ''} onChangeText={(v) => setNotes((n) => ({ ...n, [a.id]: v }))} />
            <Row>
              <Button style={{ flex: 1 }} kind="danger" label={t('approvals.reject')} busy={busy === a.id} onPress={() => void decide(a, 'reject')} />
              <Button style={{ flex: 1 }} label={t('approvals.approve')} busy={busy === a.id} onPress={() => void decide(a, 'approve')} />
            </Row>
          </Card>
        );
      })}
    </Screen>
  );
}
