import { t, type MessageKey } from '@site-diary/i18n';
import { formatNumber, shortDate, weekday } from '@site-diary/shared';
import { useCallback } from 'react';
import { useSession } from './session';

export type { MessageKey };

// These return the same function until the language changes, so they are safe in effect and callback deps.

export function useT() {
  const { lang } = useSession();
  return useCallback((key: MessageKey, vars?: Record<string, string | number>) => t(lang, key, vars), [lang]);
}

/** Gujarati/Hindi name when the person reads those, English otherwise. */
export function useName() {
  const { lang } = useSession();
  return useCallback(
    (r: Record<string, unknown> | undefined | null): string => (!r ? '' : String((lang === 'en' ? r.nameEn : r.nameGu) ?? r.nameEn ?? r.name ?? '')),
    [lang],
  );
}

export const num = (n: number) => formatNumber(n);

/** "ગુરુવાર 22/10" — the way a day is named on site. */
export function useDayName() {
  const t = useT();
  return useCallback((iso: string) => `${t(`day.${weekday(iso)}` as MessageKey)} ${shortDate(iso)}`, [t]);
}
