interface AvatarProps {
  name?: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'h-8 w-8 text-sm',
  md: 'h-10 w-10 text-base',
  lg: 'h-12 w-12 text-lg',
};

export function Avatar({ name, src, size = 'md', className = '' }: AvatarProps) {
  const initial = name ? name[0].toUpperCase() : '?';

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={`rounded-full object-cover ${sizeClasses[size]} ${className}`}
      />
    );
  }

  return (
    <div
      className={`flex items-center justify-center rounded-full bg-lilac font-bold text-primary ${sizeClasses[size]} ${className}`}
    >
      {initial}
    </div>
  );
}
