// Шапка чата с фото короля (ТЗ §1.1).
export function ChatHeader({ lessonNo }: { lessonNo: number }) {
  return (
    <header className="coach-cover">
      <div style={{ display: 'flex', alignItems: 'center', gap: 22, maxWidth: 430 }}>
        <div className="coach-crest coach-crest-lg coach-serif" aria-hidden="true">МТ</div>
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="coach-eyebrow">Личный тренер</div>
          <h1 className="coach-serif" style={{
            margin: 0, fontSize: 40, fontWeight: 500,
            lineHeight: 1.04, letterSpacing: '-0.015em',
            color: 'var(--ivory)',
          }}>
            Михаил Таль
          </h1>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.45, color: 'var(--text-2, #A39B8A)' }}>
            Восьмой чемпион мира. Видит твои партии и каждое утро строит план.
          </p>
        </div>
      </div>
      <span className="coach-plate">Занятие № {lessonNo}</span>
    </header>
  );
}
