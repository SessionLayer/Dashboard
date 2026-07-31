import { useCallback, useState } from 'react';

import { importCustomerPrivateKey, SlrecError } from '../../crypto/slrec';

/**
 * Read a picked file to bytes with `FileReader` (jsdom's `File` has no
 * `arrayBuffer()`), staying entirely in-browser — the file is never uploaded.
 */
function readFileBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (result instanceof ArrayBuffer) resolve(new Uint8Array(result));
      else reject(new Error('Could not read the selected file.'));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('Could not read the selected file.'));
    };
    reader.readAsArrayBuffer(file);
  });
}

export interface CustomerKeyState {
  /** The imported, NON-extractable private key — held in memory only. */
  key: CryptoKey | undefined;
  keyName: string | undefined;
  keyError: string | undefined;
  importing: boolean;
  importFromFile: (file: File) => Promise<void>;
  clear: () => void;
}

/**
 * Holds the customer's recording decryption key in component state ONLY. The key
 * is imported non-extractable, never serialized, never sent to the Control Plane
 * or object store, and never written to storage — the §12.2/§15 crown-jewels
 * invariant. It vanishes when the screen unmounts.
 */
export function useCustomerKey(): CustomerKeyState {
  const [key, setKey] = useState<CryptoKey | undefined>();
  const [keyName, setKeyName] = useState<string | undefined>();
  const [keyError, setKeyError] = useState<string | undefined>();
  const [importing, setImporting] = useState(false);

  const importFromFile = useCallback(async (file: File) => {
    setImporting(true);
    setKeyError(undefined);
    try {
      const bytes = await readFileBytes(file);
      const text = new TextDecoder().decode(bytes);
      const imported = text.includes('-----BEGIN')
        ? await importCustomerPrivateKey(text)
        : await importCustomerPrivateKey(bytes);
      setKey(imported);
      setKeyName(file.name);
    } catch (e) {
      setKey(undefined);
      setKeyName(undefined);
      setKeyError(
        e instanceof SlrecError
          ? e.message
          : 'That file is not a usable PKCS#8 P-256 private key.',
      );
    } finally {
      setImporting(false);
    }
  }, []);

  const clear = useCallback(() => {
    setKey(undefined);
    setKeyName(undefined);
    setKeyError(undefined);
  }, []);

  return { key, keyName, keyError, importing, importFromFile, clear };
}
