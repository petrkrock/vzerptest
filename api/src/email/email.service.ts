import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { DatabaseService } from '../database/database.service';

// v1.32.5: poll outbox_events каждые 5 сек. Захват пачки — UPDATE ... RETURNING
// (атомарно, двойной отправки не будет даже при двух репликах). Ретраи: 5 попыток.
const POLL_MS = 5000;
const BATCH = 10;
const MAX_ATTEMPTS = 5;

interface OutboxRow {
  id: string;
  payload: { email?: string; subject?: string; text?: string };
  attempts: number;
}

@Injectable()
export class EmailService implements OnModuleInit, OnModuleDestroy {
  private log = new Logger('Email');
  private timer?: NodeJS.Timeout;
  private running = false;
  private transporter?: nodemailer.Transporter;

  constructor(private db: DatabaseService) {}

  onModuleInit() {
    if (!process.env.SMTP_URL) {
      this.log.warn('SMTP_URL не задан — почтовый воркер отключён');
      return;
    }
    this.transporter = nodemailer.createTransport(process.env.SMTP_URL);
    this.timer = setInterval(() => {
      this.tick().catch(e => this.log.error(`tick: ${String(e)}`));
    }, POLL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running || !this.transporter) return;
    this.running = true;
    try {
      const { rows } = await this.db.withAdmin(c =>
        c.query(
          `UPDATE public.outbox_events SET status = 'sending', attempts = attempts + 1
           WHERE id IN (
             SELECT id FROM public.outbox_events
             WHERE status = 'pending' AND payload ->> 'email' IS NOT NULL
             ORDER BY created_at LIMIT ${BATCH}
           )
           RETURNING id, payload, attempts`,
        ),
      );
      for (const ev of rows as OutboxRow[]) {
        await this.deliver(ev);
      }
    } finally {
      this.running = false;
    }
  }

  private async deliver(ev: OutboxRow) {
    const to = ev.payload?.email;
    if (!to) {
      await this.mark(ev.id, 'sent'); // не письмо — пропускаем как обработанное
      return;
    }
    try {
      await this.transporter!.sendMail({
        from: process.env.EMAIL_FROM || process.env.SMTP_FROM,
        to,
        subject: ev.payload.subject || 'Уведомление ВсемЗапчасти ERP',
        text: ev.payload.text || '',
      });
      await this.mark(ev.id, 'sent');
      this.log.log(`sent → ${to}`);
    } catch (e) {
      const status = ev.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
      await this.db.withAdmin(c =>
        c.query(
          `UPDATE public.outbox_events SET status = $1, last_error = $2 WHERE id = $3`,
          [status, String(e).slice(0, 500), ev.id],
        ),
      );
      this.log.error(`fail (${ev.attempts}/${MAX_ATTEMPTS}) → ${to}: ${String(e).slice(0, 200)}`);
    }
  }

  private mark(id: string, status: 'sent' | 'failed') {
    return this.db.withAdmin(c =>
      c.query(
        `UPDATE public.outbox_events SET status = $1, sent_at = now(), last_error = NULL WHERE id = $2`,
        [status, id],
      ),
    );
  }
}
