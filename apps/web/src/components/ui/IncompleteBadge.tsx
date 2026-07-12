export function IncompleteBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-chip bg-coral/10 px-2.5 py-0.5 text-xs font-semibold text-coral ${className}`}
    >
      incomplete entry
    </span>
  );
}
