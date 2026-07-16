interface ProgressHeaderProps {
  daySubtitle: string;
}

export function ProgressHeader({ daySubtitle }: ProgressHeaderProps) {
  return (
    <div className="mb-6">
      <h1 className="text-[28px] font-extrabold text-deep leading-tight">Progress</h1>
      <p className="mt-0.5 text-sm text-muted">{daySubtitle}</p>
    </div>
  );
}
