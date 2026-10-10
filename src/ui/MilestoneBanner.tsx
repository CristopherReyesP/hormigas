import type { MilestoneInfo } from '../game/GameManager';

interface MilestoneBannerProps {
  milestone: MilestoneInfo | null | undefined;
}

/** The endless run's night milestone (night 7, then every 5): a short celebration over the world. */
export function MilestoneBanner({ milestone }: MilestoneBannerProps) {
  if (!milestone) return null;
  const reward = `+${milestone.minerals} minerales${milestone.food > 0 ? ` · +${milestone.food} ${milestone.foodUnit}` : ''}`;
  return (
    <div className="milestone-banner" role="status" aria-live="polite">
      <div className="run-banner" style={{ marginBottom: 0 }}>{milestone.title}</div>
      <div className="milestone-reward">{reward}</div>
    </div>
  );
}
