import { BadRequestException, Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { LkService } from './lk.service';
import { Public } from '../auth/public.decorator';
import { TicketService } from '../events/ticket.service';
import { SseService } from '../events/sse.service';

// v1.32.4: роуты ЛК. Публичные — авторизация токеном (+PIN на изменение), как было в edge function.
@Controller('lk')
export class LkController {
  constructor(
    private lk: LkService,
    private ticket: TicketService,
    private sse: SseService,
  ) {}

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

  @Public()
  @Post('stream-ticket')
  streamTicket(@Body() body: { token?: string }) {
    if (!body?.token) throw new BadRequestException('Недействительная ссылка');
    return this.ticket.createLk(body.token);
  }

  @Public()
  @Get('stream')
  stream(
    @Query('ticket') ticket: string,
    @Query('last_id') lastId: string,
    @Res() reply: FastifyReply,
  ) {
    this.sse.connectLk(ticket, Number(lastId) || 0, reply.raw);
  }
}
