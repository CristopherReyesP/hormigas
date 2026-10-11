interface FrontierBannerProps {
  banner: { title: string; subtitle: string } | null | undefined;
}

/** Phase 2 opens: the thorn wall falls and the meteor shower strikes (styled as the night milestone) */
export function FrontierBanner({ banner }: FrontierBannerProps) {
  if (!banner) return null;
  return (
    <div className="milestone-banner" role="status" aria-live="polite">
      <div className="run-banner" style={{ marginBottom: 0 }}>{banner.title}</div>
      <div className="milestone-reward">{banner.subtitle}</div>
    </div>
  );
}
