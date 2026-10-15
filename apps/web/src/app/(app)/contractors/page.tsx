'use client';

import { Tabs } from 'antd';
import { MasterCrud } from '@/components/MasterCrud';
import { Page } from '@/components/Page';
import { date, money } from '@/lib/format';
import { useLookups } from '@/lib/masters';
import { useMe } from '@/lib/session';

// W3: contractors, skills (Gujarati names), rate history, named workers.
export default function ContractorsPage() {
  const me = useMe();
  const L = useLookups();
  const canEdit = me?.user.role === 'owner' || me?.user.role === 'engineer';
  const contractorOpts = L.contractors.map((c) => ({ value: c.id, label: String(c.name) }));
  const skillOpts = L.skills.map((s) => ({ value: s.id, label: `${s.nameEn} · ${s.nameGu}` }));
  return (
    <Page title="Contractors & labour">
      <Tabs items={[
        {
          key: 'contractors', label: 'Contractors', children: (
            <MasterCrud kind="contractor" canEdit={canEdit} addLabel="Add contractor"
              columns={[{ title: 'Name', dataIndex: 'name' }, { title: 'Phone', dataIndex: 'phone' }, { title: 'Trade', dataIndex: 'trade' }, { title: 'Rate type', dataIndex: 'rateType', render: (v: string) => v.replace('_', ' ') }]}
              fields={[
                { name: 'name', label: 'Name', required: true }, { name: 'phone', label: 'Phone' }, { name: 'trade', label: 'Trade', placeholder: 'Civil, shuttering, steel…' },
                { name: 'rateType', label: 'Rate type', type: 'select', required: true, options: [{ value: 'daily', label: 'Daily wage per skill' }, { value: 'lump_sum', label: 'Lump-sum' }, { value: 'per_unit', label: 'Per unit' }] },
              ]} />
          ),
        },
        {
          key: 'rates', label: 'Daily rates', children: (
            <MasterCrud kind="contractorRate" canEdit={canEdit} addLabel="Add rate"
              search={(r) => `${String(L.contractor(r.contractorId)?.name)} ${String(L.skill(r.skillId)?.nameEn)}`}
              columns={[
                { title: 'Contractor', dataIndex: 'contractorId', render: (v: string) => String(L.contractor(v)?.name ?? '') },
                { title: 'Skill', dataIndex: 'skillId', render: (v: string) => `${String(L.skill(v)?.nameEn ?? '')} · ${String(L.skill(v)?.nameGu ?? '')}` },
                { title: 'Rate / day', dataIndex: 'dailyRatePaise', align: 'right', render: money },
                { title: 'From', dataIndex: 'effectiveFrom', render: date },
              ]}
              fields={[
                { name: 'contractorId', label: 'Contractor', type: 'select', options: contractorOpts, required: true },
                { name: 'skillId', label: 'Skill', type: 'select', options: skillOpts, required: true },
                { name: 'dailyRatePaise', label: 'Rate per day', type: 'money', required: true },
                { name: 'effectiveFrom', label: 'From date', type: 'date', required: true },
              ]} />
          ),
        },
        {
          key: 'skills', label: 'Skills', children: (
            <MasterCrud kind="skill" canEdit={canEdit} addLabel="Add skill"
              columns={[{ title: 'Gujarati', dataIndex: 'nameGu' }, { title: 'English', dataIndex: 'nameEn' }]}
              fields={[{ name: 'nameGu', label: 'Name (Gujarati)', required: true }, { name: 'nameEn', label: 'Name (English)', required: true }, { name: 'sort', label: 'Order', type: 'number' }]} />
          ),
        },
        {
          key: 'workers', label: 'Named workers', children: (
            <MasterCrud kind="worker" canEdit={canEdit} addLabel="Add worker"
              columns={[
                { title: 'Name', dataIndex: 'name' },
                { title: 'Contractor', dataIndex: 'contractorId', render: (v: string) => String(L.contractor(v)?.name ?? '') },
                { title: 'Skill', dataIndex: 'skillId', render: (v: string) => String(L.skill(v)?.nameEn ?? '') },
                { title: 'Phone', dataIndex: 'phone' },
              ]}
              fields={[
                { name: 'name', label: 'Name', required: true },
                { name: 'contractorId', label: 'Contractor', type: 'select', options: contractorOpts, required: true },
                { name: 'skillId', label: 'Skill', type: 'select', options: skillOpts },
                { name: 'phone', label: 'Phone' },
              ]} />
          ),
        },
      ]} />
    </Page>
  );
}

