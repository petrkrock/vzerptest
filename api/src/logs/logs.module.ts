import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { LogsController } from './logs.controller';

// v1.35.0: клиентские логи (app_logs) — фронт шлёт POST /logs.
@Module({
  imports: [DatabaseModule],
  controllers: [LogsController],
})
export class LogsModule {}
