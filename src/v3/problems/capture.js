// Context for "Report a problem" (17 Oct 2026): the last failed API calls and browser errors of this session, kept in
// memory only (never sent unless the user reports a problem), plus page facts at the moment of reporting.
import api from '../../utils/api';

const MAX = 10;
const apiErrors = [];
const consoleErrors = [];
let installed = false;
const push = (list, item) => { list.push(item); if (list.length > MAX) list.shift(); };
const now = () => new Date().toISOString();

export function installCapture() {
    if (installed) return;
    installed = true;
    api.interceptors.response.use((res) => res, (err) => {
        const cfg = err?.config || {};
        const url = String(cfg.url || '');
        if (!url.includes('/problems')) {
            push(apiErrors, {
                at: now(), method: String(cfg.method || 'get').toUpperCase(), url: url.slice(0, 200),
                status: err?.response?.status ?? 'network', message: String(err?.response?.data?.error || err?.response?.data?.message || err?.message || '').slice(0, 300),
            });
        }
        return Promise.reject(err);
    });
    window.addEventListener('error', (e) => push(consoleErrors, { at: now(), message: String(e?.message || '').slice(0, 300), source: `${String(e?.filename || '').split('/').pop()}:${e?.lineno || ''}` }));
    window.addEventListener('unhandledrejection', (e) => push(consoleErrors, { at: now(), message: String(e?.reason?.message || e?.reason || '').slice(0, 300), source: 'promise' }));
}

// The record or page on screen: the first heading.
const heading = () => (document.querySelector('main h1, main h2, h1')?.innerText || document.title || '').trim().slice(0, 200);

export function captureContext() {
    return {
        page_path: `${window.location.pathname}${window.location.search}`.slice(0, 500),
        page_heading: heading(),
        app_build: process.env.REACT_APP_VERSION || process.env.REACT_APP_BUILD || 'beta',
        context: {
            api_errors: [...apiErrors], console_errors: [...consoleErrors],
            viewport: `${window.innerWidth}×${window.innerHeight}`, language: navigator.language, time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
    };
}

// A picture of the page as it is now (before the report box opens). Null if it fails.
export async function captureScreen() {
    try {
        const { default: html2canvas } = await import('html2canvas');
        const canvas = await html2canvas(document.body, { scale: Math.min(1, 1600 / window.innerWidth), logging: false, useCORS: true, windowWidth: window.innerWidth, windowHeight: window.innerHeight, height: window.innerHeight, y: window.scrollY });
        const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
        return blob ? new File([blob], `screen-capture-${Date.now()}.png`, { type: 'image/png' }) : null;
    } catch { return null; }
}
