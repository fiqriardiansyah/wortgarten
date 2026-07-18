import { tokens } from '@/design/tokens';

export function IncompleteBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center border-2 leading-none ${className}`}
      style={{
        backgroundColor: tokens.color.coralSoft,
        color: tokens.color.coralDeep,
        borderColor: tokens.color.coral,
        borderRadius: tokens.sketch.radiusC,
        paddingLeft: tokens.component.chip.paddingX,
        paddingRight: tokens.component.chip.paddingX,
        paddingTop: tokens.component.chip.paddingY,
        paddingBottom: tokens.component.chip.paddingY,
        fontSize: tokens.font.size.xs,
        fontWeight: tokens.font.weight.bold,
      }}
    >
      incomplete entry
    </span>
  );
}
