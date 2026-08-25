import { useEffect, useRef, useState, useCallback } from 'react';
import { API_BASE_URL } from '../../utils/api';

// Same raw-WebSocket connect/reconnect pattern as NotificationBell.jsx
// (shared /ws server, JWT via query param, 5s auto-reconnect on close) —
// filtered to QC_LIVE_EVENT messages only. Multiple sockets per user are
// already supported server-side (utils/websocket.js keys by userId -> Set),
// so this runs alongside NotificationBell's own connection without conflict.
const useLiveQcSocket = (onEvent) => {
    const [connected, setConnected] = useState(false);
    const wsRef = useRef(null);
    const reconnectTimerRef = useRef(null);
    const onEventRef = useRef(onEvent);
    onEventRef.current = onEvent;

    const connect = useCallback(() => {
        const token = localStorage.getItem('factory_token');
        if (!token) return;

        const wsBase = API_BASE_URL.replace(/^http/, 'ws');
        const ws = new WebSocket(`${wsBase}/ws?token=${token}`);
        wsRef.current = ws;

        ws.onopen = () => setConnected(true);

        ws.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data);
                if (msg.type === 'QC_LIVE_EVENT') onEventRef.current?.(msg.event);
            } catch {}
        };

        ws.onclose = () => {
            setConnected(false);
            reconnectTimerRef.current = setTimeout(connect, 5000);
        };

        ws.onerror = () => ws.close();
    }, []);

    useEffect(() => {
        connect();
        return () => {
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            const ws = wsRef.current;
            if (ws) {
                // Detach handlers before closing. Under StrictMode's dev-only
                // double-invoke (mount -> cleanup -> mount), this socket's
                // close() can race with its own handshake completing
                // server-side, leaving a brief window where the backend still
                // has it registered alongside the new socket from the second
                // mount — a single broadcast then reaches both, and without
                // this, the still-attached onmessage handler on this stale
                // socket would double-fire onEvent for it (and its onclose
                // would additionally schedule a stray reconnect).
                ws.onmessage = null;
                ws.onclose = null;
                ws.onerror = null;
                ws.close();
            }
        };
    }, [connect]);

    return connected;
};

export default useLiveQcSocket;
