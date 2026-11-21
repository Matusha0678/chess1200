// GET /api/coach/plan?date=YYYY-MM-DD — вернуть последнюю версию плана
// POST /api/coach/plan { date } — создать план, если ещё нет (иначе вернуть)
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { loadCoachContext } from '@/lib/coach/context';
import { buildFallbackPlan, validatePlan, type Plan } from '@/lib/coach/plan';
import { buildPlanPrompt, callOpenRouter, tryParseJson } from '@/lib/coach/prompt';

interface PlanRow {
  id: string;
  date: string;
  version: number;
  plan: Plan;
  reason: string | null;
  created_at: string;
}

async function latestPlan(date: string): Promise<PlanRow | null> {
  const r = await supabase.from('coach_plans')
    .select('id, date, version, plan, reason, created_at')
    .eq('date', date)
    .order('version', { ascending: false })
    .limit(1);
  const row = (r.data ?? [])[0] as PlanRow | undefined;
  return row ?? null;
}

async function prevPlan(date: string): Promise<PlanRow | null> {
  const r = await supabase.from('coach_plans')
    .select('id, date, version, plan, reason, created_at')
    .lt('date', date)
    .order('date', { ascending: false })
    .order('version', { ascending: false })
    .limit(1);
  const row = (r.data ?? [])[0] as PlanRow | undefined;
  return row ?? null;
}

async function makeFallback(date: string): Promise<Plan> {
  const ctx = await loadCoachContext(date);
  const top = ctx.leaks.find(l => l.main) ?? ctx.leaks[0];
  return buildFallbackPlan({
    daily_minutes: ctx.settings.daily_minutes,
    top_leak_key: top?.key,
    top_leak_count: top?.count,
    tactics_acc: ctx.tactics_acc_7d ?? undefined,
    openings_due: ctx.openings_due,
  });
}

async function generateAIPlan(date: string): Promise<{ plan: Plan; used_ai: boolean }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { plan: await makeFallback(date), used_ai: false };

  try {
    const ctx = await loadCoachContext(date);
    const prev = await prevPlan(date);
    const prevItems = prev?.plan?.items?.map(i => ({ key: i.key, min: i.min, what: i.what })) ?? [];
    const { system, user } = buildPlanPrompt(ctx, prevItems.length ? { items: prevItems } : undefined);

    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await callOpenRouter(system, user, apiKey);
      const parsed = tryParseJson(raw);
      const valid = validatePlan(parsed);
      if (valid) return { plan: valid, used_ai: true };
    }
  } catch (e) {
    console.warn('coach AI plan failed:', e);
  }
  return { plan: await makeFallback(date), used_ai: false };
}

async function savePlan(date: string, plan: Plan, reason: string | null = null, version = 1) {
  return supabase.from('coach_plans').insert({ date, version, plan, reason });
}

function requestDate(url: URL, bodyDate?: string | null): string {
  const d = bodyDate ?? url.searchParams.get('date');
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }
  return d;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = requestDate(url);
  const row = await latestPlan(date);
  if (!row) return NextResponse.json({ plan: null }, { status: 200 });
  return NextResponse.json({ plan: row.plan, version: row.version, id: row.id, reason: row.reason });
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  let body: { date?: string } = {};
  try { body = await req.json() as { date?: string }; } catch { /* */ }
  const date = requestDate(url, body.date);

  // Если уже есть — возвращаем, план не пересоздаём
  const existing = await latestPlan(date);
  if (existing) {
    return NextResponse.json({ plan: existing.plan, version: existing.version, id: existing.id, reason: existing.reason, created: false });
  }

  const { plan, used_ai } = await generateAIPlan(date);
  const { data, error } = await savePlan(date, plan, used_ai ? null : 'fallback');
  if (error) {
    // БД не доступна — всё равно возвращаем план, страница сможет работать
    return NextResponse.json({ plan, version: 1, created: true, saved: false, used_ai, error: error.message });
  }
  const row = (data as unknown as PlanRow[] | null)?.[0];

  // Пишем сообщение Таля в tal_chat (ТЗ §5.1)
  try {
    await supabase.from('tal_chat').insert({
      role: 'assistant',
      content: plan.message,
      kind: 'morning',
      plan_id: row?.id ?? null,
    });
  } catch { /* не критично */ }

  // Фиксируем плановые минуты в tal_daily_log — для серии/дисциплины
  try {
    await supabase.from('tal_daily_log').upsert({
      date, task_key: 'coach_plan_minutes', value: plan.total_min,
    }, { onConflict: 'date,task_key' });
  } catch { /* не критично */ }

  return NextResponse.json({ plan, version: 1, id: row?.id ?? null, created: true, used_ai });
}
