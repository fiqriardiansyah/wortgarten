interface StatNumberProps {
  value: number | string;
  caption: string;
  color?: 'primary' | 'gold' | 'deep';
  className?: string;
}

const colorClasses = {
  primary: 'text-primary',
  gold: 'text-gold',
  deep: 'text-deep',
};

export function StatNumber({ value, caption, color = 'deep', className = '' }: StatNumberProps) {
  return (
    <div className={`flex flex-col ${className}`}>
      <span className={`text-hero font-extrabold leading-none ${colorClasses[color]}`}>{value}</span>
      <span className="mt-1 text-sm text-muted">{caption}</span>
    </div>
  );
}
