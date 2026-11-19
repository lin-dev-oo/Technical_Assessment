import { useEffect, useState } from 'react';

export function useRealtime(refresh: () => void) {
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let stopped = false;
    let socket: WebSocket;
    let retry: number;
    const invalidate = () => { refresh(); setRevision(value => value + 1); };
    function connect() {
      socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/events`);
      socket.onopen = () => {
        if (stopped) return;
        setConnection('connected');
        // Also covers changes between the initial HTTP request and the first connection.
        invalidate();
      };
      socket.onmessage = event => {
        if (stopped) return;
        try { if (JSON.parse(event.data).type === 'changed') invalidate(); } catch { /* Ignore unsupported messages. */ }
      };
      socket.onerror = () => socket.close();
      socket.onclose = () => {
        if (stopped) return;
        setConnection('disconnected');
        retry = window.setTimeout(connect, 500);
      };
    }
    connect();
    return () => { stopped = true; window.clearTimeout(retry); socket.close(); };
  }, [refresh]);
  return { connection, revision };
}
