import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Client } from 'pg';
import { SseService } from './sse.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class PgListenerService implements OnModuleInit, OnModuleDestroy {
  private listener: Client;
  private lastId = 0;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(private sse: SseService, private db: DatabaseService) {
    this.listener = new Client({ connectionString: process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL });
    this.listener.on('notification', (msg) => {
      if (msg.channel !== 'sync_events' || !msg.payload) return;
      try {
        const { id } = JSON.parse(msg.payload) as { id: number };
        if (id <= this.lastId) return;
        void this.readAndEmit(id);
      } catch { /* ignore malformed */ }
    });
  }

  async onModuleInit() {
    await this.listener.connect();
    await this.listener.query('LISTEN sync_events');
    this.cleanupTimer = setInterval(() => void this.cleanup(), 3600000);
    this.cleanupTimer.unref?.();
    void this.cleanup();
    const rows = await this.db.withAdmin(c =>
      c.query(
        `SELECT id, domain_id, supplier_id, entity, op, entity_id FROM sync_events WHERE id > $1 ORDER BY id ASC`,
        [this.lastId],
      ),
    ).then(r => r.rows);
    for (const row of rows) {
      this.sse.onEvent(row);
      this.lastId = row.id as number;
    }
  }

  async onModuleDestroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    await this.listener.end().catch(() => {});
  }

  private async cleanup(): Promise<void> {
    try {
      await this.db.withAdmin(async c => {
        await c.query(`DELETE FROM sync_events WHERE created_at < now() - interval '24 hours'`);
        await c.query(`DELETE FROM sse_tickets WHERE expires_at < now() - interval '1 hour'`);
      });
    } catch { /* таблицы ещё не созданы — повторим на следующем цикле */ }
  }

  private async readAndEmit(id: number) {
    const { rows } = await this.db.withAdmin(c =>
      c.query(
        `SELECT id, domain_id, supplier_id, entity, op, entity_id FROM sync_events WHERE id = $1`,
        [id],
      ),
    );
    if (!rows[0]) return;
    this.sse.onEvent(rows[0]);
    if ((rows[0].id as number) > this.lastId) this.lastId = rows[0].id as number;
  }
}
