import { formatNumber, formatPaise } from '@site-diary/shared';

export const money = (paise: number | null | undefined) => (paise == null ? '—' : formatPaise(Number(paise)));
export const qty = (n: number | null | undefined) => (n == null ? '—' : formatNumber(Number(n)));
const dayFmt = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
/** 07 Oct 2026 */
export const date = (iso: string | null | undefined) => (iso ? dayFmt.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`)) : '—');
export const dateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
/** "Cement · સિમેન્ટ" */
export const bilingual = (r: { nameEn?: string; nameGu?: string } | undefined) => (r ? (r.nameGu && r.nameGu !== r.nameEn ? `${r.nameEn} · ${r.nameGu}` : (r.nameEn ?? '')) : '');
export const ROLE_LABEL: Record<string, string> = { owner: 'Owner', engineer: 'Site engineer', supervisor: 'Supervisor', store: 'Store keeper', accountant: 'Accountant' };
