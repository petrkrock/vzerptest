import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { LkService } from './lk.service';
import { Public } from '../auth/public.decorator';

// v1.32.4: роуты ЛК. Публичные — авторизация токеном (+PIN на изменение), как было в edge function.
@Controller('lk')
export class LkController {
  constructor(private lk: LkService) {}

  @Public()
  @Get()
  getInfo(@Query('token') token?: string) {
    if (!token) throw new BadRequestException('Недействительная ссылка');
    return this.lk.getInfo(token);
  }

  @Public()
  @Post()
  post(@Body() body: Record<string, unknown>) {
    if (!body || typeof body !== 'object') throw new BadRequestException('Некорректный запрос');
    return this.lk.post(body);
  }
}
