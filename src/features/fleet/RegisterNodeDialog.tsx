import { useState } from 'react';

import {
  Button,
  Dialog,
  FormActions,
  JsonField,
  ProblemAlert,
  TextField,
  TextareaField,
  parseJsonObject,
} from '../../ui';
import type { RegisterNodeRequest } from '../../api/types';
import { useRegisterNode } from './api';

function toLabelMap(text: string): Record<string, string> | undefined {
  const obj = parseJsonObject(text);
  if (obj === undefined) return undefined;
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, String(v)]),
  );
}

export function RegisterNodeDialog({ onClose }: { onClose: () => void }) {
  const register = useRegisterNode();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [labels, setLabels] = useState('');
  const [hostCertificate, setHostCertificate] = useState('');
  const [pinnedHostKey, setPinnedHostKey] = useState('');
  const [nodePolicyName, setNodePolicyName] = useState('');

  const hasHostIdentity =
    hostCertificate.trim() !== '' || pinnedHostKey.trim() !== '';
  const canSubmit =
    name.trim() !== '' && address.trim() !== '' && hasHostIdentity;

  const onSubmit = () => {
    let parsedLabels: Record<string, string> | undefined;
    try {
      parsedLabels = toLabelMap(labels);
    } catch {
      return; // JsonField already surfaces the parse error
    }
    const body: RegisterNodeRequest = {
      name: name.trim(),
      address: address.trim(),
      ...(parsedLabels !== undefined ? { labels: parsedLabels } : {}),
      ...(hostCertificate.trim() !== ''
        ? { hostCertificate: hostCertificate.trim() }
        : {}),
      ...(pinnedHostKey.trim() !== ''
        ? { pinnedHostKey: pinnedHostKey.trim() }
        : {}),
      ...(nodePolicyName.trim() !== ''
        ? { nodePolicyName: nodePolicyName.trim() }
        : {}),
    };
    register.mutate(body, { onSuccess: onClose });
  };

  return (
    <Dialog title="Register agentless node" onClose={onClose}>
      <TextField
        label="Name"
        value={name}
        onChange={setName}
        required
        hint="Stable, unique node name — the enrollment key and SSH addressing name."
      />
      <TextField
        label="Dial address"
        value={address}
        onChange={setAddress}
        required
        placeholder="host:port"
        hint="The node sshd address; port defaults to 22 if omitted."
      />
      <JsonField
        label="Labels"
        value={labels}
        onChange={setLabels}
        hint='Inventory labels for node selectors, e.g. {"env":"prod"}.'
      />
      <TextareaField
        label="Host certificate"
        value={hostCertificate}
        onChange={setHostCertificate}
        rows={3}
        monospace
        hint="Host-CA-signed OpenSSH host certificate line (primary host-identity anchor)."
      />
      <TextareaField
        label="Pinned host key"
        value={pinnedHostKey}
        onChange={setPinnedHostKey}
        rows={3}
        monospace
        error={
          !hasHostIdentity
            ? 'Provide a host certificate or a pinned host key — SessionLayer never trusts on first use.'
            : undefined
        }
        hint="Fallback anchor when the node presents a plain host key."
      />
      <TextField
        label="Node policy"
        value={nodePolicyName}
        onChange={setNodePolicyName}
        hint="Optional NodePolicy snapshot reference."
      />

      {register.isError && <ProblemAlert error={register.error} />}

      <FormActions>
        <Button variant="ghost" onClick={onClose} disabled={register.isPending}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={onSubmit}
          disabled={!canSubmit || register.isPending}
        >
          {register.isPending ? 'Registering…' : 'Register'}
        </Button>
      </FormActions>
    </Dialog>
  );
}
