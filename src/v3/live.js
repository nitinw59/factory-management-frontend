// 3.0 live refresh (13 Oct 2026): one websocket per browser tab to the backend's /ws, shared by every
// 3.0 screen that wants fresh numbers (My work, the Approvals badge and inbox, requisition lists).
// The server sends { type: 'V3_CHANGED', areas } after any 3.0 change; subscribers re-read their own
// data ~2 s later (one refresh for a burst). Backup: re-check every 5 minutes and when the tab is shown
// again, and after the socket reconnects (a message may have been missed while it was down).
import { useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../utils/api';

const subs = new Set();          // (reason) => void
const listeners = new Set();     // connection status listeners
let ws = null;
let retryTimer = null;
let debounce = null;
let connected = false;
let missed = false;              // a change arrived while the tab was hidden
let lastFire = Date.now();
const BACKUP_MS = 5 * 60 * 1000;

const setConnected = (v) => { connected = v; listeners.forEach(f => f(v)); };

function fire(reason) {
    if (document.visibilityState !== 'visible') { missed = true; return; }
    missed = false;
    lastFire = Date.now();
    subs.forEach(f => { try { f(reason); } catch { /* one screen failing doesn't stop the others */ } });
}
function schedule(reason) {
    clearTimeout(debounce);
    debounce = setTimeout(() => fire(reason), 2000);
}

function connect() {
    if (ws || !subs.size) return;
    const token = localStorage.getItem('factory_token');
    if (!token) return;
    let wasDown = !connected;
    try {
        ws = new WebSocket(`${API_BASE_URL.replace(/^http/, 'ws')}/ws?token=${token}`);
    } catch { ws = null; retryTimer = setTimeout(connect, 10000); return; }
    ws.onopen = () => { setConnected(true); if (wasDown && lastFire < Date.now() - 3000) schedule('reconnect'); wasDown = false; };
    ws.onmessage = (e) => {
        try { const m = JSON.parse(e.data); if (m.type === 'V3_CHANGED') schedule('change'); } catch { /* not ours */ }
    };
    ws.onclose = (e) => {
        ws = null;
        setConnected(false);
        if (e.code === 4001) return;   // token refused: the app's own session handling logs out
        if (subs.size) retryTimer = setTimeout(connect, 5000);
    };
    ws.onerror = () => { try { ws?.close(); } catch { /* closing anyway */ } };
}
function disconnect() {
    clearTimeout(retryTimer);
    if (ws) { ws.onclose = null; try { ws.close(); } catch { /* already closed */ } ws = null; }
    setConnected(false);
}

if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && subs.size && (missed || Date.now() - lastFire > BACKUP_MS)) schedule('visible');
    });
    setInterval(() => { if (subs.size && Date.now() - lastFire > BACKUP_MS) fire('backup'); }, 60 * 1000);
}

// Call `onChange` whenever 3.0 work may have changed. Returns whether the live connection is up.
export function useV3Live(onChange, enabled = true) {
    const cb = useRef(onChange);
    cb.current = onChange;
    const [up, setUp] = useState(connected);
    useEffect(() => {
        if (!enabled) return undefined;
        const f = (reason) => cb.current?.(reason);
        subs.add(f);
        listeners.add(setUp);
        connect();
        return () => {
            subs.delete(f);
            listeners.delete(setUp);
            if (!subs.size) disconnect();
        };
    }, [enabled]);
    return up;
}
