// Barcode scanner and sound for the stage check (27 Oct 2026, "build all" — 2.0's garment checker scanner in 3.0).
//
// useWedgeScanner: a hardware scanner (Retsol D 5015, keyboard wedge) "types" the code and Enter. As in 2.0
// (GarmentProcessingPortal) the page listens to every key: characters closer than 120 ms (QR codes need the wider gap)
// build the code, Enter with more than 3 of them is a scan — so it works whatever is focused, also over the inspection
// screen. Keys typed into a text box (the scan box itself, defect search, a password) are left alone; the Enter that ends
// a scan is swallowed so it doesn't also press a focused button.
//
// feedback: 2.0's sounds — a high beep (880 Hz) when found / saved, a middle one (660 Hz) for "already", a low one
// (220 Hz) for a problem — and 2.0's spoken messages where the checker must act ("Batch not loaded on your line …").
import { useEffect, useRef } from 'react';

const GAP_MS = 120;
const editable = (el) => Boolean(el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)));

export function useWedgeScanner(onScan, enabled = true) {
    const cb = useRef(onScan);
    cb.current = onScan;
    useEffect(() => {
        if (!enabled) return undefined;
        let buf = '';
        let last = 0;
        const onKey = (e) => {
            if (editable(e.target)) { buf = ''; return; }
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const now = Date.now();
            if (now - last > GAP_MS) buf = '';
            last = now;
            if (e.key === 'Enter') {
                if (buf.length > 3) { e.preventDefault(); e.stopPropagation(); cb.current(buf); }
                buf = '';
            } else if (e.key.length === 1) {
                buf += e.key;
            }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [enabled]);
}

// Spoken where the checker has to do something (as 2.0); a tone otherwise.
const SPEECH = {
    already: 'Already approved',
    not_loaded: 'Batch not loaded on your line. Please ask the loader to load the batch.',
    waiting: 'Waiting for an earlier stage',
    wrong_stage: 'Not checked at this stage',
};
const TONE = { success: [880, 0.2], already: [660, 0.3], not_loaded: [660, 0.3], error: [220, 0.5] };

let ctx = null;
function tone(freq, secs) {
    try {
        ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + secs);
        osc.start(); osc.stop(ctx.currentTime + secs);
    } catch { /* no audio on this device */ }
}
function say(text) {
    try {
        if (!window.speechSynthesis) return false;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
        return true;
    } catch { return false; }
}

// kind: success | already | not_loaded | waiting | wrong_stage | error
export function feedback(kind) {
    if (SPEECH[kind] && say(SPEECH[kind])) return;
    const [f, s] = TONE[kind] || TONE.error;
    tone(f, s);
}
