import { db, type Row } from './db';

/** "B block · Floor 6" */
export function floorName(node: Row): string {
  const parent = db.find('structureNode', node.parentId as string | null);
  const towers = db.rows('structureNode').filter((n) => n.projectId === node.projectId && n.kind === 'tower').length;
  return parent && towers > 1 ? `${String(parent.name)} · ${String(node.name)}` : String(node.name);
}
