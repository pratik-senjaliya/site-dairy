import en from './locales/en.json';
import gu from './locales/gu.json';
import hi from './locales/hi.json';

/** English is the key reference; Gujarati is the default language shown. */
export type MessageKey = keyof typeof en;
export type Locale = 'gu' | 'en' | 'hi';

export const DEFAULT_LOCALE: Locale = 'gu';
export const messages: Record<Locale, Record<MessageKey, string>> = { gu, en, hi };

/** t('gu', 'attendance.workers', { count: 12 }) → "12 માણસ". Falls back to English, then the key. */
export function t(locale: Locale, key: MessageKey, vars?: Record<string, string | number>): string {
  const text = messages[locale][key] ?? messages.en[key] ?? key;
  return vars ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m)) : text;
}
