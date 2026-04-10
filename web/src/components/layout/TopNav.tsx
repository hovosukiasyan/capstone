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
    <nav className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex h-14 items-center gap-8">
          {/* Logo / brand */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span className="text-blue-700 font-bold text-lg">Armenia</span>
            <span className="text-slate-400 text-sm font-medium hidden sm:block">Poverty Analytics</span>
          </Link>

          {/* Nav links */}
          <div className="flex items-center gap-1 overflow-x-auto">
            {NAV_ITEMS.map(({ href, label }) => {
              const active =
                href === '/'
                  ? pathname === '/'
                  : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`
                    whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors
                    ${active
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }
                  `}
                >
                  {label}
                </Link>
              );
            })}
          </div>

          {/* Right: dataset badge */}
          <div className="ml-auto shrink-0 hidden md:flex items-center gap-2">
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
              ILCS 2015
            </span>
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
              ArmStat 2016–2022
            </span>
          </div>
        </div>
      </div>
    </nav>
  );
}
