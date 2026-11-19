import type { Server } from 'node:http';
import type { Express } from 'express';
import type { EventEmitter } from 'node:events';
import { WebSocket, WebSocketServer } from 'ws';

// Notifications invalidate browser snapshots. HTTP remains the authoritative data interface.
export function attachRealtime(app: Express, server: Server) {
  const sockets = new WebSocketServer({ server, path: '/api/events', maxPayload: 1024 });
  const alive = new Set<WebSocket>();
  sockets.on('connection', socket => {
    alive.add(socket);
    socket.on('pong', () => alive.add(socket));
    socket.on('close', () => alive.delete(socket));
    socket.on('error', () => socket.terminate());
  });
  const notify = (ids: number[]) => {
    const message = JSON.stringify({ type: 'changed', ids });
    for (const socket of sockets.clients) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      if (socket.bufferedAmount > 65536) socket.terminate();
      else socket.send(message);
    }
  };
  (app as EventEmitter).on('committed', notify);
  const heartbeat = setInterval(() => {
    for (const socket of sockets.clients) {
      if (!alive.delete(socket)) socket.terminate();
      else socket.ping();
    }
  }, 15000);
  heartbeat.unref();
  return () => {
    clearInterval(heartbeat);
    app.off('committed', notify);
    for (const socket of sockets.clients) socket.terminate();
    sockets.close();
  };
}
