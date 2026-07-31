import { useState } from 'react';

import {
  Badge,
  Button,
  CodeBlock,
  ConfirmDialog,
  Detail,
  DetailList,
  Dialog,
  EnumMultiField,
  FormActions,
  JsonField,
  NumberField,
  PageHeader,
  SelectField,
  TagField,
  TextField,
  Time,
  parseJsonObject,
  type Column,
} from '../../ui';
import { useCan } from '../../auth/AuthContext';
import type { Capability, Effect, RuleResource } from '../../api/types';
import { CrudList, MutationError, OriginBadge, jsonText } from './common';
import { useCreateRule, useDeleteRule, useRules, useUpdateRule } from './hooks';

const CAPABILITY_OPTIONS: readonly { value: Capability; label: string }[] = [
  { value: 'shell', label: 'shell' },
  { value: 'exec', label: 'exec' },
  { value: 'sftp', label: 'sftp' },
  { value: 'scp', label: 'scp' },
  { value: 'port_forward_local', label: 'port_forward_local' },
  { value: 'port_forward_remote', label: 'port_forward_remote' },
  { value: 'agent_forward', label: 'agent_forward' },
  { value: 'x11', label: 'x11' },
];

const EFFECT_OPTIONS: readonly { value: Effect; label: string }[] = [
  { value: 'allow', label: 'allow' },
  { value: 'deny', label: 'deny' },
];

type Dialog =
  | { kind: 'create' }
  | { kind: 'detail'; row: RuleResource }
  | { kind: 'edit'; row: RuleResource }
  | { kind: 'delete'; row: RuleResource };

function effectBadge(effect: Effect) {
  return <Badge tone={effect === 'deny' ? 'fail' : 'pass'}>{effect}</Badge>;
}

/** A compact `k=v k2=v2` summary of a selector object for the list column. */
function selectorSummary(selector: Record<string, unknown>): string {
  const entries = Object.entries(selector);
  if (entries.length === 0) return '*';
  return entries.map(([k, v]) => `${k}=${String(v)}`).join(' ');
}

function RuleForm({
  existing,
  onDone,
}: {
  existing?: RuleResource;
  onDone: () => void;
}) {
  const create = useCreateRule();
  const update = useUpdateRule();
  const [name, setName] = useState(existing?.name ?? '');
  const [identity, setIdentity] = useState(
    jsonText(existing?.identitySelector) || '{}',
  );
  const [nodeLabel, setNodeLabel] = useState(
    jsonText(existing?.nodeLabelSelector) || '{}',
  );
  const [sourceIp, setSourceIp] = useState(
    jsonText(existing?.sourceIpCondition),
  );
  const [principals, setPrincipals] = useState<string[]>(
    existing?.principals ?? [],
  );
  const [ttl, setTtl] = useState<number | ''>(existing?.ttlSeconds ?? 3600);
  const [capabilities, setCapabilities] = useState<Capability[]>(
    existing?.capabilities ?? [],
  );
  const [effect, setEffect] = useState<Effect>(existing?.effect ?? 'allow');
  const [formError, setFormError] = useState<string>();

  const pending = create.isPending || update.isPending;

  const submit = () => {
    let identitySelector: Record<string, unknown>;
    let nodeLabelSelector: Record<string, unknown>;
    let sourceIpCondition: Record<string, unknown> | undefined;
    try {
      identitySelector = parseJsonObject(identity) ?? {};
      nodeLabelSelector = parseJsonObject(nodeLabel) ?? {};
      sourceIpCondition = parseJsonObject(sourceIp);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Invalid JSON selector');
      return;
    }
    setFormError(undefined);
    const ttlSeconds = ttl === '' ? 0 : ttl;
    if (existing) {
      update.mutate(
        {
          id: existing.id,
          body: {
            identitySelector,
            nodeLabelSelector,
            sourceIpCondition,
            principals,
            ttlSeconds,
            capabilities,
            effect,
            version: existing.version,
          },
        },
        { onSuccess: onDone },
      );
    } else {
      create.mutate(
        {
          name,
          identitySelector,
          nodeLabelSelector,
          sourceIpCondition,
          principals,
          ttlSeconds,
          capabilities,
          effect,
        },
        { onSuccess: onDone },
      );
    }
  };

  return (
    <div className="form">
      {existing === undefined && (
        <TextField label="Name" value={name} onChange={setName} required />
      )}
      <JsonField
        label="Identity selector"
        value={identity}
        onChange={setIdentity}
        required
        hint="JSON object matched against the caller identity."
      />
      <JsonField
        label="Node-label selector"
        value={nodeLabel}
        onChange={setNodeLabel}
        required
        hint="JSON object matched against target node labels."
      />
      <JsonField
        label="Source-IP condition"
        value={sourceIp}
        onChange={setSourceIp}
        hint="Optional JSON object; leave empty for no source-IP constraint."
      />
      <TagField
        label="Principals"
        values={principals}
        onChange={setPrincipals}
        hint="Unix login names this rule grants."
      />
      <NumberField
        label="TTL (seconds)"
        value={ttl}
        onChange={setTtl}
        min={1}
        required
      />
      <EnumMultiField
        label="Capabilities"
        options={CAPABILITY_OPTIONS}
        values={capabilities}
        onChange={setCapabilities}
      />
      <SelectField
        label="Effect"
        value={effect}
        onChange={setEffect}
        options={EFFECT_OPTIONS}
        required
      />
      {formError !== undefined && (
        <p className="field-error error" role="alert">
          {formError}
        </p>
      )}
      <MutationError error={existing ? update.error : create.error} />
      <FormActions>
        <Button variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} disabled={pending}>
          {pending ? 'Saving…' : existing ? 'Save changes' : 'Create rule'}
        </Button>
      </FormActions>
    </div>
  );
}

function RuleDetail({ row }: { row: RuleResource }) {
  return (
    <DetailList>
      <Detail label="Name">{row.name}</Detail>
      <Detail label="Effect">{effectBadge(row.effect)}</Detail>
      <Detail label="Principals">
        {row.principals.length > 0 ? row.principals.join(', ') : '—'}
      </Detail>
      <Detail label="Capabilities">
        {row.capabilities.length > 0 ? row.capabilities.join(', ') : '—'}
      </Detail>
      <Detail label="TTL">{row.ttlSeconds}s</Detail>
      <Detail label="Identity selector">
        <CodeBlock value={row.identitySelector} />
      </Detail>
      <Detail label="Node-label selector">
        <CodeBlock value={row.nodeLabelSelector} />
      </Detail>
      <Detail label="Source-IP condition">
        <CodeBlock value={row.sourceIpCondition} />
      </Detail>
      <Detail label="Origin">
        <OriginBadge origin={row.origin} />
      </Detail>
      <Detail label="Version">{row.version}</Detail>
      <Detail label="Created">
        <Time value={row.createdAt} />
      </Detail>
      <Detail label="Updated">
        <Time value={row.updatedAt} />
      </Detail>
    </DetailList>
  );
}

export function RulesScreen() {
  const canWrite = useCan('rbac:write');
  const rules = useRules();
  const del = useDeleteRule();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const close = () => {
    setDialog(null);
    del.reset();
  };

  const columns: Column<RuleResource>[] = [
    { header: 'Name', cell: (r) => r.name },
    { header: 'Effect', cell: (r) => effectBadge(r.effect) },
    {
      header: 'Principals',
      cell: (r) => (r.principals.length > 0 ? r.principals.join(', ') : '—'),
    },
    {
      header: 'Selector',
      cell: (r) => (
        <span className="mono">
          id:{selectorSummary(r.identitySelector)} node:
          {selectorSummary(r.nodeLabelSelector)}
        </span>
      ),
    },
    {
      header: 'Capabilities',
      cell: (r) =>
        r.capabilities.length > 0 ? r.capabilities.join(', ') : '—',
    },
    { header: 'TTL', cell: (r) => `${String(r.ttlSeconds)}s`, align: 'right' },
    { header: 'Origin', cell: (r) => <OriginBadge origin={r.origin} /> },
    {
      header: 'Ver',
      cell: (r) => <span className="mono">v{r.version}</span>,
      align: 'right',
    },
  ];

  return (
    <section>
      <PageHeader
        title="Data-plane rules"
        description="Typed allow/deny grants the access engine evaluates per session."
        actions={
          canWrite ? (
            <Button
              variant="primary"
              onClick={() => {
                setDialog({ kind: 'create' });
              }}
            >
              New rule…
            </Button>
          ) : undefined
        }
      />
      <CrudList
        list={rules}
        columns={columns}
        rowKey={(r) => r.id}
        caption="Data-plane rules"
        emptyTitle="No rules yet"
        onRowClick={(row) => {
          setDialog({ kind: 'detail', row });
        }}
      />

      {dialog?.kind === 'create' && (
        <Dialog title="New rule" onClose={close}>
          <RuleForm onDone={close} />
        </Dialog>
      )}
      {dialog?.kind === 'edit' && (
        <Dialog title={`Edit rule "${dialog.row.name}"`} onClose={close}>
          <RuleForm existing={dialog.row} onDone={close} />
        </Dialog>
      )}
      {dialog?.kind === 'detail' && (
        <Dialog title={dialog.row.name} onClose={close}>
          <RuleDetail row={dialog.row} />
          {canWrite && (
            <FormActions>
              <Button
                onClick={() => {
                  setDialog({ kind: 'edit', row: dialog.row });
                }}
              >
                Edit
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setDialog({ kind: 'delete', row: dialog.row });
                }}
              >
                Delete
              </Button>
            </FormActions>
          )}
        </Dialog>
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          title={`Delete rule "${dialog.row.name}"?`}
          confirmLabel="Delete"
          pending={del.isPending}
          error={del.error}
          onConfirm={() => {
            del.mutate(dialog.row.id, { onSuccess: close });
          }}
          onClose={close}
        >
          <p>
            This removes the grant. In-flight sessions are unaffected; new
            evaluations will no longer match it.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}
