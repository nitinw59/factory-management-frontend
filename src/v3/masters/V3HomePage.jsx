// 3.0 home, personal: the user's name and roles, and their pages as tiles by
// area (only what their 3.0 roles can open — same list as the menu).
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/ui';
import { useV3Access } from '../V3Access';
import { visibleNav } from '../v3Nav';

export default function V3HomePage() {
    const { me } = useV3Access();
    const groups = [];
    for (const n of visibleNav(me.menu)) {
        if (n.section) groups.push({ section: n.section, items: [] });
        else if (n.key !== 'home' && groups.length) groups[groups.length - 1].items.push(n);
    }
    const extra = me.granted_roles.length ? ` · extra access: ${me.granted_roles.map(g => g.label).join(', ')}` : '';
    return (
        <div>
            <PageHeader title={`Welcome${me.user.name ? `, ${me.user.name}` : ''}`} subtitle={`${me.role_label}${extra}`} />
            {groups.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-600">
                    Nothing for your role in 3.0 yet — your work continues in 2.0 (Switch version, top right). The factory admin can give you extra access if you need a 3.0 page.
                </div>
            ) : groups.map(g => (
                <section key={g.section} className="mb-5">
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">{g.section}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                        {g.items.map(t => (
                            <Link key={t.to} to={t.to} className="bg-white border border-slate-200 hover:border-indigo-400 rounded-xl p-4 flex gap-3 transition">
                                <span className="w-10 h-10 shrink-0 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center"><t.icon size={18} /></span>
                                <span className="min-w-0">
                                    <span className="block font-bold text-slate-800">{t.label}</span>
                                    <span className="block text-sm text-slate-500">{t.text}</span>
                                </span>
                            </Link>
                        ))}
                    </div>
                </section>
            ))}
        </div>
    );
}
