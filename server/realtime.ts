import type { Server } from 'node:http';
import type { Express } from 'express';
import type { EventEmitter } from 'node:events';
import { WebSocket, WebSocketServer } from 'ws';
import { randomUUID } from 'node:crypto';

const colors = ['#087f8c', '#3659b8', '#a33d79', '#537829', '#8e5c20'];
const fields = new Set(['postId', 'name', 'email', 'body']);
const expiry = 12000;

// Notifications invalidate browser snapshots. HTTP remains the authoritative data interface.
export function attachRealtime(app: Express, server: Server) {
  const sockets = new WebSocketServer({ server, path: '/api/events', maxPayload: 1024 });
  const alive = new Set<WebSocket>();
  let sequence = 0;
  let revision = randomUUID();
  const resumable = new Map<string, WebSocket>();
  const resumeTokens = new Map<WebSocket, string>();
  const sessions = new Map<WebSocket, { sessionId: string; label: string; color: string; cell: { commentId: number; field: string } | null; seen: number }>();
  const send = (socket: WebSocket, message: string) => {
    if (socket.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > 65536) socket.terminate(); else socket.send(message);
  };
  const presenceSnapshot = () => JSON.stringify({ type: 'presence', sessions: [...sessions.values()].filter(session => session.cell).map(({ seen: _, ...session }) => session) });
  const publishPresence = () => {
    const message = presenceSnapshot();
    for (const socket of sockets.clients) send(socket, message);
  };
  sockets.on('connection', (socket, request) => {
    const requestedToken = new URL(request.url ?? '', 'http://localhost').searchParams.get('resume');
    const previousSocket = requestedToken ? resumable.get(requestedToken) : undefined;
    const previous = previousSocket && sessions.get(previousSocket);
    const index = sequence;
    if (!previous) sequence++;
    const session = previous ?? { sessionId: randomUUID(), label: `Session ${index + 1}`, color: colors[index % colors.length], cell: null as { commentId: number; field: string } | null, seen: Date.now() };
    if (previousSocket) { sessions.delete(previousSocket); previousSocket.terminate(); }
    session.cell = null; session.seen = Date.now();
    const resumeToken = randomUUID();
    resumeTokens.set(socket, resumeToken); resumable.set(resumeToken, socket);
    sessions.set(socket, session);
    send(socket, JSON.stringify({ type: 'session', ...session, resumeToken }));
    send(socket, presenceSnapshot());
    if (previous) publishPresence();
    let tokens = 40;
    let last = Date.now();
    socket.on('message', (raw, binary) => {
      if (socket.readyState !== WebSocket.OPEN) return;
      const now = Date.now();
      tokens = Math.min(40, tokens + (now - last) / 50); last = now;
      if (tokens < 1) { socket.close(1008, 'Presence rate limit exceeded'); return; }
      tokens--;
      if (binary) return;
      try {
        const message = JSON.parse(raw.toString());
        if (!message || message.type !== 'presence') return;
        const cell = message.cell;
        if (cell !== null && (!cell || !Number.isSafeInteger(cell.commentId) || cell.commentId < 1 || cell.commentId > 2147483647 || !fields.has(cell.field))) return;
        const next = cell === null ? null : { commentId: cell.commentId as number, field: cell.field as string };
        const changed = JSON.stringify(next) !== JSON.stringify(session.cell);
        session.cell = next; session.seen = now;
        if (changed) publishPresence();
        // Every heartbeat returns an authoritative snapshot, so a missed push
        // cannot leave either data or another editor's activity stale forever.
        send(socket, JSON.stringify({ type: 'sync', revision, sessions: [...sessions.values()].filter(item => item.cell).map(({ seen: _, ...item }) => item) }));
      } catch { /* Malformed presence has no effect on shared data or activity. */ }
    });
    alive.add(socket);
    socket.on('pong', () => alive.add(socket));
    socket.on('close', () => {
      alive.delete(socket);
      const token = resumeTokens.get(socket); if (token) resumable.delete(token); resumeTokens.delete(socket);
      const active = sessions.has(socket) && session.cell; sessions.delete(socket); if (active) publishPresence();
    });
    socket.on('error', () => socket.terminate());
  });
  const notify = (ids: number[]) => {
    revision = randomUUID();
    const message = JSON.stringify({ type: 'changed', ids });
    for (const socket of sockets.clients) send(socket, message);
  };
  (app as EventEmitter).on('committed', notify);
  const presenceExpiry = setInterval(() => {
    let changed = false;
    for (const session of sessions.values()) if (session.cell && Date.now() - session.seen >= expiry) { session.cell = null; changed = true; }
    if (changed) publishPresence();
  }, 1000);
  presenceExpiry.unref();
  const heartbeat = setInterval(() => {
    for (const socket of sockets.clients) {
      if (!alive.delete(socket)) socket.terminate();
      else socket.ping();
    }
  }, 15000);
  heartbeat.unref();
  return () => {
    clearInterval(heartbeat);
    clearInterval(presenceExpiry);
    app.off('committed', notify);
    for (const socket of sockets.clients) socket.terminate();
    sockets.close();
  };
}
