import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

// v1.32.1: скелет API. Слушаем 0.0.0.0 — внутри контейнера Coolify иначе healthcheck не достучится.
async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // v1.32.4: лимит тела (ЛК присылает склады/проценку).
    // v1.35.3-fix6: 15 МБ — upload файлов ЛК идёт base64 через /files,
    // 512 КБ не хватало (FastifyError: Request body is too large).
    // trustProxy: сколько прокси перед API (Coolify/Traefik = 1). От этого зависит req.ip — на нём лимиты логина/форм.
    // 0 — API торчит наружу без прокси (тогда x-forwarded-for игнорируется).
    new FastifyAdapter({ bodyLimit: 15 * 1024 * 1024, trustProxy: Number(process.env.TRUST_PROXY_HOPS ?? 1) }),
  );

  // Заголовки безопасности для всех ответов API (SSE пишет в reply.raw напрямую — его не затрагивает).
  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook(
    'onSend',
    (_req: unknown, reply: { header(k: string, v: string): unknown }, payload: unknown, done: (err: Error | null, payload?: unknown) => void) => {
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header('X-Frame-Options', 'DENY');
      reply.header('Referrer-Policy', 'no-referrer');
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      reply.header('Cross-Origin-Resource-Policy', 'cross-origin'); // картинки ЛК/форм грузятся с другого домена
      done(null, payload);
    },
  );

  // v1.34.1: один вызов enableCors. Раньше было три register(cors) с prefix —
  // Fastify падал с FST_ERR_DEC_ALREADY_PRESENT (corsPreflightEnabled уже добавлен).
  // enableCors сам регистрирует @fastify/cors один раз.
  // CORS_ORIGINS — список доменов CRM через запятую. Пусто = любой origin (только для разработки!).
  const origins = (process.env.CORS_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
  app.enableCors({
    origin: origins.length ? origins : true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  const port = Number(process.env.PORT || 3000);
  await app.listen({ port, host: '0.0.0.0' });
  console.log(JSON.stringify({ level: 'info', msg: 'api started', port, host: '0.0.0.0' }));
}

bootstrap().catch(err => {
  console.error(JSON.stringify({ level: 'error', msg: 'api failed to start', err: String(err) }));
  process.exit(1);
});