import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { DomainsService } from './domains.service';
import { RequestUser } from '../database/database.service';

@Controller('domains')
export class DomainsController {
  constructor(private domains: DomainsService) {}

  @Get()
  list(@Req() req: { user: RequestUser }) {
    return this.domains.list(req.user);
  }

  @Post()
  create(
    @Req() req: { user: RequestUser },
    @Body() body: { host?: string; name?: string; id?: string },
  ) {
    return this.domains.create(req.user, body);
  }

  @Patch(':id')
  update(
    @Req() req: { user: RequestUser },
    @Param('id') id: string,
    @Body() body: { is_active?: boolean },
  ) {
    return this.domains.update(req.user, id, body);
  }

  @Delete(':id')
  remove(@Req() req: { user: RequestUser }, @Param('id') id: string) {
    return this.domains.remove(req.user, id);
  }
}
