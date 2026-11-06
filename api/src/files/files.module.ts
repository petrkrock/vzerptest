import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';

// v1.34.0: файлы (баннеры ЛК, база знаний) — заменяет storage-бакеты Supabase.
// Хранение: локальный volume (env UPLOAD_DIR, по умолчанию ./uploads в контейнере).
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [FilesController],
  providers: [FilesService],
})
export class FilesModule {}