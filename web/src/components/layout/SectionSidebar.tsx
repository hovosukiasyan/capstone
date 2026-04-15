'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface SidebarItem {
  href: string;
  label: string;
  description?: string;
}

interface SectionSidebarProps {
  items: SidebarItem[];
  title: string;
}

export default function SectionSidebar({ items, title }: SectionSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="w-48 shrink-0 hidden lg:block">
      <div className="sticky top-20">
        <p
          style={{
            fontFamily: 'var(--font-sans), sans-serif',
            fontSize: '0.6875rem',
            fontWeight: 500,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            color: 'var(--text-faint)',
            marginBottom: '0.625rem',
            paddingLeft: '0.5rem',
          }}
        >
          {title}
        </p>
        <nav className="flex flex-col gap-0.5">
          {items.map(({ href, label, description }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                style={{
                  display: 'block',
                  padding: '0.375rem 0.625rem',
                  borderRadius: 'var(--radius-md)',
                  textDecoration: 'none',
                  background: active ? 'var(--surface-subtle)' : 'transparent',
                  borderLeft: active ? '2px solid var(--warm-600)' : '2px solid transparent',
                  transition: 'background 0.12s, border-color 0.12s',
                }}
                className="group hover:bg-[var(--surface-subtle)]"
              >
                <span
                  style={{
                    display: 'block',
                    fontFamily: 'var(--font-sans), sans-serif',
                    fontSize: '0.8125rem',
                    fontWeight: active ? 500 : 400,
                    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  }}
                  className="group-hover:text-[var(--text-primary)]"
                >
                  {label}
                </span>
                {description && (
                  <span
                    style={{
                      display: 'block',
                      fontFamily: 'var(--font-sans), sans-serif',
                      fontSize: '0.6875rem',
                      color: 'var(--text-faint)',
                      marginTop: '0.125rem',
                    }}
                  >
                    {description}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
