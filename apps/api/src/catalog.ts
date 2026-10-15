// Starting lists copied into every new company (editable per company afterwards).
// Gujarati first; English names are what the CA and the web panel exports use.
import type { ProjectType } from '@prisma/client';
import type { Unit } from '@site-diary/shared';

export const SKILLS: { gu: string; en: string }[] = [
  { gu: 'કડિયા', en: 'Mason (kadiya)' },
  { gu: 'મજૂર', en: 'Helper (majur)' },
  { gu: 'સુથાર', en: 'Carpenter / shuttering (sutar)' },
  { gu: 'લુહાર', en: 'Bar bender (luhar)' },
  { gu: 'પ્લમ્બર', en: 'Plumber' },
  { gu: 'ઇલેક્ટ્રિશિયન', en: 'Electrician' },
  { gu: 'રંગારા', en: 'Painter' },
];

export const MATERIALS: { gu: string; en: string; unit: Unit; category: string }[] = [
  { gu: 'સિમેન્ટ', en: 'Cement', unit: 'bag', category: 'cement' },
  { gu: 'સળિયા (TMT)', en: 'TMT steel', unit: 'kg', category: 'steel' },
  { gu: 'બાઇન્ડિંગ વાયર', en: 'Binding wire', unit: 'kg', category: 'steel' },
  { gu: 'રેતી', en: 'Sand', unit: 'brass', category: 'aggregate' },
  { gu: 'કપચી 20mm', en: 'Aggregate 20mm', unit: 'brass', category: 'aggregate' },
  { gu: 'કપચી 10mm', en: 'Aggregate 10mm (grit)', unit: 'brass', category: 'aggregate' },
  { gu: 'ઈંટ', en: 'Bricks', unit: 'nos', category: 'masonry' },
  { gu: 'AAC બ્લોક', en: 'AAC blocks', unit: 'nos', category: 'masonry' },
  { gu: 'રેડી મિક્સ કોંક્રિટ', en: 'Ready-mix concrete', unit: 'cum', category: 'concrete' },
  { gu: 'ટાઇલ્સ', en: 'Tiles', unit: 'sqft', category: 'finishing' },
];

const RCC: [string, string][] = [
  ['ખોદકામ', 'Excavation'],
  ['ફૂટિંગ', 'Footing'],
  ['કોલમ', 'Column'],
  ['બીમ', 'Beam'],
  ['સ્લેબ', 'Slab'],
  ['ચણતર', 'Masonry'],
  ['પ્લાસ્ટર', 'Plaster'],
  ['પ્લમ્બિંગ', 'Plumbing'],
  ['ઇલેક્ટ્રિકલ', 'Electrical'],
  ['ફ્લોરિંગ', 'Flooring'],
  ['ફિનિશિંગ', 'Finishing'],
];

export const WORK_ITEM_TEMPLATES: Record<ProjectType, [string, string][]> = {
  rcc_frame: RCC,
  load_bearing: [
    ['ખોદકામ', 'Excavation'],
    ['પાયો (PCC)', 'Foundation PCC'],
    ['ચણતર', 'Load-bearing masonry'],
    ['સ્લેબ', 'Slab'],
    ['પ્લાસ્ટર', 'Plaster'],
    ['પ્લમ્બિંગ', 'Plumbing'],
    ['ઇલેક્ટ્રિકલ', 'Electrical'],
    ['ફ્લોરિંગ', 'Flooring'],
    ['ફિનિશિંગ', 'Finishing'],
  ],
  bungalow: [...RCC, ['કમ્પાઉન્ડ વોલ', 'Compound wall']],
};
