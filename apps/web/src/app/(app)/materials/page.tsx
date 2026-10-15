'use client';

import { UNITS } from '@site-diary/shared';
import { Tabs } from 'antd';
import { useState } from 'react';
import { MasterCrud } from '@/components/MasterCrud';
import { Page } from '@/components/Page';
import { SitePicker } from '@/components/SitePicker';
import { qty } from '@/lib/format';
import { useLookups } from '@/lib/masters';
import { useMe } from '@/lib/session';

// W6: materials with units, suppliers, minimum stock per site.
export default function MaterialsPage() {
  const me = useMe();
  const L = useLookups();
  const [site, setSite] = useState<string | undefined>();
  const canEdit = me?.user.role === 'owner' || me?.user.role === 'store';
  return (
    <Page title="Materials & suppliers">
      <Tabs items={[
        {
          key: 'materials', label: 'Materials', children: (
            <MasterCrud kind="material" canEdit={canEdit} addLabel="Add material"
              columns={[{ title: 'English', dataIndex: 'nameEn' }, { title: 'Gujarati', dataIndex: 'nameGu' }, { title: 'Unit', dataIndex: 'unit' }, { title: 'Category', dataIndex: 'category' }]}
              fields={[
                { name: 'nameEn', label: 'Name (English)', required: true }, { name: 'nameGu', label: 'Name (Gujarati)', required: true },
                { name: 'unit', label: 'Unit', type: 'select', required: true, options: UNITS.map((u) => ({ value: u, label: u })) }, { name: 'category', label: 'Category' },
              ]} />
          ),
        },
        {
          key: 'suppliers', label: 'Suppliers', children: (
            <MasterCrud kind="supplier" canEdit={canEdit} addLabel="Add supplier"
              columns={[{ title: 'Name', dataIndex: 'name' }, { title: 'Phone', dataIndex: 'phone' }, { title: 'GSTIN', dataIndex: 'gstin' }]}
              fields={[{ name: 'name', label: 'Name', required: true }, { name: 'phone', label: 'Phone' }, { name: 'gstin', label: 'GSTIN' }]} />
          ),
        },
        {
          key: 'min', label: 'Minimum stock', children: (
            <>
              <SitePicker value={site} onChange={setSite} />
              {site ? (
                <div style={{ marginTop: 12 }}>
                  <MasterCrud kind="siteMaterialSetting" query={`?projectId=${site}`} defaults={{ projectId: site }} canEdit={canEdit} addLabel="Set minimum"
                    columns={[{ title: 'Material', dataIndex: 'materialId', render: (v: string) => String(L.material(v)?.nameEn ?? '') }, { title: 'Minimum', dataIndex: 'minStock', align: 'right', render: (v: number, r) => `${qty(v)} ${String(L.material(r.materialId)?.unit ?? '')}` }]}
                    fields={[{ name: 'materialId', label: 'Material', type: 'select', required: true, options: L.materials.map((m) => ({ value: m.id, label: `${m.nameEn} (${m.unit})` })) }, { name: 'minStock', label: 'Minimum quantity', type: 'qty', required: true }]} />
                </div>
              ) : null}
            </>
          ),
        },
      ]} />
    </Page>
  );
}
