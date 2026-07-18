import { Card } from '@/components/ui/Card';
import { StatNumber } from '@/components/ui/StatNumber';
import { SegmentedBar, segmentColors } from '@/components/ui/SegmentedBar';
import type { GardenStats } from '@wortgarten/shared';

interface GardenCardProps {
  garden: GardenStats;
  index: number;
}

export function GardenCard({ garden, index }: GardenCardProps) {
  const { collected, mastered, segments } = garden;
  const barSegments = [
    { label: 'New', count: segments.new, color: segmentColors.new },
    { label: 'Learning', count: segments.learning, color: segmentColors.learning },
    { label: 'Mastered', count: segments.mastered, color: segmentColors.mastered },
  ];

  return (
    <>
      {/* Desktop: full garden card */}
      <Card index={index} className="hidden lg:block">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Your garden</p>
        <div className="flex gap-6 mb-4">
          <StatNumber value={collected} caption="words collected 🌱" color="primary" />
          <StatNumber value={mastered} caption="mastered 🏆" color="gold" />
        </div>
        <SegmentedBar segments={barSegments} />
      </Card>

      {/* Mobile: two side-by-side stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:hidden">
        <Card index={index} className="!p-4">
          <p className="text-[28px] font-extrabold text-teal leading-none">{collected}</p>
          <p className="mt-1 text-xs text-muted">words in garden 🌱</p>
        </Card>
        <Card index={index + 0.5} className="!p-4">
          <p className="text-[28px] font-extrabold text-teal-deep leading-none">{mastered}</p>
          <p className="mt-1 text-xs text-muted">mastered 🏆</p>
        </Card>
      </div>
    </>
  );
}
