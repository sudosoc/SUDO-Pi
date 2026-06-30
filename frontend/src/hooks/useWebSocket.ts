import { useCallback, useEffect, useRef, useState } from "react";
import type { WebSocketMessage } from "@/types";

type WsStatus = "connecting" | "connected" | "disconnected" | "error";

interface UseWebSocketOptions {
  onMessage?: (msg: WebSocketMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
}

export function useWebSocket(path: string, options: UseWebSocketOptions = {}) {
  const {
    onMessage,
    onConnect,
    onDisconnect,
    reconnectInterval = 3000,
    maxReconnectAttempts = 10,
    heartbeatInterval = 25000,
  } = options;

  const [status, setStatus] = useState<WsStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCount = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMounted = useRef(true);

  const clearTimers = useCallback(() => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
    reconnectTimer.current = null;
    heartbeatTimer.current = null;
  }, []);

  const connect = useCallback(() => {
    if (!isMounted.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const url = `${protocol}//${host}${path}`;

    setStatus("connecting");
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!isMounted.current) return;
      setStatus("connected");
      reconnectCount.current = 0;
      onConnect?.();

      heartbeatTimer.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, heartbeatInterval);
    };

    ws.onmessage = (event) => {
      if (!isMounted.current) return;
      try {
        const msg = JSON.parse(event.data) as WebSocketMessage;
        if (msg.type === "pong") return;
        onMessage?.(msg);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onerror = () => {
      if (!isMounted.current) return;
      setStatus("error");
    };

    ws.onclose = () => {
      if (!isMounted.current) return;
      clearTimers();
      setStatus("disconnected");
      onDisconnect?.();

      if (reconnectCount.current < maxReconnectAttempts) {
        reconnectCount.current++;
        const delay = Math.min(reconnectInterval * reconnectCount.current, 30000);
        reconnectTimer.current = setTimeout(connect, delay);
      }
    };
  }, [path, onMessage, onConnect, onDisconnect, reconnectInterval, maxReconnectAttempts, heartbeatInterval, clearTimers]);

  const disconnect = useCallback(() => {
    clearTimers();
    wsRef.current?.close();
    wsRef.current = null;
    setStatus("disconnected");
  }, [clearTimers]);

  const send = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    connect();
    return () => {
      isMounted.current = false;
      clearTimers();
      wsRef.current?.close();
    };
  }, [connect, clearTimers]);

  return { status, send, disconnect, reconnect: connect };
}
