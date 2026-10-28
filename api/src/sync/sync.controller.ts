import { Body, Controller, Get, Post, Put, Req } from '@nestjs/common';
import { SyncService, SyncOp } from './sync.service';
import { RequestUser } from '../database/database.service';

@Controller('sync')
export class SyncController {
  constructor(private sync: SyncService) {}

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
}
