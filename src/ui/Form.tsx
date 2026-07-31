import { useId, useState, type ReactNode, type KeyboardEvent } from 'react';

import { Button } from './Button';

function hasErrorValue(error: ReactNode): boolean {
  return error !== undefined && error !== null && error !== '';
}

export function fieldAria(
  id: string,
  hint: ReactNode,
  error: ReactNode,
  required?: boolean,
): {
  'aria-describedby': string | undefined;
  'aria-invalid': true | undefined;
  'aria-required': true | undefined;
} {
  const ids = [
    hint !== undefined ? `${id}-hint` : undefined,
    hasErrorValue(error) ? `${id}-error` : undefined,
  ].filter((v): v is string => v !== undefined);
  return {
    'aria-describedby': ids.length > 0 ? ids.join(' ') : undefined,
    'aria-invalid': hasErrorValue(error) ? true : undefined,
    'aria-required': required === true ? true : undefined,
  };
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={htmlFor} className="field-label">
        {label}
        {required === true && <span aria-hidden="true"> *</span>}
      </label>
      {children}
      {hint !== undefined && (
        <p id={`${htmlFor}-hint`} className="field-hint muted">
          {hint}
        </p>
      )}
      {hasErrorValue(error) && (
        <p id={`${htmlFor}-error`} className="field-error error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  hint,
  error,
  required,
  placeholder,
  type = 'text',
  autoComplete = 'off',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  placeholder?: string;
  type?: 'text' | 'password' | 'email' | 'url';
  autoComplete?: string;
}) {
  const id = useId();
  return (
    <Field
      label={label}
      htmlFor={id}
      hint={hint}
      error={error}
      required={required}
    >
      <input
        id={id}
        className="input"
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        {...fieldAria(id, hint, error, required)}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      />
    </Field>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  hint,
  error,
  required,
  min,
  max,
  disabled,
}: {
  label: string;
  value: number | '';
  onChange: (v: number | '') => void;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <Field
      label={label}
      htmlFor={id}
      hint={hint}
      error={error}
      required={required}
    >
      <input
        id={id}
        className="input"
        type="number"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        {...fieldAria(id, hint, error, required)}
        onChange={(e) => {
          onChange(e.target.value === '' ? '' : Number(e.target.value));
        }}
      />
    </Field>
  );
}

export function TextareaField({
  label,
  value,
  onChange,
  hint,
  error,
  required,
  rows = 4,
  monospace = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  rows?: number;
  monospace?: boolean;
}) {
  const id = useId();
  return (
    <Field
      label={label}
      htmlFor={id}
      hint={hint}
      error={error}
      required={required}
    >
      <textarea
        id={id}
        className={monospace ? 'input mono' : 'input'}
        rows={rows}
        value={value}
        {...fieldAria(id, hint, error, required)}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      />
    </Field>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  hint,
  error,
  required,
  disabled,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <Field
      label={label}
      htmlFor={id}
      hint={hint}
      error={error}
      required={required}
    >
      <select
        id={id}
        className="input"
        value={value}
        disabled={disabled}
        {...fieldAria(id, hint, error, required)}
        onChange={(e) => {
          onChange(e.target.value as T);
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function CheckboxField({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="field field-checkbox">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => {
          onChange(e.target.checked);
        }}
      />
      <label htmlFor={id}>{label}</label>
      {hint !== undefined && <p className="field-hint muted">{hint}</p>}
    </div>
  );
}

/** A chip editor for a string array (principals, groups, approver emails). */
export function TagField({
  label,
  values,
  onChange,
  hint,
  error,
  placeholder = 'Type and press Enter',
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  hint?: ReactNode;
  error?: ReactNode;
  placeholder?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState('');

  const commit = () => {
    const v = draft.trim();
    if (v !== '' && !values.includes(v)) onChange([...values, v]);
    setDraft('');
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && draft === '' && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  };

  return (
    <Field label={label} htmlFor={id} hint={hint} error={error}>
      <div className="tag-field">
        {values.map((v) => (
          <span key={v} className="tag">
            {v}
            <button
              type="button"
              aria-label={`Remove ${v}`}
              onClick={() => {
                onChange(values.filter((x) => x !== v));
              }}
            >
              ✕
            </button>
          </span>
        ))}
        <input
          id={id}
          className="tag-input"
          value={draft}
          placeholder={placeholder}
          onChange={(e) => {
            setDraft(e.target.value);
          }}
          onKeyDown={onKeyDown}
          onBlur={commit}
        />
      </div>
    </Field>
  );
}

/** A checkbox group over a fixed enum (capabilities, permissions). */
export function EnumMultiField<T extends string>({
  label,
  options,
  values,
  onChange,
  hint,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  values: T[];
  onChange: (v: T[]) => void;
  hint?: ReactNode;
}) {
  const toggle = (v: T, on: boolean) => {
    onChange(on ? [...new Set([...values, v])] : values.filter((x) => x !== v));
  };
  return (
    <fieldset className="field enum-multi">
      <legend className="field-label">{label}</legend>
      <div className="enum-multi-grid">
        {options.map((o) => (
          <label key={o.value} className="enum-multi-item">
            <input
              type="checkbox"
              checked={values.includes(o.value)}
              onChange={(e) => {
                toggle(o.value, e.target.checked);
              }}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      {hint !== undefined && <p className="field-hint muted">{hint}</p>}
    </fieldset>
  );
}

/** Parse a JSON object string; returns `undefined` on empty and throws on invalid. */
export function parseJsonObject(
  text: string,
): Record<string, unknown> | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  const parsed: unknown = JSON.parse(trimmed);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new SyntaxError('Expected a JSON object');
  }
  return parsed as Record<string, unknown>;
}

/** A monospace JSON editor (selectors are shape-validated jsonb). Validates on change. */
export function JsonField({
  label,
  value,
  onChange,
  hint,
  required,
  rows = 5,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: ReactNode;
  required?: boolean;
  rows?: number;
}) {
  let error: string | undefined;
  try {
    parseJsonObject(value);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Invalid JSON';
  }
  return (
    <TextareaField
      label={label}
      value={value}
      onChange={onChange}
      hint={hint}
      error={error}
      required={required}
      rows={rows}
      monospace
    />
  );
}

export function FormActions({ children }: { children: ReactNode }) {
  return <div className="form-actions">{children}</div>;
}

export { Button };
