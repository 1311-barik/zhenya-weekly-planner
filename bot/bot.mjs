// Telegram-бот планировщика (Фаза 2).
// Самостоятельный воркер: читает ту же SQLite-БД через Prisma,
// шлёт уведомления и отвечает на команды /today и /start.
//
// Запуск: node --env-file=.env bot/bot.mjs
// Нужно в .env: TELEGRAM_BOT_TOKEN (обязательно), TELEGRAM_CHAT_ID (для рассылок).
// Часовой пояс расписаний берётся из TZ (по умолчанию Europe/Bratislava).

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
let CHAT = process.env.TELEGRAM_CHAT_ID || null;

if (!TOKEN) {
  console.error("[bot] TELEGRAM_BOT_TOKEN не задан — бот не запускается. Добавь токен в .env.");
  process.exit(0); // не падаем в рестарт-цикл
}

const API = `https://api.telegram.org/bot${TOKEN}`;

// ───────── Даты (UTC-полночь как календарный день) ─────────
const pad = (n) => String(n).padStart(2, "0");
const fmtTime = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function utcMidnight(y, mo, d) {
  return new Date(Date.UTC(y, mo, d));
}
function addDays(d, n) {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}
function startOfWeek(d) {
  const dow = (d.getUTCDay() + 6) % 7;
  return addDays(d, -dow);
}
// «Сегодня» по локальному времени сервера (TZ задаётся окружением).
function todayDate() {
  const n = new Date();
  return utcMidnight(n.getFullYear(), n.getMonth(), n.getDate());
}

const NORMS = {
  atelier: { label: "Ателье", emoji: "🧵", required: 2, min: 240 },
  gym: { label: "Качалка", emoji: "🏋️", required: 2, min: 180 },
};

// ───────── Данные ─────────
async function blocksOn(date) {
  return prisma.block.findMany({ where: { date }, orderBy: { start: "asc" } });
}
async function weekBlocks(date) {
  const ws = startOfWeek(date);
  return prisma.block.findMany({
    where: { date: { gte: ws, lt: addDays(ws, 7) } },
  });
}
function normState(blocks) {
  return Object.entries(NORMS).map(([type, cfg]) => {
    const done = blocks.filter(
      (b) => b.kind === type && b.done && b.duration >= cfg.min
    ).length;
    return { type, cfg, done, complete: done >= cfg.required };
  });
}

// ───────── Тексты ─────────
async function todayText(prefix) {
  const bs = await blocksOn(todayDate());
  if (!bs.length) return `${prefix}На сегодня блоков нет — чистый день 🌿`;
  const lines = bs.map((b) => `• ${fmtTime(b.start)} — ${b.title}${b.done ? " ✓" : ""}`);
  return `${prefix}<b>План на сегодня</b>\n${lines.join("\n")}`;
}
async function normReminderText() {
  const state = normState(await weekBlocks(todayDate()));
  if (state.every((s) => s.complete)) return null; // норма закрыта — не беспокоим
  const parts = state.map(
    (s) => `${s.cfg.emoji} ${s.cfg.label} ${s.done}/${s.cfg.required}`
  );
  return `Норма недели: ${parts.join(", ")} — ещё есть время до выходных 💪`;
}

// ───────── Telegram API ─────────
async function send(text, chatId = CHAT) {
  if (!chatId) return;
  try {
    const r = await fetch(`${API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    if (!r.ok) console.error("[bot] sendMessage", r.status, await r.text());
  } catch (e) {
    console.error("[bot] send error", e.message);
  }
}

// ───────── Long-polling команд ─────────
async function pollLoop() {
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const r = await fetch(`${API}/getUpdates?timeout=30&offset=${offset}`);
      const data = await r.json();
      if (!data.ok) {
        await sleep(3000);
        continue;
      }
      for (const u of data.result) {
        offset = u.update_id + 1;
        const msg = u.message;
        if (!msg || !msg.text) continue;
        const chatId = msg.chat.id;
        const text = msg.text.trim().toLowerCase();
        if (text.startsWith("/start")) {
          await send(
            `Привет! Я планировщик-бот 🗓\nТвой chat_id: <code>${chatId}</code>\n\nДобавь его в .env (TELEGRAM_CHAT_ID), и я начну присылать утренние сводки и напоминания. Команда /today — план на сегодня.`,
            chatId
          );
          if (!CHAT) CHAT = String(chatId); // чтобы /today работал сразу
        } else if (text.startsWith("/today")) {
          await send(await todayText(""), chatId);
        }
      }
    } catch (e) {
      console.error("[bot] poll error", e.message);
      await sleep(3000);
    }
  }
}

// ───────── Планировщик уведомлений ─────────
const fired = new Set(); // ключи «уже отправлено», сбрасываются в полночь
let lastDayKey = "";

async function tick() {
  const now = new Date();
  const hh = now.getHours();
  const mm = now.getMinutes();
  const dow = (now.getDay() + 6) % 7; // 0=Пн … 6=Вс
  const dayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  if (dayKey !== lastDayKey) {
    fired.clear();
    lastDayKey = dayKey;
  }
  const once = (key, fn) => {
    if (fired.has(key)) return;
    fired.add(key);
    fn();
  };

  if (!CHAT) return; // без chat_id рассылки невозможны

  // Утренняя сводка — 08:00
  if (hh === 8 && mm === 0) once(`${dayKey}-morning`, async () =>
    send(await todayText("Доброе утро! ☀️\n"))
  );

  // Пятница 18:00 — напоминание о незакрытой норме
  if (dow === 4 && hh === 18 && mm === 0)
    once(`${dayKey}-norm`, async () => {
      const t = await normReminderText();
      if (t) send(t);
    });

  // Воскресенье 20:00 — анонс новой недели
  if (dow === 6 && hh === 20 && mm === 0)
    once(`${dayKey}-newweek`, () =>
      send("Новая неделя на пороге — загляни в планировщик и собери её ✨")
    );

  // За 30 минут до блока — напоминание
  const target = hh * 60 + mm + 30;
  const bs = await blocksOn(todayDate());
  for (const b of bs) {
    if (b.start === target && !b.done) {
      once(`${dayKey}-pre-${b.id}`, () =>
        send(`Через 30 минут: <b>${b.title}</b> в ${fmtTime(b.start)} ⏰`)
      );
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function schedulerLoop() {
  // выравниваемся на начало минуты
  await sleep((60 - new Date().getSeconds()) * 1000);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await tick();
    } catch (e) {
      console.error("[bot] tick error", e.message);
    }
    await sleep(60000);
  }
}

console.log(
  `[bot] запущен. TZ=${process.env.TZ || "(system)"}, chat_id=${CHAT || "(не задан — пришли боту /start)"}`
);
pollLoop();
schedulerLoop();
