import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { BuyersModule } from './buyers/buyers.module';
import { LkModule } from './lk/lk.module';
import { EmailModule } from './email/email.module';
import { SyncModule } from './sync/sync.module';
import { DomainsModule } from './domains/domains.module';
import { PublicModule } from './public/public.module';
import { CheckoModule } from './checko/checko.module';
import { FilesModule } from './files/files.module';
import { LogsModule } from './logs/logs.module';
import { EventsModule } from './events/events.module';

// v1.34.0: Supabase вырезан — все модули живут здесь (checko/files/logs — замена storage/edge).
@Module({
  imports: [DatabaseModule, AuthModule, HealthModule, SuppliersModule, BuyersModule, LkModule, EmailModule, SyncModule, DomainsModule, PublicModule, CheckoModule, FilesModule, LogsModule, EventsModule],
})
export class AppModule {}
