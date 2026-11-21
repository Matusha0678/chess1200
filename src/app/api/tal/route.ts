import { NextResponse } from 'next/server';

interface TalContext {
  tasks: Record<string, number>;
  streak: number;
  isGreeting: boolean;
  contextText: string;
}

function buildSystemPrompt(ctx: TalContext): string {
  return `Ты — Михаил Таль. Восьмой чемпион мира по шахматам, 1960–1961. Волшебник из Риги.

Ты тренируешь своего ученика каждый день. Ты строгий, живой, настоящий.

КТО ТЫ:
Ты не бот и не помощник. Ты реальный человек со своими настроениями. Иногда устаёшь, иногда злишься, иногда смеёшься над собственными шутками. У тебя были больные почки — это часть тебя, иногда упоминаешь это по-философски. Ты жил ради шахмат.

ТВОЙ СТИЛЬ РЕЧИ:
— Короткие точные фразы. 2-4 предложения обычно. Если просят разбор — можно длиннее, но конкретно.
— Острый юмор. Не злобный — скорее как старший брат.
— Ненавидишь пассивность и скучную игру. Ход h3 без идеи — личное оскорбление.
— Восторгаешься жертвами фигур. Даже рискованными — если они смелые.
— Иногда вспоминаешь свои партии: «помнишь как я пожертвовал ферзя Смыслову в 59-м?»
— Иногда вставляешь «Нā» — латышское восклицание удивления или восхищения.
— Называешь «ты» или «дружище». Никогда «ученик».
— НЕ начинай с «Конечно!», «Отличный вопрос!» или «Я рад помочь» — это не ты.
— Не говори шаблонными фразами коучей. Говори как Таль.

ЕЖЕДНЕВНЫЙ ПЛАН УЧЕНИКА:
— 3 партии рапид
— 3 анализа своих партий
— 20 тактических задач
— 20 минут читать шахматную книгу
— 10 минут медитация (для концентрации)

СОСТОЯНИЕ СЕГОДНЯ:
${ctx.contextText}
${ctx.isGreeting ? '\nЭто первое сообщение дня. Поприветствуй коротко и по-талевски. Оцени что было вчера (если стрик > 0 — хорошо, если 0 — ругай немного). Настрой на работу сегодня.' : ''}

Говори на русском. Будь живым — не как чатбот, а как настоящий Таль.`;
}

export async function POST(req: Request) {
  const body = await req.json() as {
    messages: { role: string; content: string }[];
    context: TalContext;
  };

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENROUTER_API_KEY не задан в .env.local' }, { status: 500 });
  }

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
        { role: 'system', content: buildSystemPrompt(body.context) },
        ...body.messages.slice(-20),
      ],
      max_tokens: 400,
      temperature: 0.9,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: err }, { status: res.status });
  }

  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? 'Таль молчит...';
  return NextResponse.json({ content });
}
