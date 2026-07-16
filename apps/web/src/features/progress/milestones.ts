export interface MilestoneDef {
  threshold: number;
  payoff: string;
}

/** Static app copy, not user data — thresholds and payoff lines never come from the API. */
export const MILESTONES: MilestoneDef[] = [
  { threshold: 100, payoff: 'Introduce yourself, order food' },
  { threshold: 200, payoff: 'Understand ~40% of daily German' },
  { threshold: 300, payoff: 'Follow simple conversations' },
  { threshold: 500, payoff: "Read children's books" },
  { threshold: 1000, payoff: 'Understand ~75% of daily German' },
];
