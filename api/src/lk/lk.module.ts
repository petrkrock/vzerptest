import { Module } from '@nestjs/common';
import { LkController } from './lk.controller';
import { LkService } from './lk.service';
import { DatabaseModule } from '../database/database.module';

// ЛК поставщика по токену — публичный модуль (аналог edge function supplier-service).
@Module({
  imports: [DatabaseModule],
  controllers: [LkController],
  providers: [LkService],
})
export class LkModule {}