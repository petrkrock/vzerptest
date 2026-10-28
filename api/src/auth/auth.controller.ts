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
    // v1.34.0 (аудит #3): IP для rate-limit (5 попыток/5 мин на email+ip).
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || '';
    return this.auth.login(body.email || '', body.password || '', ip);
  }
}
