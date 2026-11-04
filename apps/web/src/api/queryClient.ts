import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from './client';
import { meKey, resetSession } from './queries';

const isUnauthorized = (err: unknown): boolean => err instanceof ApiError && err.status === 401;

export function createQueryClient(): QueryClient {
  const onSessionLost = () => void resetSession(qc);
  const qc: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (err, query) => {
        if (isUnauthorized(err) && query.queryKey[0] !== meKey[0]) onSessionLost();
      },
    }),
    mutationCache: new MutationCache({
      onError: (err) => {
        if (isUnauthorized(err)) onSessionLost();
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, err) => !isUnauthorized(err) && failureCount < 3,
      },
    },
  });
  return qc;
}
