import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { DomainsController } from './domains.controller';
import { DomainsService } from './domains.service';

// v1.32.9: домены-арендаторы (SettingsPage). CRUD через view public.domains —
// RLS-политика domains_admin_all (admin-only) фильтрует сама.
@Module({
  imports: [DatabaseModule],
  controllers: [DomainsController],
  providers: [DomainsService],
})
export class DomainsModule {}
