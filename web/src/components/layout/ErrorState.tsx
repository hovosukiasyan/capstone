interface ErrorStateProps {
  title?: string;
  message: string;
  compact?: boolean;
}

export default function ErrorState({
  title = 'Failed to load data',
  message,
  compact = false,
}: ErrorStateProps) {
  return (
    <div
      className={`rounded-xl border border-rose-200 bg-rose-50 text-rose-800 ${
        compact ? 'p-4 text-sm' : 'p-6'
      }`}
    >
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed">{message}</p>
    </div>
  );
}
