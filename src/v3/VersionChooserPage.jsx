// First page after login: continue in Version 2.0 (today's portals) or open
// Version 3.0 (the new system, built portal by portal — see
// docs/VERSION_3_OVERVIEW.md in the backend repo). Shown to every user until 2.0 is
// retired (decided); the 3.0 card lists what this user can open there.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Factory, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { accessApi } from './api/accessApi';
import { visibleNav } from './v3Nav';

export default function VersionChooserPage() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const [areas, setAreas] = useState(null);
    useEffect(() => {
        accessApi.me().then(res => setAreas(visibleNav(res.data.menu).filter(n => n.section).map(n => n.section))).catch(() => setAreas(null));
    }, []);

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
            <div className="w-full max-w-3xl">
                <p className="text-sm font-bold text-slate-500 mb-1">Welcome{user?.name ? `, ${user.name}` : ''}</p>
                <h1 className="text-3xl font-black text-slate-900 mb-6">Which version do you want to open?</h1>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button
                        type="button"
                        onClick={() => navigate('/init', { replace: true })}
                        className="text-left bg-white border-2 border-slate-200 hover:border-amber-500 rounded-2xl p-6 transition group"
                    >
                        <div className="flex items-center gap-2 mb-3">
                            <span className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center"><Factory size={20} /></span>
                            <span className="text-xs font-black uppercase tracking-widest text-amber-700">Version 2.0</span>
                        </div>
                        <h2 className="text-xl font-black text-slate-900 mb-1">Current system</h2>
                        <p className="text-sm text-slate-500 mb-4">Your usual portal, orders and production as they run today.</p>
                        <span className="inline-flex items-center gap-1 text-sm font-bold text-amber-700 group-hover:gap-2 transition-all">
                            Open 2.0 <ArrowRight size={16} />
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={() => navigate('/v3', { replace: true })}
                        className="text-left bg-white border-2 border-slate-200 hover:border-indigo-500 rounded-2xl p-6 transition group"
                    >
                        <div className="flex items-center gap-2 mb-3">
                            <span className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center"><Sparkles size={20} /></span>
                            <span className="text-xs font-black uppercase tracking-widest text-indigo-700">Version 3.0</span>
                        </div>
                        <h2 className="text-xl font-black text-slate-900 mb-1">New system</h2>
                        <p className="text-sm text-slate-500 mb-4">{areas === null ? 'Being built portal by portal.' : areas.length ? `For you: ${areas.join(', ')}.` : 'Nothing for your role in 3.0 yet — your work continues in 2.0.'}</p>
                        <span className="inline-flex items-center gap-1 text-sm font-bold text-indigo-700 group-hover:gap-2 transition-all">
                            Open 3.0 <ArrowRight size={16} />
                        </span>
                    </button>
                </div>

                <p className="text-xs text-slate-400 mt-6">
                    2.0 and 3.0 keep separate data: an order stays in the version it was started in.
                    <button type="button" onClick={logout} className="ml-2 font-semibold text-slate-500 hover:text-slate-700 underline">Log out</button>
                </p>
            </div>
        </div>
    );
}
