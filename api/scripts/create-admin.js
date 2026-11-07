// Создаёт/обновляет учётную запись первого администратора (admin@vz.tech).
// Запуск в контейнере API (Coolify → API → Terminal):  ADMIN_PASSWORD='ваш-пароль-от-12-символов' node scripts/create-admin.js
// Берёт DATABASE_URL_ADMIN из окружения API. Пароль нигде не хранится — только bcrypt-хеш в profiles.
// id и email совпадают с администратором по умолчанию в настройках CRM (src/lib/store.ts) — иначе вход не пройдёт.
const bcrypt = require('bcryptjs');
const { Client } = require('pg');

const ADMIN_ID = '00000000-0000-4000-8000-000000000099';
const ADMIN_EMAIL = 'admin@vz.tech';

(async () => {
  const url = process.env.DATABASE_URL_ADMIN;
  const password = process.env.ADMIN_PASSWORD || '';
  if (!url) { console.error('Не задан DATABASE_URL_ADMIN'); process.exit(1); }
  if (password.length < 12) { console.error('ADMIN_PASSWORD обязателен, минимум 12 символов'); process.exit(1); }

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO public.profiles (id, email, role, password_hash) VALUES ($1, $2, 'admin', $3)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, role = 'admin', password_hash = EXCLUDED.password_hash`,
      [ADMIN_ID, ADMIN_EMAIL, bcrypt.hashSync(password, 10)],
    );
    console.log(`Администратор ${ADMIN_EMAIL} готов. Войдите в CRM и создайте личную учётную запись в Настройки → Пользователи.`);
  } finally {
    await client.end();
  }
})().catch(e => { console.error('Ошибка:', e.message); process.exit(1); });
