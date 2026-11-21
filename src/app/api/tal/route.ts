// Тренер Таль — ответ на сообщения с опциональным plan_patch (ТЗ §5.2).
// POST { date, user_message } → { reply, plan_updated? }
//   Сохраняет сообщение пользователя и ответ Таля в tal_chat.
//   Если модель вернула plan_patch — применяет к последнему плану на date,
//   сохраняет новую версию в coach_plans, пишет plan_update сообщение.

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { loadCoachContext } from '@/lib/coach/context';
import {
  applyPatch, validatePatch, type Plan,
} from '@/lib/coach/plan';
import { buildTalkPrompt, callOpenRouter, tryParseJson } from '@/lib/coach/prompt';

interface TalkReply {
  reply: string;
  plan_patch?: unknown;
}

async function getLatestPlan(date: string): Promise<{ id: string; version: number; plan: Plan } | null> {
  const r = await supabase.from('coach_plans')
    .select('id, version, plan')
    .eq('date', date)
    .order('version', { ascending: false })
    .limit(1);
  const row = (r.data ?? [])[0] as { id: string; version: number; plan: Plan } | undefined;
  return row ?? null;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { date?: string; user_message?: string };
  const date = body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : new Date().toISOString().slice(0, 10);
  const userMsg = (body.user_message ?? '').trim();
  if (!userMsg) {
    return NextResponse.json({ error: 'empty' }, { status: 400 });
  }

  // Сохраняем вопрос пользователя сразу
  const insUser = await supabase.from('tal_chat').insert({ role: 'user', content: userMsg, kind: 'text' })
    .select('id, created_at').limit(1);
  const userRow = (insUser.data ?? [])[0] as { id: string; created_at: string } | undefined;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    const reply = 'Таль молчит — проверь OPENROUTER_API_KEY в .env.local.';
    await supabase.from('tal_chat').insert({ role: 'assistant', content: reply, kind: 'text' });
    return NextResponse.json({ reply, user_id: userRow?.id, plan_updated: null });
  }

  // Контекст + текущий план
  const ctx = await loadCoachContext(date);
  const latest = await getLatestPlan(date);
  const planItems = latest ? latest.plan.items.map(i => ({ key: i.key, min: i.min, what: i.what })) : [];
  const system = buildTalkPrompt(ctx, { items: planItems });

  // 20 последних сообщений для контекста
  const histRes = await supabase.from('tal_chat')
    .select('role, content, created_at')
    .order('created_at', { ascending: false })
    .limit(20);
  const history = (histRes.data ?? []).reverse() as Array<{ role: string; content: string }>;

  // Собираем в один user-prompt — модель видит систему + компактный лог
  const userPrompt = [
    history.map(h => `${h.role === 'user' ? 'Ученик' : 'Таль'}: ${h.content}`).join('\n'),
    `Ученик: ${userMsg}`,
  ].join('\n');

  let reply = '';
  let patchRaw: unknown = null;
  try {
    const raw = await callOpenRouter(system, userPrompt, apiKey);
    const parsed = tryParseJson<TalkReply>(raw);
    if (parsed && typeof parsed.reply === 'string' && parsed.reply.trim()) {
      reply = parsed.reply.trim();
      patchRaw = parsed.plan_patch ?? null;
    } else {
      reply = raw.trim().slice(0, 800) || 'Таль задумался, но ответа нет.';
    }
  } catch (e) {
    console.warn('coach /api/tal failed:', e);
    reply = 'Таль не на связи сейчас. Попробуй ещё раз через минуту.';
  }

  // Применяем plan_patch (если валиден и есть план)
  let planUpdated: { version: number; reason: string; plan: Plan } | null = null;
  if (latest && patchRaw) {
    const patch = validatePatch(patchRaw);
    if (patch) {
      const newPlan = applyPatch(latest.plan, patch);
      const newVersion = latest.version + 1;
      const saved = await supabase.from('coach_plans').insert({
        date, version: newVersion, plan: newPlan, reason: patch.reason,
      }).select('id').limit(1);
      const newRow = (saved.data ?? [])[0] as { id: string } | undefined;
      // Обновляем coach_plan_minutes
      try {
        await supabase.from('tal_daily_log').upsert({
          date, task_key: 'coach_plan_minutes', value: newPlan.total_min,
        }, { onConflict: 'date,task_key' });
      } catch { /* не критично */ }
      // Запись «plan_update» в чат
      try {
        await supabase.from('tal_chat').insert({
          role: 'assistant', content: patch.reason, kind: 'plan_update', plan_id: newRow?.id ?? null,
        });
      } catch { /* не критично */ }
      planUpdated = { version: newVersion, reason: patch.reason, plan: newPlan };
    }
  }

  // Ответ Таля — отдельная запись
  await supabase.from('tal_chat').insert({ role: 'assistant', content: reply, kind: 'text' });

  return NextResponse.json({ reply, plan_updated: planUpdated });
}
