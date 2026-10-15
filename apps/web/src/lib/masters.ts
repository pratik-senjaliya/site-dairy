'use client';

import { useFetch } from './hooks';

export interface Named { id: string; name?: string; nameEn?: string; nameGu?: string; unit?: string; [k: string]: unknown }

/** Names for the ids that tables show (contractors, skills, materials, suppliers, sites, people). */
export function useLookups() {
  const contractors = useFetch<Named[]>('/masters/contractor');
  const skills = useFetch<Named[]>('/masters/skill');
  const materials = useFetch<Named[]>('/masters/material');
  const suppliers = useFetch<Named[]>('/masters/supplier');
  const projects = useFetch<Named[]>('/projects');
  const users = useFetch<Named[]>('/users');
  const by = (list: Named[] | undefined) => (id: unknown) => list?.find((x) => x.id === id);
  return {
    contractors: contractors.data ?? [], skills: skills.data ?? [], materials: materials.data ?? [], suppliers: suppliers.data ?? [], projects: projects.data ?? [], users: users.data ?? [],
    contractor: by(contractors.data), skill: by(skills.data), material: by(materials.data), supplier: by(suppliers.data), project: by(projects.data), user: by(users.data),
    reload: () => Promise.all([contractors.reload(), skills.reload(), materials.reload(), suppliers.reload(), projects.reload(), users.reload()]),
  };
}
