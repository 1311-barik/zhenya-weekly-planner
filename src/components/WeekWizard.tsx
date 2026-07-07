"use client";

import { useMemo, useState } from "react";
import type { WeekBundle } from "@/lib/types";
import { WEEKDAYS_SHORT } from "@/lib/config";
import { formatDuration, formatTime, parseTime } from "@/lib/client";
import { fromDateKey, startOfWeek, formatWeekTitle } from "@/lib/week";

interface Props {
  bundle: WeekBundle;
  onRemoveBlocks: (ids: string[]) => Promise<void>;
  onPlaceOneoff: (title: string, dayKey: string, start?: number) => Promise<void>;
  onDeleteBlock: (id: string) => Promise<void>;
  onFinish: () => void;
  onClose: () => void;
}

export default function WeekWizard({
  bundle,
  onRemoveBlocks,
  onPlaceOneoff,
  onDeleteBlock,
  onFinish,
  onClose,
}: Props) {
  const [step, setStep] = useState(1);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [day, setDay] = useState<string>(bundle.days[0]);
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);

  const weekTitle = formatWeekTitle(startOfWeek(fromDateKey(bundle.weekStart)));

  const recurringBlocks = useMemo(
    () =>
      bundle.blocks
        .filter((b) => b.recurring)
        .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start),
    [bundle.blocks]
  );

  // Разовые дела, уже стоящие в сетке (не повтор, не из библиотеки, не норма).
  const oneoffBlocks = useMemo(
    () =>
      bundle.blocks
        .filter((b) => !b.recurring && !b.templateId && !b.kind)
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
      onFinish();
    }
  }

  async function addOneoff() {
    const t = name.trim();
    if (!t || busy) return;
    setBusy(true);
    const start = time ? parseTime(time) ?? undefined : undefined;
    await onPlaceOneoff(t, day, start);
    setName("");
    setTime("");
    setBusy(false);
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
              Женя, что уже известно про эту неделю? Врач, маникюр, встречи, поездки…
              Выбери день (и время, если есть) — дело сразу встанет в сетку.
            </p>

            <input
              className="form-input"
              placeholder="Например, врач"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addOneoff()}
            />
            <div className="wizard-dayoff-grid" style={{ marginBottom: 10 }}>
              {bundle.days.map((dayKey, i) => (
                <div
                  key={dayKey}
                  className={`wizard-day${day === dayKey ? " selected" : ""}`}
                  onClick={() => setDay(dayKey)}
                >
                  <div className="wizard-day-name">{WEEKDAYS_SHORT[i]}</div>
                  <div className="wizard-day-num">{fromDateKey(dayKey).getUTCDate()}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <input
                className="form-input"
                style={{ margin: 0, flex: 1 }}
                type="time"
                step={900}
                value={time}
                placeholder="время (не обязательно)"
                onChange={(e) => setTime(e.target.value)}
              />
              <button className="btn-primary" onClick={addOneoff} disabled={busy}>
                Добавить в день
              </button>
            </div>

            <div className="wizard-body">
              {oneoffBlocks.length === 0 ? (
                <p className="wizard-row-sub">Пока пусто — добавь дела выше, и они появятся в сетке.</p>
              ) : (
                oneoffBlocks.map((b) => (
                  <div key={b.id} className="wizard-row">
                    <div className="wizard-row-main">
                      {b.title}
                      <div className="wizard-row-sub">
                        {dayShort(b.date)} {fromDateKey(b.date).getUTCDate()} · {formatTime(b.start)}
                      </div>
                    </div>
                    <button className="wizard-row-btn" onClick={() => onDeleteBlock(b.id)}>
                      Удалить
                    </button>
                  </div>
                ))
              )}
            </div>
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
            {step === 1 ? "Дальше" : "Готово"}
          </button>
        </div>
      </div>
    </div>
  );
}
