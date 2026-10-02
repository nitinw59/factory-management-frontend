// Network status UI for factory tablets on patchy Wi-Fi.
//
//  - OfflineBanner: a small always-on-top notice while the device is offline,
//    so a checker knows scans won't save until the connection is back.
//  - PageErrorBoundary: wraps each lazily loaded page (see App.js lazyPage).
//    If a page's code can't be downloaded it shows a "network connection
//    lost" alert with Retry (and retries by itself when the device comes back
//    online) instead of React's blank white screen.
//  - isServerReachable: tells "network down" apart from "old app after a
//    deploy" (server reachable, chunk gone → reload is the right fix).
import React, { useEffect, useState } from 'react';
import { WifiOff, RefreshCw, AlertTriangle } from 'lucide-react';

export const isChunkLoadError = (err) =>
    !!err && (err.name === 'ChunkLoadError'
        || /Loading (CSS )?chunk [\w-]+ failed/i.test(err.message || '')
        || /Failed to fetch dynamically imported module/i.test(err.message || ''));

// True if the app's own server answers (no cache) within a few seconds.
export const isServerReachable = async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 4000) : null;
    try {
        const res = await fetch(`/index.html?probe=${Date.now()}`, { cache: 'no-store', signal: ctrl?.signal });
        return res.ok;
    } catch {
        return false;
    } finally {
        if (timer) clearTimeout(timer);
    }
};

const useOnline = () => {
    const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine !== false);
    useEffect(() => {
        const up = () => setOnline(true);
        const down = () => setOnline(false);
        window.addEventListener('online', up);
        window.addEventListener('offline', down);
        return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
    }, []);
    return online;
};

export const OfflineBanner = () => {
    const online = useOnline();
    if (online) return null;
    return (
        <div role="alert" className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none">
            <div className="flex items-center gap-2 bg-rose-600 text-white px-4 py-2 rounded-full shadow-lg font-bold text-sm">
                <WifiOff size={16} />
                No network connection — scans and changes won't save until it's back
            </div>
        </div>
    );
};

export class PageErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
        this.handleOnline = this.handleOnline.bind(this);
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidMount() {
        window.addEventListener('online', this.handleOnline);
    }

    componentWillUnmount() {
        window.removeEventListener('online', this.handleOnline);
    }

    handleOnline() {
        // Connection is back — try the page again by itself.
        if (this.state.error && isChunkLoadError(this.state.error)) this.retry();
    }

    retry() {
        this.setState({ error: null });
        this.props.onRetry?.();
    }

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;

        const network = isChunkLoadError(error);
        return (
            <div className="flex items-center justify-center min-h-[50vh] p-6">
                <div className={`max-w-md w-full text-center rounded-2xl border-2 p-6 ${network ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50'}`}>
                    <div className={`mx-auto mb-3 w-12 h-12 rounded-full flex items-center justify-center ${network ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'}`}>
                        {network ? <WifiOff size={24} /> : <AlertTriangle size={24} />}
                    </div>
                    <h2 className="text-lg font-black text-slate-800 mb-1">
                        {network ? 'Network connection lost' : 'This page hit a problem'}
                    </h2>
                    <p className="text-sm text-slate-600 mb-4">
                        {network
                            ? "This page couldn't load because the device can't reach the server. It will try again automatically when the connection is back."
                            : 'Something went wrong while showing this page. Reloading usually fixes it.'}
                    </p>
                    <button
                        onClick={() => (network ? this.retry() : window.location.reload())}
                        className="inline-flex items-center gap-2 bg-slate-900 text-white font-bold text-sm px-5 py-2.5 rounded-xl active:scale-95"
                    >
                        <RefreshCw size={16} /> {network ? 'Retry' : 'Reload'}
                    </button>
                </div>
            </div>
        );
    }
}
