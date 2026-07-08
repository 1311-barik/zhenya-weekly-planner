"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DAY_START_HOUR,
  DAY_START_MIN,
  DAY_END_HOUR,
  DAY_END_MIN,
  HOUR_HEIGHT,
  MIN_BLOCK_MINUTES,
  WEEKDAYS_SHORT,
  NORMS,
  NORM_TYPES,
  type ColorKey,
  type NormType,
} from "@/lib/config";
import type { BlockDTO, TaskDTO, TemplateDTO, WeekBundle } from "@/lib/types";
import {
  addDays,
  fromDateKey,
  startOfWeek,
  toDateKey,
  formatWeekTitle,
} from "@/lib/week";
import { parseOneoff } from "@/lib/parseOneoff";
import {
  api,
  computeNorms,
  formatDuration,
  formatTime,
  maxFreeGap,
  minToY,
  playSnap,
  pxHeight,
  snapMin,
  yToMin,
} from "@/lib/client";
import { findOverlap, findSameNorm, isNormKind } from "@/lib/blockRules";
import EditBlockPopup, { type BlockDraft } from "./EditBlockPopup";
import AwayPopup from "./AwayPopup";
import WeekWizard from "./WeekWizard";
import StatsPanel from "./StatsPanel";
import TemplateEditor from "./TemplateEditor";

// Цвет норм-кирпичика по типу.
const NORM_COLOR: Record<NormType, ColorKey> = { atelier: "bordeaux", gym: "orange" };

const HOURS = Array.from(
  { length: DAY_END_HOUR - DAY_START_HOUR + 1 },
  (_, i) => DAY_START_HOUR + i
);
const GRID_HEIGHT = HOURS.length * HOUR_HEIGHT;
const DRAG_THRESHOLD = 5; // px до начала перетаскивания (чтобы клик не двигал блок)

// ───────── Раскладка пересекающихся блоков (дорожки) ─────────
type Layout = Record<string, { left: number; width: number }>;

function layoutDay(blocks: BlockDTO[]): Layout {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || b.duration - a.duration);
  const out: Layout = {};
  let cluster: BlockDTO[] = [];
  let clusterEnd = -1;

  const flush = () => {
    if (!cluster.length) return;
    const laneEnds: number[] = [];
    const lane: Record<string, number> = {};
    for (const b of cluster) {
      let placed = -1;
      for (let i = 0; i < laneEnds.length; i++) {
        if (laneEnds[i] <= b.start) {
          placed = i;
          break;
        }
      }
      if (placed === -1) {
        placed = laneEnds.length;
        laneEnds.push(0);
      }
      laneEnds[placed] = b.start + b.duration;
      lane[b.id] = placed;
    }
    const lanes = laneEnds.length;
    for (const b of cluster) {
      out[b.id] = { left: (lane[b.id] / lanes) * 100, width: (1 / lanes) * 100 };
    }
    cluster = [];
    clusterEnd = -1;
  };

  for (const b of sorted) {
    if (cluster.length && b.start >= clusterEnd) flush();
    cluster.push(b);
    clusterEnd = Math.max(clusterEnd, b.start + b.duration);
  }
  flush();
  return out;
}

// ───────── Состояние перетаскивания ─────────
type DragState =
  | {
      mode: "move";
      id: string;
      grabOffsetY: number;
      duration: number;
      title: string;
      color: ColorKey;
      kind: NormType | null;
    }
  | { mode: "resize"; id: string; start: number }
  | {
      mode: "create";
      source: "template" | "task";
      title: string;
      color: ColorKey;
      kind: BlockDTO["kind"];
      templateId: string | null;
      duration: number;
    };

interface LivePreview {
  dayIndex: number;
  start: number;
  duration: number;
  mode: DragState["mode"];
  id?: string;
  title?: string;
  color?: ColorKey;
}

interface DragOverlay {
  x: number;
  y: number;
  title: string;
  color: ColorKey;
  duration: number;
}

interface AgendaGap {
  id: string;
  start: number;
  end: number;
  fits: NormType[];
  variant: "empty-day" | "between";
}

interface UndoNotice {
  message: string;
  action: () => Promise<void>;
}

export default function Planner({
  initial,
  today,
}: {
  initial: WeekBundle;
  today: string;
}) {
  const [bundle, setBundle] = useState<WeekBundle>(initial);
  const [weekStart, setWeekStart] = useState<string>(initial.weekStart);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<
    { mode: "create" | "edit"; draft: BlockDraft } | null
  >(null);
  const [awayOpen, setAwayOpen] = useState(false);
  const [mobileDay, setMobileDay] = useState<number>(() => {
    const idx = initial.days.indexOf(today);
    return idx >= 0 ? idx : 0;
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"week" | "day">("week");
  const [mobileWeekMode, setMobileWeekMode] = useState<"grid" | "scroll" | "list">("list");
  const [addSheetDay, setAddSheetDay] = useState<string | null>(null);
  const [preview, setPreview] = useState<LivePreview | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [justPlacedId, setJustPlacedId] = useState<string | null>(null);
  const [infoToast, setInfoToast] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [extrasHidden, setExtrasHidden] = useState(false);
  const [dayOffPromptHidden, setDayOffPromptHidden] = useState(false);
  const [dayOffPromptChoice, setDayOffPromptChoice] = useState<string | null>(null);
  const [agendaDropId, setAgendaDropId] = useState<string | null>(null);
  const [dragOverlay, setDragOverlay] = useState<DragOverlay | null>(null);
  const [undoStack, setUndoStack] = useState<UndoNotice[]>([]);

  const colRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dragRef = useRef<DragState | null>(null);
  const previewRef = useRef<LivePreview | null>(null);
  const agendaDropRef = useRef<string | null>(null);
  const pointerUpRef = useRef<(() => void) | null>(null);
  const pointerCancelRef = useRef<((event?: Event) => void) | null>(null);
  const activePointerRef = useRef<{ id: number; target: Element } | null>(null);
  const movedRef = useRef(false);
  const dragOriginRef = useRef({ x: 0, y: 0 });
  const suppressClick = useRef(false);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const lastSnapKeyRef = useRef("");

  // ── загрузка недели при смене ──
  useEffect(() => {
    if (weekStart === bundle.weekStart) return;
    let active = true;
    api
      .week(weekStart)
      .then((b) => {
        if (active) {
          setBundle(b);
          const idx = b.days.indexOf(today);
          setMobileDay(idx >= 0 ? idx : 0);
        }
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [weekStart, bundle.weekStart, today]);

  const refresh = useCallback(async () => {
    try {
      const b = await api.week(weekStart);
      setBundle(b);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [weekStart]);

  const norms = useMemo(() => computeNorms(bundle.blocks), [bundle.blocks]);

  // Сколько обязательных кирпичиков ещё надо расставить (по факту наличия
  // блока нужного типа и длительности, независимо от отметки «выполнено»).
  const normTray = useMemo(
    () =>
      NORM_TYPES.map((type) => {
        const cfg = NORMS[type];
        const placed = bundle.blocks.filter(
          (b) => b.kind === type && b.duration >= cfg.minDuration
        ).length;
        return { type, cfg, remaining: Math.max(cfg.required - placed, 0) };
      }),
    [bundle.blocks]
  );
  const trayRemaining = normTray.reduce((s, n) => s + n.remaining, 0);

  // Празднование, когда расставлен последний обязательный кирпичик.
  const prevTrayRef = useRef(trayRemaining);
  useEffect(() => {
    if (prevTrayRef.current > 0 && trayRemaining === 0) {
      window.setTimeout(() => setCelebrate(true), 0);
    }
    if (trayRemaining > 0) {
      // снова не закрыт, пока минимум не добран
      window.setTimeout(() => setExtrasHidden(false), 0);
    }
    prevTrayRef.current = trayRemaining;
  }, [trayRemaining]);

  const flashInfo = useCallback((msg: string) => {
    setInfoToast(msg);
    window.setTimeout(() => setInfoToast((cur) => (cur === msg ? null : cur)), 3200);
  }, []);

  const flashPlaced = useCallback((id: string) => {
    setJustPlacedId(id);
    window.setTimeout(() => setJustPlacedId((cur) => (cur === id ? null : cur)), 360);
  }, []);

  const offerUndo = useCallback((message: string, action: () => Promise<void>) => {
    setUndoStack((stack) => [...stack.slice(-7), { message, action }]);
  }, []);

  const runUndo = useCallback(async () => {
    const notice = undoStack.at(-1);
    if (!notice) return;
    setUndoStack((stack) => stack.slice(0, -1));
    try {
      await notice.action();
      flashInfo("Вернула");
    } catch (e) {
      setError((e as Error).message);
      refresh();
    }
  }, [flashInfo, refresh, undoStack]);

  const dayOffSet = useMemo(() => new Set(bundle.dayOff), [bundle.dayOff]);
  const blocksByDay = useMemo(() => {
    const map: Record<string, BlockDTO[]> = {};
    for (const d of bundle.days) map[d] = [];
    for (const b of bundle.blocks) (map[b.date] ??= []).push(b);
    return map;
  }, [bundle.blocks, bundle.days]);
  const placementMessage = useCallback(
    ({
      dayKey,
      start,
      duration,
      kind,
      excludeId,
    }: {
      dayKey: string;
      start: number;
      duration: number;
      kind?: NormType | null;
      excludeId?: string;
    }) => {
      const dayBlocks = blocksByDay[dayKey] ?? [];
      if (findOverlap(dayBlocks, start, duration, excludeId)) {
        return "Женя, блоки не могут пересекаться по времени";
      }
      if (findSameNorm(dayBlocks, kind, excludeId)) {
        return "Женя, в этот день такой любимый блок уже стоит";
      }
      return null;
    },
    [blocksByDay]
  );
  const currentWeekStart = useMemo(
    () => toDateKey(startOfWeek(fromDateKey(today))),
    [today]
  );
  const hasWeekDayOff = bundle.dayOff.some((d) => bundle.days.includes(d));
  const showDayOffPrompt =
    bundle.weekStart === currentWeekStart &&
    trayRemaining === 0 &&
    !hasWeekDayOff &&
    !dayOffPromptHidden &&
    !celebrate &&
    !editing &&
    !awayOpen &&
    !wizardOpen &&
    !statsOpen &&
    !templatesOpen &&
    !addSheetDay;

  const agendaGapsByDay = useMemo(() => {
    const out: Record<string, AgendaGap[]> = {};
    const displayStart = Math.max(DAY_START_MIN, 10 * 60);
    const focusEnd = Math.min(DAY_END_MIN, 20 * 60);
    const minUsefulGap = Math.min(...NORM_TYPES.map((type) => NORMS[type].minDuration));
    const makeGap = (
      dayKey: string,
      start: number,
      end: number,
      variant: AgendaGap["variant"]
    ): AgendaGap | null => {
      const safeStart = Math.max(displayStart, start);
      const safeEnd = Math.min(focusEnd, end);
      const duration = safeEnd - safeStart;
      if (duration < minUsefulGap) return null;
      const dayBlocks = blocksByDay[dayKey] ?? [];
      const fits = NORM_TYPES.filter(
        (type) =>
          duration >= NORMS[type].minDuration &&
          !findSameNorm(dayBlocks, type)
      );
      if (fits.length === 0) return null;
      return {
        id: `${dayKey}-${safeStart}-${safeEnd}`,
        start: safeStart,
        end: safeEnd,
        fits,
        variant,
      };
    };

    for (const dayKey of bundle.days) {
      const blocks = (blocksByDay[dayKey] ?? [])
        .slice()
        .sort((a, b) => a.start - b.start);
      const gaps: AgendaGap[] = [];

      if (dayOffSet.has(dayKey)) {
        out[dayKey] = gaps;
        continue;
      }

      if (blocks.length === 0) {
        const first = makeGap(dayKey, displayStart, Math.min(focusEnd, 14 * 60), "empty-day");
        const second = makeGap(dayKey, 15 * 60, Math.min(focusEnd, 18 * 60), "empty-day");
        if (first) gaps.push(first);
        if (second) gaps.push(second);
        out[dayKey] = gaps;
        continue;
      }

      let cursor = displayStart;
      for (const block of blocks) {
        if (block.start > cursor) {
          const gap = makeGap(dayKey, cursor, block.start, "between");
          if (gap) gaps.push(gap);
        }
        cursor = Math.max(cursor, block.start + block.duration);
        if (cursor >= focusEnd) break;
      }
      if (cursor < focusEnd) {
        const gap = makeGap(dayKey, cursor, focusEnd, "between");
        if (gap) gaps.push(gap);
      }

      out[dayKey] = gaps;
    }

    return out;
  }, [blocksByDay, bundle.days, dayOffSet]);

  // ── навигация недель ──
  const goWeek = (delta: number) => {
    const next = addDays(startOfWeek(fromDateKey(weekStart)), delta * 7);
    const nextKey = toDateKey(next);
    if (nextKey !== bundle.weekStart) setLoading(true);
    setWeekStart(nextKey);
  };
  const goToday = () => {
    const nextKey = toDateKey(startOfWeek(fromDateKey(today)));
    if (nextKey !== bundle.weekStart) setLoading(true);
    setWeekStart(nextKey);
  };

  // ── свайп по дням (мобильный) ──
  const onAreaTouchStart = (e: React.TouchEvent) => {
    if (dragRef.current || e.touches.length !== 1) {
      swipeRef.current = null;
      return;
    }
    const el = e.target as HTMLElement;
    if (el.closest(".task-block") || el.closest(".norm-tray")) {
      swipeRef.current = null;
      return;
    }
    const t = e.touches[0];
    swipeRef.current = { x: t.clientX, y: t.clientY };
  };

  const onAreaTouchEnd = (e: React.TouchEvent) => {
    const start = swipeRef.current;
    swipeRef.current = null;
    if (!start || dragRef.current) return;
    if (!window.matchMedia("(max-width: 760px)").matches) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      suppressClick.current = true;
      setMobileDay((d) => Math.min(6, Math.max(0, d + (dx < 0 ? 1 : -1))));
    }
  };

  // ── поиск колонки под курсором ──
  const findColumn = (clientX: number, clientY: number) => {
    for (let i = 0; i < colRefs.current.length; i++) {
      const el = colRefs.current[i];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue; // скрытая (моб.)
      if (clientX >= r.left && clientX <= r.right) {
        const relY = Math.min(Math.max(clientY - r.top, 0), GRID_HEIGHT);
        return { index: i, relY };
      }
    }
    return null;
  };

  const findAgendaGap = (
    clientX: number,
    clientY: number,
    duration: number,
    kind?: NormType | null
  ) => {
    const hit = document
      .elementsFromPoint(clientX, clientY)
      .find((el) => el instanceof HTMLElement && el.closest(".agenda-gap"))
      ?.closest(".agenda-gap") as HTMLElement | undefined;
    if (!hit) return null;

    const dayIndex = Number(hit.dataset.dayIndex);
    const start = Number(hit.dataset.start);
    const end = Number(hit.dataset.end);
    const id = hit.dataset.gapId;
    const fits = (hit.dataset.fits ?? "").split(",").filter(Boolean);
    if (!Number.isFinite(dayIndex) || !Number.isFinite(start) || !Number.isFinite(end) || !id) {
      return null;
    }
    if (end - start < duration) return null;
    if (isNormKind(kind) && !fits.includes(kind)) return null;
    const rect = hit.getBoundingClientRect();
    const available = end - start - duration;
    const ratio = rect.width > 0 ? Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1) : 0;
    const placedStart =
      available > 0
        ? Math.min(end - duration, start + snapMin(available * ratio))
        : start;
    return { dayIndex, start: placedStart, end, id };
  };

  const findSwapTarget = useCallback(
    (moving: BlockDTO, dayKey: string, start: number) => {
      const nextEnd = start + moving.duration;
      const target = (blocksByDay[dayKey] ?? []).find(
        (block) =>
          block.id !== moving.id &&
          start < block.start + block.duration &&
          nextEnd > block.start
      );
      if (!target) return null;

      const targetNextStart = moving.start;
      const targetNextEnd = targetNextStart + target.duration;
      if (targetNextEnd > DAY_END_MIN) return null;
      if (dayOffSet.has(moving.date)) return null;
      if (
        target.date === moving.date &&
        target.start < targetNextEnd &&
        target.start + moving.duration > targetNextStart
      ) {
        return null;
      }

      const blocksWithoutPair = bundle.blocks.filter(
        (block) => block.id !== moving.id && block.id !== target.id
      );
      const targetCollides = blocksWithoutPair.some(
        (block) =>
          block.date === moving.date &&
          targetNextStart < block.start + block.duration &&
          targetNextEnd > block.start
      );
      if (targetCollides) return null;

      const movingSameNorm = blocksWithoutPair.some(
        (block) => block.date === target.date && block.kind === moving.kind && moving.kind
      );
      const targetSameNorm = blocksWithoutPair.some(
        (block) => block.date === moving.date && block.kind === target.kind && target.kind
      );
      if (movingSameNorm || targetSameNorm) return null;

      return target;
    },
    [blocksByDay, bundle.blocks, dayOffSet]
  );

  // ── обработчики перетаскивания (общие) ──
  const clearDragState = useCallback(() => {
    if (activePointerRef.current) {
      const { id, target } = activePointerRef.current;
      if (target instanceof HTMLElement) {
        try {
          if (target.hasPointerCapture?.(id)) target.releasePointerCapture(id);
        } catch {
          // Some mobile webviews drop pointer capture when their browser UI takes focus.
        }
      }
    }
    activePointerRef.current = null;
    dragRef.current = null;
    previewRef.current = null;
    agendaDropRef.current = null;
    lastSnapKeyRef.current = "";
    setAgendaDropId(null);
    setDragOverlay(null);
    setPreview(null);
  }, []);

  const onPointerMove = useCallback((e: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.mode !== "resize") {
      setDragOverlay({
        x: e.clientX,
        y: e.clientY,
        title: drag.title,
        color: drag.color,
        duration: drag.duration,
      });
    }
    // Порог: клик с микро-сдвигом не считается перетаскиванием.
    if (!movedRef.current) {
      const o = dragOriginRef.current;
      if (Math.hypot(e.clientX - o.x, e.clientY - o.y) < DRAG_THRESHOLD) return;
      movedRef.current = true;
    }
    const dragKind =
      drag.mode === "resize" ? null : drag.kind;
    const agendaHit =
      drag.mode !== "resize"
        ? findAgendaGap(e.clientX, e.clientY, drag.duration, dragKind)
        : null;
    const hit = agendaHit ? null : findColumn(e.clientX, e.clientY);
    if (!agendaHit && !hit) {
      if (agendaDropRef.current) {
        agendaDropRef.current = null;
        setAgendaDropId(null);
      }
      return;
    }

    let start: number;
    let duration: number;
    if (drag.mode === "move") {
      start = agendaHit ? agendaHit.start : snapMin(yToMin(hit!.relY - drag.grabOffsetY));
      duration = drag.duration;
    } else if (drag.mode === "resize") {
      start = drag.start;
      duration = Math.max(snapMin(yToMin(hit!.relY) - start), MIN_BLOCK_MINUTES);
    } else {
      start = agendaHit ? agendaHit.start : snapMin(yToMin(hit!.relY));
      duration = drag.duration;
    }
    start = Math.min(Math.max(start, DAY_START_HOUR * 60), DAY_END_MIN - MIN_BLOCK_MINUTES);
    duration = Math.min(duration, DAY_END_MIN - start);

    const next: LivePreview = {
      dayIndex: agendaHit ? agendaHit.dayIndex : hit!.index,
      start,
      duration,
      mode: drag.mode,
      id: "id" in drag ? drag.id : undefined,
      title: drag.mode === "create" ? drag.title : undefined,
      color: drag.mode === "create" ? drag.color : undefined,
    };
    const nextDropId = agendaHit?.id ?? null;
    if (nextDropId !== agendaDropRef.current) {
      agendaDropRef.current = nextDropId;
      setAgendaDropId(nextDropId);
    }
    const snapKey = `${next.dayIndex}:${start}:${duration}`;
    if (snapKey !== lastSnapKeyRef.current) {
      if (e.pointerType === "touch") window.navigator.vibrate?.(8);
      lastSnapKeyRef.current = snapKey;
    }
    previewRef.current = next;
    setPreview(next);
  }, []);

  const removeDragListeners = useCallback(() => {
    window.removeEventListener("pointermove", onPointerMove);
    if (pointerUpRef.current) {
      window.removeEventListener("pointerup", pointerUpRef.current);
      window.removeEventListener("touchend", pointerUpRef.current);
    }
    if (pointerCancelRef.current) {
      window.removeEventListener("pointercancel", pointerCancelRef.current);
      window.removeEventListener("blur", pointerCancelRef.current);
      document.removeEventListener("visibilitychange", pointerCancelRef.current);
    }
  }, [onPointerMove]);

  const onPointerUp = useCallback(async () => {
    removeDragListeners();
    const drag = dragRef.current;
    const prev = previewRef.current;
    clearDragState();
    if (movedRef.current) suppressClick.current = true;

    if (!drag || !prev || !movedRef.current) return;
    const dayKey = bundle.days[prev.dayIndex];
    if (!dayKey) return;

    try {
      if (drag.mode === "create") {
        if (dayOffSet.has(dayKey)) {
          setError("Женя, это выходной, давай оставим его свободным");
          return;
        }
        const message = placementMessage({
          dayKey,
          start: prev.start,
          duration: prev.duration,
          kind: drag.kind,
        });
        if (message) {
          setError(message);
          return;
        }
        const created = await api.createBlock({
          title: drag.title,
          color: drag.color,
          date: dayKey,
          start: prev.start,
          duration: prev.duration,
          kind: drag.kind,
          templateId: drag.templateId,
        });
        // отклик при установке: пружинка + звук
        playSnap();
        flashPlaced(created.id);
        setBundle((b) => {
          const blocks = [...b.blocks, created];
          // Подсказка о свободном месте для любимых кирпичиков.
          if (drag.kind) {
            const dayBlocks = blocks.filter((x) => x.date === dayKey);
            const gap = maxFreeGap(dayBlocks);
            const dayName = WEEKDAYS_SHORT[prev.dayIndex];
            const minNorm = Math.min(...NORM_TYPES.map((t) => NORMS[t].minDuration));
            flashInfo(
              gap >= minNorm
                ? `${dayName}: тут ещё есть мягкое окошко, если захочется добавить блок`
                : `${dayName}: кажется, этот день уже достаточно полный`
            );
          }
          return { ...b, blocks };
        });
        offerUndo("Блок добавлен", async () => {
          await api.deleteBlock(created.id);
          setBundle((b) => ({ ...b, blocks: b.blocks.filter((x) => x.id !== created.id) }));
        });
      } else if (drag.mode === "move") {
        const moving = bundle.blocks.find((block) => block.id === drag.id);
        if (!moving) return;
        const message = placementMessage({
          dayKey,
          start: prev.start,
          duration: prev.duration,
          kind: drag.kind,
          excludeId: drag.id,
        });
        if (message) {
          const swapTarget = findSwapTarget(moving, dayKey, prev.start);
          if (!swapTarget) {
            setError(message);
            return;
          }
          playSnap();
          flashPlaced(drag.id);
          setBundle((b) => ({
            ...b,
            blocks: b.blocks.map((x) => {
              if (x.id === drag.id) return { ...x, date: swapTarget.date, start: swapTarget.start };
              if (x.id === swapTarget.id) return { ...x, date: moving.date, start: moving.start };
              return x;
            }),
          }));
          const swapped = await api.swapBlocks(drag.id, swapTarget.id);
          setBundle((b) => ({
            ...b,
            blocks: b.blocks.map((x) => swapped.blocks.find((block) => block.id === x.id) ?? x),
          }));
          offerUndo("Блоки поменялись местами", async () => {
            const restored = await api.swapBlocks(drag.id, swapTarget.id);
            setBundle((b) => ({
              ...b,
              blocks: b.blocks.map((x) => restored.blocks.find((block) => block.id === x.id) ?? x),
            }));
          });
          return;
        }
        playSnap();
        flashPlaced(drag.id);
        const before = { date: moving.date, start: moving.start };
        setBundle((b) => ({
          ...b,
          blocks: b.blocks.map((x) =>
            x.id === drag.id ? { ...x, date: dayKey, start: prev.start } : x
          ),
        }));
        await api.updateBlock(drag.id, { date: dayKey, start: prev.start });
        offerUndo("Блок перенесён", async () => {
          const restored = await api.updateBlock(drag.id, before);
          setBundle((b) => ({
            ...b,
            blocks: b.blocks.map((x) => (x.id === restored.id ? restored : x)),
          }));
        });
      } else if (drag.mode === "resize") {
        const current = bundle.blocks.find((block) => block.id === drag.id);
        if (!current) return;
        const message = placementMessage({
          dayKey: current.date,
          start: current.start,
          duration: prev.duration,
          kind: current.kind,
          excludeId: drag.id,
        });
        if (message) {
          setError(message);
          return;
        }
        setBundle((b) => ({
          ...b,
          blocks: b.blocks.map((x) =>
            x.id === drag.id ? { ...x, duration: prev.duration } : x
          ),
        }));
        await api.updateBlock(drag.id, { duration: prev.duration });
        offerUndo("Длительность изменена", async () => {
          const restored = await api.updateBlock(drag.id, { duration: current.duration });
          setBundle((b) => ({
            ...b,
            blocks: b.blocks.map((x) => (x.id === restored.id ? restored : x)),
          }));
        });
      }
    } catch (e) {
      setError((e as Error).message);
      refresh();
    }
  }, [bundle.blocks, bundle.days, clearDragState, dayOffSet, findSwapTarget, flashInfo, flashPlaced, offerUndo, placementMessage, refresh, removeDragListeners]);

  useEffect(() => {
    pointerUpRef.current = onPointerUp;
  }, [onPointerUp]);

  const onPointerCancel = useCallback(
    (event?: Event) => {
      if (event?.type === "visibilitychange" && !document.hidden) return;
      removeDragListeners();
      if (movedRef.current) suppressClick.current = true;
      clearDragState();
    },
    [clearDragState, removeDragListeners]
  );

  useEffect(() => {
    pointerCancelRef.current = onPointerCancel;
  }, [onPointerCancel]);

  const startDrag = (state: DragState, e: React.PointerEvent) => {
    const target = e.currentTarget;
    if (target instanceof HTMLElement) {
      try {
        target.setPointerCapture?.(e.pointerId);
        activePointerRef.current = { id: e.pointerId, target };
      } catch {
        activePointerRef.current = null;
      }
    }
    dragRef.current = state;
    agendaDropRef.current = null;
    setAgendaDropId(null);
    setDragOverlay(
      state.mode === "resize"
        ? null
        : {
            x: e.clientX,
            y: e.clientY,
            title: state.title,
            color: state.color,
            duration: state.duration,
          }
    );
    lastSnapKeyRef.current = "";
    movedRef.current = false;
    dragOriginRef.current = { x: e.clientX, y: e.clientY };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("touchend", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("blur", onPointerCancel);
    document.addEventListener("visibilitychange", onPointerCancel);
  };

  // ── drag существующего блока (тело) ──
  const onBlockPointerDown = (e: React.PointerEvent, block: BlockDTO) => {
    const target = e.target as HTMLElement;
    if (target.closest(".resize-handle")) return;
    e.preventDefault();
    e.stopPropagation();
    const blockEl = target.closest(".task-block, .agenda-block") as HTMLElement | null;
    const blockRect = (blockEl ?? (e.currentTarget as HTMLElement)).getBoundingClientRect();
    startDrag({
      mode: "move",
      id: block.id,
      grabOffsetY: e.clientY - blockRect.top,
      duration: block.duration,
      title: block.title,
      color: block.color,
      kind: block.kind,
    }, e);
  };

  const onResizePointerDown = (e: React.PointerEvent, block: BlockDTO) => {
    e.preventDefault();
    e.stopPropagation();
    startDrag({ mode: "resize", id: block.id, start: block.start }, e);
  };

  // ── drag обязательного кирпичика из лотка ──
  const onNormPointerDown = (e: React.PointerEvent, type: NormType) => {
    e.preventDefault();
    const cfg = NORMS[type];
    startDrag(
      {
        mode: "create",
        source: "template",
        title: `${cfg.emoji} ${cfg.label}`,
        color: NORM_COLOR[type],
        kind: type,
        templateId: null,
        duration: cfg.minDuration,
      },
      e
    );
  };

  // ── drag из библиотеки / inbox ──
  const onTemplatePointerDown = (e: React.PointerEvent, t: TemplateDTO) => {
    e.preventDefault();
    startDrag({
      mode: "create",
      source: "template",
      title: t.name,
      color: t.color,
      kind: t.kind,
      templateId: t.id,
      duration: t.duration,
    }, e);
  };

  const onTaskPointerDown = (e: React.PointerEvent, task: TaskDTO) => {
    const target = e.target as HTMLElement;
    if (target.closest(".inbox-del")) return;
    e.preventDefault();
    startDrag({
      mode: "create",
      source: "task",
      title: task.title,
      color: "purple",
      kind: null,
      templateId: null,
      duration: task.duration ?? 60,
    }, e);
  };

  // ── добавление блока тапом (мобильная лента) ──
  // Первый свободный слот в дне, начиная с 9:00.
  const firstFreeStart = (dayKey: string, duration: number) => {
    const dayBlocks = (blocksByDay[dayKey] ?? [])
      .slice()
      .sort((a, b) => a.start - b.start);
    let start = 9 * 60;
    for (const b of dayBlocks) {
      if (start + duration <= b.start) break;
      if (b.start + b.duration > start) start = b.start + b.duration;
    }
    return start + duration <= DAY_END_MIN ? start : null;
  };

  const addStandardBlock = async (dayKey: string, t: TemplateDTO) => {
    setAddSheetDay(null);
    if (dayOffSet.has(dayKey)) {
      setError("Женя, это выходной, давай оставим его свободным");
      return;
    }
    const start = firstFreeStart(dayKey, t.duration);
    if (start === null) {
      setError("Женя, в этом дне уже нет подходящего свободного окошка");
      return;
    }
    const message = placementMessage({
      dayKey,
      start,
      duration: t.duration,
      kind: t.kind,
    });
    if (message) {
      setError(message);
      return;
    }
    try {
      const created = await api.createBlock({
        title: t.name,
        color: t.color,
        date: dayKey,
        start,
        duration: t.duration,
        kind: t.kind,
        templateId: t.id,
      });
      setBundle((b) => ({ ...b, blocks: [...b.blocks, created] }));
      offerUndo("Блок добавлен", async () => {
        await api.deleteBlock(created.id);
        setBundle((b) => ({ ...b, blocks: b.blocks.filter((x) => x.id !== created.id) }));
      });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const addCustomToDay = (dayKey: string) => {
    setAddSheetDay(null);
    const start = firstFreeStart(dayKey, 60);
    if (start === null) {
      setError("Женя, в этом дне уже нет подходящего свободного окошка");
      return;
    }
    setEditing({
      mode: "create",
      draft: { title: "", color: "rose", date: dayKey, start, duration: 60 },
    });
  };

  // ── клик по пустому месту → создать блок ──
  const onColumnClick = (e: React.MouseEvent, dayIndex: number) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    const dayKey = bundle.days[dayIndex];
    if (dayOffSet.has(dayKey)) {
      setError("Женя, это выходной, давай оставим его свободным");
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const start = Math.min(
      snapMin(yToMin(e.clientY - rect.top)),
      DAY_END_MIN - 60
    );
    setEditing({
      mode: "create",
      draft: { title: "", color: "rose", date: dayKey, start, duration: 60 },
    });
  };

  // ── сохранение из попапа ──
  const saveBlock = async (d: BlockDraft) => {
    try {
      if (d.id) {
        const current = bundle.blocks.find((block) => block.id === d.id);
        if (!current) return;
        const message = placementMessage({
          dayKey: d.date,
          start: d.start,
          duration: d.duration,
          kind: current?.kind ?? null,
          excludeId: d.id,
        });
        if (message) {
          setError(message);
          return;
        }
        const updated = await api.updateBlock(d.id, {
          title: d.title,
          color: d.color,
          date: d.date,
          start: d.start,
          duration: d.duration,
        });
        setBundle((b) => ({
          ...b,
          blocks: b.blocks.map((x) => (x.id === d.id ? updated : x)),
        }));
        offerUndo("Блок изменён", async () => {
          const restored = await api.updateBlock(current.id, {
            title: current.title,
            color: current.color,
            date: current.date,
            start: current.start,
            duration: current.duration,
          });
          setBundle((b) => ({
            ...b,
            blocks: b.blocks.map((x) => (x.id === restored.id ? restored : x)),
          }));
        });
      } else {
        const message = placementMessage({
          dayKey: d.date,
          start: d.start,
          duration: d.duration,
          kind: null,
        });
        if (message) {
          setError(message);
          return;
        }
        const created = await api.createBlock({
          title: d.title,
          color: d.color,
          date: d.date,
          start: d.start,
          duration: d.duration,
        });
        setBundle((b) => ({ ...b, blocks: [...b.blocks, created] }));
        offerUndo("Блок создан", async () => {
          await api.deleteBlock(created.id);
          setBundle((b) => ({ ...b, blocks: b.blocks.filter((x) => x.id !== created.id) }));
        });
      }
      setEditing(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const deleteBlock = async (id: string) => {
    const deleted = bundle.blocks.find((x) => x.id === id);
    setBundle((b) => ({ ...b, blocks: b.blocks.filter((x) => x.id !== id) }));
    setEditing(null);
    try {
      await api.deleteBlock(id);
      if (deleted) {
        offerUndo("Блок удалён", async () => {
          const restored = await api.createBlock({
            title: deleted.title,
            color: deleted.color,
            date: deleted.date,
            start: deleted.start,
            duration: deleted.duration,
            kind: deleted.kind,
            templateId: deleted.templateId,
          });
          setBundle((b) => ({ ...b, blocks: [...b.blocks, restored] }));
        });
      }
    } catch (e) {
      setError((e as Error).message);
      refresh();
    }
  };

  // ── задачи (inbox) ──
  const addTask = async () => {
    const title = prompt("Новая задача:");
    if (!title?.trim()) return;
    try {
      const t = await api.createTask({ title: title.trim() });
      setBundle((b) => ({ ...b, tasks: [...b.tasks, t] }));
      offerUndo("Задача добавлена", async () => {
        await api.deleteTask(t.id);
        setBundle((b) => ({ ...b, tasks: b.tasks.filter((x) => x.id !== t.id) }));
      });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const deleteTask = async (id: string) => {
    const deleted = bundle.tasks.find((x) => x.id === id);
    setBundle((b) => ({ ...b, tasks: b.tasks.filter((x) => x.id !== id) }));
    try {
      await api.deleteTask(id);
      if (deleted) {
        offerUndo("Задача удалена", async () => {
          const restored = await api.createTask({
            title: deleted.title,
            duration: deleted.duration,
          });
          setBundle((b) => ({ ...b, tasks: [...b.tasks, restored] }));
        });
      }
    } catch (e) {
      setError((e as Error).message);
      refresh();
    }
  };

  // ── выходной ──
  const toggleDayOff = async (dayKey: string) => {
    const next = !dayOffSet.has(dayKey);
    const before = [...bundle.dayOff];
    try {
      await api.dayOff(dayKey, next);
      setBundle((b) => ({
        ...b,
        dayOff: next ? [...b.dayOff, dayKey] : b.dayOff.filter((d) => d !== dayKey),
      }));
      offerUndo(next ? "Выходной поставлен" : "Выходной снят", async () => {
        const current = new Set(bundle.days);
        for (const date of bundle.days) await api.dayOff(date, false);
        for (const date of before.filter((date) => current.has(date))) {
          await api.dayOff(date, true);
        }
        setBundle((b) => ({
          ...b,
          dayOff: [
            ...b.dayOff.filter((date) => !current.has(date)),
            ...before.filter((date) => current.has(date)),
          ],
        }));
      });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // ── отъезд ──
  const activeAway = bundle.away[0];
  const startAway = async (s: string, en: string) => {
    const removedBlocks = bundle.blocks.filter((block) => block.date >= s && block.date <= en);
    const previousDayOff = bundle.dayOff.filter((date) => date >= s && date <= en);
    try {
      const away = await api.away(s, en);
      setAwayOpen(false);
      await refresh();
      offerUndo("Отъезд поставлен", async () => {
        await api.returnFromAway(away.id);
        const restored = await Promise.all(
          removedBlocks.map((block) =>
            api.createBlock({
              title: block.title,
              color: block.color,
              date: block.date,
              start: block.start,
              duration: block.duration,
              kind: block.kind,
              templateId: block.templateId,
            })
          )
        );
        const rangeDays = bundle.days.filter((date) => date >= s && date <= en);
        for (const date of rangeDays) await api.dayOff(date, false);
        for (const date of previousDayOff) await api.dayOff(date, true);
        setBundle((b) => ({
          ...b,
          away: b.away.filter((item) => item.id !== away.id),
          blocks: [
            ...b.blocks.filter(
              (block) => !(block.date >= s && block.date <= en && block.title === "✈️ Отъезд")
            ),
            ...restored,
          ],
          dayOff: [
            ...b.dayOff.filter((date) => !(date >= s && date <= en)),
            ...previousDayOff,
          ],
        }));
      });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const returnFromAway = async () => {
    if (!activeAway) return;
    try {
      await api.returnFromAway(activeAway.id);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // ── колбэки мастера «Собрать неделю» ──
  // Добавить разовое дело в список (inbox).
  const wizardAddTask = async (title: string) => {
    try {
      const t = await api.createTask({ title });
      setBundle((b) => ({ ...b, tasks: [...b.tasks, t] }));
      offerUndo("Дело добавлено", async () => {
        await api.deleteTask(t.id);
        setBundle((b) => ({ ...b, tasks: b.tasks.filter((x) => x.id !== t.id) }));
      });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // «Расставить всё»: читаем день/время из текста каждого дела списка,
  // ставим блоки в сетку одним нажатием. Что не разобрали — вернём.
  const wizardPlaceAll = async (): Promise<{ placed: number; unparsed: string[] }> => {
    const working = bundle.blocks.map((b) => ({
      id: b.id,
      date: b.date,
      start: b.start,
      duration: b.duration,
    }));
    const freeStart = (dayKey: string, duration: number): number | null => {
      const dayB = working
        .filter((b) => b.date === dayKey)
        .sort((a, b) => a.start - b.start);
      let s = 9 * 60;
      for (const b of dayB) {
        if (s + duration <= b.start) break;
        if (b.start + b.duration > s) s = b.start + b.duration;
      }
      return s + duration <= DAY_END_MIN ? s : null;
    };
    const isFree = (dayKey: string, start: number, duration: number) =>
      !working.some(
        (b) =>
          b.date === dayKey &&
          start < b.start + b.duration &&
          start + duration > b.start
      );

    const newBlocks: BlockDTO[] = [];
    const placedTasks: TaskDTO[] = [];
    const placedTaskIds: string[] = [];
    const unparsed: string[] = [];
    const duration = 60;

    for (const task of bundle.tasks) {
      const p = parseOneoff(task.title);
      if (p.dayIndex === null) {
        unparsed.push(task.title);
        continue;
      }
      const dayKey = bundle.days[p.dayIndex];
      if (dayOffSet.has(dayKey)) {
        unparsed.push(`${task.title} (выходной)`);
        continue;
      }
      if (p.start !== null && (p.start < DAY_START_MIN || p.start + duration > DAY_END_MIN)) {
        unparsed.push(`${task.title} (время вне дня)`);
        continue;
      }
      if (p.start !== null && !isFree(dayKey, p.start, duration)) {
        unparsed.push(`${task.title} (это время уже занято)`);
        continue;
      }
      const start = p.start ?? freeStart(dayKey, duration);
      if (start == null) {
        unparsed.push(`${task.title} (день занят)`);
        continue;
      }
      try {
        const created = await api.createBlock({
          title: p.title,
          color: "rose",
          date: dayKey,
          start,
          duration,
        });
        newBlocks.push(created);
        placedTasks.push(task);
        placedTaskIds.push(task.id);
        working.push({ id: created.id, date: dayKey, start, duration });
      } catch (e) {
        unparsed.push(`${task.title} (${(e as Error).message})`);
      }
    }
    await Promise.all(placedTaskIds.map((id) => api.deleteTask(id).catch(() => null)));

    setBundle((b) => ({
      ...b,
      blocks: [...b.blocks, ...newBlocks],
      tasks: b.tasks.filter((t) => !placedTaskIds.includes(t.id)),
    }));
    if (newBlocks.length > 0) {
      offerUndo("Разовые дела расставлены", async () => {
        await Promise.all(newBlocks.map((block) => api.deleteBlock(block.id)));
        const restoredTasks = await Promise.all(
          placedTasks.map((task) =>
            api.createTask({ title: task.title, duration: task.duration })
          )
        );
        setBundle((b) => ({
          ...b,
          blocks: b.blocks.filter((block) => !newBlocks.some((created) => created.id === block.id)),
          tasks: [...b.tasks, ...restoredTasks],
        }));
      });
    }
    return { placed: newBlocks.length, unparsed };
  };

  const wizardRemoveBlocks = async (ids: string[]) => {
    const removed = bundle.blocks.filter((x) => ids.includes(x.id));
    setBundle((b) => ({ ...b, blocks: b.blocks.filter((x) => !ids.includes(x.id)) }));
    try {
      await Promise.all(ids.map((id) => api.deleteBlock(id)));
      if (removed.length > 0) {
        offerUndo("Блоки мастера убраны", async () => {
          const restored = await Promise.all(
            removed.map((block) =>
              api.createBlock({
                title: block.title,
                color: block.color,
                date: block.date,
                start: block.start,
                duration: block.duration,
                kind: block.kind,
                templateId: block.templateId,
              })
            )
          );
          setBundle((b) => ({ ...b, blocks: [...b.blocks, ...restored] }));
        });
      }
    } catch (e) {
      setError((e as Error).message);
      refresh();
    }
  };

  const wizardApplyDayOff = async (selected: string | null) => {
    const current = bundle.dayOff.find((d) => bundle.days.includes(d)) ?? null;
    const before = [...bundle.dayOff];
    try {
      if (current && current !== selected) await api.dayOff(current, false);
      if (selected) await api.dayOff(selected, true);
      setBundle((b) => ({
        ...b,
        dayOff: [
          ...b.dayOff.filter((d) => !b.days.includes(d)),
          ...(selected ? [selected] : []),
        ],
      }));
      offerUndo("Выходной в мастере изменён", async () => {
        for (const date of bundle.days) await api.dayOff(date, false);
        for (const date of before.filter((date) => bundle.days.includes(date))) {
          await api.dayOff(date, true);
        }
        setBundle((b) => ({
          ...b,
          dayOff: [
            ...b.dayOff.filter((date) => !b.days.includes(date)),
            ...before.filter((date) => bundle.days.includes(date)),
          ],
        }));
      });
    } catch (e) {
      setError((e as Error).message);
      refresh();
    }
  };

  const applyPromptDayOff = async () => {
    if (!dayOffPromptChoice) {
      setDayOffPromptHidden(true);
      return;
    }
    await wizardApplyDayOff(dayOffPromptChoice);
    setDayOffPromptHidden(true);
    setDayOffPromptChoice(null);
  };

  const finishWizard = () => {
    setWizardOpen(false);
    setSidebarOpen(false);
    // подсказка после мастера
    window.setTimeout(() => {
      if (trayRemaining > 0) {
        flashInfo("Женя, пожалуйста, расставь любимые блоки в подходящие окошки");
      } else {
        flashInfo("Женя, неделя уже выглядит собранной");
      }
    }, 250);
  };

  // ── рендер одного блока ──
  const renderBlock = (block: BlockDTO, layout: Layout) => {
    const live =
      preview && preview.id === block.id && preview.mode !== "create" ? preview : null;
    const start = live ? live.start : block.start;
    const duration = live ? live.duration : block.duration;
    const lay = layout[block.id] ?? { left: 0, width: 100 };
    const dragging = Boolean(live);

    return (
      <div
        key={block.id}
        className={`task-block block-${block.color}${
          dragging ? " dragging" : ""
        }${block.id === justPlacedId ? " snap-pop" : ""}`}
        style={{
          top: minToY(start),
          height: Math.max(pxHeight(duration), 26),
          left: dragging ? "3px" : `calc(${lay.left}% + 3px)`,
          width: dragging ? "auto" : `calc(${lay.width}% - 6px)`,
          right: dragging ? "3px" : "auto",
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          setEditing({
            mode: "edit",
            draft: {
              id: block.id,
              title: block.title,
              color: block.color,
              date: block.date,
              start: block.start,
              duration: block.duration,
            },
          });
        }}
      >
        <div className="task-block-title">{block.title}</div>
        <div className="task-block-time">
          {formatTime(start)} · {formatDuration(duration)}
        </div>
        <button
          className="block-move-handle"
          title="Перенести блок"
          aria-label="Перенести блок"
          onPointerDown={(e) => onBlockPointerDown(e, block)}
          onClick={(e) => e.stopPropagation()}
        >
          ↕
        </button>
        <div className="resize-handle" onPointerDown={(e) => onResizePointerDown(e, block)} />
      </div>
    );
  };

  const weekStartDate = startOfWeek(fromDateKey(weekStart));

  return (
    <>
      {/* HEADER */}
      <header className="app-header">
        <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
          <div className="app-logo">
            sheyn&apos;s <span>plan</span>
            <em>ner</em>
          </div>
          <div className="week-nav">
            <button className="nav-btn" onClick={() => goWeek(-1)} aria-label="Прошлая неделя">
              ‹
            </button>
            <span className="week-title" onClick={goToday} style={{ cursor: "pointer" }}>
              {formatWeekTitle(weekStartDate)}
            </span>
            <button className="nav-btn" onClick={() => goWeek(1)} aria-label="Следующая неделя">
              ›
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {norms.map((n) => (
            <div key={n.type} className={`norm-chip ${n.complete ? "norm-done" : "norm-todo"}`}>
              <div className={`dot ${n.complete ? "dot-green" : "dot-red"}`} />
              {n.emoji} {n.label} {n.done}/{n.required}
            </div>
          ))}
        </div>

        <div className="header-actions">
          {activeAway ? (
            <button className="btn-ghost active" onClick={returnFromAway}>
              🏠 Я вернулась
            </button>
          ) : (
            <button className="btn-ghost" onClick={() => setAwayOpen(true)}>
              ✈️ Я уезжаю
            </button>
          )}
          <button className="btn-ghost" onClick={() => setStatsOpen(true)} title="Статистика">
            📊
          </button>
          <a
            className="btn-ghost"
            href={`/api/screenshot?week=${weekStart}`}
            title="Скачать неделю картинкой"
            style={{ textDecoration: "none" }}
          >
            🖼
          </a>
          <button className="btn-ghost" onClick={() => setWizardOpen(true)}>
            ✨ Собрать неделю
          </button>
          <button
            className="btn-primary"
            onClick={() =>
              setEditing({
                mode: "create",
                draft: {
                  title: "",
                  color: "rose",
                  date: bundle.days[mobileDay] ?? bundle.days[0],
                  start: 9 * 60,
                  duration: 60,
                },
              })
            }
          >
            + Задача
          </button>
        </div>
      </header>

      {error && (
        <div
          style={{
            position: "fixed",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--terracotta)",
            color: "white",
            padding: "8px 16px",
            borderRadius: 20,
            fontSize: 13,
            zIndex: 200,
            cursor: "pointer",
          }}
          onClick={() => setError(null)}
        >
          {error} ✕
        </div>
      )}

      {infoToast && <div className="info-toast">{infoToast}</div>}
      {undoStack.length > 0 && (
        <div className="undo-toast">
          <span>{undoStack.at(-1)?.message}</span>
          <button type="button" onClick={runUndo}>
            Отменить
          </button>
          <button
            type="button"
            className="undo-toast-close"
            aria-label="Скрыть"
            onClick={() => setUndoStack([])}
          >
            ×
          </button>
        </div>
      )}

      {/* MAIN */}
      <div
        className={`main-layout ${
          mobileView === "week"
            ? `mv-week ${
                mobileWeekMode === "scroll"
                  ? "mv-week-scroll"
                  : mobileWeekMode === "list"
                    ? "mv-week-list"
                    : "mv-week-grid"
              }`
            : "mv-day"
        }`}
      >
        {/* SIDEBAR */}
        <aside className={`sidebar${sidebarOpen ? " open" : ""}`}>
          <div className="sidebar-handle" onClick={() => setSidebarOpen((v) => !v)}>
            {sidebarOpen ? "▼ Скрыть" : "▲ Задачи и блоки"}
          </div>
          <div>
            <div className="sidebar-section-title">
              Библиотека блоков
              <button className="sidebar-edit-btn" onClick={() => setTemplatesOpen(true)}>
                настроить
              </button>
            </div>
            {bundle.templates.map((t) => (
              <div
                key={t.id}
                className="block-item"
                onPointerDown={(e) => onTemplatePointerDown(e, t)}
                title="Можно мягко перенести в нужный день"
              >
                <div
                  className="block-color-dot"
                  style={{ background: colorDot(t.color) }}
                />
                <span style={{ fontSize: 13 }}>{t.name}</span>
                <span className="block-duration">{formatDuration(t.duration)}</span>
              </div>
            ))}
          </div>

          <div>
            <div className="sidebar-section-title">Список задач</div>
            {bundle.tasks.length === 0 && (
              <p style={{ fontSize: 12, color: "var(--light-gray)", marginBottom: 8 }}>
                Пока здесь спокойно. Если появится дело, Женя, можно добавить его сюда.
              </p>
            )}
            {bundle.tasks.map((task) => (
              <div
                key={task.id}
                className="inbox-item"
                onPointerDown={(e) => onTaskPointerDown(e, task)}
                title="Можно перенести в день"
              >
                <span style={{ fontSize: 14, marginTop: 1 }}>◦</span>
                <span className="inbox-text">{task.title}</span>
                <span className="inbox-del" onClick={() => deleteTask(task.id)}>
                  ✕
                </span>
              </div>
            ))}
            <button className="add-task-btn" onClick={addTask}>
              + Добавить задачу
            </button>
          </div>
        </aside>

        {/* Переключатель Неделя / День (мобильный) */}
        <div className="mobile-view-toggle">
          <button
            className={mobileView === "week" ? "active" : ""}
            onClick={() => setMobileView("week")}
          >
            Неделя
          </button>
          <button
            className={mobileView === "day" ? "active" : ""}
            onClick={() => setMobileView("day")}
          >
            День
          </button>
        </div>

        <div className="mobile-week-mode-toggle" aria-label="Вид недели">
          <button
            className={mobileWeekMode === "list" ? "active" : ""}
            onClick={() => setMobileWeekMode("list")}
          >
            Список
          </button>
          <button
            className={mobileWeekMode === "grid" ? "active" : ""}
            onClick={() => setMobileWeekMode("grid")}
          >
            Сетка
          </button>
          <button
            className={mobileWeekMode === "scroll" ? "active" : ""}
            onClick={() => setMobileWeekMode("scroll")}
          >
            Скролл
          </button>
        </div>

        <div className="mobile-list-tray">
          {trayRemaining > 0 ? (
            <>
              <div className="mobile-list-tray-title">
                Женя, пожалуйста, перенеси в подходящее окошко
              </div>
              <div className="mobile-list-bricks">
                {normTray.flatMap((n) =>
                  Array.from({ length: n.remaining }, (_, idx) => (
                    <div
                      key={`${n.type}-${idx}`}
                      className={`tray-brick block-${NORM_COLOR[n.type]}`}
                      onPointerDown={(e) => onNormPointerDown(e, n.type)}
                      title={`${n.cfg.label}: минимум ${formatDuration(n.cfg.minDuration)}`}
                    >
                      {n.cfg.emoji} {n.cfg.label}
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <>
              <div className="mobile-list-tray-title">Можно добавить ещё</div>
              <div className="mobile-list-bricks">
                {NORM_TYPES.map((type) => (
                  <div
                    key={type}
                    className={`tray-brick block-${NORM_COLOR[type]}`}
                    onPointerDown={(e) => onNormPointerDown(e, type)}
                    title={`${NORMS[type].label}: ${formatDuration(NORMS[type].minDuration)}`}
                  >
                    {NORMS[type].emoji} {NORMS[type].label}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* НЕДЕЛЬНАЯ ЛЕНТА (мобильная главная) */}
        <div className="week-agenda">
          {bundle.days.map((dayKey, i) => {
            const off = dayOffSet.has(dayKey);
            const d = fromDateKey(dayKey);
            const dayBlocks = (blocksByDay[dayKey] ?? [])
              .slice()
              .sort((a, b) => a.start - b.start);
            const dayGaps = agendaGapsByDay[dayKey] ?? [];
            const beforeFirstGaps =
              dayBlocks.length > 0
                ? dayGaps.filter((gap) => gap.end <= dayBlocks[0].start)
                : [];
            return (
              <div
                key={dayKey}
                className={`agenda-day${dayKey === today ? " is-today" : ""}${
                  off ? " is-dayoff" : ""
                }`}
              >
                <div className="agenda-day-head">
                  <span className="agenda-day-name">{WEEKDAYS_SHORT[i]}</span>
                  <span className="agenda-day-num">{d.getUTCDate()}</span>
                  {off && <span className="agenda-dayoff-badge">выходной</span>}
                  <button
                    className={`agenda-dayoff-btn${off ? " active" : ""}`}
                    onClick={() => toggleDayOff(dayKey)}
                    title={off ? "Отменить выходной" : "Сделать выходным"}
                  >
                    {off ? "↺" : "☼"}
                  </button>
                </div>

                <div className="agenda-blocks">
                  {dayBlocks.length === 0 && dayGaps.length === 0 && (
                    <div className="agenda-empty">
                      {off ? "Выходной 🌿" : "Свободно"}
                    </div>
                  )}
                  {beforeFirstGaps.map((gap) => (
                    <button
                      key={gap.id}
                      className={`agenda-gap agenda-gap-${gap.variant}${
                        agendaDropId === gap.id ? " is-drag-over" : ""
                      }`}
                      data-gap-id={gap.id}
                      data-day-index={i}
                      data-start={gap.start}
                      data-end={gap.end}
                      data-fits={gap.fits.join(",")}
                      onClick={() => setAddSheetDay(dayKey)}
                    >
                      <span className="agenda-gap-time">
                        {formatTime(gap.start)} до {formatTime(gap.end)}
                      </span>
                      <span className="agenda-gap-body">
                        <span className="agenda-gap-title">Окошко</span>
                        <span className="agenda-gap-hint">
                          Сюда мягко встанет{" "}
                          {gap.fits
                            .map((type) => `${NORMS[type].emoji} ${NORMS[type].label}`)
                            .join(" или ")}
                        </span>
                      </span>
                    </button>
                  ))}
                  {dayBlocks.map((b) => {
                    const afterGaps = dayGaps.filter(
                      (gap) => gap.start === b.start + b.duration
                    );

                    return (
                      <div key={b.id} className="agenda-item-group">
                        <div
                          className="agenda-block"
                          onClick={() =>
                            setEditing({
                              mode: "edit",
                              draft: {
                                id: b.id,
                                title: b.title,
                                color: b.color,
                                date: b.date,
                                start: b.start,
                                duration: b.duration,
                              },
                            })
                          }
                        >
                          <div
                            className="agenda-color"
                            style={{ background: colorDot(b.color) }}
                          />
                          <span className="agenda-block-time">{formatTime(b.start)}</span>
                          <div className="agenda-block-body">
                            <div className="agenda-block-title">{b.title}</div>
                            <div className="agenda-block-dur">
                              {formatTime(b.start + b.duration)}
                            </div>
                          </div>
                          <button
                            className="agenda-move-handle"
                            title="Перенести блок"
                            aria-label="Перенести блок"
                            onPointerDown={(e) => onBlockPointerDown(e, b)}
                            onClick={(e) => e.stopPropagation()}
                          >
                            ↕
                          </button>
                        </div>

                        {afterGaps.map((gap) => (
                          <button
                            key={gap.id}
                            className={`agenda-gap agenda-gap-${gap.variant}${
                              agendaDropId === gap.id ? " is-drag-over" : ""
                            }`}
                            data-gap-id={gap.id}
                            data-day-index={i}
                            data-start={gap.start}
                            data-end={gap.end}
                            data-fits={gap.fits.join(",")}
                            onClick={() => setAddSheetDay(dayKey)}
                          >
                            <span className="agenda-gap-time">
                              {formatTime(gap.start)} до {formatTime(gap.end)}
                            </span>
                            <span className="agenda-gap-body">
                              <span className="agenda-gap-title">Окошко</span>
                              <span className="agenda-gap-hint">
                                Сюда мягко встанет{" "}
                                {gap.fits
                                  .map((type) => `${NORMS[type].emoji} ${NORMS[type].label}`)
                                  .join(" или ")}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    );
                  })}

                  {dayBlocks.length === 0 &&
                    dayGaps.map((gap) => (
                      <button
                        key={gap.id}
                        className={`agenda-gap agenda-gap-${gap.variant}${
                          agendaDropId === gap.id ? " is-drag-over" : ""
                        }`}
                        data-gap-id={gap.id}
                        data-day-index={i}
                        data-start={gap.start}
                        data-end={gap.end}
                        data-fits={gap.fits.join(",")}
                        onClick={() => setAddSheetDay(dayKey)}
                      >
                        <span className="agenda-gap-time">
                          {formatTime(gap.start)} до {formatTime(gap.end)}
                        </span>
                        <span className="agenda-gap-body">
                          <span className="agenda-gap-title">Окошко</span>
                          <span className="agenda-gap-hint">
                            Сюда мягко встанет{" "}
                            {gap.fits
                              .map((type) => `${NORMS[type].emoji} ${NORMS[type].label}`)
                              .join(" или ")}
                          </span>
                        </span>
                      </button>
                    ))}
                </div>

                {!off && (
                  <button className="agenda-add" onClick={() => setAddSheetDay(dayKey)}>
                    + блок
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* CALENDAR */}
        <div
          className="calendar-area"
          onTouchStart={onAreaTouchStart}
          onTouchEnd={onAreaTouchEnd}
        >
          {/* Лоток обязательных кирпичиков */}
          {trayRemaining > 0 && (
            <div className="norm-tray">
              <div className="norm-tray-title">Любимые блоки недели</div>
              <div className="norm-tray-hint">
                Женя, пожалуйста, перенеси их в подходящие окошки. Блок аккуратно встанет.
              </div>
              <div className="tray-bricks">
                {normTray.flatMap((n) =>
                  Array.from({ length: n.remaining }, (_, i) => (
                    <div
                      key={`${n.type}-${i}`}
                      className={`tray-brick block-${NORM_COLOR[n.type]}`}
                      onPointerDown={(e) => onNormPointerDown(e, n.type)}
                      title={`${n.cfg.label}: минимум ${formatDuration(n.cfg.minDuration)}`}
                    >
                      {n.cfg.emoji} {n.cfg.label}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Лоток дополнительных блоков сверх нормы */}
          {trayRemaining === 0 && !extrasHidden && (
            <div className="norm-tray">
              <div className="norm-tray-title">Если захочется ещё</div>
              <div className="norm-tray-hint">
                Неделя уже собрана. Можно добавить ещё блок только если хочется.
              </div>
              <div className="tray-bricks">
                {NORM_TYPES.map((t) => (
                  <div
                    key={t}
                    className={`tray-brick block-${NORM_COLOR[t]}`}
                    onPointerDown={(e) => onNormPointerDown(e, t)}
                    title={`${NORMS[t].label}: минимум ${formatDuration(NORMS[t].minDuration)}`}
                  >
                    {NORMS[t].emoji} {NORMS[t].label}
                  </div>
                ))}
              </div>
              <button className="tray-hide-btn" onClick={() => setExtrasHidden(true)}>
                Скрыть
              </button>
            </div>
          )}

          {/* Mobile day switcher */}
          <div className="mobile-day-switch">
            <button
              className="nav-btn"
              onClick={() => setMobileDay((d) => Math.max(0, d - 1))}
            >
              ‹
            </button>
            <span className="week-title">{mobileDayLabel(bundle.days[mobileDay])}</span>
            <button
              className="nav-btn"
              onClick={() => setMobileDay((d) => Math.min(6, d + 1))}
            >
              ›
            </button>
          </div>

          {/* Days header */}
          <div className="days-header">
            <div style={{ borderRight: "1px solid rgba(196,189,180,0.2)" }} />
            {bundle.days.map((dayKey, i) => {
              const off = dayOffSet.has(dayKey);
              const d = fromDateKey(dayKey);
              return (
                <div
                  key={dayKey}
                  className={`day-header${off ? " holiday" : ""}${
                    mobileView === "day" && i !== mobileDay ? " mobile-hidden" : ""
                  }`}
                >
                  <div className="day-name">{WEEKDAYS_SHORT[i]}</div>
                  <div className={`day-number${dayKey === today ? " today" : ""}`}>
                    {d.getUTCDate()}
                  </div>
                  {off && <div className="holiday-badge">выходной</div>}
                  <button
                    className={`dayoff-btn${off ? " active" : ""}`}
                    title={off ? "Отменить выходной" : "Сделать выходным"}
                    onClick={() => toggleDayOff(dayKey)}
                  >
                    {off ? "↺" : "☼"}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Time grid */}
          <div className="time-grid" style={{ height: GRID_HEIGHT }}>
            <div className="time-col">
              {HOURS.map((h) => (
                <div key={h} className="time-slot">
                  <span className="time-label">{String(h).padStart(2, "0")}:00</span>
                </div>
              ))}
            </div>

            {bundle.days.map((dayKey, dayIndex) => {
              const dayBlocks = blocksByDay[dayKey] ?? [];
              const layout = layoutDay(dayBlocks);
              const off = dayOffSet.has(dayKey);
              const showGhost =
                preview && preview.mode === "create" && preview.dayIndex === dayIndex;
              return (
                <div
                  key={dayKey}
                  ref={(el) => {
                    colRefs.current[dayIndex] = el;
                  }}
                  className={`day-col${off ? " holiday-col" : ""}${
                    mobileView === "day" && dayIndex !== mobileDay ? " mobile-hidden" : ""
                  }`}
                  onClick={(e) => onColumnClick(e, dayIndex)}
                >
                  {HOURS.map((h) => (
                    <div key={h} className="hour-line" />
                  ))}

                  {off && (
                    <div className="holiday-overlay">
                      <span className="holiday-label">ВЫХОДНОЙ</span>
                    </div>
                  )}

                  {dayBlocks.map((b) => renderBlock(b, layout))}

                  {showGhost && preview && (
                    <div
                      className="drop-ghost"
                      style={{ top: minToY(preview.start), height: pxHeight(preview.duration) }}
                    >
                      <div style={{ padding: "6px 8px", fontSize: 11.5, color: "var(--terracotta)" }}>
                        {preview.title}
                        <div style={{ fontSize: 10, opacity: 0.8 }}>
                          {formatTime(preview.start)} · {formatDuration(preview.duration)}
                        </div>
                      </div>
                    </div>
                  )}

                  {dayKey === today && <NowLine />}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {loading && (
        <div
          style={{
            position: "fixed",
            bottom: 12,
            right: 12,
            fontSize: 12,
            color: "var(--mid-gray)",
            zIndex: 200,
          }}
        >
          Загрузка…
        </div>
      )}

      {dragOverlay && (
        <div
          className={`drag-follower block-${dragOverlay.color}`}
          style={{
            left: `clamp(10px, ${dragOverlay.x + 14}px, calc(100vw - 158px))`,
            top: `clamp(10px, ${dragOverlay.y + 14}px, calc(100vh - 64px))`,
          }}
        >
          <div className="drag-follower-title">{dragOverlay.title}</div>
          <div className="drag-follower-time">{formatDuration(dragOverlay.duration)}</div>
        </div>
      )}

      {showDayOffPrompt && (
        <div
          className="popup-overlay app-notice-overlay"
          onClick={() => setDayOffPromptHidden(true)}
        >
          <div className="popup app-notice-popup" onClick={(e) => e.stopPropagation()}>
            <div className="popup-title serif">Женя, давай выберем выходной</div>
            <p className="wizard-intro">
              Любимые блоки уже на месте. Пожалуйста, оставим в неделе честную паузу.
            </p>
            <div className="wizard-dayoff-grid" style={{ marginBottom: 16 }}>
              {bundle.days.map((dayKey, i) => (
                <div
                  key={dayKey}
                  className={`wizard-day${dayOffPromptChoice === dayKey ? " selected" : ""}`}
                  onClick={() =>
                    setDayOffPromptChoice(dayOffPromptChoice === dayKey ? null : dayKey)
                  }
                >
                  <div className="wizard-day-name">{WEEKDAYS_SHORT[i]}</div>
                  <div className="wizard-day-num">{fromDateKey(dayKey).getUTCDate()}</div>
                </div>
              ))}
            </div>
            <div className="popup-actions" style={{ justifyContent: "flex-end" }}>
              <button className="btn-ghost" onClick={() => setDayOffPromptHidden(true)}>
                Позже
              </button>
              <button className="btn-primary" onClick={applyPromptDayOff}>
                {dayOffPromptChoice ? "Сделать выходным" : "Без выходного"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <EditBlockPopup
          mode={editing.mode}
          draft={editing.draft}
          onSave={saveBlock}
          onDelete={editing.draft.id ? () => deleteBlock(editing.draft.id!) : undefined}
          onClose={() => setEditing(null)}
          weekDays={bundle.days}
        />
      )}

      {awayOpen && (
        <AwayPopup
          defaultStart={today}
          onConfirm={startAway}
          onClose={() => setAwayOpen(false)}
        />
      )}

      {wizardOpen && (
        <WeekWizard
          bundle={bundle}
          onRemoveBlocks={wizardRemoveBlocks}
          onAddTask={wizardAddTask}
          onRemoveTask={deleteTask}
          onPlaceAll={wizardPlaceAll}
          onFinish={finishWizard}
          onClose={() => setWizardOpen(false)}
        />
      )}

      {statsOpen && <StatsPanel onClose={() => setStatsOpen(false)} />}

      {templatesOpen && (
        <TemplateEditor
          templates={bundle.templates}
          onChange={(list) => setBundle((b) => ({ ...b, templates: list }))}
          onUndo={offerUndo}
          onClose={() => setTemplatesOpen(false)}
        />
      )}

      {addSheetDay && (
        <div className="add-sheet-overlay" onClick={() => setAddSheetDay(null)}>
          <div className="add-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="add-sheet-title serif">Добавить в день</div>
            <div className="add-sheet-chips">
              {bundle.templates.map((t) => (
                <button
                  key={t.id}
                  className="add-sheet-chip"
                  onClick={() => addStandardBlock(addSheetDay, t)}
                >
                  {t.name}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn-ghost"
                style={{ flex: 1 }}
                onClick={() => addCustomToDay(addSheetDay)}
              >
                ✏️ Своя задача
              </button>
              <button className="btn-ghost" onClick={() => setAddSheetDay(null)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {celebrate && (
        <div className="popup-overlay" onClick={() => setCelebrate(false)}>
          <div
            className="popup celebrate-popup"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="celebrate-emoji">🎉</div>
            <div className="popup-title serif" style={{ marginBottom: 8 }}>
              Женя, неделя собрана
            </div>
            <p style={{ fontSize: 13, color: "var(--mid-gray)", marginBottom: 20 }}>
              Любимые блоки нашли свои места. Можно выдохнуть, и пусть всё идёт
              мягко 💛
            </p>
            <button
              className="btn-primary"
              style={{ width: "100%" }}
              onClick={() => setCelebrate(false)}
            >
              Спасибо
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// Линия «сейчас» по локальному времени.
function NowLine() {
  const [top, setTop] = useState<number | null>(null);
  useEffect(() => {
    const update = () => {
      const now = new Date();
      const min = now.getHours() * 60 + now.getMinutes();
      if (min < DAY_START_HOUR * 60 || min > DAY_END_MIN) {
        setTop(null);
      } else {
        setTop(minToY(min));
      }
    };
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, []);
  if (top === null) return null;
  return <div className="now-line" style={{ top }} />;
}

function colorDot(color: ColorKey): string {
  const map: Record<ColorKey, string> = {
    blue: "#6E9EBF",
    purple: "#8B7FA8",
    green: "#7A9B7A",
    bordeaux: "#C4897A",
    orange: "#C4704A",
    mint: "#7AAFA8",
    rose: "#C4899A",
    gold: "#C9A96E",
  };
  return map[color];
}

const MOBILE_MONTHS = [
  "янв", "фев", "мар", "апр", "мая", "июн",
  "июл", "авг", "сен", "окт", "ноя", "дек",
];
function mobileDayLabel(dayKey: string): string {
  if (!dayKey) return "";
  const d = fromDateKey(dayKey);
  const wd = WEEKDAYS_SHORT[(d.getUTCDay() + 6) % 7];
  return `${wd}, ${d.getUTCDate()} ${MOBILE_MONTHS[d.getUTCMonth()]}`;
}
