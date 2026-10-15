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
  | 'users';
export type Action = 'C' | 'A' | 'V';

const M: Record<Module, Partial<Record<Role, string>>> = {
  projects: { owner: 'CAV', engineer: 'V', supervisor: 'V', store: 'V', accountant: 'V' },
  // Engineers approve late attendance edits (scope: "later edits need engineer approval").
  attendance: { owner: 'VA', engineer: 'CVA', supervisor: 'CV', accountant: 'V' },
  wages: { owner: 'CAV', engineer: 'CV', supervisor: 'C', accountant: 'CV' },
  // Indents go "owner/engineer approval" in the scope text.
  indent: { owner: 'AV', engineer: 'CVA', supervisor: 'C', store: 'CV', accountant: 'V' },
  po: { owner: 'CAV', engineer: 'V', store: 'CV', accountant: 'V' },
  store: { owner: 'V', engineer: 'V', supervisor: 'C', store: 'CV', accountant: 'V' },
  progress: { owner: 'V', engineer: 'CV', supervisor: 'CV' },
  reports: { owner: 'V', engineer: 'V', accountant: 'V' },
  users: { owner: 'CAV' },
};

export function can(role: Role, module: Module, action: Action): boolean {
  return M[module][role]?.includes(action) ?? false;
}

/** Field roles that create on the phone also see what they and their site entered. */
export function canSee(role: Role, module: Module): boolean {
  return can(role, module, 'V') || can(role, module, 'C');
}

/** Owner and accountant see every site; everyone else only the sites assigned to them. */
export function seesAllSites(role: Role): boolean {
  return role === 'owner' || role === 'accountant';
}
