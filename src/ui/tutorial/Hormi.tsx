import { AntRole } from '../../game/components/components';
import { Portrait } from '../console/Portrait';

/** Hormi, the scout who narrates the tutorial: the scout's own animated sprite from the atlas. */
export function Hormi({ cheering = false }: { cheering?: boolean }) {
  return (
    <span className={cheering ? 'tut-hormi tut-hormi--cheer' : 'tut-hormi'} aria-hidden="true">
      <Portrait kind="ant" role={AntRole.Scout} />
    </span>
  );
}
