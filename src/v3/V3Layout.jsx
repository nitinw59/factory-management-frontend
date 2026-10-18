// Shell for every Version 3.0 page, personalised per user (docs/V3_ROLE_NAVIGATION_PLAN.md):
// - office users: top bar with search, a menu grouped by job showing the pages that are their own
//   work (sections fold open / shut and stay as left), pages they may only look at under "More",
//   a breadcrumb with Back above every page; on a phone the menu opens as a drawer;
// - floor users (checkers, cutting operator, line loader): a full-screen station page
//   without a menu, as in 2.0 — only their screen(s);
// - a page outside the user's roles shows "not for your role" instead of failing calls.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import ReportProblemButton from './problems/ReportProblem';
import { ArrowLeftRight, LogOut, ShieldOff, Search, ChevronDown, ChevronRight, ArrowLeft, Menu, X, Eye } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { accessApi } from './api/accessApi';
import { workApi } from './api/workApi';
import { apiError } from './api/mastersApi';
import { NAV, keyForPath, visibleNav, trailFor } from './v3Nav';
import { V3AccessContext } from './V3Access';
import { useV3Live } from './live';

const store = {
    get: (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } },
};

// One box for any number: order, buyer PO, style, PO, GRN, requisition, supplier, cut batch, garment, piece.
function SearchBox() {
    const navigate = useNavigate();
    const [q, setQ] = useState('');
    const [rows, setRows] = useState(null);
    const [active, setActive] = useState(0);
    const box = useRef(null);
    useEffect(() => {
        if (q.trim().length < 2) { setRows(null); return undefined; }
        const t = setTimeout(() => workApi.search(q.trim()).then(res => { setRows(res.data); setActive(0); }).catch(() => setRows([])), 250);
        return () => clearTimeout(t);
    }, [q]);
    useEffect(() => {
        const close = (e) => { if (box.current && !box.current.contains(e.target)) setRows(null); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);
    const go = (r) => { if (!r) return; setQ(''); setRows(null); navigate(r.to); };
    return (
        <div ref={box} className="relative flex-1 max-w-md">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input id="v3-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search order, buyer PO, style, PO, GRN, piece…"
                aria-label="Search 3.0" autoComplete="off"
                onKeyDown={e => {
                    if (e.key === 'Enter') go(rows?.[active]);
                    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, (rows?.length || 1) - 1)); }
                    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
                    else if (e.key === 'Escape') setRows(null);
                }}
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-indigo-400" />
            {rows && (
                <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-96 overflow-y-auto">
                    {rows.length === 0 ? <p className="px-3 py-2 text-sm text-slate-500">Nothing found for "{q.trim()}".</p> : rows.map((r, i) => (
                        <button key={`${r.type}${r.code}${i}`} type="button" onMouseEnter={() => setActive(i)} onClick={() => go(r)}
                            className={`w-full text-left px-3 py-2 flex items-baseline gap-2 ${i === active ? 'bg-indigo-50' : ''}`}>
                            <span className="text-[10px] font-black uppercase tracking-wide text-slate-400 w-24 shrink-0">{r.type}</span>
                            <span className="min-w-0"><span className="font-bold text-slate-800">{r.code}</span> <span className="text-xs text-slate-500">{r.detail}</span></span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function TopBar({ me, user, logout, navigate, onMenu, children }) {
    const extra = me?.granted_roles?.length ? ` + ${me.granted_roles.map(g => g.label).join(', ')}` : '';
    return (
        <header className="h-14 shrink-0 bg-white border-b border-slate-200 flex items-center gap-3 px-3 md:px-4 sticky top-0 z-20">
            {onMenu && <button type="button" onClick={onMenu} className="md:hidden p-1.5 rounded-lg border border-slate-200 text-slate-600" aria-label="Open the menu"><Menu size={18} /></button>}
            <span className="text-xs font-black uppercase tracking-widest bg-indigo-600 text-white px-2.5 py-1 rounded-md shrink-0">3.0</span>
            {children}
            <div className="ml-auto flex items-center gap-2 shrink-0">
                <ReportProblemButton />
                <span className="text-xs text-slate-500 hidden lg:inline">{me?.user?.name || user?.name} · {me?.role_label || user?.role}{extra}</span>
                <button type="button" onClick={() => navigate('/choose-version')} title="Switch version"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 border border-slate-200 hover:border-indigo-300 hover:text-indigo-600 px-2.5 py-1.5 rounded-lg">
                    <ArrowLeftRight size={13} /> <span className="hidden sm:inline">Switch version</span>
                </button>
                <button type="button" onClick={logout} title="Log out"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 border border-slate-200 hover:border-rose-300 hover:text-rose-600 px-2.5 py-1.5 rounded-lg">
                    <LogOut size={13} /> <span className="hidden sm:inline">Log out</span>
                </button>
            </div>
        </header>
    );
}

function NotForRole({ me }) {
    return (
        <div className="max-w-lg mx-auto mt-16 text-center">
            <ShieldOff className="mx-auto text-slate-400 mb-3" size={36} />
            <h1 className="text-xl font-black text-slate-800 mb-1">Not for your role</h1>
            <p className="text-sm text-slate-500 mb-4">This page isn't part of your work in 3.0 ({me.role_label}). If you need it, ask the factory admin for extra access.</p>
            <NavLink to={me.home} className="text-sm font-bold text-indigo-700 underline">Go to your page</NavLink>
        </div>
    );
}

const linkCls = ({ isActive }) => `flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm font-semibold ${isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`;

// Menu: sections of the user's own work (fold open / shut, remembered), then "More" — pages the
// user may only look at. The section of the open page is always shown open.
function Sidebar({ me, approvals, onNavigate }) {
    const location = useLocation();
    const [shut, setShut] = useState(() => store.get('v3.nav.shut', {}));
    const [moreOpen, setMoreOpen] = useState(() => store.get('v3.nav.more', false));
    const toggle = (s) => setShut(prev => { const next = { ...prev, [s]: !prev[s] }; store.set('v3.nav.shut', next); return next; });
    const here = trailFor(location.pathname)?.section;
    const groups = (items) => {
        const out = [];
        for (const n of items) { if (n.section) out.push({ section: n.section, items: [] }); else if (out.length) out[out.length - 1].items.push(n); }
        return out;
    };
    const main = groups(visibleNav(me.menu, me.work));
    const more = groups(visibleNav(me.menu, me.work, { lookOnly: true }));
    const link = (n) => (
        <NavLink key={n.to} to={n.to} end={n.end} className={linkCls} onClick={onNavigate}>
            <n.icon size={16} className="shrink-0" /> <span className="min-w-0 flex-1">{n.label}</span>
            {n.key === 'approvals' && approvals > 0 && <span className="text-[11px] font-black bg-rose-600 text-white rounded-full px-1.5 min-w-[20px] text-center">{approvals}</span>}
        </NavLink>
    );
    return (
        <nav className="p-3 space-y-0.5" aria-label="3.0 menu">
            {main.map(g => {
                const open = g.section === 'Home' || g.section === here || !shut[g.section];
                return (
                    <div key={g.section}>
                        {g.section !== 'Home' && (
                            <button type="button" onClick={() => toggle(g.section)} aria-expanded={open}
                                className="w-full flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 px-3 pt-3 pb-1">
                                {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />} {g.section}
                                {!open && <span className="ml-auto font-bold normal-case tracking-normal">{g.items.length}</span>}
                            </button>
                        )}
                        {open && g.items.map(link)}
                    </div>
                );
            })}
            {more.length > 0 && (
                <div className="pt-3 mt-3 border-t border-slate-100">
                    <button type="button" onClick={() => { setMoreOpen(!moreOpen); store.set('v3.nav.more', !moreOpen); }} aria-expanded={moreOpen}
                        className="w-full flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 px-3 py-1.5">
                        <Eye size={13} /> More — to look up {moreOpen ? <ChevronDown size={12} className="ml-auto" /> : <ChevronRight size={12} className="ml-auto" />}
                    </button>
                    {(moreOpen || more.some(g => g.items.some(n => n.key === keyForPath(location.pathname)))) && more.map(g => (
                        <div key={g.section}>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-300 px-3 pt-2 pb-0.5">{g.section}</p>
                            {g.items.map(link)}
                        </div>
                    ))}
                </div>
            )}
        </nav>
    );
}

// Section › page, and Back to wherever the user came from (inside 3.0) — else up to the section page.
function Trail() {
    const location = useLocation();
    const navigate = useNavigate();
    const t = trailFor(location.pathname);
    if (!t || t.page.key === 'home') return null;
    const onListPage = location.pathname === t.page.to.split('?')[0];
    const canBack = (window.history.state?.idx ?? 0) > 0;
    return (
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
            {(canBack || !onListPage) && (
                <button type="button" onClick={() => (canBack ? navigate(-1) : navigate(t.page.to))}
                    className="inline-flex items-center gap-1 font-bold text-slate-600 hover:text-indigo-700 border border-slate-200 bg-white rounded-md px-2 py-0.5">
                    <ArrowLeft size={12} /> Back
                </button>
            )}
            <span className="font-semibold">{t.section}</span>
            <ChevronRight size={12} />
            {onListPage ? <span className="font-bold text-slate-700">{t.page.label}</span>
                : <NavLink to={t.page.to} className="font-bold text-indigo-700 hover:underline">{t.page.label}</NavLink>}
        </div>
    );
}

export default function V3Layout() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [me, setMe] = useState(null);
    const [error, setError] = useState('');
    const [drawer, setDrawer] = useState(false);
    const [approvals, setApprovals] = useState(0);
    const load = useCallback(() => accessApi.me().then(res => setMe(res.data)).catch(err => setError(apiError(err, 'Failed to load your 3.0 access.'))), []);
    useEffect(() => { load(); }, [load]);
    // Approvals waiting: refreshed as the user moves between pages.
    const approver = !!me?.menu?.approvals && !me?.floor;
    const loadApprovals = useCallback(() => { workApi.approvals().then(res => setApprovals(res.data.items.length)).catch(() => {}); }, []);
    useEffect(() => { if (approver) loadApprovals(); }, [approver, location.pathname, loadApprovals]);
    useV3Live(loadApprovals, approver);   // live: re-count when 3.0 work changes
    useEffect(() => { setDrawer(false); }, [location.pathname]);
    const ctx = useMemo(() => ({ me, reload: load }), [me, load]);

    if (!me) {
        return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-500">{error || 'Loading…'}</div>;
    }
    const key = keyForPath(location.pathname);
    const allowed = key === null || me.menu[key];
    const outlet = allowed ? <Outlet /> : <NotForRole me={me} />;

    // Floor users: their screen only, full width, no menu (2.0 workstation style).
    if (me.floor) {
        if (location.pathname === '/v3' || location.pathname === '/v3/') return <Navigate to={me.home} replace />;
        const screens = NAV.filter(n => !n.section && !n.hidden && n.key !== 'home' && me.menu[n.key]);
        return (
            <V3AccessContext.Provider value={ctx}>
                <div className="min-h-screen bg-slate-50 flex flex-col">
                    <TopBar me={me} user={user} logout={logout} navigate={navigate}>
                        {screens.length > 1 && (
                            <nav className="flex gap-1">{screens.map(n => (
                                <NavLink key={n.key} to={n.to} className={({ isActive }) => `px-2.5 py-1 rounded-lg text-xs font-bold ${isActive ? 'bg-indigo-600 text-white' : 'border border-slate-200 text-slate-600'}`}>{n.label}</NavLink>
                            ))}</nav>
                        )}
                    </TopBar>
                    <main className="flex-1 min-w-0 p-3 md:p-5">{outlet}</main>
                </div>
            </V3AccessContext.Provider>
        );
    }

    return (
        <V3AccessContext.Provider value={ctx}>
            <div className="min-h-screen bg-slate-50 flex flex-col">
                <TopBar me={me} user={user} logout={logout} navigate={navigate} onMenu={() => setDrawer(true)}>
                    <SearchBox />
                </TopBar>
                <div className="flex-1 flex min-h-0">
                    <aside className="w-60 shrink-0 bg-white border-r border-slate-200 hidden md:block overflow-y-auto sticky top-14 h-[calc(100vh-3.5rem)]">
                        <Sidebar me={me} approvals={approvals} />
                    </aside>
                    {drawer && (
                        <div className="md:hidden fixed inset-0 z-40">
                            <button type="button" className="absolute inset-0 bg-slate-900/40" onClick={() => setDrawer(false)} aria-label="Close the menu" />
                            <aside className="absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] bg-white shadow-xl overflow-y-auto">
                                <div className="flex items-center justify-between px-4 h-14 border-b border-slate-200">
                                    <span className="font-black text-slate-800">Menu</span>
                                    <button type="button" onClick={() => setDrawer(false)} className="p-1.5 rounded-lg text-slate-500" aria-label="Close the menu"><X size={18} /></button>
                                </div>
                                <Sidebar me={me} approvals={approvals} onNavigate={() => setDrawer(false)} />
                            </aside>
                        </div>
                    )}
                    <main className="flex-1 min-w-0 p-4 md:p-6">
                        <Trail />
                        {outlet}
                    </main>
                </div>
            </div>
        </V3AccessContext.Provider>
    );
}
