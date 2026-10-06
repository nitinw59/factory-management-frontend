// Shell for every Version 3.0 page, personalised per user (docs/V3_ROLE_NAVIGATION_PLAN.md):
// - office users: top bar + a menu of only the pages their 3.0 roles can open;
// - floor users (checkers, cutting operator, line loader): a full-screen station page
//   without a menu, as in 2.0 — only their screen(s);
// - a page outside the user's roles shows "not for your role" instead of failing calls.
import { useCallback, useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeftRight, LogOut, ShieldOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { accessApi } from './api/accessApi';
import { apiError } from './api/mastersApi';
import { NAV, keyForPath, visibleNav } from './v3Nav';
import { V3AccessContext } from './V3Access';

function TopBar({ me, user, logout, navigate, children }) {
    const extra = me?.granted_roles?.length ? ` + ${me.granted_roles.map(g => g.label).join(', ')}` : '';
    return (
        <header className="h-14 shrink-0 bg-white border-b border-slate-200 flex items-center gap-3 px-4">
            <span className="text-xs font-black uppercase tracking-widest bg-indigo-600 text-white px-2.5 py-1 rounded-md">Version 3.0</span>
            <span className="text-sm font-bold text-slate-700 hidden sm:inline">Factory management</span>
            {children}
            <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-slate-500 hidden md:inline">{me?.user?.name || user?.name} · {me?.role_label || user?.role}{extra}</span>
                <button type="button" onClick={() => navigate('/choose-version')}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 border border-slate-200 hover:border-indigo-300 hover:text-indigo-600 px-2.5 py-1.5 rounded-lg">
                    <ArrowLeftRight size={13} /> Switch version
                </button>
                <button type="button" onClick={logout}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 border border-slate-200 hover:border-rose-300 hover:text-rose-600 px-2.5 py-1.5 rounded-lg">
                    <LogOut size={13} /> Log out
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

export default function V3Layout() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [me, setMe] = useState(null);
    const [error, setError] = useState('');
    const load = useCallback(() => accessApi.me().then(res => setMe(res.data)).catch(err => setError(apiError(err, 'Failed to load your 3.0 access.'))), []);
    useEffect(() => { load(); }, [load]);

    if (!me) {
        return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-500">{error || 'Loading…'}</div>;
    }
    const key = keyForPath(location.pathname);
    const allowed = key === null || me.menu[key];
    const outlet = allowed ? <Outlet /> : <NotForRole me={me} />;

    // Floor users: their screen only, full width, no menu (2.0 workstation style).
    if (me.floor) {
        if (location.pathname === '/v3' || location.pathname === '/v3/') return <Navigate to={me.home} replace />;
        const screens = NAV.filter(n => !n.section && n.key !== 'home' && me.menu[n.key]);
        return (
            <V3AccessContext.Provider value={{ me, reload: load }}>
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

    const nav = visibleNav(me.menu);
    return (
        <V3AccessContext.Provider value={{ me, reload: load }}>
            <div className="min-h-screen bg-slate-50 flex flex-col">
                <TopBar me={me} user={user} logout={logout} navigate={navigate} />
                <div className="flex-1 flex min-h-0">
                    <nav className="w-60 shrink-0 bg-white border-r border-slate-200 p-3 space-y-0.5 hidden md:block">
                        {nav.map((n, i) => n.section ? (
                            <p key={i} className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-3 pt-4 pb-1">{n.section}</p>
                        ) : (
                            <NavLink key={n.to} to={n.to} end={n.end}
                                className={({ isActive }) => `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold ${isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                                <n.icon size={16} /> {n.label}
                            </NavLink>
                        ))}
                    </nav>
                    {/* Phone: the same links as a scrolling strip */}
                    <main className="flex-1 min-w-0 p-4 md:p-6">
                        <div className="md:hidden flex gap-1.5 overflow-x-auto pb-3 mb-3 border-b border-slate-200">
                            {nav.filter(n => !n.section).map(n => (
                                <NavLink key={n.to} to={n.to} end={n.end}
                                    className={({ isActive }) => `shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold ${isActive ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
                                    {n.label}
                                </NavLink>
                            ))}
                        </div>
                        {outlet}
                    </main>
                </div>
            </div>
        </V3AccessContext.Provider>
    );
}
