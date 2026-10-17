import NetInfo from '@react-native-community/netinfo';
import { randomUUID } from 'expo-crypto';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import {
  addDays, isoDate, PULL_TABLES, PUSH_ORDER, type PullResponse, type PullTable, type PushResult, type PushTable, type StockRow,
} from '@site-diary/shared';
import { ApiError, get, post, putBlob } from './api';
import { kv } from './kv';

// The phone's own copy of its sites: every screen reads from here and writes here first, so entry
// never waits for the network. Writes go into an outbox; sync pushes the outbox, uploads queued photos,
// then pulls everything that changed since the last pull (server_rev).

export type Row = { id: string; [key: string]: unknown };
type Outbox = { table: PushTable; row: Row };
type PhotoJob = { photoId: string; uri: string };
export type SyncError = { table: string; id: string; reason: string; at: string };

const DATED: PullTable[] = ['attendanceEntry', 'advance', 'grn', 'materialIssue', 'siteDay', 'dailyProgress'];
const KEEP_DAYS = 30;

class Db {
  private ns = '';
  private tables = new Map<string, Map<string, Row>>();
  private outbox = new Map<string, Outbox>();
  photos: PhotoJob[] = [];
  stock: StockRow[] = [];
  sites: string[] = [];
  rev = '0';
  today = isoDate();
  lastSync: string | null = null;
  lastError: string | null = null;
  errors: SyncError[] = [];
  pending = new Set<string>();
  syncing = false;
  online = true;
  private version = 0;
  private listeners = new Set<() => void>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;
  private changed() {
    this.version++;
    this.listeners.forEach((fn) => fn());
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.persist(), 300);
  }

  /** Load this user's copy (each user on a shared phone has their own). */
  async open(userId: string) {
    if (this.ns === userId) return;
    this.ns = userId;
    this.tables.clear();
    const k = (s: string) => `db:${userId}:${s}`;
    for (const t of PULL_TABLES) {
      const rows = await kv.getJson<Row[]>(k(`t:${t}`));
      this.tables.set(t, new Map((rows ?? []).map((r) => [r.id, r])));
    }
    this.outbox = new Map(((await kv.getJson<Outbox[]>(k('outbox'))) ?? []).map((o) => [`${o.table}:${o.row.id}`, o]));
    const meta = await kv.getJson<{ rev: string; lastSync: string | null; stock: StockRow[]; photos: PhotoJob[]; errors: SyncError[]; pending: string[]; sites?: string[] }>(k('meta'));
    this.sites = meta?.sites ?? [];
    this.rev = meta?.rev ?? '0';
    this.lastSync = meta?.lastSync ?? null;
    this.stock = meta?.stock ?? [];
    this.photos = (await kv.getJson<PhotoJob[]>(k('photos'))) ?? meta?.photos ?? [];
    this.errors = meta?.errors ?? [];
    this.pending = new Set(meta?.pending ?? []);
    this.changed();
  }

  private async persist() {
    if (!this.ns) return;
    const k = (s: string) => `db:${this.ns}:${s}`;
    await Promise.all([
      ...[...this.tables].map(([t, m]) => kv.setJson(k(`t:${t}`), [...m.values()])),
      kv.setJson(k('outbox'), [...this.outbox.values()]),
      kv.setJson(k('meta'), { rev: this.rev, lastSync: this.lastSync, stock: this.stock, photos: this.photos, errors: this.errors.slice(0, 50), pending: [...this.pending], sites: this.sites }),
    ]);
  }

  /** "Never lose an entry": the outbox and the photo queue are written at once, not after the debounce. */
  private async persistOutbox() {
    if (!this.ns) return;
    await Promise.all([
      kv.setJson(`db:${this.ns}:outbox`, [...this.outbox.values()]),
      kv.setJson(`db:${this.ns}:photos`, this.photos),
    ]);
  }

  table(t: PullTable) {
    let m = this.tables.get(t);
    if (!m) this.tables.set(t, (m = new Map()));
    return m;
  }
  rows(t: PullTable): Row[] {
    return [...this.table(t).values()].filter((r) => !r.deletedAt);
  }
  find(t: PullTable, id: string | null | undefined) {
    return id ? this.table(t).get(id) : undefined;
  }
  isUnsynced(t: PushTable, id: string) {
    return this.outbox.has(`${t}:${id}`);
  }
  get outboxCount() {
    return this.outbox.size;
  }
  outboxRows(): Outbox[] {
    return [...this.outbox.values()];
  }

  /** Save locally (now) and queue for the server. */
  save(t: PushTable, row: Partial<Row> & Record<string, unknown>): Row {
    const full = { ...this.find(t, row.id as string), ...row, id: (row.id as string | undefined) ?? randomUUID() } as Row;
    this.table(t).set(full.id, full);
    this.outbox.set(`${t}:${full.id}`, { table: t, row: full });
    this.pending.delete(full.id);
    void this.persistOutbox();
    this.changed();
    this.soon();
    return full;
  }
  remove(t: PushTable, id: string) {
    const row = this.find(t, id);
    if (row) this.save(t, { ...row, deletedAt: new Date().toISOString() });
  }
  queuePhoto(photoId: string, uri: string) {
    this.photos.push({ photoId, uri });
    void this.persistOutbox();
    this.changed();
  }

  /** Sync shortly after an entry, so several quick saves go in one push. */
  soon() {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => void this.sync(), 1500);
  }

  async sync(): Promise<void> {
    if (this.syncing || !this.ns) return;
    this.syncing = true;
    this.lastError = null;
    this.changed();
    try {
      await this.push();
      await this.uploadPhotos();
      await this.pull();
      this.lastSync = new Date().toISOString();
      this.online = true; // reaching the server is the real test, whatever the phone's network probe says
    } catch (e) {
      const offline = e instanceof ApiError && e.code === 'offline';
      if (offline) this.online = false;
      this.lastError = offline ? 'offline' : e instanceof Error ? e.message : String(e);
    } finally {
      this.syncing = false;
      this.changed();
    }
  }

  private async push() {
    const items = [...this.outbox.entries()];
    if (!items.length) return;
    const changes: Record<string, Record<string, unknown>[]> = {};
    for (const t of PUSH_ORDER) {
      const rows = items.filter(([, o]) => o.table === t).map(([, o]) => strip(o.row));
      if (rows.length) changes[t] = rows;
    }
    const res = await post<PushResult>('/sync/push', { changes });
    for (const [key, o] of items) if (this.outbox.get(key) === o) this.outbox.delete(key);
    for (const [from] of Object.entries(res.remapped)) {
      for (const t of PUSH_ORDER) this.table(t).delete(from);
    }
    for (const id of res.pending) this.pending.add(id);
    if (res.rejected.length) {
      const at = new Date().toISOString();
      this.errors = [...res.rejected.map((r) => ({ ...r, at })), ...this.errors].slice(0, 50);
      for (const r of res.rejected) this.table(r.table as PullTable).delete(r.id);
      this.rev = '0'; // pull everything again so nothing stays half-changed on this phone
    }
  }

  private async uploadPhotos() {
    for (const job of [...this.photos]) {
      if (this.isUnsynced('photo', job.photoId)) continue; // the row goes first
      try {
        const blob = await (await fetch(job.uri)).blob();
        await putBlob(`/photos/${job.photoId}/file`, blob, 'image/jpeg');
        this.photos = this.photos.filter((p) => p !== job);
        const row = this.find('photo', job.photoId);
        if (row) this.table('photo').set(row.id, { ...row, uploaded: true });
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) this.photos = this.photos.filter((p) => p !== job);
        else if (e instanceof ApiError && e.status === 0) throw e;
        // otherwise: keep it and try on the next sync
      }
    }
  }

  private async pull() {
    const full = this.rev === '0';
    const p = await get<PullResponse>(`/sync/pull?since=${this.rev}`);
    if (full) {
      for (const t of PULL_TABLES) {
        const local = [...this.table(t).values()].filter((r) => this.outbox.has(`${t}:${r.id}`));
        this.tables.set(t, new Map(local.map((r) => [r.id, r])));
      }
    }
    for (const [t, rows] of Object.entries(p.changes) as [PullTable, Row[]][]) {
      const m = this.table(t);
      for (const r of rows) {
        if (this.outbox.has(`${t}:${r.id}`)) continue; // our newer local change wins until it is pushed
        this.pending.delete(r.id);
        if (r.deletedAt) m.delete(r.id);
        else m.set(r.id, m.get(r.id)?._uri ? { ...r, _uri: m.get(r.id)?._uri } : r); // keep the photo shown from the phone's own file
      }
    }
    this.stock = p.stock;
    this.today = p.today;
    this.rev = p.rev;
    if (p.sites) this.dropOtherSites(p.sites);
    this.prune();
  }

  /** A site taken away from this person disappears from the phone (unsent entries for it stay until refused). */
  private dropOtherSites(sites: string[]) {
    this.sites = sites;
    const keep = new Set(sites);
    for (const t of PULL_TABLES) {
      const m = this.table(t);
      for (const r of m.values()) {
        if (this.outbox.has(`${t}:${r.id}`)) continue;
        const pid = t === 'project' ? r.id : (r.projectId ?? (t === 'stockTransfer' ? null : undefined));
        if (t === 'stockTransfer' && !keep.has(String(r.fromProjectId)) && !keep.has(String(r.toProjectId))) m.delete(r.id);
        else if (typeof pid === 'string' && !keep.has(pid)) m.delete(r.id);
      }
    }
  }

  /** Keep the last 30 days of daily entries on the phone. */
  private prune() {
    const from = addDays(isoDate(), -KEEP_DAYS);
    const old = (t: PullTable, r: Row, day: unknown) => typeof day === 'string' && day.slice(0, 10) < from && !this.outbox.has(`${t}:${r.id}`);
    for (const t of DATED) {
      const m = this.table(t);
      for (const r of m.values()) if (old(t, r, r.date)) m.delete(r.id);
    }
    // Finished business older than 30 days: photos, solved problems, decided indents, completed transfers.
    for (const r of this.table('photo').values()) if (old('photo', r, r.takenAt) && !this.photos.some((p) => p.photoId === r.id)) this.table('photo').delete(r.id);
    for (const r of this.table('issue').values()) if (r.status === 'resolved' && old('issue', r, r.updatedAt)) this.table('issue').delete(r.id);
    for (const r of this.table('indent').values()) {
      if (r.status !== 'submitted' && r.status !== 'draft' && old('indent', r, r.createdAt)) {
        this.table('indent').delete(r.id);
        for (const l of this.table('indentLine').values()) if (l.indentId === r.id) this.table('indentLine').delete(l.id);
      }
    }
    for (const r of this.table('stockTransfer').values()) if (r.status !== 'sent' && old('stockTransfer', r, r.updatedAt)) this.table('stockTransfer').delete(r.id);
  }

  async close() {
    await this.persist();
    this.ns = '';
    this.tables.clear();
    this.outbox.clear();
    this.changed();
  }

  /** Background: on start, on reconnect, when the app comes back, and every 2 minutes. */
  startAutoSync() {
    const timer = setInterval(() => void this.sync(), 120_000);
    const net = NetInfo.addEventListener((s) => {
      // Only "connected or not": reachability probes can be blocked on site Wi-Fi; sync itself decides.
      const online = s.isConnected !== false;
      if (online && !this.online) void this.sync();
      else if (!online) {
        this.online = false;
        this.changed();
      }
    });
    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active') void this.sync();
    });
    void this.sync();
    return () => {
      clearInterval(timer);
      net();
      app.remove();
    };
  }
}

/** Local-only fields start with "_". */
const strip = (r: Row) => Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith('_')));

export const db = new Db();

/** Re-render when the local copy changes; `select` runs against it. */
export function useDb<T>(select: () => T): T {
  useSyncExternalStore(db.subscribe, db.getVersion, db.getVersion);
  return select();
}
