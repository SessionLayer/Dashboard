import {
  useInfiniteQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
} from '@tanstack/react-query';

export { ProblemError, unwrap, type ProblemDetails } from './problem';

export interface CursorPage<T> {
  items: T[];
  nextCursor?: string;
}

export const CP_KEY = 'cp' as const;

export function resourceKey(
  area: string,
  ...rest: readonly unknown[]
): readonly unknown[] {
  return [CP_KEY, area, ...rest] as const;
}

export interface CursorListResult<T> {
  items: T[];
  isPending: boolean;
  isError: boolean;
  error: unknown;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  refetch: () => void;
}

export function useCursorList<T>(
  key: readonly unknown[],
  fetchPage: (
    cursor: string | undefined,
    signal: AbortSignal,
  ) => Promise<CursorPage<T>>,
  options?: { enabled?: boolean },
): CursorListResult<T> {
  const query: UseInfiniteQueryResult<InfiniteData<CursorPage<T>>> =
    useInfiniteQuery({
      queryKey: key,
      queryFn: ({ pageParam, signal }) => fetchPage(pageParam, signal),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor,
      enabled: options?.enabled,
    });

  return {
    items: query.data?.pages.flatMap((p) => p.items) ?? [],
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: () => void query.fetchNextPage(),
    refetch: () => void query.refetch(),
  };
}
