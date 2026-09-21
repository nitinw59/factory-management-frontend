import { useEffect, useRef, useState, useCallback } from 'react';
import { API_BASE_URL } from '../../utils/api';

// Same connect/reconnect shape as qc_live/useLiveQcSocket.js, but for an
// anonymous kiosk viewer — no JWT at all, just the ?public=1 opt-in the
// backend's utils/websocket.js requires to register a public socket instead
// of rejecting the connection. Fires onEvent for every message the server
// sends (the public channel currently only ever broadcasts QC_LIVE_EVENT,
// used purely as a "something changed, go re-fetch" signal).
const usePublicSocket = (onEvent) => {
    const [connected, setConnected] = useState(false);
    const wsRef = useRef(null);
    const reconnectTimerRef = useRef(null);
    const onEventRef = useRef(onEvent);
    onEventRef.current = onEvent;

    const connect = useCallback(() => {
        const wsBase = API_BASE_URL.replace(/^http/, 'ws');
        const ws = new WebSocket(`${wsBase}/ws?public=1`);
        wsRef.current = ws;

        ws.onopen = () => setConnected(true);

        ws.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data);
                if (msg.type !== 'CONNECTED') onEventRef.current?.(msg);
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
                ws.onmessage = null;
                ws.onclose = null;
                ws.onerror = null;
                ws.close();
            }
        };
    }, [connect]);

    return connected;
};

export default usePublicSocket;
