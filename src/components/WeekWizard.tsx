"use client";

import { useMemo, useState } from "react";
import type { WeekBundle } from "@/lib/types";
import { WEEKDAYS_SHORT } from "@/lib/config";
import { formatDuration, formatTime } from "@/lib/client";
import { fromDateKey, startOfWeek, formatWeekTitle } from "@/lib/week";

interface Props {
  bundle: WeekBundle;
  onRemoveBlocks: (ids: string[]) => Promise<void>;
  onAddTask: (title: string) => Promise<void>;
  onRemoveTask: (id: string) => Promise<void>;
  onPlaceAll: () => Promise<{ placed: number; unparsed: string[] }>;
  onFinish: () => void;
  onClose: () => void;
}

export default function WeekWizard({
  bundle,
  onRemoveBlocks,
  onAddTask,
  onRemoveTask,
  onPlaceAll,
  onFinish,
  onClose,
}: Props) {
  const [step, setStep] = useState(1);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [taskInput, setTaskInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [unparsed, setUnparsed] = useState<string[]>([]);

  const weekTitle = formatWeekTitle(startOfWeek(fromDateKey(bundle.weekStart)));

  const recurringBlocks = useMemo(
    () =>
      bundle.blocks
        .filter((b) => b.recurring)
        .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start),
    [bundle.blocks]
  );

  const dayShort = (dateKey: string) =>
    WEEKDAYS_SHORT[(fromDateKey(dateKey).getUTCDay() + 6) % 7];

  function toggleRemoved(id: string) {
    setRemoved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function addTask() {
    const t = taskInput.trim();
    if (!t || busy) return;
    setBusy(true);
    await onAddTask(t);
    setTaskInput("");
    setBusy(false);
  }

  async function next() {
    if (busy) return;
    if (step === 1) {
      if (removed.size > 0) {
        setBusy(true);
        await onRemoveBlocks([...removed]);
        setRemoved(new Set());
        setBusy(false);
      }
      setStep(2);
    } else if (step === 2) {
      // расставить всё разом
      setBusy(true);
      const res = await onPlaceAll();
      setBusy(false);
      if (res.unparsed.length === 0) {
        onFinish();
      } else {
        setUnparsed(res.unparsed);
      }
    }
  }

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup wizard" onClick={(e) => e.stopPropagation()}>
        <div className="popup-title serif" style={{ marginBottom: 2 }}>
          Женя, соберём неделю
        </div>
        <div style={{ fontSize: 12, color: "var(--mid-gray)", marginBottom: 16 }}>
          {weekTitle}
        </div>

        <div className="wizard-steps">
          {[1, 2].map((s) => (
            <div
              key={s}
              className={`wizard-dot${s === step ? " active" : ""}${
                s < step ? " done" : ""
              }`}
            />
          ))}
        </div>

        {/* ШАГ 1. Постоянные события */}
        {step === 1 && (
          <>
            <div className="wizard-step-label">Шаг 1 из 2 · Постоянные события</div>
            <p className="wizard-intro">
              Я бережно перенёс постоянные события на неделю. Пожалуйста, оставь то,
              что в силе, а лишнее можно мягко убрать.
            </p>
            <div className="wizard-body">
              {recurringBlocks.length === 0 && (
                <p className="wizard-row-sub">На этой неделе постоянных событий нет, спокойно.</p>
              )}
              {recurringBlocks.map((b) => {
                const off = removed.has(b.id);
                return (
                  <div key={b.id} className={`wizard-row${off ? " removed" : ""}`}>
                    <div className="wizard-row-main">
                      {b.title}
                      <div className="wizard-row-sub">
                        {dayShort(b.date)} · {formatTime(b.start)} · {formatDuration(b.duration)}
                      </div>
                    </div>
                    <button
                      className={`wizard-row-btn${off ? " restore" : ""}`}
                      onClick={() => toggleRemoved(b.id)}
                    >
                      {off ? "Вернуть" : "Убрать"}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ШАГ 2. Разовые дела */}
        {step === 2 && (
          <>
            <div className="wizard-step-label">Шаг 2 из 2 · Разовые дела</div>
            <p className="wizard-intro">
              Женя, впиши всё как есть, с днём и временем: «Встреча. Вторник. 10:00».
              По кнопке я сама разложу их по дням.
            </p>
            <div className="wizard-add-row">
              <input
                className="form-input"
                placeholder="Например, врач во вторник 15:00"
                value={taskInput}
                onChange={(e) => setTaskInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTask()}
              />
              <button className="btn-primary" onClick={addTask} disabled={busy}>
                +
              </button>
            </div>
            <div className="wizard-body">
              {bundle.tasks.length === 0 && (
                <p className="wizard-row-sub">Пока пусто — впиши дела выше.</p>
              )}
              {bundle.tasks.map((t) => (
                <div key={t.id} className="wizard-row">
                  <div className="wizard-row-main">{t.title}</div>
                  <button className="wizard-row-btn" onClick={() => onRemoveTask(t.id)}>
                    Удалить
                  </button>
                </div>
              ))}
            </div>

            {unparsed.length > 0 && (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--terracotta)",
                  background: "rgba(196,112,74,0.08)",
                  border: "1px solid rgba(196,112,74,0.25)",
                  borderRadius: 8,
                  padding: "8px 10px",
                  marginBottom: 12,
                  lineHeight: 1.4,
                }}
              >
                Вот что пока не получилось расставить. Пожалуйста, допиши день или
                свободное время и нажми ещё раз:
                {unparsed.map((u) => (
                  <div key={u}>• {u}</div>
                ))}
              </div>
            )}
          </>
        )}

        {/* НАВИГАЦИЯ */}
        <div className="wizard-actions">
          {step > 1 ? (
            <button className="btn-ghost" onClick={() => setStep(step - 1)} disabled={busy}>
              Назад
            </button>
          ) : (
            <button className="btn-ghost" onClick={onClose}>
              Отмена
            </button>
          )}
          <button className="btn-primary" onClick={next} disabled={busy}>
            {step === 1 ? "Дальше" : "Готово → расставить"}
          </button>
        </div>
      </div>
    </div>
  );
}
