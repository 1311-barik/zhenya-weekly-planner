"use client";

import { useState } from "react";
import { COLORS, COLOR_KEYS, type ColorKey } from "@/lib/config";
import { formatTime, parseTime } from "@/lib/client";

export interface BlockDraft {
  id?: string;
  title: string;
  color: ColorKey;
  date: string;
  start: number;
  duration: number;
}

const DURATIONS: { label: string; value: number }[] = [
  { label: "15 мин", value: 15 },
  { label: "30 мин", value: 30 },
  { label: "45 мин", value: 45 },
  { label: "1 ч", value: 60 },
  { label: "1.5 ч", value: 90 },
  { label: "2 ч", value: 120 },
  { label: "2.5 ч", value: 150 },
  { label: "3 ч", value: 180 },
  { label: "4 ч", value: 240 },
  { label: "5 ч", value: 300 },
  { label: "6 ч", value: 360 },
];

export default function EditBlockPopup({
  mode,
  draft,
  onSave,
  onDelete,
  onClose,
}: {
  mode: "create" | "edit";
  draft: BlockDraft;
  onSave: (d: BlockDraft) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(draft.title);
  const [color, setColor] = useState<ColorKey>(draft.color);
  const [timeStr, setTimeStr] = useState(formatTime(draft.start));
  const [duration, setDuration] = useState(draft.duration);

  function save() {
    const start = parseTime(timeStr);
    if (!title.trim()) return;
    if (start === null) return;
    onSave({ ...draft, title: title.trim(), color, start, duration });
  }

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup" onClick={(e) => e.stopPropagation()}>
        <div className="popup-title serif">
          {mode === "create" ? "Новый блок" : "Редактировать блок"}
        </div>

        <label className="form-label">Название</label>
        <input
          className="form-input"
          type="text"
          value={title}
          autoFocus
          placeholder="Например, 🎨 Работа над серией"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />

        <div className="form-row">
          <div>
            <label className="form-label">Начало</label>
            <input
              className="form-input"
              type="time"
              step={900}
              value={timeStr}
              onChange={(e) => setTimeStr(e.target.value)}
            />
          </div>
          <div>
            <label className="form-label">Длительность</label>
            <select
              className="form-input"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            >
              {DURATIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="form-label">Цвет</label>
        <div className="color-swatches">
          {COLOR_KEYS.map((c) => (
            <div
              key={c}
              className={`color-swatch${c === color ? " selected" : ""}`}
              style={{ background: COLORS[c].dot }}
              title={COLORS[c].label}
              onClick={() => setColor(c)}
            />
          ))}
        </div>

        <div className="popup-actions">
          {mode === "edit" && onDelete ? (
            <button
              className="btn-ghost"
              style={{ color: "var(--terracotta)", borderColor: "rgba(196,112,74,0.3)" }}
              onClick={onDelete}
            >
              Удалить
            </button>
          ) : (
            <span />
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-ghost" onClick={onClose}>
              Отмена
            </button>
            <button className="btn-primary" onClick={save}>
              Сохранить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
