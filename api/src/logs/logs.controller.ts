import { Body, Controller, Post } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Public } from '../auth/public.decorator';

// v1.35.0: приём клиентских логов. Колонки app_logs приведены к боевой схеме
// (level, message, page, stack, user_email).
@Controller('logs')
export class LogsController {
  constructor(private db: DatabaseService) {}

  @Public()
  @Post()
  async write(@Body() body: { level?: string; scope?: string; message?: string; meta?: { stack?: string | null; page?: string; user_email?: string | null } }) {
    const level = ['info', 'warn', 'error'].includes(String(body.level)) ? String(body.level) : 'info';
    await this.db.withAdmin(c =>
      c.query(
        `INSERT INTO public.app_logs (level, message, page, stack, user_email)
         VALUES ($1, $2, $3, $4, $5)`,
        [level, String(body.message || '').slice(0, 2000),
         String(body.meta?.page || '').slice(0, 500),
         body.meta?.stack ? String(body.meta.stack).slice(0, 8000) : null,
         body.meta?.user_email ? String(body.meta.user_email).slice(0, 200) : null],
      ),
    ).catch(() => undefined); // логирование не должно ломать приложение
    return { ok: true };
  }
}
