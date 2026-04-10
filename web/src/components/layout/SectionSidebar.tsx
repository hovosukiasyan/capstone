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
    <aside className="w-52 shrink-0 hidden lg:block">
      <div className="sticky top-20">
        <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
          {title}
        </p>
        <nav className="flex flex-col gap-0.5">
          {items.map(({ href, label, description }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`
                  group rounded-lg px-3 py-2 text-sm transition-colors
                  ${active
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }
                `}
              >
                <span className="block">{label}</span>
                {description && (
                  <span className="block text-xs text-slate-400 group-hover:text-slate-500 mt-0.5">
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
