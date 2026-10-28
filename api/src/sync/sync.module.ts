import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

// v1.32.7: синк стора. Один снапшот + батч-операции diff (как у мапперов Supabase).
@Module({
  imports: [DatabaseModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
