import { t, type MessageKey } from '@site-diary/i18n';
import { formatNumber } from '@site-diary/shared';
import { useSession } from './session';

export type { MessageKey };

export function useT() {
  const { lang } = useSession();
  return (key: MessageKey, vars?: Record<string, string | number>) => t(lang, key, vars);
}

/** Gujarati/Hindi name when the person reads those, English otherwise. */
export function useName() {
  const { lang } = useSession();
  return (r: Record<string, unknown> | undefined | null): string =>
    !r ? '' : String((lang === 'en' ? r.nameEn : r.nameGu) ?? r.nameEn ?? r.name ?? '');
}

export const num = (n: number) => formatNumber(n);
