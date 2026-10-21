// LOCAL TEST MODE (20 Oct 2026): log in as any user without Google, to test the portals one after another.
// Shown only in a development build (`npm start`) opened on this machine, and only when the backend answers
// /api/auth/dev/users — which it does only with DEV_LOGIN=true, a local database and a request from this machine
// (see factory-management-backend/routes/devLoginRoutes.js). A production build never contains it.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../utils/api';

const RECENT_KEY = 'devLogin.recent';
const readRecent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; } };
const saveRecent = (id) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...readRecent().filter(x => x !== id)].slice(0, 6))); } catch { /* private window */ } };
const roleLabel = (r) => String(r || 'no role').replace(/_/g, ' ');

export const devLoginPossible = () => process.env.NODE_ENV === 'development'
    && ['localhost', '127.0.0.1'].includes(window.location.hostname);

export default function DevLoginPanel() {
    const navigate = useNavigate();
    const [users, setUsers] = useState(null);   // null = not available (panel hidden)
    const [q, setQ] = useState('');
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState('');
    const recent = readRecent();

    useEffect(() => {
        if (!devLoginPossible()) return;
        fetch(`${API_BASE_URL}/api/auth/dev/users`).then(r => (r.ok ? r.json() : null)).then(setUsers).catch(() => setUsers(null));
    }, []);

    const groups = useMemo(() => {
        const s = q.trim().toLowerCase();
        const list = (users || []).filter(u => !s || `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(s));
        const m = new Map();
        for (const u of list) { const k = u.role || ''; if (!m.has(k)) m.set(k, []); m.get(k).push(u); }
        return [...m.entries()];
    }, [users, q]);

    if (!users) return null;

    const loginAs = async (u) => {
        setBusy(u.id); setError('');
        try {
            const r = await fetch(`${API_BASE_URL}/api/auth/dev/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: u.id }) });
            const d = await r.json().catch(() => ({}));
            if (!r.ok || !d.token) throw new Error(d.error || 'Test login refused.');
            saveRecent(u.id);
            navigate(`/auth/callback?token=${encodeURIComponent(d.token)}`, { replace: true });   // the normal login path from here
        } catch (err) { setError(err.message); setBusy(null); }
    };
    const recentUsers = recent.map(id => users.find(u => u.id === id)).filter(Boolean);
    const userBtn = (u) => (
        <button key={u.id} type="button" disabled={busy != null} onClick={() => loginAs(u)}
            className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-amber-100 disabled:opacity-50 flex items-baseline gap-2">
            <span className="font-semibold text-slate-800 text-sm">{u.name}</span>
            <span className="text-[11px] text-slate-500 truncate">{u.email}</span>
            {busy === u.id && <span className="ml-auto text-[11px] text-amber-700">logging in…</span>}
        </button>
    );

    return (
        <div className="w-full mt-6 rounded-xl border-2 border-dashed border-amber-400 bg-amber-50/70 p-3">
            <p className="text-[11px] font-black uppercase tracking-widest text-amber-800">Test mode — local only</p>
            <p className="text-[11px] text-amber-900/80 mb-2">Log in as any user without Google ({users.length} users).</p>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Name, email or role" autoFocus
                className="w-full px-3 py-1.5 text-sm border border-amber-300 rounded-lg bg-white focus:outline-none focus:border-amber-500 mb-2" />
            {error && <p className="text-xs font-semibold text-rose-700 mb-1">{error}</p>}
            <div className="max-h-72 overflow-y-auto -mx-1 px-1">
                {!q && recentUsers.length > 0 && (
                    <div className="mb-1.5">
                        <p className="px-3 pt-1 text-[10px] font-black uppercase tracking-wider text-amber-700">Recent</p>
                        {recentUsers.map(u => <div key={`r${u.id}`}>{userBtn(u)}<p className="px-3 -mt-1 mb-0.5 text-[10px] text-slate-400">{roleLabel(u.role)}</p></div>)}
                    </div>
                )}
                {groups.map(([role, list]) => (
                    <div key={role} className="mb-1.5">
                        <p className="px-3 pt-1 text-[10px] font-black uppercase tracking-wider text-slate-500">{roleLabel(role)} · {list.length}</p>
                        {list.map(userBtn)}
                    </div>
                ))}
                {groups.length === 0 && <p className="px-3 py-2 text-xs text-slate-500">No user matches.</p>}
            </div>
        </div>
    );
}
