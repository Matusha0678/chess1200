// Analyzer that generates natural-language insights from game_insights data.
// Produces a prioritized list of findings for the "Ассистент" block.

import type { DemoInsight } from './demo-positions';

export type InsightSeverity = 'high' | 'med' | 'low' | 'good';

export interface Insight {
  id: string;
  severity: InsightSeverity;
  icon: string;
  title: string;
  body: string;
  stat?: { value: string; label: string };
  action?: { label: string; href: string };
}

function round(n: number): number {
  return Math.round(n);
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

export function generateInsights(insights: DemoInsight[]): Insight[] {
  const found: Insight[] = [];
  if (insights.length === 0) return found;

  const total = insights.length;
  const losses = insights.filter(i => i.result === 'loss');
  const wins   = insights.filter(i => i.result === 'win');
  const draws  = insights.filter(i => i.result === 'draw');

  const winPct = pct(wins.length, total);
  const lossPct = pct(losses.length, total);

  // ── 1. Time trouble is the top loss cause ──────────────────────────
  if (losses.length >= 5) {
    const ttLosses = losses.filter(i => i.time_trouble).length;
    const ttPct = pct(ttLosses, losses.length);
    if (ttPct >= 30) {
      found.push({
        id: 'time-trouble',
        severity: ttPct >= 50 ? 'high' : 'med',
        icon: '⏱',
        title: 'Цейтнот — твой главный враг',
        body: `В ${ttPct}% проигрышей ты попадал в цейтнот. Это самая частая причина потерь. Попробуй играть rapid длиннее или меньше думать над простыми ходами.`,
        stat: { value: `${ttLosses}/${losses.length}`, label: 'проигрышей в цейтноте' },
        action: { label: 'Тренироваться быстро', href: '/sprint' },
      });
    }
  }

  // ── 2. Dropping openings (deviations) ──────────────────────────────
  if (total >= 10) {
    const devCount = insights.filter(i => i.decisive_phase === 'opening' && i.decisive_cls === 'mistake').length;
    const devPct = pct(devCount, total);
    if (devCount >= 5) {
      found.push({
        id: 'dev-opening',
        severity: devPct >= 25 ? 'high' : 'med',
        icon: '♟',
        title: 'Ты часто уходишь от своих линий',
        body: `${devCount} партий из последних — где ты отклонился от выученных дебютных линий. Повтори линии перед игрой или добавь нужные варианты в репертуар.`,
        stat: { value: `${devCount}`, label: devCount === 1 ? 'отход' : devCount <= 4 ? 'отхода' : 'отходов' },
        action: { label: 'Открыть репертуар', href: '/repertoire' },
      });
    }
  }

  // ── 3. Opening errors (not just deviations) ────────────────────────
  if (total >= 10) {
    const errOpenings = insights.filter(i =>
      i.decisive_phase === 'opening' ||
      (i.errors_opening ?? 0) >= 2
    ).length;
    const errPct = pct(errOpenings, total);
    if (errOpenings >= 8 && errPct >= 35) {
      found.push({
        id: 'err-opening',
        severity: 'med',
        icon: '🎯',
        title: 'Ошибки в дебютах — заметная доля',
        body: `В ${errOpenings} партиях ты делал ключевые ошибки или 2+ неточностей в первых 10–15 ходах. Пройди экзамен по своим дебютам.`,
        stat: { value: `${errPct}%`, label: 'партий с проблемой' },
        action: { label: 'Экзамен дебюта', href: '/openings' },
      });
    }
  }

  // ── 4. Middlegame mistakes ─────────────────────────────────────────
  if (total >= 10) {
    const mmErrors = insights.filter(i => i.decisive_phase === 'middlegame').length;
    const mmPct = pct(mmErrors, total);
    if (mmErrors >= 8 && mmPct >= 30) {
      found.push({
        id: 'err-middlegame',
        severity: mmPct >= 50 ? 'high' : 'med',
        icon: '⚔',
        title: 'Миттельшпиль — слабое звено',
        body: `${mmPct}% решающих ошибок пришлись на миттельшпиль. Разбирай ошибки в банке и тренируй тактику — это даст быстрый прирост.`,
        stat: { value: `${mmPct}%`, label: 'ошибок в середине' },
        action: { label: 'Банк ошибок', href: '/mistakes' },
      });
    }
  }

  // ── 5. Endgame mistakes ───────────────────────────────────────────
  if (total >= 10) {
    const egErrors = insights.filter(i => i.decisive_phase === 'endgame').length;
    const egPct = pct(egErrors, total);
    if (egErrors >= 5 && egPct >= 25) {
      found.push({
        id: 'err-endgame',
        severity: egPct >= 40 ? 'high' : 'med',
        icon: '♚',
        title: 'Эндшпиль — проблемное место',
        body: `${egPct}% решающих ошибок — в эндшпиле. Пройди технические эндшпили: пешечные, ладейные, окончания с лёгкими фигурами.`,
        stat: { value: `${egErrors}`, label: egErrors === 1 ? 'партия' : egErrors <= 4 ? 'партии' : 'партий' },
        action: { label: 'К эндшпилям', href: '/endgames' },
      });
    }
  }

  // ── 6. Missed wins ─────────────────────────────────────────────────
  if (total >= 10) {
    const missedWins = insights.filter(i => i.missed_win).length;
    const missedPct = pct(missedWins, total);
    if (missedWins >= 5) {
      found.push({
        id: 'missed-wins',
        severity: missedPct >= 20 ? 'high' : 'med',
        icon: '💔',
        title: 'Ты не дожимаешь выигранные позиции',
        body: `В ${missedWins} партиях у тебя была большая перевага (+2 и больше), но ты её упустил. Тренируй конвертацию.`,
        stat: { value: `${missedWins}`, label: 'упущено' },
        action: { label: 'Дожми партию', href: '/convert' },
      });
    }
  }

  // ── 7. Black vs white performance ──────────────────────────────────
  if (total >= 20) {
    const asW = insights.filter(i => i.my_color === 'w');
    const asB = insights.filter(i => i.my_color === 'b');
    const wWinPct = pct(asW.filter(i => i.result === 'win').length, asW.length);
    const bWinPct = pct(asB.filter(i => i.result === 'win').length, asB.length);
    const gap = Math.abs(wWinPct - bWinPct);
    if (gap >= 15 && asW.length >= 5 && asB.length >= 5) {
      const weak = wWinPct < bWinPct ? 'белыми' : 'чёрными';
      const strong = wWinPct < bWinPct ? 'чёрными' : 'белыми';
      found.push({
        id: 'color-gap',
        severity: 'low',
        icon: '⇄',
        title: `Разрыв между цветами: ${gap}%`,
        body: `${weak} результат заметно хуже чем ${strong}. Проверь свой репертуар на слабой стороне.`,
        stat: { value: `${wWinPct}% ↔ ${bWinPct}%`, label: 'белые/чёрные' },
      });
    }
  }

  // ── 8. Overall win rate reporter ───────────────────────────────────
  if (total >= 10) {
    if (winPct >= 60) {
      found.push({
        id: 'high-winrate',
        severity: 'good',
        icon: '✓',
        title: 'Хорошая форма',
        body: `${winPct}% побед за выбранный период. Серия идёт в плюс — не сбавляй обороты.`,
        stat: { value: `${winPct}%`, label: 'побед' },
      });
    } else if (winPct < 35 && lossPct > 50) {
      found.push({
        id: 'low-winrate',
        severity: 'high',
        icon: '⚠',
        title: 'Больше поражений чем побед',
        body: `${lossPct}% партий кончились поражением. Вернись к основам: проверка угроз перед каждым ходом.`,
        stat: { value: `${winPct}%`, label: 'побед' },
        action: { label: 'Проверка угроз', href: '/threats' },
      });
    }
  }

  // ── 9. Draws signal passive play ───────────────────────────────────
  if (total >= 20 && draws.length / total > 0.35) {
    const drawPct = pct(draws.length, total);
    found.push({
      id: 'too-many-draws',
      severity: 'low',
      icon: '◧',
      title: 'Много ничьих',
      body: `${drawPct}% партий закончились вничью. Возможно играешь слишком пассивно — попробуй острые дебюты.`,
      stat: { value: `${drawPct}%`, label: 'ничьих' },
      action: { label: 'Острые дебюты', href: '/openings' },
    });
  }

  // Sort by severity: high > med > low > good
  const order: Record<InsightSeverity, number> = { high: 0, med: 1, low: 2, good: 3 };
  found.sort((a, b) => order[a.severity] - order[b.severity]);

  // Cap at 5 for display
  return found.slice(0, 5);
}

// ── Aggregate metrics for additional stats cards ────────────────────
export interface AggregateMetrics {
  total: number;
  wins: number;
  losses: number;
  draws: number;
  winPct: number;
  asWhiteWinPct: number;
  asBlackWinPct: number;
  missedWins: number;
  timeTrouble: number;
  byPhase: { opening: number; middlegame: number; endgame: number };
  bestGame: DemoInsight | null;     // highest accuracy win
  worstGame: DemoInsight | null;    // biggest decisive loss
  byWeekday: Record<string, { games: number; wins: number }>;
}

const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export function aggregate(insights: DemoInsight[]): AggregateMetrics {
  const total = insights.length;
  const wins = insights.filter(i => i.result === 'win').length;
  const losses = insights.filter(i => i.result === 'loss').length;
  const draws = insights.filter(i => i.result === 'draw').length;

  const asW = insights.filter(i => i.my_color === 'w');
  const asB = insights.filter(i => i.my_color === 'b');
  const asWhiteWinPct = pct(asW.filter(i => i.result === 'win').length, asW.length);
  const asBlackWinPct = pct(asB.filter(i => i.result === 'win').length, asB.length);

  const missedWins = insights.filter(i => i.missed_win).length;
  const timeTrouble = insights.filter(i => i.time_trouble).length;

  const byPhase = {
    opening: insights.filter(i => i.decisive_phase === 'opening').length,
    middlegame: insights.filter(i => i.decisive_phase === 'middlegame').length,
    endgame: insights.filter(i => i.decisive_phase === 'endgame').length,
  };

  // best game: win with lowest decisive_loss (most clean)
  const winsByQuality = insights
    .filter(i => i.result === 'win' && (i.decisive_loss ?? 999) >= 0)
    .sort((a, b) => (a.decisive_loss ?? 999) - (b.decisive_loss ?? 999));
  const bestGame = winsByQuality[0] ?? null;

  // worst game: loss with biggest decisive_loss
  const lossesByQuality = insights
    .filter(i => i.result === 'loss' && (i.decisive_loss ?? 0) > 0)
    .sort((a, b) => (b.decisive_loss ?? 0) - (a.decisive_loss ?? 0));
  const worstGame = lossesByQuality[0] ?? null;

  // by weekday
  const byWeekday: AggregateMetrics['byWeekday'] = {};
  for (const name of WEEKDAYS) byWeekday[name] = { games: 0, wins: 0 };
  for (const ins of insights) {
    if (!ins.date) continue;
    const d = new Date(ins.date);
    if (isNaN(d.getTime())) continue;
    const name = WEEKDAYS[d.getDay()];
    byWeekday[name].games++;
    if (ins.result === 'win') byWeekday[name].wins++;
  }

  return {
    total, wins, losses, draws,
    winPct: pct(wins, total),
    asWhiteWinPct, asBlackWinPct,
    missedWins, timeTrouble,
    byPhase, bestGame, worstGame, byWeekday,
  };
}

export const SEVERITY_COLOR: Record<InsightSeverity, { bg: string; border: string; text: string }> = {
  high: { bg: 'color-mix(in srgb, #E0574A 16%, var(--surface))', border: 'color-mix(in srgb, #E0574A 40%, var(--hairline))', text: '#E0574A' },
  med:  { bg: 'color-mix(in srgb, #F0A43A 14%, var(--surface))', border: 'color-mix(in srgb, #F0A43A 35%, var(--hairline))', text: '#F0A43A' },
  low:  { bg: 'color-mix(in srgb, #4A90E2 12%, var(--surface))', border: 'color-mix(in srgb, #4A90E2 30%, var(--hairline))', text: '#4A90E2' },
  good: { bg: 'color-mix(in srgb, var(--accent) 14%, var(--surface))', border: 'color-mix(in srgb, var(--accent) 35%, var(--hairline))', text: 'var(--accent)' },
};

// Suppress unused warning
void round;
