import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { RequestUser } from '../database/database.service';

@Controller('suppliers')
export class SuppliersController {
  constructor(private suppliers: SuppliersService) {}

  @Get()
  list(@Req() req: { user: RequestUser }) {
    return this.suppliers.list(req.user, 'suppliers');
  }

  @Get(':id')
  get(@Req() req: { user: RequestUser }, @Param('id') id: string) {
    return this.suppliers.get(req.user, 'suppliers', id);
  }

  @Post()
  create(@Req() req: { user: RequestUser }, @Body() body: Record<string, unknown>) {
    return this.suppliers.create(req.user, 'suppliers', body);
  }

  @Patch(':id')
  update(
    @Req() req: { user: RequestUser },
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.suppliers.update(req.user, 'suppliers', id, body);
  }

  @Delete(':id')
  remove(@Req() req: { user: RequestUser }, @Param('id') id: string) {
    return this.suppliers.remove(req.user, 'suppliers', id);
  }
}
