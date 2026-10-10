import './crystal.css';

/**
 * The Crystal Hive's opening: a short title over the Hive, then it fades out
 * by itself (CSS only, it never blocks input). The Swarm's meteor intro is
 * its own cinematic; this one does not touch it.
 */
export function CrystalIntroTitle() {
  return (
    <div className="crystal-intro" aria-live="polite">
      <div className="crystal-intro-line">LA COLMENA DESPIERTA</div>
      <div className="crystal-intro-sub">Levanta extractores, haz crecer tus agujas y resiste las oleadas</div>
    </div>
  );
}
