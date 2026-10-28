import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { BuyersService } from './buyers.service';
import { RequestUser } from '../database/database.service';

@Controller('buyers')
export class BuyersController {
  constructor(private buyers: BuyersService) {}

  @Get()
  list(@Req() req: { user: RequestUser }) {
    return this.buyers.list(req.user, 'buyers');
  }

  @Get(':id')
  get(@Req() req: { user: RequestUser }, @Param('id') id: string) {
    return this.buyers.get(req.user, 'buyers', id);
  }

  @Post()
  create(@Req() req: { user: RequestUser }, @Body() body: Record<string, unknown>) {
    return this.buyers.create(req.user, 'buyers', body);
  }

  @Patch(':id')
  update(
    @Req() req: { user: RequestUser },
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.buyers.update(req.user, 'buyers', id, body);
  }

  @Delete(':id')
  remove(@Req() req: { user: RequestUser }, @Param('id') id: string) {
    return this.buyers.remove(req.user, 'buyers', id);
  }
}
