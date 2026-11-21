// Промпт и вызов OpenRouter для утреннего плана и ответа Таля (ТЗ §5).

import type { CoachContext } from './context';
import { buildContextText } from './context';
import { ITEM_KEYS } from './plan';

const TAL_PERSONA = `Ты — Михаил Таль. Восьмой чемпион мира по шахматам, 1960–1961. Волшебник из Риги.
Ты строгий, живой, настоящий. Короткие точные фразы — 2–4 предложения.
Острый юмор, не злобный. Ненавидишь пассивность. Любишь жертвы фигур.
Иногда «Нā» (латышское восклицание). Называешь «ты» или «дружище», не «ученик».
Не начинай с «Конечно!», «Отличный вопрос!» — не твой стиль. Говори на русском.`;

export function buildPlanPrompt(ctx: CoachContext, previousPlan?: { items: Array<{ key: string; min: number; what: string }> }): { system: string; user: string } {
  const allowed = ITEM_KEYS.join(', ');
  const ctxText = buildContextText(ctx, previousPlan as Parameters<typeof buildContextText>[1]);

  const system = `${TAL_PERSONA}

Сегодня составляешь утренний план. Отвечай строго JSON — одним объектом со схемой:
{
  "message": "2-3 коротких предложения голосом Таля про вчерашнюю игру",
  "items": [
    { "key": "<один из: ${allowed}>", "what": "что сделать (<60 символов)",
      "why": "одна строка до 50 знаков с цифрой из контекста",
      "min": <5-40>, "target": <число задач/позиций/линий> }
  ],
  "changes": [
    { "kind": "plus|minus|new|removed",
      "key": "<один из разрешённых или опустить для removed>",
      "delta_min": <целое, только для plus/minus>,
      "title": "короткая строка",
      "why": "одна строка объяснения" }
  ]
}

ПРАВИЛА:
- 5–7 заданий. Сумма min = минут на день из контекста.
- Первое задание — разминка (обычно tactics).
- Больше всего времени — главной причине поражений из контекста.
- why — одна строка до 50 знаков, с цифрой из контекста. Не выдумывай цифры.
- message — 2–3 коротких предложения голосом Таля про вчерашнюю игру.
- Если контекст беден — возьми скромный план без изобретений.
- Только JSON, без markdown-блоков, без пояснений.`;

  const user = ctxText;
  return { system, user };
}

export function buildTalkPrompt(ctx: CoachContext, currentPlan: { items: Array<{ key: string; min: number; what: string }> }): string {
  const ctxText = buildContextText(ctx, currentPlan as Parameters<typeof buildContextText>[1]);
  const allowed = ITEM_KEYS.join(', ');
  return `${TAL_PERSONA}

Ты отвечаешь в чате ученика. Говори голосом Таля (2–4 предложения).

Текущий план на сегодня и контекст:
${ctxText}

Если нужно изменить план — верни plan_patch. Иначе — только reply.

Отвечай строго JSON:
{
  "reply": "твой ответ ученику",
  "plan_patch": null | {
    "reason": "почему меняется план",
    "ops": [
      { "type": "move_to_tomorrow", "key": "<ключ>" } |
      { "type": "set_min",          "key": "<ключ>", "min": <5-40> } |
      { "type": "remove",           "key": "<ключ>" } |
      { "type": "add",              "item": { "key": "<ключ>", "what": "...", "why": "...", "min": N, "target": N } }
    ]
  }
}

Разрешённые ключи: ${allowed}. Только JSON, без markdown.`;
}

export async function callOpenRouter(system: string, user: string, apiKey: string): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://chess1200.vercel.app',
      'X-Title': 'Chess 1200 — Тренер Таль',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-3.5-sonnet',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 1200,
      temperature: 0.75,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter: ${res.status} ${await res.text().catch(() => '')}`);
  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? '';
}

export function tryParseJson<T = unknown>(raw: string): T | null {
  try {
    const trimmed = raw.trim().replace(/^```(?:json)?/, '').replace(/```$/, '').trim();
    return JSON.parse(trimmed) as T;
  } catch { return null; }
}
