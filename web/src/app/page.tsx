import Link from 'next/link';
import KpiCard from '@/components/cards/KpiCard';
import { getHouseholdStats, getModelMetrics, getRegionalYears } from '@/lib/db';
import { formatAMD } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const SECTION_CARDS = [
  {
    href: '/regional',
    title: 'Regional Atlas',
    eyebrow: 'Map-first analysis',
    description:
      'Explore all 11 marzes through choropleths, ranking tables, and time-series views of poverty, extreme poverty, infrastructure capacity, and stress.',
  },
  {
    href: '/household',
    title: 'Household Analysis',
    eyebrow: 'Micro-level structure',
    description:
      'Study household income distributions, socioeconomic features, clustering, and correlations from the ILCS 2015 microdata.',
  },
  {
    href: '/models/validation',
    title: '2022 Validation',
    eyebrow: 'Forecast holdout evidence',
    description:
      'Examine how well models trained on 2016–2021 predicted actual 2022 regional poverty and stress outcomes across all 11 marzes.',
  },
  {
    href: '/explorer',
    title: 'Data Explorer',
    eyebrow: 'Structured table access',
    description:
      'Filter the underlying household data with practical controls, sort analytically relevant columns, and export scoped subsets.',
  },
];

export default async function HomePage() {
  let stats, metrics, years;
  try {
    [stats, metrics, years] = await Promise.all([
      getHouseholdStats(),
      getModelMetrics(),
      getRegionalYears(),
    ]);
  } catch (err) {
    const e = err as Error & { code?: string; detail?: string };
    return (
      <div
        className="rounded-[var(--radius-xl)] border p-6"
        style={{ background: 'var(--warm-50)', borderColor: 'var(--warm-200)' }}
      >
        <h2 className="mb-2 text-lg font-semibold" style={{ color: 'var(--warm-800)' }}>
          Database error
        </h2>
        <pre className="overflow-x-auto whitespace-pre-wrap text-sm" style={{ color: 'var(--warm-700)' }}>
          {e?.message}
          {e?.code ? `\ncode: ${e.code}` : ''}
          {e?.detail ? `\ndetail: ${e.detail}` : ''}
        </pre>
      </div>
    );
  }

  const bestModel = metrics[0];
  const yearRange = years.length > 0 ? `${years[0]}–${years[years.length - 1]}` : '2016–2022';

  return (
    <div className="space-y-8">
      <section
        className="hero-panel relative overflow-hidden rounded-[28px] px-6 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12"
        style={{
          background:
            'linear-gradient(140deg, var(--stone-950) 0%, var(--stone-900) 36%, var(--warm-900) 78%, #5c2c18 100%)',
        }}
      >
        <div
          aria-hidden
          className="absolute inset-0 opacity-70"
          style={{
            background:
              'radial-gradient(circle at 18% 16%, rgba(186,216,238,0.16), transparent 28%), radial-gradient(circle at 80% 24%, rgba(216,112,112,0.18), transparent 22%), linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.04) 48%, transparent 100%)',
          }}
        />
        <div
          aria-hidden
          className="hero-grid absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
            backgroundSize: '72px 72px',
            maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent 88%)',
          }}
        />

        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.8fr)] lg:items-end">
          <div className="hero-copy">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-white/70">
                Armenia Poverty Observatory
              </span>
              <span className="text-[11px] uppercase tracking-[0.16em] text-white/45">
                Household microdata + regional panel forecasting
              </span>
            </div>

            <h1
              className="max-w-3xl font-display text-[clamp(2rem,5vw,4.5rem)] font-normal leading-[1.02] text-[var(--stone-50)]"
              style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
            >
              A civic analytics platform for poverty, stress, and regional inequality in Armenia.
            </h1>

            <p className="mt-5 max-w-2xl text-sm leading-7 text-white/72 sm:text-base">
              We validate regional poverty forecasts against observed 2022 outcomes across 11 Armenian marzes,
              then project 2023–2026 using the same validated workflow — built from ILCS 2015 and ArmStat panel data.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/regional"
                className="rounded-full bg-[var(--stone-50)] px-5 py-2.5 text-sm font-medium text-[var(--stone-950)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lg)]"
              >
                Open Regional Atlas
              </Link>
              <Link
                href="/models/validation"
                className="rounded-full border border-white/20 bg-white/6 px-5 py-2.5 text-sm font-medium text-white/88 transition hover:-translate-y-0.5 hover:bg-white/10"
              >
                Review 2022 Validation
              </Link>
            </div>
          </div>

          <div className="hero-metrics grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-[22px] border border-white/12 bg-white/8 p-4 backdrop-blur-sm">
              <p className="text-[11px] uppercase tracking-[0.14em] text-white/48">Regional coverage</p>
              <p className="mt-2 font-data text-2xl text-[var(--stone-50)]">{yearRange}</p>
              <p className="mt-1 text-xs text-white/62">11 marzes tracked through the atlas and ranking views</p>
            </div>
            <div className="rounded-[22px] border border-white/12 bg-white/8 p-4 backdrop-blur-sm">
              <p className="text-[11px] uppercase tracking-[0.14em] text-white/48">Validation year</p>
              <p className="mt-2 font-data text-2xl text-[var(--stone-50)]">2022</p>
              <p className="mt-1 text-xs text-white/62">Models trained 2016–2021, tested against actual 2022 outcomes across 11 marzes</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="homepage-kpi-card"><KpiCard title="Households surveyed" value={stats.count.toLocaleString()} subtitle="ILCS 2015 microdata" color="blue" /></div>
        <div className="homepage-kpi-card"><KpiCard title="Median income" value={formatAMD(Math.round(stats.median_income), true)} subtitle="AMD per year" color="emerald" /></div>
        <div className="homepage-kpi-card"><KpiCard title="Validation year" value="2022" subtitle="Forecast holdout vs actual ArmStat data" color="amber" /></div>
        <div className="homepage-kpi-card"><KpiCard title="Income range" value={`${formatAMD(Math.round(stats.p10_income), true)}–${formatAMD(Math.round(stats.p90_income), true)}`} subtitle="P10 to P90 spread" color="slate" /></div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-sm)]">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">
                Platform Sections
              </p>
              <h2 className="mt-2 text-2xl font-medium text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}>
                Four ways to read the evidence
              </h2>
            </div>
            <p className="max-w-xs text-right text-sm text-[var(--text-muted)]">
              The regional map is the strongest current experience. The other sections should feel just as deliberate.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {SECTION_CARDS.map((card, index) => (
              <Link
                key={card.href}
                href={card.href}
                className="homepage-section-card group rounded-[22px] border p-5 transition hover:-translate-y-1"
                style={{
                  borderColor: 'var(--border)',
                  background:
                    index === 0
                      ? 'linear-gradient(180deg, rgba(238,247,252,0.95), rgba(255,255,255,1))'
                      : 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(253,252,250,1))',
                }}
              >
                <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-faint)]">{card.eyebrow}</p>
                <h3 className="mt-2 text-lg font-medium text-[var(--text-primary)] group-hover:text-[var(--warm-700)]">
                  {card.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">{card.description}</p>
                <div className="mt-5 flex items-center justify-between text-sm font-medium text-[var(--cool-700)]">
                  <span>Enter section</span>
                  <span className="transition group-hover:translate-x-1">→</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-sm)]">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">Project framing</p>
          <h2 className="mt-2 text-2xl font-medium text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}>
            What the platform is trying to explain
          </h2>

          <div className="mt-5 space-y-4">
            {[
              {
                title: 'Household vulnerability',
                body: 'Income, assets, consumption, and self-reported hardship provide the micro-level structure behind poverty risk.',
              },
              {
                title: 'Regional inequality',
                body: 'Poverty and extreme poverty rates vary across Armenian marzes and need map-first interpretation rather than isolated tables.',
              },
              {
                title: 'Forecasting limits',
                body: 'Time-series pages should communicate not just metrics, but also the strength and limits of the data generation process.',
              },
            ].map((item) => (
              <div key={item.title} className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
                <h3 className="text-sm font-medium text-[var(--text-primary)]">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{item.body}</p>
              </div>
            ))}
          </div>

          <Link
            href="/explorer"
            className="mt-6 inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:border-[var(--cool-300)] hover:bg-[var(--surface-subtle)]"
          >
            Inspect the dataset directly <span>→</span>
          </Link>
        </div>
      </section>

      <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-sm)]">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">Model snapshot</p>
            <h2 className="mt-2 text-2xl font-medium text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}>
              Household Income Benchmark
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              ILCS 2015 micro-level income model. The primary forecast evidence is the{' '}
              <Link href="/models/validation" className="font-medium text-[var(--cool-700)] underline">
                2022 Validation
              </Link>{' '}
              page.
            </p>
          </div>
          <Link href="/models" className="text-sm font-medium text-[var(--cool-700)] transition hover:text-[var(--cool-800)]">
            Open household model →
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                <th className="px-0 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)]">Model</th>
                <th className="px-0 py-3 text-right text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)]">R²</th>
                <th className="px-0 py-3 text-right text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)]">MAE</th>
                <th className="px-0 py-3 text-right text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)]">RMSE</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m, index) => (
                <tr key={m.model} className="border-b border-[var(--border-subtle)] last:border-b-0">
                  <td className="py-3 text-[var(--text-primary)]">
                    <div className="flex items-center gap-2">
                      {index === 0 && (
                        <span className="rounded-full bg-[var(--warning-bg)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--warning)]">
                          Best
                        </span>
                      )}
                      <span className="font-medium">{m.model.toUpperCase()}</span>
                    </div>
                  </td>
                  <td className="py-3 text-right font-data text-[var(--text-secondary)]">{m.r2.toFixed(4)}</td>
                  <td className="py-3 text-right font-data text-[var(--text-secondary)]">{formatAMD(Math.round(m.mae), true)}</td>
                  <td className="py-3 text-right font-data text-[var(--text-secondary)]">{formatAMD(Math.round(m.rmse), true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
