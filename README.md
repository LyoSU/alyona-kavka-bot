# Alyona Kavka — Telegram Sales Funnel Bot

Production-ready Telegram бот для воронки продажів Альони Кавки (HR-консультант, 18+ років досвіду).
Збудовано на **grammY + TypeScript + MongoDB**, єдиний Docker-deploy із бекапом і CRM через форум-групу.

---

## Що в коробці

- 25-нодова воронка з PDF (текст / фото / відео-кружки / кнопки)
- Telegram Payments + LiqPay; USD-ціни конвертуються в UAH через НБУ (з ручним override)
- Атомарна доставка цифрових уроків (mp4 з `protect_content`) — sweeper з retry до 5 спроб
- Заявки на консультації → окрема таблиця `appointments`
- CRM через форум-групу: 1 топік на користувача, профіль-картка піном
- Адмін-панель прямо в боті: редагування контенту/продуктів/уроків, керування командою, налаштування
- Гранулярні permissions (8 capabilities), додавання адмінів через `KeyboardButton.request_users`
- Розсилки з cursor-based ticker і 7 сегментами
- Статистика + CSV-експорти (users, purchases)
- Privacy: /pause, /resume, /delete_my_data (soft-delete PII)
- Long-polling через `@grammyjs/runner` (без webhook); auto-retry; throttler

---

## Швидкий старт (single-host деплой)

### 1. Передумови

- Docker 24+ та Docker Compose v2 на сервері
- Telegram Bot Token (через [@BotFather](https://t.me/BotFather))
- LiqPay provider token (BotFather → My Bots → Payments → LiqPay)
- Твій Telegram user ID (через [@userinfobot](https://t.me/userinfobot))

### 2. Setup

```bash
git clone <repo-url> alyona-bot && cd alyona-bot
cp .env.example .env
$EDITOR .env                  # заповни BOT_TOKEN, OWNER_TG_IDS, LIQPAY_PROVIDER_TOKEN, MASTER_KEY
openssl rand -hex 32          # → MASTER_KEY у .env

docker compose up -d --build
docker compose exec bot npm run seed   # одноразово; ідемпотентно
```

### 3. Перший запуск (адмін-чекліст)

1. Напиши боту `/start` — отримаєш статус owner (повні permissions).
2. Створи **форум-групу** в Telegram → ✏️ Edit → Topics: ON.
3. Додай бота у групу й зроби адміном з правами:
   - Manage topics ✅
   - Invite users ✅
4. У приватному чаті з ботом: `/admin` → ⚙️ Налаштування → **🔗 Підключити адмін-групу** → обери щойно створену групу.
5. Завантаж відео уроків: `/admin` → 🎬 Уроки (відео) → ➕ Завантажити новий урок.
6. У сидованих нодах замість `PENDING_UPLOAD` потрібні твої файли:
   - `/admin` → 📝 Контент воронки → знайди ноди з типом `photo` чи `video_note` → завантаж.
7. Додай помічників: `/admin` → 👥 Команда → ➕ Додати адміна → тапни на користувача в TG.
8. Виставити курс UAH/USD якщо хочеш зафіксований: `/admin` → ⚙️ Налаштування → 💱 Змінити курс.

---

## Архітектура

```
┌──────────┐   long-polling     ┌──────────┐
│ Telegram │ ◀──────────────── │   bot    │  ──► MongoDB
└──────────┘                    │ (Node 24)│  ──► Sentry (опц.)
                                └──────────┘
                                      │
                                      ▼
                                ┌──────────┐
                                │  Mongo   │  (named volume)
                                └──────────┘
                                      ▲
                                      │
                                ┌──────────┐
                                │ backup   │  ──► ./backups (host)
                                └──────────┘
```

- **bot** — TypeScript, бандл `dist/main.cjs` (~6.5 MB), запускається через `tini`
- **mongo** — MongoDB 7, single-node
- **backup** — sidecar контейнер, що раз на 24 год робить `mongodump` із 7-денною ротацією

---

## Структура коду

```
src/
├── bot/
│   ├── handlers/
│   │   ├── admin/        # /admin панель (8 модулів)
│   │   ├── lessons.ts    # «📚 Мої уроки» для юзерів
│   │   ├── plain-message.ts   # user → CRM relay
│   │   ├── admin-reply.ts     # CRM → user relay
│   │   ├── privacy.ts    # /pause /resume /delete_my_data /help /about
│   │   └── start.ts
│   ├── middlewares/      # user upsert, permissions, anti-spam
│   ├── keyboards/        # persistent reply-keyboard
│   ├── commands.ts       # setMyCommands
│   └── index.ts          # createBot()
├── domain/
│   ├── funnel/           # 25-нодова state-машина
│   ├── products/         # каталог
│   ├── lessons/          # відео-уроки
│   ├── payments/         # Telegram Payments + NBU exchange
│   ├── delivery/         # атомарна доставка (sweeper)
│   ├── broadcasts/       # cursor-based розсилки
│   ├── support/          # форум-топіки CRM
│   ├── stats/            # statistics + CSV export
│   └── users/            # upsert + permissions
├── db/                   # Mongo client + типізовані колекції
├── lib/                  # logger, secrets, sentry, html escaping
├── http/                 # /health endpoint
└── main.ts               # bootstrap
seed/                     # одноразова ініціалізація БД
tests/                    # vitest (unit + integration with real Mongo)
```

---

## Operations runbook

### Логи

```bash
docker compose logs -f bot          # бота
docker compose logs -f mongo
docker compose logs -f backup
```

### Health check

```bash
curl -s http://127.0.0.1:3000/health
# {"ok":true}
```

### Бекап і відновлення

Архіви накопичуються в `./backups/` як `alyona_bot-YYYY-MM-DD_HHMMSS.archive.gz`.

```bash
# Список бекапів
ls -lh backups/

# Ручний бекап
docker compose exec backup /usr/local/bin/backup.sh once

# Відновлення (зробить overwrite!)
docker compose exec backup mongorestore \
  --host=mongo --port=27017 \
  --archive=/backups/alyona_bot-2026-01-15_030000.archive.gz \
  --gzip --drop
```

### Перезапуск після оновлення коду

```bash
git pull
docker compose up -d --build bot     # лише bot, mongo не чіпаємо
```

### Очистити webhook (якщо помилково був виставлений)

Бот сам викликає `deleteWebhook` на старті — нічого не треба робити.

### Скидання адмін-групи

`/admin` → ⚙️ Налаштування → 🧹 Скинути адмін-групу → 🔗 Підключити заново.

### Передати owner-доступ іншому

1. У `.env` додати/замінити `OWNER_TG_IDS` (CSV-список TG ID).
2. `docker compose up -d bot` — рестарт; нові owner-и отримають повні permissions при наступному `/start`.

### Видалити юзера повністю (на запит)

User робить `/delete_my_data` сам. Якщо потрібно знадвору:

```bash
docker compose exec mongo mongosh alyona_bot --eval '
  db.users.updateOne(
    { tg_id: 123456 },
    { $set: { deleted_at: new Date(), first_name: "deleted", funnel_paused: true },
      $unset: { last_name: "", username: "", current_node_id: "" } }
  );
  db.support_topics.deleteOne({ user_tg_id: 123456 });
'
```

---

## Локальний розробницький запуск

```bash
nvm use                                          # Node 24
npm ci
docker run -d --name dev-mongo -p 27017:27017 mongo:7
cp .env.example .env                             # MONGO_URI=mongodb://localhost:27017
npm run seed
npm run dev                                      # tsx watch
```

### Tests

```bash
npm test                # vitest run (84+ тестів)
npm run lint            # biome check
npm run typecheck       # tsc --noEmit
```

Integration tests піднімають Mongo через testcontainers — потрібен Docker.

---

## Безпека

- `MASTER_KEY` (32 байти) шифрує LiqPay token у Mongo через libsodium secretbox
- Лог-redact (`pino`) приховує `username`, `first_name`, `last_name`, `text`, `caption`
- `protect_content: true` на всіх відео-уроках — TG не дає forward/save
- Унікальний index на `purchases.provider_payment_id` → ідемпотентність `successful_payment`
- HTML parse_mode + ескейпінг скрізь — динамічний контент не зламає рендер
- Гранулярні permissions (8) — assistant-и отримують лише `support` за замовчуванням

---

## Що далі (roadmap)

- Telegram Payments refund flow (Phase 14)
- Bot identity через BotFather (avatar, description, short description)
- Smoke test з реальним токеном після завершення завантаження медіа
