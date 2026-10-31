import { Body, Controller, Get, Post, Put, Query, Req, Res } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { SyncService, SyncOp } from './sync.service';
import { DatabaseService, RequestUser } from '../database/database.service';
import { Public } from '../auth/public.decorator';
import { TicketService } from '../events/ticket.service';
import { SseService } from '../events/sse.service';
import { PgListenerService } from '../events/pg-listener.service';

@Controller('sync')
export class SyncController {
  constructor(
    private sync: SyncService,
    private ticket: TicketService,
    private sse: SseService,
    private pgListener: PgListenerService,
    private db: DatabaseService,
  ) {}

  @Get('snapshot')
  snapshot(@Req() req: { user: RequestUser }) {
    return this.sync.snapshot(req.user);
  }

  @Post('ops')
  ops(@Req() req: { user: RequestUser }, @Body() body: { ops?: SyncOp[] }) {
    return this.sync.applyOps(req.user, Array.isArray(body?.ops) ? body.ops : []);
  }

  @Put('settings')
  saveSettings(@Req() req: { user: RequestUser }, @Body() body: { settings?: unknown }) {
    return this.sync.saveSettings(req.user, body?.settings);
  }

  @Get('events-debug')
  async eventsDebug() {
    const { rows } = await this.db.withAdmin(c =>
      c.query(`SELECT COALESCE(MAX(id), 0)::int AS max_id, COUNT(*)::int AS total FROM public.sync_events`),
    );
    return {
      listener: this.pgListener.stats(),
      sse: this.sse.stats(),
      events: rows[0] ?? { max_id: 0, total: 0 },
      now: new Date().toISOString(),
    };
  }

  @Post('stream-ticket')
  streamTicket(@Req() req: { user: RequestUser }) {
    return this.ticket.createCrm(req.user);
  }

  @Public()
  @Get('stream')
  async stream(
    @Query('ticket') ticket: string,
    @Query('last_id') lastId: string,
    @Req() req: { headers?: Record<string, unknown> },
    @Res() reply: FastifyReply,
  ) {
    const origin = typeof req?.headers?.origin === 'string' ? req.headers.origin : undefined;
    await this.sse.connectCrm(ticket, Number(lastId) || 0, reply.raw, origin);
  }
}
