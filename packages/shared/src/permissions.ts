import type { Role } from './schemas';

// Permission matrix v1 (docs/scope.md → Users and roles). C = create, A = approve, V = view.
export type Module =
  | 'projects'
  | 'attendance'
  | 'wages'
  | 'indent'
  | 'po'
  | 'store'
  | 'progress'
  | 'reports'
  | 'users'
  /** Flats, buyers' payments and the partners' cash book. */
  | 'accounts';
export type Action = 'C' | 'A' | 'V';

// A partner sees everything (that is the point: trust between partners) and writes only in the cash book.
const M: Record<Module, Partial<Record<Role, string>>> = {
  projects: { owner: 'CAV', engineer: 'V', supervisor: 'V', store: 'V', accountant: 'V', partner: 'V' },
  // Engineers approve late attendance edits (scope: "later edits need engineer approval").
  // Owners and engineers can make every site entry themselves: a small builder is often his own supervisor.
  attendance: { owner: 'CVA', engineer: 'CVA', supervisor: 'CV', accountant: 'V', partner: 'V' },
  wages: { owner: 'CAV', engineer: 'CV', supervisor: 'C', accountant: 'CV', partner: 'V' },
  // Indents go "owner/engineer approval" in the scope text.
  indent: { owner: 'CAV', engineer: 'CVA', supervisor: 'C', store: 'CV', accountant: 'V', partner: 'V' },
  po: { owner: 'CAV', engineer: 'V', store: 'CV', accountant: 'V', partner: 'V' },
  store: { owner: 'CV', engineer: 'CV', supervisor: 'C', store: 'CV', accountant: 'V', partner: 'V' },
  progress: { owner: 'CV', engineer: 'CV', supervisor: 'CV', partner: 'V' },
  reports: { owner: 'V', engineer: 'V', accountant: 'V', partner: 'V' },
  users: { owner: 'CAV' },
  accounts: { owner: 'CV', accountant: 'CV', partner: 'CV' },
};

export function can(role: Role, module: Module, action: Action): boolean {
  return M[module][role]?.includes(action) ?? false;
}

/** Field roles that create on the phone also see what they and their site entered. */
export function canSee(role: Role, module: Module): boolean {
  return can(role, module, 'V') || can(role, module, 'C');
}

/** Owner, accountant and partners see every site; everyone else only the sites assigned to them. */
export function seesAllSites(role: Role): boolean {
  return role === 'owner' || role === 'accountant' || role === 'partner';
}
