import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @HttpCode(200)
  @Post('login')
  login(
    @Body() body: { email?: string; password?: string },
    @Req() req: { headers: Record<string, string | undefined>; ip?: string },
  ) {
    // Реальный IP даёт Fastify (trustProxy в main.ts); заголовок x-forwarded-for клиент подделывает.
    const ip = req.ip || '';
    return this.auth.login(body.email || '', body.password || '', ip);
  }
}
