interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: { value: number; label: string };
  color?: 'blue' | 'emerald' | 'amber' | 'rose' | 'slate';
  icon?: React.ReactNode;
}

const accentMap = {
  blue:    { bg: 'var(--cool-50)',   border: 'var(--cool-200)',  valueColor: 'var(--cool-800)' },
  emerald: { bg: '#EAF5EE',          border: '#B6DFC6',          valueColor: 'var(--success)' },
  amber:   { bg: 'var(--warning-bg)',border: '#E8C98A',          valueColor: 'var(--warning)' },
  rose:    { bg: 'var(--warm-50)',   border: 'var(--warm-200)',  valueColor: 'var(--warm-800)' },
  slate:   { bg: 'var(--surface-subtle)', border: 'var(--border)', valueColor: 'var(--text-primary)' },
};

export default function KpiCard({
  title, value, subtitle, trend, color = 'slate', icon,
}: KpiCardProps) {
  const accent = accentMap[color];

  return (
    <div
      style={{
        background: accent.bg,
        border: `1px solid ${accent.border}`,
        borderRadius: 'var(--radius-lg)',
        padding: '1.125rem 1.25rem',
      }}
    >
      <div className="flex items-start justify-between">
        <p
          style={{
            fontFamily: 'var(--font-sans), sans-serif',
            fontSize: '0.75rem',
            fontWeight: 500,
            color: 'var(--text-muted)',
            margin: 0,
            lineHeight: 1.4,
          }}
        >
          {title}
        </p>
        {icon && <span style={{ color: 'var(--text-faint)' }}>{icon}</span>}
      </div>
      <p
        style={{
          fontFamily: 'var(--font-mono), monospace',
          fontSize: '1.625rem',
          fontWeight: 400,
          color: accent.valueColor,
          marginTop: '0.5rem',
          marginBottom: 0,
          lineHeight: 1.15,
          letterSpacing: '-0.01em',
        }}
      >
        {value}
      </p>
      {subtitle && (
        <p
          style={{
            fontFamily: 'var(--font-sans), sans-serif',
            fontSize: '0.6875rem',
            color: 'var(--text-faint)',
            marginTop: '0.25rem',
          }}
        >
          {subtitle}
        </p>
      )}
      {trend && (
        <div className="mt-2 flex items-center gap-1">
          <span
            style={{
              fontSize: '0.75rem',
              color: trend.value >= 0 ? 'var(--warm-600)' : 'var(--success)',
            }}
          >
            {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value).toFixed(1)}%
          </span>
          <span style={{ fontSize: '0.6875rem', color: 'var(--text-faint)' }}>
            {trend.label}
          </span>
        </div>
      )}
    </div>
  );
}
