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
  const [daysInput, setDaysInput] = useState("");
  const [error, setError] = useState("");
  const days = Number(daysInput);
  const validDays = Number.isInteger(days) && days >= 1 && days <= 90;
  const previewDays = validDays ? days : null;

  // Дата возвращения = старт + (дней − 1); «вернулась» на следующий день.
  const endDate =
    start && previewDays ? toDateKey(addDays(fromDateKey(start), previewDays - 1)) : "";
  const backDate =
    start && previewDays ? toDateKey(addDays(fromDateKey(start), previewDays)) : "";

  const human = (key: string) => {
    if (!key) return "";
    const d = fromDateKey(key);
    return `${WD[(d.getUTCDay() + 6) % 7]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  };

  function confirm() {
    if (!start) return setError("Женя, пожалуйста, укажи дату отъезда");
    if (!validDays) return setError("Пожалуйста, укажи от 1 до 90 дней");
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
              className={`btn-ghost${validDays && days === p ? " active" : ""}`}
              style={{ padding: "5px 12px" }}
              onClick={() => {
                setDaysInput(String(p));
                setError("");
              }}
            >
              {p}
            </button>
          ))}
        </div>
        <input
          className="form-input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="Например, 7"
          value={daysInput}
          onChange={(e) => {
            setDaysInput(e.target.value.replace(/\D/g, "").slice(0, 2));
            setError("");
          }}
        />

        {start && previewDays && (
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
            🌿 Выходные: <b>{human(start)}</b> до <b>{human(endDate)}</b>
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
