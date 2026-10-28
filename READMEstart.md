# READMEstart — запуск проекта с нуля (пошагово, для новичка)

> VZ ERP v1.33.3. Два режима: `supabase` (быстрый старт, без своего сервера) и `own` (полный свой стек).
> Команды ниже — для Windows PowerShell. На Linux/macOS отличий почти нет.

## 0. Что должно быть установлено

| Программа | Проверка | Где взять |
|---|---|---|
| Node.js 20+ | `node -v` | nodejs.org (LTS) |
| Git | `git --version` | git-scm.com |
| Docker (для own-режима) | `docker -v` | docker.com |

## 1. Скачать и установить проект

```powershell
# 1. Распаковать архив vz_erp_vX.Y.Z.zip в папку, например C:\VZCRM
# 2. Зайти в папку проекта
cd C:\VZCRM\vz_erp_v1.33.3

# 3. Установить зависимости фронта (один раз, ~2-5 минут)
npm install
```

## 2. Режим «supabase» — быстрый старт (5 минут)

Подходит, чтобы посмотреть систему. Нужен проект Supabase (бесплатный на supabase.com).

```powershell
# 1. Создать файл .env (скопировать из примера) и вписать свои ключи проекта Supabase
copy .env.example .env
# открыть .env в блокноте и заполнить VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY

# 2. Применить схему базы: открыть supabase/schema.sql целиком в
#    Supabase → SQL Editor → Run (один раз)

# 3. Запустить
npm run dev
# Открыть в браузере адрес из консоли (обычно http://localhost:5173)
```

**Демо-вход не требует пароля**: введите любой email из списка пользователей настроек (или admin@vz.tech) — при незаполненном Supabase вход подставляет локального админа (только для разработки!).

## 3. Режим «own» — свой стек (полный)

Нужны: Docker и база PostgreSQL 15.

```powershell
# ─── ШАГ 1. Поднять PostgreSQL 15 в Docker (один раз) ───
docker run -d --name vzpg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:15

# ─── ШАГ 2. Применить схему (в отдельном окне терминала) ───
# Windows (PowerShell):
Get-Content migrations\prod_baseline.sql | docker exec -i vzpg psql -U postgres -d postgres
# Linux/macOS:
cat migrations/prod_baseline.sql | docker exec -i vzpg psql -U postgres -d postgres
# ВАЖНО: prod_baseline — ТОЛЬКО для чистой базы. Существующей базе с данными
# применяйте недостающие номерные миграции (0002…0007) — см. MIGRATION.md.

# ─── ШАГ 3. Создать роли (один раз) ───
docker exec -it vzpg psql -U postgres -d postgres -c "CREATE ROLE app_user LOGIN PASSWORD 'app_pass'; GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO app_user; GRANT USAGE ON SCHEMA public TO app_user;"
docker exec -it vzpg psql -U postgres -d postgres -c "CREATE ROLE app_admin LOGIN PASSWORD 'admin_pass' BYPASSRLS;"

# ─── ШАГ 4. Настроить и запустить API ───
cd api
copy .env.example .env
# в .env указать:
#   DATABASE_URL=postgres://app_user:app_pass@localhost:5432/postgres
#   DATABASE_URL_ADMIN=postgres://app_admin:admin_pass@localhost:5432/postgres
#   JWT_SECRET=<любая длинная случайная строка>
npm install
npm run build
npm start
# Проверка: открыть http://localhost:3000/healthz → {"status":"ok"}
cd ..

# ─── ШАГ 5. Настроить фронт ───
copy .env.example .env   # если ещё нет
# в .env добавить:
#   VITE_API_MODE=own
#   VITE_API_URL=http://localhost:3000

# ─── ШАГ 6. Запустить фронт ───
npm run dev
# Открыть http://localhost:5173
```

**Первый вход в own-режиме**: пароль пользователя хранится в `profiles.password_hash` (bcrypt).
Задать его для админа (один раз, в терминале с Docker):

```powershell
# поставить bcrypt-хэш для пользователя admin-1 (email admin@vz.tech)
docker exec -it vzpg psql -U postgres -d postgres -c "UPDATE profiles SET password_hash='$2b$10$ЗДЕСЬ_ХЭШ' WHERE id='admin-1';"
# хэш сгенерировать можно онлайн-генератором bcrypt или командой node:
node -e "console.log(require('bcryptjs').hashSync('ВАШ_ПАРОЛЬ', 10))"
```

## 4. Памятка по командам терминала

| Команда | Где | Что делает |
|---|---|---|
| `npm install` | корень / api | установить зависимости (после распаковки или смены ветки) |
| `npm run dev` | корень | запустить фронт в режиме разработки (hot-reload) |
| `npm run build` | корень / api | собрать продакшн-бандл / скомпилировать API |
| `npm run preview` | корень | посмотреть собранный фронт локально |
| `npm run typecheck` | корень / api | проверить типы без сборки |
| `npm run start` | api | запустить скомпилированное API (нужен build) |
| `docker start vzpg` / `docker stop vzpg` | — | запустить/остановить локальную базу |
| `docker exec -it vzpg psql -U postgres -d postgres` | — | зайти в консоль SQL базы |
| `pg_prove -U postgres tests/rls_isolation.sql` | корень (нужен pgTAP) | прогнать тесты изоляции доменов |

## 5. Если что-то не запускается

1. **Порт занят** (`EADDRINUSE`): закройте программу, занявшую порт, или поменяйте PORT в .env.
2. **Ошибка авторизации в own**: проверьте DATABASE_URL (роль app_user), пароль в profiles (Шаг «Первый вход»).
3. **Пустые списки после входа**: в own-режиме проверьте, что миграции 0001 применены и в app_settings есть строка id='global'.
4. **CORS-ошибки в консоли браузера**: в dev-режиме VITE_API_URL должен указывать на порт API (3000).
