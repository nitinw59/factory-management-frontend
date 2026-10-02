import React, { Suspense, useEffect, useState } from 'react';
import { PageErrorBoundary, isChunkLoadError, isServerReachable } from './NetworkStatus';

// ─── Pages load on demand ─────────────────────────────────────────────────────
// Each portal's pages are split into their own chunk, so a workstation tablet
// downloads only the pages it opens instead of the whole app (~5 MB). Layouts,
// route guards and login stay in the main bundle. Every page gets its OWN
// Suspense boundary, so the surrounding layout/sidebar stays on screen while
// a page's chunk loads.
export const PageLoader = () => (
    <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
    </div>
);
// Tablets stay open all shift. After a deploy, a tab still running the OLD
// app asks for page chunks the new deploy no longer has — reload once to pick
// up the new version. But only when the server IS reachable: if the network
// is down, a reload would swap the app for the browser's "no internet" page,
// so the error goes to PageErrorBoundary's network alert instead. The flag
// stops a reload loop if a chunk is genuinely missing.
const RELOAD_FLAG = 'chunk-reload-attempted';
const loadWithReload = (factory) => () => factory().then(
    (mod) => {
        try { sessionStorage.removeItem(RELOAD_FLAG); } catch { /* storage unavailable */ }
        return mod;
    },
    async (err) => {
        if (!isChunkLoadError(err) || !(await isServerReachable())) throw err;
        let attempted = true;
        try { attempted = sessionStorage.getItem(RELOAD_FLAG) === '1'; sessionStorage.setItem(RELOAD_FLAG, '1'); } catch { /* storage unavailable */ }
        if (attempted) throw err;
        window.location.reload();
        return new Promise(() => {}); // page is reloading
    }
);
// ─── Background download of the rest of a portal ─────────────────────────────
// Once a page has loaded, the other pages of the SAME portal (same top-level
// path, e.g. every /line-loader/* page) are downloaded quietly in the
// background, one at a time, when the browser is idle. Moving between pages
// is then instant and still works if the Wi-Fi drops later. Groups come from
// App.js's own route tree (registerPrefetchGroups) — nothing to keep in sync.
const groupOf = new Map();       // LazyPage component -> portal key
const groupMembers = new Map();  // portal key -> Set<LazyPage component>
const prefetchedGroups = new Set();

const lazyTypesIn = (element, out = []) => {
    if (!React.isValidElement(element)) return out;
    if (typeof element.type === 'function' && element.type.preload) out.push(element.type);
    React.Children.forEach(element.props?.children, (child) => lazyTypesIn(child, out));
    return out;
};

const joinPath = (parent, path) => {
    if (!path) return parent;
    if (path.startsWith('/')) return path;
    return `${parent.replace(/\/$/, '')}/${path}`;
};

export const registerPrefetchGroups = (routesElement) => {
    const walk = (node, parentPath) => {
        React.Children.forEach(node?.props?.children, (route) => {
            if (!React.isValidElement(route)) return;
            const fullPath = joinPath(parentPath, route.props.path);
            const key = fullPath.split('/').filter(Boolean)[0] || '/';
            for (const Comp of lazyTypesIn(route.props.element)) {
                if (!groupOf.has(Comp)) groupOf.set(Comp, key);
                if (!groupMembers.has(key)) groupMembers.set(key, new Set());
                groupMembers.get(key).add(Comp);
            }
            walk(route, fullPath);
        });
    };
    walk(routesElement, '');
};

const whenIdle = (fn) => (typeof window !== 'undefined' && window.requestIdleCallback
    ? window.requestIdleCallback(fn, { timeout: 5000 })
    : setTimeout(fn, 2000));

const prefetchGroupOf = (Comp) => {
    const key = groupOf.get(Comp);
    if (!key || prefetchedGroups.has(key)) return;
    prefetchedGroups.add(key);
    const queue = [...(groupMembers.get(key) || [])].filter((c) => c !== Comp);
    const next = () => {
        const C = queue.shift();
        if (!C) return;
        // A failed background download is harmless — the real page load
        // (with its network alert) tries again when the page is opened.
        C.preload().catch(() => {}).finally(() => whenIdle(next));
    };
    whenIdle(next);
};

// Rendered inside the page's Suspense, so it only mounts once the page did.
const PrefetchPortal = ({ of }) => {
    useEffect(() => { prefetchGroupOf(of); }, [of]);
    return null;
};

export const lazyPage = (factory) => {
    let Page = React.lazy(loadWithReload(factory));
    const LazyPage = (props) => {
        const [, setAttempt] = useState(0);
        // React.lazy remembers a failed load, so Retry needs a fresh one.
        const retry = () => {
            Page = React.lazy(loadWithReload(factory));
            setAttempt((a) => a + 1);
        };
        return (
            <PageErrorBoundary onRetry={retry}>
                <Suspense fallback={<PageLoader />}>
                    <Page {...props} />
                    <PrefetchPortal of={LazyPage} />
                </Suspense>
            </PageErrorBoundary>
        );
    };
    LazyPage.preload = factory;
    return LazyPage;
};

export default lazyPage;
