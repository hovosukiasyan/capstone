interface PageHeaderProps {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export default function PageHeader({ title, subtitle, children }: PageHeaderProps) {
  return (
    <div className="mb-7 flex items-start justify-between gap-4">
      <div>
        <h1
          style={{
            fontFamily: 'var(--font-serif), Georgia, serif',
            fontWeight: 400,
            fontSize: '1.625rem',
            lineHeight: 1.25,
            letterSpacing: '-0.02em',
            color: 'var(--text-primary)',
            margin: 0,
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            style={{
              marginTop: '0.375rem',
              fontFamily: 'var(--font-sans), sans-serif',
              fontWeight: 400,
              fontSize: '0.875rem',
              lineHeight: 1.5,
              color: 'var(--text-muted)',
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {children && (
        <div className="flex items-center gap-2 shrink-0 mt-0.5">{children}</div>
      )}
    </div>
  );
}
