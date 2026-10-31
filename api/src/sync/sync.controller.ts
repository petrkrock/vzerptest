import { Body, Controller, Get, Post, Put, Query, Req, Res } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { SyncService, SyncOp } from './sync.service';
import { RequestUser } from '../database/database.service';
import { Public } from '../auth/public.decorator';
import { TicketService } from '../events/ticket.service';
import { SseService } from '../events/sse.service';

@Controller('sync')
export class SyncController {
  constructor(
    private sync: SyncService,
    private ticket: TicketService,
    private sse: SseService,
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

  @Post('stream-ticket')
  streamTicket(@Req() req: { user: RequestUser }) {
    return this.ticket.createCrm(req.user);
  }

  @Public()
  @Get('stream')
  stream(
    @Query('ticket') ticket: string,
    @Query('last_id') lastId: string,
    @Res() reply: FastifyReply,
  ) {
    this.sse.connectCrm(ticket, Number(lastId) || 0, reply.raw);
  }
}
