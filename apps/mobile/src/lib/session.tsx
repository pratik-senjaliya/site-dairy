import type { Locale } from '@site-diary/i18n';
import type { CompanySettings, Role } from '@site-diary/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, clearTokens, DEMO_BUILD, get, getDeviceId, initApi, post, saveTokens, setDemo } from './api';
import { db } from './db';
import { kv, secure } from './kv';

export interface Me {
  user: { id: string; name: string; phone: string; role: Role; language: Locale };
  company: { id: string; name: string; plan: string; settings: CompanySettings };
  projects: { id: string; name: string; status: string }[];
}

interface Session {
  status: 'loading' | 'out' | 'in';
  me: Me | null;
  siteId: string | null;
  lang: Locale;
  setLang(l: Locale): void;
  setSite(id: string): void;
  signedIn(tokens: { accessToken?: string; refreshToken?: string }): Promise<void>;
  refreshMe(): Promise<void>;
  signOut(): Promise<void>;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Session['status']>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [lang, setLangState] = useState<Locale>('gu');

  const enter = useCallback(async (m: Me) => {
    setMe(m);
    setLangState(m.user.language);
    await kv.setJson('me', m);
    await db.open(m.user.id);
    const last = await kv.get(`site:${m.user.id}`);
    setSiteId(m.projects.find((p) => p.id === last)?.id ?? (m.projects.length === 1 ? m.projects[0]!.id : null));
    setStatus('in');
  }, []);

  const toOut = useCallback(() => {
    setStatus('out');
    setMe(null);
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      await enter(await get<Me>('/auth/me'));
    } catch (e) {
      if (!(e instanceof ApiError) || e.status === 401) throw e;
    }
  }, [enter]);

  useEffect(() => {
    void (async () => {
      await initApi(toOut);
      const lastLang = (await kv.get('lang')) as Locale | null;
      if (lastLang) setLangState(lastLang);
      const cached = await kv.getJson<Me>('me');
      const hasToken = !!(await secure.get('refresh'));
      if (cached && hasToken) {
        await enter(cached); // works offline; refreshed below when online
        void refreshMe().catch(() => toOut());
      } else {
        setStatus('out');
      }
    })();
  }, [enter, refreshMe, toOut]);

  const value = useMemo<Session>(
    () => ({
      status, me, siteId, lang,
      setLang(l) {
        setLangState(l);
        void kv.set('lang', l);
        if (me) void api('PATCH', '/auth/me', { language: l }).catch(() => {});
      },
      setSite(id) {
        setSiteId(id);
        if (me) void kv.set(`site:${me.user.id}`, id);
      },
      async signedIn(tokens) {
        await saveTokens(tokens);
        await enter(await get<Me>('/auth/me'));
      },
      refreshMe,
      async signOut() {
        // Entries not yet sent stay on the phone for this user and go out at the next sign-in.
        await post('/auth/logout').catch(() => {});
        if (!DEMO_BUILD) await setDemo(false);
        await clearTokens();
        await kv.remove('me');
        await db.close();
        toOut();
      },
    }),
    [status, me, siteId, lang, enter, refreshMe, toOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const s = useContext(Ctx);
  if (!s) throw new Error('SessionProvider missing');
  return s;
}

export { getDeviceId };
