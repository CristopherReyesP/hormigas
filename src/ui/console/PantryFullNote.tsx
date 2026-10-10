import { pantryFullText, pantryWaitingText } from './pantryNote';

/**
 * The full-pantry message as a note in the banner column under the top strip
 * (the strip itself only says LLENA): the food still on its way and the tool
 * that makes room.
 */
export function PantryFullNote({ inTransit }: { inTransit: number }) {
  const waiting = pantryWaitingText(inTransit);
  return (
    <div className="pantry-full-note" role="status">
      {waiting && <span className="pantry-full-note-waiting">{waiting}</span>}
      <span>{pantryFullText()}</span>
    </div>
  );
}
