// Shell for every Version 3.0 page: top bar (version badge, switch back to
// 2.0, change version, log out) + side navigation.
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Home, Palette, SlidersHorizontal, Tags, Package, ClipboardList, Layers, ArrowLeftRight, LogOut, Shirt, Route, ClipboardCheck, FileText, Calculator, Settings2, Boxes, ShoppingCart, FileCheck, Gauge, Warehouse, CalendarDays } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const NAV = [
    { to: '/v3', label: 'Home', icon: Home, end: true },
    { section: 'Masters' },
    { to: '/v3/masters/garment-colours', label: 'Garment colours', icon: Palette },
    { to: '/v3/masters/trim-settings', label: 'Trim settings (tones)', icon: SlidersHorizontal },
    { to: '/v3/masters/trim-types', label: 'Trim types', icon: Tags },
    { to: '/v3/masters/trim-items', label: 'Trim items & stock', icon: Package },
    { to: '/v3/masters/opening-stock', label: 'Opening stock', icon: ClipboardList },
    { to: '/v3/masters/fabric-items', label: 'Fabric items', icon: Layers },
    { to: '/v3/masters/fabric-stock', label: 'Fabric stock', icon: Warehouse },
    { section: 'Styles' },
    { to: '/v3/styles', label: 'Styles', icon: Shirt },
    { to: '/v3/stage-types', label: 'Stage types', icon: Route },
    { to: '/v3/bom-approvals', label: 'BOM approvals', icon: ClipboardCheck },
    { section: 'Sales' },
    { to: '/v3/sales-orders', label: 'Sales orders', icon: FileText },
    { to: '/v3/sales-order-approvals', label: 'Order approvals', icon: ClipboardCheck },
    { section: 'Planning' },
    { to: '/v3/planning', label: 'Material requirements', icon: Calculator, end: true },
    { to: '/v3/planning/readiness', label: 'Material readiness', icon: Gauge },
    { to: '/v3/planning/milestones', label: 'Order milestones', icon: CalendarDays },
    { to: '/v3/planning/position', label: 'Material position', icon: Boxes },
    { to: '/v3/planning/buy-list', label: 'Buy list', icon: ShoppingCart },
    { to: '/v3/planning/purchase-requisitions', label: 'Purchase requisitions', icon: FileCheck },
    { to: '/v3/planning/purchase-requisitions?status=SUBMITTED', label: 'Requisition approvals', icon: ClipboardCheck },
    { to: '/v3/planning/settings', label: 'Planning settings', icon: Settings2 },
];

export default function V3Layout() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            <header className="h-14 shrink-0 bg-white border-b border-slate-200 flex items-center gap-3 px-4">
                <span className="text-xs font-black uppercase tracking-widest bg-indigo-600 text-white px-2.5 py-1 rounded-md">Version 3.0</span>
                <span className="text-sm font-bold text-slate-700 hidden sm:inline">Factory management</span>
                <div className="ml-auto flex items-center gap-2">
                    <span className="text-xs text-slate-500 hidden md:inline">{user?.name} · {user?.role}</span>
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
            <div className="flex-1 flex min-h-0">
                <nav className="w-60 shrink-0 bg-white border-r border-slate-200 p-3 space-y-0.5 hidden md:block">
                    {NAV.map((n, i) => n.section ? (
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
                        {NAV.filter(n => !n.section).map(n => (
                            <NavLink key={n.to} to={n.to} end={n.end}
                                className={({ isActive }) => `shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold ${isActive ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
                                {n.label}
                            </NavLink>
                        ))}
                    </div>
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
