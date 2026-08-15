import { useId } from 'react';

import { Button, Field, SelectField, TagField, TextField } from '../../ui';
import type { AccessModel, Capability } from '../../api/types';
import type { AuditFilters as Filters } from './auditHooks';

const CAPABILITIES: readonly Capability[] = [
  'shell',
  'exec',
  'sftp',
  'scp',
  'port_forward_local',
  'port_forward_remote',
  'agent_forward',
  'x11',
];

const ACCESS_MODELS: readonly AccessModel[] = ['standing', 'jit', 'breakglass'];

function DateTimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id}>
      <input
        id={id}
        className="input"
        type="datetime-local"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      />
    </Field>
  );
}

/**
 * The audit search form over every contract dimension: identity, subject,
 * action, outcome, session, node (+ node label), source IP, capability, access model,
 * time range, and correlation id — all real, write-path-populated search dimensions the
 * `/v1/audit-events` search accepts.
 */
export function AuditFilters({
  draft,
  onChange,
  onSubmit,
  onClear,
}: {
  draft: Filters;
  onChange: (next: Filters) => void;
  onSubmit: () => void;
  onClear: () => void;
}) {
  const set = <K extends keyof Filters>(key: K, v: Filters[K]) => {
    onChange({ ...draft, [key]: v });
  };

  return (
    <form
      className="audit-filters"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="filter-grid">
        <TextField
          label="Actor (identity)"
          value={draft.actor ?? ''}
          onChange={(v) => {
            set('actor', v);
          }}
        />
        <TextField
          label="Subject"
          value={draft.subject ?? ''}
          onChange={(v) => {
            set('subject', v);
          }}
        />
        <TextField
          label="Action"
          value={draft.action ?? ''}
          onChange={(v) => {
            set('action', v);
          }}
          placeholder="e.g. lock.create"
        />
        <TextField
          label="Outcome"
          value={draft.outcome ?? ''}
          onChange={(v) => {
            set('outcome', v);
          }}
        />
        <TextField
          label="Session ID"
          value={draft.sessionId ?? ''}
          onChange={(v) => {
            set('sessionId', v);
          }}
        />
        <TextField
          label="Node ID"
          value={draft.nodeId ?? ''}
          onChange={(v) => {
            set('nodeId', v);
          }}
        />
        <DateTimeField
          label="From"
          value={draft.from ?? ''}
          onChange={(v) => {
            set('from', v);
          }}
        />
        <DateTimeField
          label="To"
          value={draft.to ?? ''}
          onChange={(v) => {
            set('to', v);
          }}
        />
      </div>

      <fieldset className="filter-grid audit-more-filters">
        <legend>More dimensions</legend>
        <TextField
          label="Source IP"
          value={draft.sourceIp ?? ''}
          onChange={(v) => {
            set('sourceIp', v);
          }}
        />
        <SelectField<Capability | ''>
          label="Capability"
          value={draft.capability ?? ''}
          onChange={(v) => {
            set('capability', v);
          }}
          options={[
            { value: '', label: 'Any' },
            ...CAPABILITIES.map((c) => ({ value: c, label: c })),
          ]}
        />
        <SelectField<AccessModel | ''>
          label="Access model"
          value={draft.accessModel ?? ''}
          onChange={(v) => {
            set('accessModel', v);
          }}
          options={[
            { value: '', label: 'Any' },
            ...ACCESS_MODELS.map((m) => ({ value: m, label: m })),
          ]}
        />
        <TextField
          label="Correlation ID"
          value={draft.correlationId ?? ''}
          onChange={(v) => {
            set('correlationId', v);
          }}
        />
        <TagField
          label="Node labels (key=value)"
          values={draft.nodeLabel ?? []}
          onChange={(v) => {
            set('nodeLabel', v);
          }}
          placeholder="env=prod, then Enter"
        />
      </fieldset>

      <div className="filter-actions">
        <Button type="submit" variant="primary">
          Search
        </Button>
        <Button type="button" variant="ghost" onClick={onClear}>
          Clear
        </Button>
      </div>
    </form>
  );
}
