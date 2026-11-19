import { useEffect, useState } from 'react';

export type Presence = { sessionId: string; label: string; color: string; cell: { commentId: number; field: string } };

export function useRealtime(refresh: () => void) {
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [revision, setRevision] = useState(0);
  const [presence, setPresence] = useState<Presence[]>([]);
  const [sessionLabel, setSessionLabel] = useState('Session');
  useEffect(() => {
    let stopped = false;
    let socket: WebSocket;
    let retry: number;
    let sessionId = '';
    let resumeToken = '';
    let focusTimer: number;
    let windowActive = true;
    const announce = () => {
      if (socket?.readyState !== WebSocket.OPEN) return;
      const element = windowActive && document.visibilityState !== 'hidden' ? document.activeElement as HTMLElement | null : null;
      const field = element?.dataset.activeField;
      const commentId = Number(element?.dataset.commentId);
      socket.send(JSON.stringify({ type: 'presence', cell: field && !element?.hasAttribute('disabled') ? { commentId, field } : null }));
    };
    const focusChanged = () => { window.clearTimeout(focusTimer); focusTimer = window.setTimeout(announce, 75); };
    const blur = () => { windowActive = false; announce(); };
    const focus = () => { windowActive = true; focusChanged(); };
    document.addEventListener('focusin', focusChanged);
    document.addEventListener('focusout', focusChanged);
    document.addEventListener('visibilitychange', announce);
    window.addEventListener('blur', blur);
    window.addEventListener('focus', focus);
    const heartbeat = window.setInterval(announce, 3000);
    const invalidate = () => { refresh(); setRevision(value => value + 1); };
    function connect() {
      socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/events${resumeToken ? `?resume=${encodeURIComponent(resumeToken)}` : ''}`);
      socket.onopen = () => {
        if (stopped) return;
        setConnection('connected');
        // Also covers changes between the initial HTTP request and the first connection.
        invalidate();
      };
      socket.onmessage = event => {
        if (stopped) return;
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'changed') invalidate();
          if (message.type === 'session') { sessionId = message.sessionId; resumeToken = message.resumeToken; setSessionLabel(message.label); announce(); }
          if (message.type === 'presence') setPresence(message.sessions.filter((item: Presence) => item.sessionId !== sessionId));
        } catch { /* Ignore unsupported messages. */ }
      };
      socket.onerror = () => socket.close();
      socket.onclose = () => {
        if (stopped) return;
        setConnection('disconnected');
        setPresence([]);
        retry = window.setTimeout(connect, 500);
      };
    }
    connect();
    return () => {
      stopped = true; window.clearTimeout(retry); window.clearTimeout(focusTimer); window.clearInterval(heartbeat);
      document.removeEventListener('focusin', focusChanged); document.removeEventListener('focusout', focusChanged);
      document.removeEventListener('visibilitychange', announce); window.removeEventListener('blur', blur); window.removeEventListener('focus', focus);
      socket.close();
    };
  }, [refresh]);
  return { connection, revision, presence, sessionLabel };
}
