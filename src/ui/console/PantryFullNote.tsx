import { pantryFullText, pantryWaitersText, pantryWaitingText } from './pantryNote';

/**
 * The full-pantry message as a note in the banner column under the top strip
 * (the strip itself only says LLENA): the food still on its way, the workers
 * waiting below with their loads and the tool that makes room.
 */
export function PantryFullNote({ inTransit, waiting = 0 }: { inTransit: number; waiting?: number }) {
  const onWay = pantryWaitingText(inTransit);
  const waiters = pantryWaitersText(waiting);
  return (
    <div className="pantry-full-note" role="status">
      {onWay && <span className="pantry-full-note-waiting">{onWay}</span>}
      {waiters && <span className="pantry-full-note-waiting">{waiters}</span>}
      <span>{pantryFullText()}</span>
    </div>
  );
}
