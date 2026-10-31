// v1.34.4: транспорт синка к своему API. Supabase вырезан — это единственный путь.
// Контракт — как у бывших мапперов (pullRemoteSnapshot/saveSettings/create/update/delete ×5).

import type { AppSettings, Supplier, Buyer, Task, Ticket, MediaRecord } from '@/types';
import { apiRequest, camelize } from './api';
import { logToServer } from './log';

export function remoteSyncEnabled(): boolean {
  return true; // own-режим единственный (v1.34.0); синк всегда активен
}

type Entity = 'suppliers' | 'buyers' | 'tasks' | 'tickets' | 'mediaRecords';

interface Snapshot {
  syncVersion: number;
  settings: AppSettings;
  suppliers: Supplier[];
  buyers: Buyer[];
  tasks: Task[];
  tickets: Ticket[];
  mediaRecords: MediaRecord[];
}

export async function pullRemoteSnapshot(): Promise<Snapshot> {
  const snap = await apiRequest<{
    syncVersion?: number;
    settings: unknown; suppliers: unknown[]; buyers: unknown[]; tasks: unknown[];
    tickets: unknown[]; mediaRecords: unknown[];
  }>('/sync/snapshot');
  return {
    syncVersion: snap.syncVersion ?? 0,
    settings: snap.settings as AppSettings,
    suppliers: camelize<Supplier[]>(snap.suppliers),
    buyers: camelize<Buyer[]>(snap.buyers),
    tasks: camelize<Task[]>(snap.tasks),
    tickets: camelize<Ticket[]>(snap.tickets),
    mediaRecords: camelize<MediaRecord[]>(snap.mediaRecords),
  };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await apiRequest('/sync/settings', { method: 'PUT', body: { settings } });
}

// v1.34.4: оп — единая точка. Сигнатура (entity, kind, id, data?).
// ВАЖНО: при update data должен быть объектом с полями сущности (не id!).
async function op(entity: Entity, kind: 'create' | 'update' | 'delete', id: string, data?: unknown): Promise<void> {
  try {
    await apiRequest('/sync/ops', {
      method: 'POST',
      body: { ops: [{ entity, op: kind, id, data }] },
    });
  } catch (e) {
    // v1.35.0: ошибка синка — в журнал (app_logs), а не только в консоль. Причина «не
    // записывается» теперь видна текстом в Настройки → Журнал / DBeaver.
    logToServer('error', `sync ${entity}/${kind} ${id}: ${(e as Error)?.message || e}`).catch(() => undefined);
    throw e;
  }
}

export async function createSupplier(s: Supplier): Promise<void> { await op('suppliers', 'create', s.id, s); }
export async function updateSupplier(s: Supplier): Promise<void> { await op('suppliers', 'update', s.id, s); }
export async function deleteSupplier(id: string): Promise<void> { await op('suppliers', 'delete', id); }
export async function createBuyer(b: Buyer): Promise<void> { await op('buyers', 'create', b.id, b); }
export async function updateBuyer(b: Buyer): Promise<void> { await op('buyers', 'update', b.id, b); }
export async function deleteBuyer(id: string): Promise<void> { await op('buyers', 'delete', id); }
export async function createTask(t: Task): Promise<void> { await op('tasks', 'create', t.id, t); }
export async function updateTask(t: Task): Promise<void> { await op('tasks', 'update', t.id, t); }
export async function deleteTask(id: string): Promise<void> { await op('tasks', 'delete', id); }
export async function createTicket(t: Ticket): Promise<void> { await op('tickets', 'create', t.id, t); }
export async function updateTicket(t: Ticket): Promise<void> { await op('tickets', 'update', t.id, t); }
export async function deleteTicket(id: string): Promise<void> { await op('tickets', 'delete', id); }
export async function createMediaRecord(m: MediaRecord): Promise<void> { await op('mediaRecords', 'create', m.id, m); }
export async function updateMediaRecord(m: MediaRecord): Promise<void> { await op('mediaRecords', 'update', m.id, m); }
export async function deleteMediaRecord(id: string): Promise<void> { await op('mediaRecords', 'delete', id); }