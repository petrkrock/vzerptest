import { BadRequestException, Body, Controller, ForbiddenException, Param, Patch, Post, Req } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { DatabaseService, RequestUser } from '../database/database.service';

// v1.34.0: управление входами пользователей — заменяет Edge Functions create-manager/update-manager.
// profiles доступна read-only для authenticated → только admin (проверка is_admin) и через withAdmin.
@Controller('auth/users')
export class AuthUsersController {
  constructor(private db: DatabaseService) {}

  private async assertAdmin(user: RequestUser) {
    const { rows } = await this.db.withClaims(user, c =>
      c.query(`SELECT (SELECT is_admin()) AS ok`),
    );
    if (!rows[0]?.ok) throw new ForbiddenException('Только администратор');
  }

  @Post()
  async create(
    @Req() req: { user: RequestUser },
    @Body() body: { email?: string; password?: string; name?: string },
  ) {
    await this.assertAdmin(req.user);
    const email = (body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new BadRequestException('Некорректный email');
    if (password.length < 6) throw new BadRequestException('Пароль минимум 6 символов');
    const id = crypto.randomUUID();
    const hash = await bcrypt.hash(password, 10);
    await this.db.withAdmin(c =>
      c.query(
        `INSERT INTO public.profiles (id, email, role, password_hash) VALUES ($1, $2, 'user', $3)`,
        [id, email, hash],
      ),
    );
    return { id, email };
  }

  @Patch(':id')
  async update(
    @Req() req: { user: RequestUser },
    @Param('id') id: string,
    @Body() body: { password?: string; ban_duration?: string },
  ) {
    await this.assertAdmin(req.user);
    if (body.password) {
      if (String(body.password).length < 6) throw new BadRequestException('Пароль минимум 6 символов');
      const hash = await bcrypt.hash(String(body.password), 10);
      await this.db.withAdmin(c =>
        c.query(`UPDATE public.profiles SET password_hash = $1 WHERE id = $2`, [hash, id]),
      );
    }
    // Бан: обнуляем хэш (вход невозможен). Разбан — только новый пароль (старый не храним).
    if (body.ban_duration && body.ban_duration !== 'none') {
      await this.db.withAdmin(c =>
        c.query(`UPDATE public.profiles SET password_hash = NULL WHERE id = $1`, [id]),
      );
    }
    return { id };
  }
}
