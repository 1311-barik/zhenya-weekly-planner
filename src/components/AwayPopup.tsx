"use client";

import { useState } from "react";
import { addDays, fromDateKey, toDateKey } from "@/lib/week";

const MONTHS = [
  "янв", "фев", "мар", "апр", "мая", "июн",
  "июл", "авг", "сен", "окт", "ноя", "дек",
];
const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const PRESETS = [2, 3, 5, 7, 14];

export default function AwayPopup({
  defaultStart,
  onConfirm,
  onClose,
}: {
  defaultStart: string;
  onConfirm: (startDate: string, endDate: string) => void;
  onClose: () => void;
}) {
  const [start, setStart] = useState(defaultStart);
  const [days, setDays] = useState(7);
  const [error, setError] = useState("");

  // Дата возвращения = старт + (дней − 1); «вернулась» на следующий день.
  const endDate = start ? toDateKey(addDays(fromDateKey(start), Math.max(days, 1) - 1)) : "";
  const backDate = start ? toDateKey(addDays(fromDateKey(start), Math.max(days, 1))) : "";

  const human = (key: string) => {
    if (!key) return "";
    const d = fromDateKey(key);
    return `${WD[(d.getUTCDay() + 6) % 7]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  };

  function confirm() {
    if (!start) return setError("Женя, пожалуйста, укажи дату отъезда");
    if (days < 1) return setError("Пожалуйста, выбери хотя бы один день");
    onConfirm(start, endDate);
  }

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup" onClick={(e) => e.stopPropagation()}>
        <div className="popup-title serif">✈️ Я уезжаю</div>
        <p style={{ fontSize: 13, color: "var(--mid-gray)", marginBottom: 16 }}>
          Женя, на эти дни я поставлю «Отъезд» и оставлю их свободными.
          Остальные блоки в эти дни аккуратно уберутся.
        </p>

        <label className="form-label">Дата отъезда</label>
        <input
          className="form-input"
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />

        <label className="form-label">На сколько дней</label>
        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              className={`btn-ghost${days === p ? " active" : ""}`}
              style={{ padding: "5px 12px" }}
              onClick={() => setDays(p)}
            >
              {p}
            </button>
          ))}
        </div>
        <input
          className="form-input"
          type="number"
          min={1}
          max={90}
          value={days}
          onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))}
        />

        {start && (
          <div
            style={{
              fontSize: 13,
              color: "var(--charcoal)",
              background: "var(--cream)",
              border: "1px solid rgba(196,189,180,0.5)",
              borderRadius: 8,
              padding: "10px 12px",
              marginBottom: 14,
              lineHeight: 1.5,
            }}
          >
            🌿 Выходные: <b>{human(start)}</b> — <b>{human(endDate)}</b>
            <br />
            🏠 Возвращение: <b>{human(backDate)}</b>
          </div>
        )}

        {error && (
          <p style={{ color: "var(--terracotta)", fontSize: 12, marginBottom: 12 }}>
            {error}
          </p>
        )}

        <div className="popup-actions" style={{ justifyContent: "flex-end" }}>
          <button className="btn-ghost" onClick={onClose}>
            Отмена
          </button>
          <button className="btn-primary" onClick={confirm}>
            Уезжаю
          </button>
        </div>
      </div>
    </div>
  );
}
