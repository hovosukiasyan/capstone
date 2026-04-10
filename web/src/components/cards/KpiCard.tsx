interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: { value: number; label: string };
  color?: 'blue' | 'emerald' | 'amber' | 'rose' | 'slate';
  icon?: React.ReactNode;
}

const colorMap = {
  blue:    'bg-blue-50 border-blue-100',
  emerald: 'bg-emerald-50 border-emerald-100',
  amber:   'bg-amber-50 border-amber-100',
  rose:    'bg-rose-50 border-rose-100',
  slate:   'bg-slate-50 border-slate-100',
};

const valueColorMap = {
  blue:    'text-blue-800',
  emerald: 'text-emerald-800',
  amber:   'text-amber-800',
  rose:    'text-rose-800',
  slate:   'text-slate-800',
};

export default function KpiCard({
  title, value, subtitle, trend, color = 'slate', icon,
}: KpiCardProps) {
  return (
    <div className={`rounded-xl border p-5 ${colorMap[color]}`}>
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        {icon && <span className="text-slate-400">{icon}</span>}
      </div>
      <p className={`mt-2 text-3xl font-bold tabular-nums ${valueColorMap[color]}`}>
        {value}
      </p>
      {subtitle && (
        <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
      )}
      {trend && (
        <div className="mt-2 flex items-center gap-1">
          <span className={trend.value >= 0 ? 'text-rose-500' : 'text-emerald-500'}>
            {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value).toFixed(1)}%
          </span>
          <span className="text-xs text-slate-400">{trend.label}</span>
        </div>
      )}
    </div>
  );
}
