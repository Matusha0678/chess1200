'use client';
type Variant = 'success' | 'danger' | 'warning';
const BG: Record<Variant, string> = { success: 'rgba(129,182,76,.09)', danger: 'rgba(224,87,74,.09)', warning: 'rgba(240,164,58,.09)' };
const BORDER: Record<Variant, string> = { success: 'rgba(129,182,76,.32)', danger: 'rgba(224,87,74,.32)', warning: 'rgba(240,164,58,.32)' };
const COLOR: Record<Variant, string> = { success: 'var(--accent)', danger: '#F08277', warning: '#F4B45C' };
export function FeedbackCard({ variant = 'success', title, children, ...props }: { variant?: Variant; title: React.ReactNode; children?: React.ReactNode; [k: string]: unknown }) {
  return (
    <div style={{ borderRadius: 12, background: BG[variant], border: `1px solid ${BORDER[variant]}`, padding: '16px 18px' }} {...props}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: children ? 8 : 0 }}>
        <div style={{ fontSize: 19, fontWeight: 700, color: COLOR[variant] }}>{title}</div>
      </div>
      {children && <div style={{ fontSize: 15, color: '#E6E3DE' }}>{children}</div>}
    </div>
  );
}
