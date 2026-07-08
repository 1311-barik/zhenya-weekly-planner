"use client";

import { useRef, useState } from "react";
import { COLORS, COLOR_KEYS, type ColorKey } from "@/lib/config";
import { api } from "@/lib/client";
import type { TemplateDTO } from "@/lib/types";

const DURATIONS = [
  { label: "15 мин", value: 15 },
  { label: "30 мин", value: 30 },
  { label: "45 мин", value: 45 },
  { label: "1 ч", value: 60 },
  { label: "1.5 ч", value: 90 },
  { label: "2 ч", value: 120 },
  { label: "3 ч", value: 180 },
  { label: "4 ч", value: 240 },
];

const KINDS = [
  { label: "обычный", value: "" },
  { label: "🧵 норма Ателье", value: "atelier" },
  { label: "🏋️ норма Спорт", value: "gym" },
];

export default function TemplateEditor({
  templates,
  onChange,
  onClose,
  onUndo,
}: {
  templates: TemplateDTO[];
  onChange: (list: TemplateDTO[]) => void;
  onClose: () => void;
  onUndo?: (message: string, action: () => Promise<void>) => void;
}) {
  const [list, setList] = useState<TemplateDTO[]>(templates);
  const [busy, setBusy] = useState(false);
  const nameBeforeRef = useRef<Record<string, string>>({});

  const sync = (next: TemplateDTO[]) => {
    setList(next);
    onChange(next);
  };

  const patchLocal = (id: string, patch: Partial<TemplateDTO>) =>
    sync(list.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const save = async (id: string, data: Record<string, unknown>) => {
    try {
      await api.updateTemplate(id, data);
    } catch {
      /* тихо: локальное состояние уже обновлено */
    }
  };

  const restoreTemplate = (updated: TemplateDTO) => {
    sync(list.map((t) => (t.id === updated.id ? updated : t)));
  };

  const updateTemplate = async (
    template: TemplateDTO,
    patch: Partial<TemplateDTO>,
    message: string
  ) => {
    patchLocal(template.id, patch);
    try {
      await api.updateTemplate(template.id, patch);
      onUndo?.(message, async () => {
        const restored = await api.updateTemplate(template.id, {
          name: template.name,
          color: template.color,
          duration: template.duration,
          kind: template.kind,
        });
        restoreTemplate(restored);
      });
    } catch {
      /* тихо: локальное состояние уже обновлено */
    }
  };

  const addTemplate = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const created = await api.createTemplate({
        name: "✏️ Новый блок",
        color: "gold",
        duration: 60,
      });
      sync([...list, created]);
      onUndo?.("Шаблон добавлен", async () => {
        await api.deleteTemplate(created.id);
        sync(list.filter((t) => t.id !== created.id));
      });
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  const removeTemplate = async (id: string) => {
    const removed = list.find((t) => t.id === id);
    const next = list.filter((t) => t.id !== id);
    sync(next);
    try {
      await api.deleteTemplate(id);
      if (removed) {
        onUndo?.("Шаблон удалён", async () => {
          const restored = await api.createTemplate({
            name: removed.name,
            color: removed.color,
            duration: removed.duration,
            kind: removed.kind,
          });
          sync([...next, restored]);
        });
      }
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup tmpl-editor" onClick={(e) => e.stopPropagation()}>
        <div className="popup-title serif">Библиотека блоков</div>
        <p style={{ fontSize: 13, color: "var(--mid-gray)", marginBottom: 16 }}>
          Это стандартные блоки для быстрого добавления. Меняй название, цвет и
          длительность. Всё обновится в библиотеке.
        </p>

        <div className="tmpl-list">
          {list.map((t) => (
            <div className="tmpl-row" key={t.id}>
              <div className="tmpl-row-top">
                <span
                  className="block-color-dot"
                  style={{ background: COLORS[t.color as ColorKey]?.dot }}
                />
                <input
                  className="form-input"
                  style={{ margin: 0, flex: 1 }}
                  value={t.name}
                  onChange={(e) => patchLocal(t.id, { name: e.target.value })}
                  onFocus={() => {
                    nameBeforeRef.current[t.id] = t.name;
                  }}
                  onBlur={async (e) => {
                    const beforeName = nameBeforeRef.current[t.id] ?? t.name;
                    delete nameBeforeRef.current[t.id];
                    const nextName = e.target.value.trim();
                    if (!nextName || nextName === beforeName) return;
                    const before = { ...t, name: beforeName };
                    await save(t.id, { name: nextName });
                    onUndo?.("Шаблон переименован", async () => {
                      const restored = await api.updateTemplate(t.id, { name: before.name });
                      restoreTemplate(restored);
                    });
                  }}
                />
                <button
                  className="tmpl-del"
                  title="Удалить"
                  onClick={() => removeTemplate(t.id)}
                >
                  ✕
                </button>
              </div>

              <div className="tmpl-swatches">
                {COLOR_KEYS.map((c) => (
                  <div
                    key={c}
                    className={`tmpl-swatch${t.color === c ? " selected" : ""}`}
                    style={{ background: COLORS[c].dot }}
                    onClick={() => updateTemplate(t, { color: c }, "Цвет шаблона изменён")}
                  />
                ))}
              </div>

              <div className="tmpl-row-bottom">
                <select
                  className="form-input"
                  style={{ margin: 0 }}
                  value={t.duration}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    updateTemplate(t, { duration: v }, "Длительность шаблона изменена");
                  }}
                >
                  {DURATIONS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
                <select
                  className="form-input"
                  style={{ margin: 0 }}
                  value={t.kind ?? ""}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    updateTemplate(t, { kind: v as TemplateDTO["kind"] }, "Тип шаблона изменён");
                  }}
                >
                  {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>

        <div className="popup-actions" style={{ marginTop: 16 }}>
          <button className="btn-ghost" onClick={addTemplate} disabled={busy}>
            + Добавить блок
          </button>
          <button className="btn-primary" onClick={onClose}>
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}
