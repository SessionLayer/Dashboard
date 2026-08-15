// Imported from `ui/enums` directly rather than through the `ui` barrel: these
// are pure data helpers with no React dependency, and the barrel would pull the
// component tree into a module the whole app imports.
import { enumOptions } from '../ui/enums';
import type { Capability } from './types';

/**
 * The SSH capability vocabulary, in presentable form.
 *
 * One table rather than one per feature. Four features offered these choices and
 * each kept its own byte-identical copy, so adding a capability to the contract
 * meant finding all four. Being individually exhaustive made every copy fail the
 * build, which is the right failure but four times over; a single source fails it
 * once, in the place that has to change.
 *
 * A feature that needs to present capabilities differently should map over this
 * rather than restate it — a second list keyed by the same union is the
 * duplication coming back.
 */
export const CAPABILITY_OPTIONS = enumOptions<Capability>({
  shell: 'shell',
  exec: 'exec',
  sftp: 'sftp',
  scp: 'scp',
  port_forward_local: 'port_forward_local',
  port_forward_remote: 'port_forward_remote',
  agent_forward: 'agent_forward',
  x11: 'x11',
});

/** The capability values alone, for controls that build their own option shape. */
export const CAPABILITIES: readonly Capability[] = CAPABILITY_OPTIONS.map(
  (o) => o.value,
);
