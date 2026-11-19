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
    let serverRevision: string | undefined;
    let lastAck = Date.now();
    let lastFallback = 0;
    let attemptStarted = Date.now();
    const invalidate = () => { refresh(); setRevision(value => value + 1); };
    const announce = () => {
      if (socket?.readyState !== WebSocket.OPEN) return;
      const element = document.activeElement as HTMLElement | null;
      const field = element?.dataset.activeField;
      const commentId = Number(element?.dataset.commentId);
      socket.send(JSON.stringify({ type: 'presence', cell: field && !element?.hasAttribute('disabled') ? { commentId, field } : null }));
    };
    const focusChanged = () => { window.clearTimeout(focusTimer); focusTimer = window.setTimeout(announce, 75); };
    const resume = () => {
      if (document.visibilityState === 'hidden') return;
      invalidate(); announce();
    };
    document.addEventListener('focusin', focusChanged);
    document.addEventListener('focusout', focusChanged);
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', resume);
    window.addEventListener('online', resume);
    const heartbeat = window.setInterval(() => {
      announce();
      const now = Date.now();
      if (now - lastAck > 3500) {
        setConnection('disconnected'); setPresence([]);
        if (now - lastFallback >= 2000) { lastFallback = now; invalidate(); }
        if (socket?.readyState === WebSocket.OPEN || (socket?.readyState === WebSocket.CONNECTING && now - attemptStarted > 5000)) socket.close();
      }
    }, 1000);
    function connect() {
      if (stopped) return;
      attemptStarted = Date.now();
      const current = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/events${resumeToken ? `?resume=${encodeURIComponent(resumeToken)}` : ''}`);
      socket = current;
      current.onopen = () => {
        if (stopped || socket !== current) return;
        setConnection('connecting'); invalidate(); announce();
      };
      current.onmessage = event => {
        if (stopped || socket !== current) return;
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'changed') invalidate();
          if (message.type === 'session') { sessionId = message.sessionId; resumeToken = message.resumeToken; setSessionLabel(message.label); lastAck = Date.now(); setConnection('connected'); announce(); }
          if (message.type === 'presence') setPresence(message.sessions.filter((item: Presence) => item.sessionId !== sessionId));
          if (message.type === 'sync') {
            lastAck = Date.now(); setConnection('connected');
            setPresence(message.sessions.filter((item: Presence) => item.sessionId !== sessionId));
            if (serverRevision !== message.revision) { serverRevision = message.revision; invalidate(); }
          }
        } catch { /* Ignore unsupported messages. */ }
      };
      current.onerror = () => current.close();
      current.onclose = () => {
        if (stopped || socket !== current) return;
        setConnection('disconnected'); setPresence([]);
        retry = window.setTimeout(connect, 500);
      };
    }
    connect();
    return () => {
      stopped = true; window.clearTimeout(retry); window.clearTimeout(focusTimer); window.clearInterval(heartbeat);
      document.removeEventListener('focusin', focusChanged); document.removeEventListener('focusout', focusChanged);
      document.removeEventListener('visibilitychange', resume); window.removeEventListener('focus', resume); window.removeEventListener('online', resume);
      socket.close();
    };
  }, [refresh]);
  return { connection, revision, presence, sessionLabel };
}
