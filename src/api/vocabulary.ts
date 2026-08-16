// Imported from `ui/enums` directly rather than through the `ui` barrel: these
// are pure data helpers with no React dependency, and the barrel would pull the
// component tree into a module the whole app imports.
import { enumOptions } from '../ui/enums';
import type { Capability } from './types';

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

export const CAPABILITIES: readonly Capability[] = CAPABILITY_OPTIONS.map(
  (o) => o.value,
);
