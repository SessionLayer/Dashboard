import { useId } from 'react';

import { Badge, Button } from '../../ui';
import type { CustomerKeyState } from './customerKey';

/**
 * The customer decryption-key panel. The picked private key is imported in the
 * browser and held in memory only; this component makes the "never uploaded,
 * never stored" guarantee explicit to the operator.
 */
export function KeyInput({ keyState }: { keyState: CustomerKeyState }) {
  const id = useId();
  const { key, keyName, keyError, importing, importFromFile, clear } = keyState;

  return (
    <div className="key-panel">
      <div className="key-panel-head">
        <span className="key-panel-title">Recording decryption key</span>
        {key !== undefined ? (
          <Badge tone="pass">Key loaded</Badge>
        ) : (
          <Badge tone="warn">No key</Badge>
        )}
      </div>

      {key === undefined ? (
        <>
          <label htmlFor={id} className="field-label">
            Customer private key (PKCS#8 P-256, PEM or DER)
          </label>
          <input
            id={id}
            type="file"
            className="input"
            accept=".pem,.key,.der,.p8,application/x-pem-file,application/octet-stream"
            disabled={importing}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importFromFile(file);
            }}
          />
          <p className="field-hint muted">
            Used only in this browser to decrypt the recording. It is never sent
            to the platform, never uploaded to object storage, and never stored.
          </p>
        </>
      ) : (
        <div className="key-loaded">
          <span className="key-name">{keyName}</span>
          <Button size="sm" variant="ghost" onClick={clear}>
            Clear key
          </Button>
        </div>
      )}

      {keyError !== undefined && (
        <p className="field-error error" role="alert">
          {keyError}
        </p>
      )}
    </div>
  );
}
