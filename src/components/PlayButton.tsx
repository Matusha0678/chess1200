import Link from 'next/link';

interface PlayButtonProps {
  fen: string;
  color?: 'w' | 'b';
  level?: number;
  label?: string;
}

export function PlayButton({ fen, color = 'w', level = 10, label = 'Играть отсюда' }: PlayButtonProps) {
  const href = `/play?fen=${encodeURIComponent(fen)}&color=${color}&level=${level}&mode=free`;
  return (
    <Link
      href={href}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        height: 32, padding: '0 14px',
        border: '1px solid var(--control)', borderRadius: 16,
        fontSize: 12, color: 'var(--muted)',
        transition: 'color 0.15s, border-color 0.15s',
      }}
      className="play-button-link"
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <polygon points="5,3 19,12 5,21" />
      </svg>
      {label}
    </Link>
  );
}
