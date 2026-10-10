import { RUN_NIGHTS_TO_WIN } from '../../../shared/constants';
import './human.css';

/**
 * The Human expedition's landing line, over the map for the first seconds of
 * the run (the Swarm's opening is the meteor cinematic instead). It reuses
 * the run banner's look and fades out on its own.
 */
export function HumanIntroBanner({ title }: { title: string }) {
  return (
    <div className="human-intro" role="status" aria-live="polite">
      <div className="run-banner human-intro-banner">{title}</div>
      <div className="human-intro-sub">Levanta la base, junta minerales y resiste {RUN_NIGHTS_TO_WIN} noches</div>
    </div>
  );
}
