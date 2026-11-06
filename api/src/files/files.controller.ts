import { BadRequestException, Body, Controller, Get, HttpException, HttpStatus, NotFoundException, Param, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { FilesService } from './files.service';
import { Public } from '../auth/public.decorator';
import { AuthService } from '../auth/auth.service';
import { DatabaseService } from '../database/database.service';
import * as fs from 'fs';

const IMAGE_OR_PDF = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf']);
const UPLOAD_WINDOW_MS = 10 * 60 * 1000;
const UPLOAD_MAX = 30; // загрузок с одного IP за окно
const uploads = new Map<string, { count: number; resetAt: number }>();

const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv', txt: 'text/plain; charset=utf-8',
};

@Controller('files')
export class FilesController {
  constructor(private files: FilesService, private auth: AuthService, private db: DatabaseService) {}

  // Upload: либо CRM-токен (Authorization: Bearer), либо действующий токен ЛК поставщика в теле запроса.
  // Анонимная загрузка запрещена; плюс лимит загрузок с IP. GET остаётся публичным (картинки ЛК/форм).
  @Public()
  @Post()
  async upload(
    @Req() req: { headers: Record<string, string | undefined>; ip?: string },
    @Body() body: { base64?: string; name?: string; token?: string },
  ) {
    if (!body?.base64) throw new BadRequestException('Нет файла');
    this.rateLimit(req.ip || 'unknown');
    await this.assertCanUpload(req.headers.authorization, body.token);
    return this.files.save(String(body.base64), String(body.name || 'file'));
  }

  private rateLimit(ip: string) {
    const now = Date.now();
    const rec = uploads.get(ip);
    if (!rec || now > rec.resetAt) { uploads.set(ip, { count: 1, resetAt: now + UPLOAD_WINDOW_MS }); return; }
    rec.count += 1;
    if (rec.count > UPLOAD_MAX) throw new HttpException('Слишком много загрузок, попробуйте позже', HttpStatus.TOO_MANY_REQUESTS);
  }

  private async assertCanUpload(authorization?: string, lkToken?: unknown) {
    if (authorization?.startsWith('Bearer ')) {
      try { this.auth.verify(authorization.slice(7)); return; } catch { /* упадём к проверке токена ЛК */ }
    }
    if (typeof lkToken === 'string' && lkToken.length >= 16) {
      const { rows } = await this.db.withAdmin(c =>
        c.query(
          `SELECT 1 FROM public.suppliers
           WHERE service_access ->> 'token' = $1
             AND coalesce((service_access ->> 'enabled')::boolean, false) = true
             AND deleted_at IS NULL
           LIMIT 1`,
          [lkToken],
        ),
      );
      if (rows[0]) return;
    }
    throw new UnauthorizedException('Нет доступа к загрузке');
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
    res.header('X-Content-Type-Options', 'nosniff');
    if (!IMAGE_OR_PDF.has(ext)) res.header('Content-Disposition', 'attachment'); // docx/xlsx/csv/txt — только скачивание
    return fs.readFileSync(full);
  }
}
