import { BadRequestException, Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

// Простое файловое хранилище: base64 JSON → диск. Имена — uuid + безопасное расширение.
const ALLOWED_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'pdf', 'docx', 'xlsx', 'csv', 'txt']);
const MAX_BYTES = 8 * 1024 * 1024;
// Сигнатуры (magic bytes): содержимое должно соответствовать расширению, а не только имени от клиента.
const MAGIC: Record<string, number[]> = {
  png: [0x89, 0x50, 0x4e, 0x47], jpg: [0xff, 0xd8, 0xff], jpeg: [0xff, 0xd8, 0xff],
  gif: [0x47, 0x49, 0x46, 0x38], webp: [0x52, 0x49, 0x46, 0x46], pdf: [0x25, 0x50, 0x44, 0x46],
  docx: [0x50, 0x4b, 0x03, 0x04], xlsx: [0x50, 0x4b, 0x03, 0x04],
};

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
    const sig = MAGIC[ext];
    if (sig && !sig.every((b, i) => buf[i] === b)) throw new BadRequestException('Содержимое файла не соответствует его типу');
    if (!sig && buf.includes(0)) throw new BadRequestException('Текстовый файл содержит бинарные данные');
    const name = `${randomUUID()}.${ext}`;
    fs.writeFileSync(path.join(this.dir, name), buf);
    return { url: `/files/${name}` };
  }

  resolve(name: string): string | null {
    const safe = path.basename(name); // защита от path traversal
    const full = path.join(this.dir, safe);
    return fs.existsSync(full) ? full : null;
  }
}
