import { useState, type ReactNode } from 'react';

interface SectionProps {
  title: string;
  defaultOpen?: boolean;
  badge?: string;
  children: ReactNode;
}

/** Collapsible panel section — keeps crowded sidebars manageable */
export function Section({ title, defaultOpen = false, badge, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className="pixel-panel"
      style={{
        marginBottom: '10px',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px',
          background: 'transparent',
          color: 'var(--accent-amber)',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'var(--font-pixel)',
          fontSize: '8px',
          lineHeight: 1.6,
        }}
      >
        <span>
          {open ? '▾' : '▸'} {title}
        </span>
        {badge !== undefined && (
          <span style={{ color: 'var(--ui-text-dim)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
            {badge}
          </span>
        )}
      </button>
      {open && <div style={{ padding: '0 8px 8px 8px' }}>{children}</div>}
    </div>
  );
}
