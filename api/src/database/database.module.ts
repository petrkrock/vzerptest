import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service';

// Единая точка доступа к PostgreSQL. Пул держим здесь, клеймы — здесь же.
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
