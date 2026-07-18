import { Card } from '@/components/ui/Card';
import { SegmentedBar } from '@/components/ui/SegmentedBar';
import type { GardenStats } from '@wortgarten/shared';

interface GardenHeroCardProps {
  garden: GardenStats;
  index: number;
}

// This card's own solid teal background — brand-colored segments would vanish against it, so the
// bar reads as translucency steps instead (mastered = most opaque = solid white).
const heroSegmentColors = {
  new: 'rgba(255,255,255,0.35)',
  learning: 'rgba(255,255,255,0.65)',
  mastered: '#FFFFFF',
};

export function GardenHeroCard({ garden, index }: GardenHeroCardProps) {
  const { collected, segments } = garden;
  const barSegments = [
    { label: 'New', count: segments.new, color: heroSegmentColors.new },
    { label: 'Learning', count: segments.learning, color: heroSegmentColors.learning },
    { label: 'Mastered', count: segments.mastered, color: heroSegmentColors.mastered },
  ];

  return (
    <Card tone="primary" index={index}>
      <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Words in your garden</p>
      <p className="mt-2 text-hero font-extrabold leading-none text-white">{collected}</p>
      <p className="mt-2 text-sm text-white/80">More than most tourists ever learn 🌱</p>
      <div className="mt-5">
        <SegmentedBar segments={barSegments} onDark />
      </div>
    </Card>
  );
}
