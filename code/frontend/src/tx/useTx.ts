import { errorMessage, explainFailure } from './errors';
import { useCallback, useState } from 'react';
import type { TxResult } from './transactions';

interface TxState {
  busy: boolean;
  digest: string | null;
  error: string | null;
}

const IDLE: TxState = { busy: false, digest: null, error: null };

export function useTx() {
  const [state, setState] = useState<TxState>(IDLE);

  const run = useCallback(async <T extends TxResult>(fn: () => Promise<T>): Promise<T | null> => {
    setState({ busy: true, digest: null, error: null });
    try {
      const res = await fn();
      setState({ busy: false, digest: res.digest, error: null });
      return res;
    } catch (e) {
      setState({
        busy: false,
        digest: null,
        error: explainFailure(errorMessage(e)) || 'Η ενέργεια απέτυχε.',
      });
      return null;
    }
  }, []);

  const reset = useCallback(() => setState(IDLE), []);

  return { ...state, run, reset };
}
