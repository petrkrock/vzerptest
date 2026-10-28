# README.SERVER — Раздел «Сервер» и подключение своего домена

> Это дополнение к основному `README.md`. Здесь описан встроенный мониторинг VPS
> (раздел «Сервер» в CRM) и пошаговое подключение собственного домена с SSL.

---

## 1. Раздел «Сервер» в CRM

Раздел доступен только **главному администратору** (роль `admin`): в боковом меню
«Система → Сервер». На Vercel-версии показывает подсказку, на self-hosted — живые данные.

### 1.1. Что показывает

| Блок | Содержимое |
|---|---|
| **Аптайм приложения** | Сколько времени работает Node-процесс CRM (дни/часы/минуты) |
| **Память сервера** | Занято CRM-процессом + свободно/всего на VPS |
| **Загрузка CPU** | Средняя нагрузка 1 / 5 / 15 минут, версия Node и ОС |
| **SSL-сертификат** | Краткий статус: валиден ли сертификат и дата истечения |
| **Процессы (PM2)** | Таблица всех PM2-процессов: имя, PID, статус (online/error), аптайм, CPU %, память |
| **Логи → Приложение** | Последние ~150 строк stdout и stderr CRM (файлы `crm-out.log`, `crm-error.log` в PM2) |
| **Логи → Nginx** | error.log и access.log веб-сервера |
| **SSL подробно** | Полный вывод `certbot certificates`: все домены, сроки, пути |

### 1.2. Что умеет

- **«Обновить»** — перечитать все данные;
- **«Перезапустить приложение»** — `pm2 restart crm` одной кнопкой (с подтверждением;
  защита от частых нажатий — максимум 3 перезапуска в минуту);
- переключение вкладок логов и их ручное обновление.

### 1.3. Как устроено (для понимания и отладки)

```
Браузер админа ──HTTPS──▶ Nginx ──▶ 127.0.0.1:3000 ──▶ monitor-server.js
                                         │                    │
                                    раздаёт dist/        /api/* → проверка JWT
                                    (фронтенд CRM)       и роль admin → pm2, логи, certbot
```

Файл `server/monitor-server.js` заменяет статический `serve`: это Node-сервер
без внешних зависимостей (~200 строк), который одновременно отдаёт фронтенд
и обслуживает API мониторинга. Запускается через PM2 как обычное приложение.

**Контуры безопасности моста:**

1. Каждый запрос к `/api/*` требует `Authorization: Bearer <Supabase JWT>`;
2. Сервер проверяет токен через `https://<проект>.supabase.co/auth/v1/user`;
3. Затем по `service_role`-ключу (только на сервере, в браузер не попадает)
   читает таблицу `profiles` и требует `role = 'admin'` — иначе `403`;
4. Логи читаются только из фиксированного списка файлов — обход путей невозможен;
5. Перезапуск — rate limit 3/мин; эндпоинты не делают CORS (same-origin только).

**Переменные окружения сервера** (в `.env` на VPS, см. `.env.example`):

| Переменная | Назначение | По умолчанию |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | уже нужны фронтенду | — |
| `SUPABASE_SERVICE_ROLE_KEY` | **обязательна для /api** — берётся в Supabase → Settings → API | — |
| `PORT` | порт прослушивания | `3000` |
| `PM2_APP_NAME` | имя процесса для логов и рестарта | `crm` |
| `PM2_LOG_DIR` | каталог логов PM2 | `~/.pm2/logs` |
| `NGINX_ERROR_LOG`, `NGINX_ACCESS_LOG` | пути к логам Nginx | `/var/log/nginx/*.log` |

**Типовые проблемы:**

| Симптом в разделе «Сервер» | Причина | Решение |
|---|---|---|
| «Мониторинг доступен только на self-hosted» | CRM работает на Vercel или мост не запущен | `pm2 start server/monitor-server.js --name crm` |
| «На сервере не задан SUPABASE_SERVICE_ROLE_KEY» | нет сервисного ключа в `.env` | добавить и `pm2 restart crm` |
| «Требуется роль администратора» | вошли не под admin | войти под главным администратором |
| «pm2 недоступен» | PM2 не установлен или процесс иное имя | `npm i -g pm2`, проверить `PM2_APP_NAME` |
| Логи пустые | другой каталог PM2 | задать `PM2_LOG_DIR` в `.env` |

---

## 2. Подключение своего домена (пошагово)

Схема: `https://crm.вашдомен.ru` → DNS вашего регистратора → IP VPS → Nginx → CRM.
Ниже два пути: рекомендуемый (A-запись) и альтернативный (Cloudflare).

### Шаг 0. Что должно быть уже сделано

- VPS арендован, на нём по инструкции из `README.md` (вариант Б) работает CRM:
  `pm2 start server/monitor-server.js --name crm` слушает `127.0.0.1:3000`;
- Открыт порт 80 и 443: `sudo ufw allow 80/tcp && sudo ufw allow 443/tcp` (или аналог вашего файрвола);
- Вы знаете IP VPS (в панели хостинга).

### Шаг 1. DNS: создать A-запись

В панели регистратора домена (reg.ru, Timeweb, Cloudflare и т.п.) зайдите в
управление DNS-зоной и добавьте запись:

```
Тип:  A
Имя:  crm            (получится crm.вашдомен.ru; для корня — @ или пусто)
Значение:  <IP вашего VPS>
TTL:  300
```

Проверка распространения (с вашего компьютера):
```bash
ping crm.вашдомен.ru        # должен отвечать IP VPS
dig +short crm.вашдомен.ru  # то же самое точнее
```
Распространение — от 5 минут до пары часов (зависит от TTL и провайдера).

### Шаг 2. Nginx: виртуальный хост

```bash
sudo nano /etc/nginx/sites-available/crm
```
Вставьте (домен замените на свой):
```nginx
server {
    listen 80;
    server_name crm.вашдомен.ru;

    # Раздел «Сервер» и SEO: не индексируем
    add_header X-Robots-Tag "noindex, nofollow, noarchive" always;

    # ОПТИМИЗАЦИЯ: Vite-ассеты (JS/CSS-чанки с хешами в именах) отдаём
    # напрямую из Nginx — быстрее, чем через Node, + кэш на год в браузере.
    # Путь = каталог со сборкой (там, где лежит dist после npm run build).
    location /assets/ {
        root /home/user/crm/dist;           # ← ЗАМЕНИТЕ на путь к вашей сборке
        expires 365d;
        add_header Cache-Control "public, immutable";
        gzip_static on;                      # отдаёт .gz, если есть рядом с файлом
        add_header X-Content-Type-Options "nosniff" always;
        try_files $uri =404;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # WebSocket/Realtime (Supabase Realtime, HMR не нужен — прод)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
```
> Блок `/assets/` — единственное, что требует правки: замените `root` на путь к вашему
> `dist` (тот же каталог, который собирает `npm run build`). index.html, манифест и
> service worker специально НЕ кэшируются — иначе после обновления CRM пользователи
> бы видели старую версию.

Активация и проверка:
```bash
sudo ln -s /etc/nginx/sites-available/crm /etc/nginx/sites-enabled/
sudo nginx -t                    # должно быть: syntax is ok / test is successful
sudo systemctl reload nginx
```
На этом моменте `http://crm.вашдомен.ru` уже должен открывать CRM.

### Шаг 3. SSL через Let's Encrypt (бесплатно, авто-продление)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d crm.вашдомен.ru
```
Certbot сам: получит сертификат, перепишет конфиг Nginx на 443 + редирект с http,
настроит авто-продление (проверка: `sudo certbot renew --dry-run`).
Теперь сайт открывается по `https://crm.вашдомен.ru` с зелёным замком.

### Шаг 4. Проверка

1. Открыть `https://crm.вашдомен.ru` — вход в CRM;
2. Войти под admin → «Система → Сервер»: в карточке SSL виден статус VALID,
   в «Логи → Nginx» видны первые access-записи — значит цепочка домен → Nginx → CRM работает;
3. Публичные формы: `https://crm.вашдомен.ru/forms/supplier` должны открываться
   без входа (проверить в режиме инкогнито).

### Альтернатива: Cloudflare перед сервером

Если хотите скрыть IP VPS / получить CDN: добавьте домен в Cloudflare, создайте там
A-запись на IP VPS, на DNS-запросах включите «Proxy» (оранжевое облако). Важно:
в SSL/TLS-режиме Cloudflare выберите **Full** (не Flexible), иначе будут циклические
редиректы. Сертификат на VPS выпускается всё равно (Шаг 3), Cloudflare его использует
для связи с origin.

### Частые ошибки

| Проблема | Причина | Решение |
|---|---|---|
| «Сайт не открывается» по домену | DNS ещё не распространился / не тот IP | `dig +short`, подождать, проверить A-запись |
| 502 Bad Gateway | CRM-мост не запущен или порт иной | `pm2 status`, `pm2 logs crm`, проверить `PORT` |
| Ошибка сертификата | A-запись появилась после certbot | повторить `sudo certbot --nginx -d ...` |
| Циклический редирект (Cloudflare) | режим Flexible | переключить на Full |
| Формы открываются, но не отправляются | в Supabase не задан Site URL / redirect URLs | Supabase → Authentication → URL Configuration: добавить `https://crm.вашдомен.ru` |

---

## 3. Итоговая карта системы после подключения домена

```
Поставщик/менеджер в России
   │ https://crm.вашдомен.ru
   ▼
Nginx (443, SSL Let's Encrypt, gzip, noindex)
   │ proxy_pass
   ▼
monitor-server.js :3000  ── раздаёт dist/ (фронтенд CRM, PWA)
   │                            └── /api/* → мониторинг (admin JWT only)
   ▼
Supabase Cloud (PostgreSQL + Auth + Edge Functions) ── бэкап-дамп раз в неделю на VPS
```
