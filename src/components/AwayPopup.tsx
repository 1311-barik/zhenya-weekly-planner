"use client";

import { useState } from "react";

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
  const [end, setEnd] = useState(defaultStart);
  const [error, setError] = useState("");

  function confirm() {
    if (!start || !end) return setError("Укажите обе даты");
    if (end < start) return setError("Дата возвращения раньше отъезда");
    onConfirm(start, end);
  }

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup" onClick={(e) => e.stopPropagation()}>
        <div className="popup-title serif">✈️ Режим отъезда</div>
        <p style={{ fontSize: 13, color: "var(--mid-gray)", marginBottom: 16 }}>
          На эти дни встанет блок «Отъезд», остальные блоки уберутся. Повторяющиеся
          блоки на этих неделях пропускаются.
        </p>

        <div className="form-row">
          <div>
            <label className="form-label">Отъезд</label>
            <input
              className="form-input"
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div>
            <label className="form-label">Возвращение</label>
            <input
              className="form-input"
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
        </div>

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
