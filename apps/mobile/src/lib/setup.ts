import { useState } from 'react';
import { ApiError } from './api';
import { db } from './db';
import { notice } from './hooks';
import { useT } from './i18n';

/**
 * Setup screens (sites, people, contractors…) write straight to the server: one save button that shows it is
 * busy, says what went wrong in the person's language, and pulls the change onto this phone afterwards.
 */
export function useSave() {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>): Promise<boolean> => {
    setBusy(true);
    try {
      await fn();
      void db.sync();
      return true;
    } catch (e) {
      const code = e instanceof ApiError ? e.code : '';
      const text = code === 'offline' ? t('setup.needsOnline') : code === 'duplicate' ? t('setup.duplicate') : code === 'plan_limit' ? t('setup.planLimit') : e instanceof Error ? e.message : String(e);
      notice(t('common.error'), text);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

/** Rupees typed in a box → paise; empty or 0 means "no rate". */
export const toPaise = (rupees: string) => Math.round(Number(rupees.replace(/[^\d.]/g, '')) * 100) || 0;

export interface Rate { id: string; contractorId: string; skillId: string; dailyRatePaise: number; effectiveFrom: string }

/** The trades a contractor usually is; stored in English, shown in the person's language. */
export const TRADES = ['Civil', 'Shuttering', 'Steel', 'Plumbing', 'Electric', 'Painting', 'Tiles', 'Labour'] as const;

export interface Person { id: string; name: string; phone: string; role: string; language: string; isActive: boolean; siteIds: string[]; lastSeenAt: string | null }
