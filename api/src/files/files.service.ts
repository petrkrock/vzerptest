import { BadRequestException, Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

// Простое файловое хранилище: base64 JSON → диск. Имена — uuid + безопасное расширение.
const ALLOWED_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'pdf', 'docx', 'xlsx', 'csv', 'txt']);
const MAX_BYTES = 8 * 1024 * 1024;

@Injectable()
export class FilesService {
  private dir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

  constructor() {
    fs.mkdirSync(this.dir, { recursive: true });
  }

  save(base64: string, originalName: string): { url: string } {
    const m = base64.match(/^data:([\w/+.-]+);base64,(.+)$/);
    if (!m) throw new BadRequestException('Некорректный файл (ожидается base64 data-url)');
    const buf = Buffer.from(m[2], 'base64');
    if (!buf.length) throw new BadRequestException('Пустой файл');
    if (buf.length > MAX_BYTES) throw new BadRequestException('Файл больше 8 МБ');
    const ext = (originalName.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_EXT.has(ext)) throw new BadRequestException(`Тип файла не поддерживается: .${ext}`);
    // svg — потенциальный вектор: отдаём только с image/svg+xml и без inline-скриптов не гарантируем — запрещаем.
    if (ext === 'svg') throw new BadRequestException('SVG не принимается (XSS-риск)');
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
    fs.writeFileSync(path.join(this.dir, name), buf);
    return { url: `/files/${name}` };
  }

  resolve(name: string): string | null {
    const safe = path.basename(name); // защита от path traversal
    const full = path.join(this.dir, safe);
    return fs.existsSync(full) ? full : null;
  }
}
