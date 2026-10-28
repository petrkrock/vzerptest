import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/public.decorator';

// /healthz — для Coolify (healthcheck) и мониторинга. Держим дешёвым: без обращений к БД.
@Controller()
export class HealthController {
  @Public()
  @Get('healthz')
  health() {
    return {
      status: 'ok',
      uptime: Math.round(process.uptime()),
      version: process.env.APP_VERSION || 'dev',
    };
  }
}
