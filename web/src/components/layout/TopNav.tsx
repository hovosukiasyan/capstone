'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/', label: 'Overview' },
  { href: '/household', label: 'Households' },
  { href: '/regional', label: 'Regional' },
  { href: '/models', label: 'Models' },
  { href: '/explorer', label: 'Explorer' },
];

export default function TopNav() {
  const pathname = usePathname();

  return (
    <nav
      className="sticky top-0 z-50 backdrop-blur-md"
      style={{
        background: 'rgba(247, 244, 239, 0.92)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex h-14 items-center gap-6">
          {/* Logotype */}
          <Link
            href="/"
            className="shrink-0 flex items-baseline gap-2 group"
            style={{ textDecoration: 'none' }}
          >
            <span
              style={{
                fontFamily: 'var(--font-serif), Georgia, serif',
                fontWeight: 500,
                fontSize: '1.0625rem',
                letterSpacing: '-0.01em',
                color: 'var(--text-primary)',
              }}
            >
              Armenia
            </span>
            <span
              className="hidden sm:inline"
              style={{
                fontFamily: 'var(--font-sans), sans-serif',
                fontWeight: 400,
                fontSize: '0.8125rem',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
              }}
            >
              Poverty Atlas
            </span>
          </Link>

          {/* Divider */}
          <div
            className="hidden sm:block shrink-0 h-5"
            style={{ width: 1, background: 'var(--border)' }}
          />

          {/* Nav links */}
          <div className="flex items-center gap-0.5 overflow-x-auto">
            {NAV_ITEMS.map(({ href, label }) => {
              const active =
                href === '/'
                  ? pathname === '/'
                  : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  style={{
                    fontFamily: 'var(--font-sans), sans-serif',
                    fontWeight: active ? 500 : 400,
                    fontSize: '0.8125rem',
                    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                    background: active ? 'var(--surface-subtle)' : 'transparent',
                    borderBottom: active ? '2px solid var(--warm-600)' : '2px solid transparent',
                    padding: '0.25rem 0.75rem',
                    borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
                    whiteSpace: 'nowrap',
                    textDecoration: 'none',
                    lineHeight: '1.75rem',
                  }}
                  className="hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
                >
                  {label}
                </Link>
              );
            })}
          </div>

          {/* Right: dataset badges */}
          <div className="ml-auto shrink-0 hidden md:flex items-center gap-2">
            <span
              style={{
                fontFamily: 'var(--font-mono), monospace',
                fontSize: '0.6875rem',
                fontWeight: 400,
                color: 'var(--stone-500)',
                background: 'var(--surface-subtle)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-xs)',
                padding: '2px 6px',
                letterSpacing: '0.03em',
              }}
            >
              ILCS 2015
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono), monospace',
                fontSize: '0.6875rem',
                fontWeight: 400,
                color: 'var(--stone-500)',
                background: 'var(--surface-subtle)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-xs)',
                padding: '2px 6px',
                letterSpacing: '0.03em',
              }}
            >
              ArmStat 2016–2022
            </span>
          </div>
        </div>
      </div>
    </nav>
  );
}
