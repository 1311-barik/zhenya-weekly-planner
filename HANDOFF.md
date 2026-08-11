# Context Handoff
- cwd: /Users/shura/Claude/planner
- branch: main
- saved: 2026-08-11
- method: manual

## Goal
Недельный планировщик **sheyn's planner** для Жени. Продолжить разработку в новом чате.
Прод живой: **http://135.181.197.13**. PWA устанавливается с технического
HTTPS-адреса **https://planner-135-181-197-13.nip.io**.

## Current State
Фазы 1–3 готовы. Последний пакет включает надёжную блокировку нативного скролла
Telegram/iOS WebView во время переноса, распознавание «весь день», полную
документацию и PWA-установку с собственной иконкой.

### Remaining (что осталось)
1. **Собственный домен** — необязателен: PWA работает через бесплатный
   технический HTTPS-адрес. Позже его можно заменить красивым поддоменом.
2. **Настройки из UI** — предел норм 19:00 и пресет «весь день» 10 часов пока
   меняются только в `src/lib/config.ts`.

## Key Context
- **Стек:** Next.js 16 (App Router), TypeScript, Tailwind v4, Prisma 6 + SQLite.
  Кастомный pointer-based drag/resize (не dnd-kit). Node 24 локально, 20.20 на сервере.
- **Git:** планировщик — ОТДЕЛЬНЫЙ репозиторий `/Users/shura/Claude/planner/.git`.
  НЕ коммитить в домашний репо `/Users/shura` (там .ssh-ключи, секреты).
- **Сервер:** SSH `ssh -i ~/.ssh/familybot root@135.181.197.13`. Код в `/var/www/planner`.
  systemd `planner` (порт 3100), nginx server_name по IP. Отдельная SQLite на проде.
- **Деплой:** `rsync -az --delete --exclude node_modules --exclude .next --exclude .git
  --exclude 'prisma/dev.db*' --exclude .env -e "ssh -i ~/.ssh/familybot" ./
  root@135.181.197.13:/var/www/planner/` → на сервере `npm run build && systemctl restart planner`.
- **Скриншот недели:** `/api/screenshot?week=` рендерит `/print` через Playwright/Chromium.
  На сервере: playwright + `npx playwright install --with-deps chromium` + `fonts-noto-color-emoji`.
- **Расписание повторов:** `RECURRING_EVENTS` в `src/lib/config.ts` — Йога Пн 18:30,
  Инна Вт 13:00, Роберт Вт 14:00, Роберт Пт 11:00, Инна Пт 13:00. Флаг `recurring` на Block.
- **Нормы:** Ателье 2×4ч (`kind=atelier`), Спорт 2×3ч (`kind=gym`). «Качалка» переименована
  в «Спорт» (только label; kind=gym внутри).

## Files Modified (ключевые)
- `src/components/Planner.tsx` — главный: drag/resize, лоток норм, мастер-колбэки,
  `wizardPlaceAll` (парсинг+расстановка), попап-подсказки `appNotices`
- `src/components/WeekWizard.tsx` — мастер (2 шага: постоянные события + разовые дела одной кнопкой)
- `src/lib/parseOneoff.ts` — парсер дня, времени, диапазона, длительности и «весь день»
- `src/lib/config.ts`, `week.ts`, `store.ts`, `client.ts`, `blockRules.ts` (findOverlap/findSameNorm)
- `src/app/api/` — week, blocks, tasks, day-off, away, templates, stats, export, screenshot, login
- `src/app/print/page.tsx` — статичная сетка для скриншота
- `src/components/` — StatsPanel, TemplateEditor, AwayPopup, EditBlockPopup
- README.md, CHANGELOG.md

## Decisions
- **Telegram-бот УДАЛЁН** — уведомления теперь попапом (`appNotices`). Файлы `bot/`, `deploy/`,
  сервис `planner-bot` убраны. Старый бот-токен стоит перевыпустить в @BotFather.
- **Разовые дела:** свободный текст + одна кнопка «расставить» (парсинг), НЕ per-item выбор дня.
- **Обратимость:** стек «Отменить» покрывает блоки, задачи, шаблоны, выходной,
  отъезд и пакетную расстановку; перенос блоков также умеет обмен местами.
- **Мобильный drag:** начинается только за ручку ↕; тело блока скроллит список.
  Во время drag нативный `touchmove` блокируется, а автоскролл контейнера остаётся.
- **PWA:** manifest — `src/app/manifest.ts`, иконки — `public/icons/`, сохранённый
  Nginx-конфиг — `deploy/planner.nginx`.
- **Секреты:** токены/ключи в конфиг вписывает пользователь сам (не я).
- **«Параллельного агента» НЕТ** — En-коммиты (Soften language, mobile drag) это авто-правки
  среды/линтера (пользователь подтвердил).

## Errors Resolved
- Prisma 7 → откат на Prisma 6.
- dev-Turbopack не подхватывает новый CSS → `rm -rf .next/dev` + рестарт preview.
- Дубли повторов и попапов вычищены. firstFreeStart теперь `number|null` — учтено.

## Tool Usage
- Preview: `.claude/launch.json` конфиг `planner`. Мобильный тест — preview_resize preset mobile,
  драг симулировать PointerEvent через preview_eval.
- Память проекта: `~/.claude/projects/-Users-shura/memory/project_weekly_planner.md`.
