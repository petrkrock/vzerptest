import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Res } from '@nestjs/common';
import { FilesService } from './files.service';
import { Public } from '../auth/public.decorator';
import * as fs from 'fs';

const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv', txt: 'text/plain; charset=utf-8',
};

@Controller('files')
export class FilesController {
  constructor(private files: FilesService) {}

  @Post()
  upload(@Body() body: { base64?: string; name?: string }) {
    if (!body?.base64) throw new BadRequestException('Нет файла');
    return this.files.save(String(body.base64), String(body.name || 'file'));
  }

  // @Res({ passthrough: true }) — Fastify-совместимо (sendFile — Express-only API).
  @Public()
  @Get(':name')
  download(@Param('name') name: string, @Res({ passthrough: true }) res: {
    header: (k: string, v: string) => void;
  }) {
    const full = this.files.resolve(name);
    if (!full) throw new NotFoundException('Файл не найден');
    const ext = name.split('.').pop()?.toLowerCase() || '';
    res.header('Content-Type', MIME[ext] || 'application/octet-stream');
    res.header('Cache-Control', 'public, max-age=31536000, immutable');
    return fs.readFileSync(full);
  }
}
