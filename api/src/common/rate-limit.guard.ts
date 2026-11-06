import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';

// Глобальный лимит запросов с одного IP (защита от парсинга/DDoS уровня приложения).
// Окно 60 с, по умолчанию 600 запросов (RATE_LIMIT_PER_MIN) — с запасом для офиса за одним NAT
// (синк + SSE). Строгие лимиты логина, форм и загрузок живут отдельно в своих сервисах.
// IP — req.ip (Fastify trustProxy, см. main.ts). Счётчики в памяти одного процесса.
const WINDOW_MS = 60_000;
const MAX = Number(process.env.RATE_LIMIT_PER_MIN || 600);

@Injectable()
export class RateLimitGuard implements CanActivate {
  private hits = new Map<string, { count: number; resetAt: number }>();

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{ ip?: string; url?: string }>();
    if (req.url?.startsWith('/healthz')) return true; // healthcheck Coolify не лимитируем
    const now = Date.now();
    const ip = req.ip || 'unknown';
    const rec = this.hits.get(ip);
    if (!rec || now > rec.resetAt) {
      this.hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
      if (this.hits.size > 20_000) for (const [k, v] of this.hits) if (now > v.resetAt) this.hits.delete(k);
      return true;
    }
    rec.count += 1;
    if (rec.count > MAX) throw new HttpException({ error: 'Слишком много запросов, попробуйте позже' }, HttpStatus.TOO_MANY_REQUESTS);
    return true;
  }
}
