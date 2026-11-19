import { useCallback, useEffect, useState } from 'react';

export type Comment = { id: number; postId: number; name: string; email: string; body: string; version: number; proposalRevision: number; pendingCount: number };
type Page = { comments: Comment[]; total: number; datasetTotal: number; conflictIds: number[]; page: number; pageSize: number };

// Background refreshes retain the browsing context and cancel superseded snapshots.
export function useComments() {
  const [query, setQuery] = useState('');
  const [browse, setBrowse] = useState({ query: '', page: 1, pageSize: 25 });
  const [loadedBrowse, setLoadedBrowse] = useState<typeof browse>();
  const [data, setData] = useState<Page>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [hasComments, setHasComments] = useState(false);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);

  useEffect(() => {
    if (query === browse.query) return;
    const timer = window.setTimeout(() => setBrowse(current => ({ ...current, query, page: 1 })), 250);
    return () => window.clearTimeout(timer);
  }, [query, browse.query]);

  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    setLoading(true);
    setLoadError(false);
    if (query !== browse.query) return () => { current = false; controller.abort(); };
    const params = new URLSearchParams({ q: browse.query, page: String(browse.page), pageSize: String(browse.pageSize) });
    fetch(`/api/comments?${params}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => { if (!response.ok) throw new Error(); return response.json() as Promise<Page>; })
      .then(result => {
        if (!current) return;
        setData(result);
        setLoadedBrowse({ ...browse, page: result.page });
        if (result.total > 0) setHasComments(true);
        if (result.page !== browse.page) setBrowse(value => ({ ...value, page: result.page }));
      })
      .catch(() => { if (current) setLoadError(true); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; controller.abort(); };
  }, [browse, query, revision]);

  return {
    query, setQuery, data, loading, loadError, hasComments, refresh,
    searching: query !== loadedBrowse?.query,
    resultsOutdated: Boolean(data) && (loadError || loading || query !== loadedBrowse?.query || browse.page !== loadedBrowse?.page || browse.pageSize !== loadedBrowse?.pageSize),
    page: browse.page, pageSize: browse.pageSize,
    setPage: (page: number) => setBrowse(value => ({ ...value, page })),
    setPageSize: (pageSize: number) => setBrowse(value => ({ ...value, pageSize, page: 1 })),
  };
}
