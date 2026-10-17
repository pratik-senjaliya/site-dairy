'use client';

import { can, type Action, type CompanySettings, type Module, type Role } from '@site-diary/shared';
import { createContext, useContext, type ReactNode } from 'react';
import { useFetch } from './hooks';

export interface Me {
  user: { id: string; name: string; phone: string; role: Role; language: 'gu' | 'en' | 'hi' };
  company: { id: string; name: string; plan: string; settings: CompanySettings; planStatus: { label: string; endsOn: string | null; daysLeft: number | null } };
  projects: { id: string; name: string; status: string }[];
}

const Ctx = createContext<{ me: Me | undefined; reload: () => Promise<void> }>({ me: undefined, reload: async () => {} });

export function SessionProvider({ children }: { children: ReactNode }) {
  const { data, reload } = useFetch<Me>('/auth/me');
  return <Ctx.Provider value={{ me: data, reload }}>{children}</Ctx.Provider>;
}

export const useMe = () => useContext(Ctx).me;
export const useReloadMe = () => useContext(Ctx).reload;
export function useCan() {
  const me = useMe();
  return (m: Module, a: Action) => (me ? can(me.user.role, m, a) : false);
}
