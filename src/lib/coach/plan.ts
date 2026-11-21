// Типы плана тренера Таля, валидация ответа ИИ, fallback-план, прогресс.
// Клиент и сервер оба используют этот файл.

export type ItemKey =
  | 'tactics' | 'threats' | 'openings' | 'convert' | 'endgames'
  | 'sac' | 'mistakes' | 'blind' | 'play' | 'book' | 'video';

export const ITEM_KEYS: ItemKey[] = [
  'tactics', 'threats', 'openings', 'convert', 'endgames',
  'sac', 'mistakes', 'blind', 'play', 'book', 'video',
];

export const ITEM_META: Record<ItemKey, { title: string; href: string | null; manual: boolean }> = {
  tactics:  { title: 'Тактика',           href: '/tactics',         manual: false },
  threats:  { title: 'Проверка угроз',    href: '/threats',         manual: false },
  openings: { title: 'Дебюты',            href: '/openings/review', manual: false },
  convert:  { title: 'Дожми партию',      href: '/convert',         manual: true  },
  endgames: { title: 'Эндшпили',          href: '/endgames',        manual: false },
  sac:      { title: 'Жертвы',            href: '/sac',             manual: false },
  mistakes: { title: 'Ошибки',            href: '/mistakes',        manual: false },
  blind:    { title: 'Расчёт вслепую',    href: '/blind',           manual: true  },
  play:     { title: 'Партия и разбор',   href: '/play',            manual: false },
  book:     { title: 'Книга',             href: null,               manual: true  },
  video:    { title: 'Видео',             href: null,               manual: true  },
};

export interface PlanItem {
  key: ItemKey;
  what: string;      // «20 задач», «15 позиций»
  why: string;       // короткая причина, до 50 знаков
  min: number;       // минут на задание (5–40)
  target: number;    // целевое число (задач, позиций, линий)
}

export type ChangeKind = 'plus' | 'minus' | 'new' | 'removed';

export interface PlanChange {
  kind: ChangeKind;
  key?: ItemKey;
  delta_min?: number;
  title: string;
  why: string;
}

export interface Plan {
  message: string;
  items: PlanItem[];
  changes: PlanChange[];
  total_min: number;
}

export type PatchOp =
  | { type: 'move_to_tomorrow'; key: ItemKey }
  | { type: 'set_min'; key: ItemKey; min: number }
  | { type: 'add'; item: PlanItem }
  | { type: 'remove'; key: ItemKey };

export interface PlanPatch {
  reason: string;
  ops: PatchOp[];
}

// ── Валидация ответа ИИ ────────────────────────────────────────────────────

export function isItemKey(x: unknown): x is ItemKey {
  return typeof x === 'string' && (ITEM_KEYS as string[]).includes(x);
}

function isNum(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}
function isStr(x: unknown, max = 200): x is string {
  return typeof x === 'string' && x.length <= max;
}

export function validatePlan(raw: unknown): Plan | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isStr(r.message, 500)) return null;
  if (!Array.isArray(r.items) || r.items.length < 3 || r.items.length > 9) return null;

  const items: PlanItem[] = [];
  for (const it of r.items as unknown[]) {
    if (!it || typeof it !== 'object') return null;
    const o = it as Record<string, unknown>;
    if (!isItemKey(o.key)) return null;
    if (!isStr(o.what, 60)) return null;
    if (!isStr(o.why, 80)) return null;
    if (!isNum(o.min) || o.min < 5 || o.min > 60) return null;
    const target = isNum(o.target) ? Math.max(1, Math.round(o.target)) : 1;
    items.push({ key: o.key, what: o.what, why: o.why, min: Math.round(o.min), target });
  }

  const changes: PlanChange[] = [];
  if (Array.isArray(r.changes)) {
    for (const ch of r.changes as unknown[]) {
      if (!ch || typeof ch !== 'object') continue;
      const o = ch as Record<string, unknown>;
      const kind = o.kind as string;
      if (!['plus','minus','new','removed'].includes(kind)) continue;
      if (!isStr(o.title, 100) || !isStr(o.why, 120)) continue;
      changes.push({
        kind: kind as ChangeKind,
        key: isItemKey(o.key) ? o.key : undefined,
        delta_min: isNum(o.delta_min) ? Math.round(o.delta_min) : undefined,
        title: o.title,
        why: o.why,
      });
    }
  }

  const total_min = items.reduce((s, it) => s + it.min, 0);
  return { message: r.message, items, changes, total_min };
}

// ── Валидация plan_patch ──────────────────────────────────────────────────

export function validatePatch(raw: unknown): PlanPatch | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isStr(r.reason, 200)) return null;
  if (!Array.isArray(r.ops)) return null;
  const ops: PatchOp[] = [];
  for (const op of r.ops as unknown[]) {
    if (!op || typeof op !== 'object') continue;
    const o = op as Record<string, unknown>;
    const type = o.type as string;
    if (type === 'move_to_tomorrow' && isItemKey(o.key)) ops.push({ type, key: o.key });
    else if (type === 'remove' && isItemKey(o.key)) ops.push({ type, key: o.key });
    else if (type === 'set_min' && isItemKey(o.key) && isNum(o.min) && o.min >= 5 && o.min <= 60)
      ops.push({ type, key: o.key, min: Math.round(o.min) });
    else if (type === 'add' && o.item && typeof o.item === 'object') {
      const subPlan = validatePlan({ message: 'x', items: [o.item] });
      if (subPlan && subPlan.items.length === 1) ops.push({ type: 'add', item: subPlan.items[0] });
    }
  }
  if (ops.length === 0) return null;
  return { reason: r.reason, ops };
}

export function applyPatch(plan: Plan, patch: PlanPatch): Plan {
  let items = [...plan.items];
  for (const op of patch.ops) {
    if (op.type === 'move_to_tomorrow' || op.type === 'remove') {
      items = items.filter(it => it.key !== op.key);
    } else if (op.type === 'set_min') {
      items = items.map(it => it.key === op.key ? { ...it, min: op.min } : it);
    } else if (op.type === 'add') {
      if (!items.some(it => it.key === op.item.key)) items.push(op.item);
    }
  }
  const total_min = items.reduce((s, it) => s + it.min, 0);
  return { ...plan, items, total_min };
}

// ── Fallback-план (без ИИ) ──────────────────────────────────────────────

export interface FallbackContext {
  daily_minutes: number;       // coach_settings.daily_minutes
  top_leak_key?: ItemKey;      // ключ главной причины поражений
  top_leak_count?: number;     // число партий с этим признаком
  tactics_acc?: number;        // 0..1 точность задач за 7 дней
  openings_due?: number;       // линий к повторению
}

export function buildFallbackPlan(ctx: FallbackContext): Plan {
  const items: PlanItem[] = [];
  const accPct = ctx.tactics_acc != null ? Math.round(ctx.tactics_acc * 100) : null;

  // 1) Разминка — тактика 15 мин
  items.push({
    key: 'tactics',
    what: '20 задач',
    why: accPct != null ? `Точность ${accPct}%. Разогрев.` : 'Разогрев перед игрой.',
    min: 15,
    target: 20,
  });

  // 2) Главная причина поражений — 20 мин
  if (ctx.top_leak_key && ctx.top_leak_key !== 'tactics') {
    const meta = ITEM_META[ctx.top_leak_key];
    items.push({
      key: ctx.top_leak_key,
      what: meta.manual ? '20 минут' : '15 позиций',
      why: `${ctx.top_leak_count ?? 0} поражений — главная причина.`,
      min: 20,
      target: ctx.top_leak_key === 'openings' ? 10 : 15,
    });
  }

  // 3) Линии к повторению
  if (ctx.openings_due && ctx.openings_due > 0 && !items.some(it => it.key === 'openings')) {
    items.push({
      key: 'openings',
      what: `${Math.min(ctx.openings_due, 20)} линий`,
      why: `${ctx.openings_due} линий к повторению.`,
      min: 15,
      target: Math.min(ctx.openings_due, 20),
    });
  }

  // 4) Одна партия с разбором, 25 мин
  items.push({
    key: 'play',
    what: '1 партия',
    why: 'Партия + разбор ошибок.',
    min: 25,
    target: 1,
  });

  // 5) Остаток — книга
  const used = items.reduce((s, it) => s + it.min, 0);
  const remain = Math.max(0, ctx.daily_minutes - used);
  if (remain >= 10) {
    items.push({
      key: 'book',
      what: `${remain} минут`,
      why: 'Теория для разнообразия.',
      min: remain,
      target: 1,
    });
  }

  const total_min = items.reduce((s, it) => s + it.min, 0);
  return {
    message: 'План готов. Начни с тактики.',
    items,
    changes: [],
    total_min,
  };
}
