import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    LuLogOut, LuMenu, LuX, LuFileText,
    LuLayoutDashboard, LuShoppingBag, LuPackage, LuClipboardList,
} from 'react-icons/lu';

const NAV = [
    { to: '/merchandiser/bom',                 icon: LuFileText,        label: 'BOM Management'       },
    { to: '/merchandiser/planning',            icon: LuClipboardList,   label: 'Production Planning'  },
    { to: '/merchandiser/production-workflow', icon: LuLayoutDashboard, label: 'Production Workflow'  },
    { to: '/merchandiser/trims',               icon: LuPackage,         label: 'Trim Management'      },
    { to: '/merchandiser/sales-orders',        icon: LuShoppingBag,     label: 'Sales Orders'         },
];

const MerchandiserLayout = () => {
    const { logout } = useAuth();
    const navigate = useNavigate();
    const [mobileOpen, setMobileOpen] = useState(false);

    const handleLogout = () => { logout(); navigate('/login'); };

    return (
        <div className="flex flex-col h-screen bg-slate-50 font-sans">
            <header className="bg-white shadow-sm border-b border-slate-200 relative z-30">
                <div className="container mx-auto px-4 sm:px-6 py-3 flex justify-between items-center">
                    <div className="flex items-center gap-2 text-lg font-bold text-slate-800">
                        <div className="bg-violet-600 p-1.5 rounded-lg shadow-sm">
                            <LuFileText className="text-white" size={18} />
                        </div>
                        <span className="tracking-tight">Merchandiser Portal</span>
                    </div>

                    <div className="hidden md:flex items-center gap-6">
                        <nav className="flex items-center gap-5">
                            {NAV.map(({ to, icon: Icon, label }) => (
                                <NavLink
                                    key={to}
                                    to={to}
                                    className={({ isActive }) =>
                                        `flex items-center text-sm font-medium transition-colors gap-1.5 ${isActive ? 'text-violet-600' : 'text-slate-600 hover:text-violet-600'}`
                                    }
                                >
                                    <Icon size={15} /> {label}
                                </NavLink>
                            ))}
                        </nav>
                        <button
                            onClick={handleLogout}
                            className="flex items-center text-sm font-medium text-slate-500 hover:text-rose-600 transition-colors bg-slate-50 hover:bg-rose-50 px-3 py-1.5 rounded-lg gap-1.5"
                        >
                            <LuLogOut size={15} /> Logout
                        </button>
                    </div>

                    <button
                        onClick={() => setMobileOpen(o => !o)}
                        className="md:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                    >
                        {mobileOpen ? <LuX size={22} /> : <LuMenu size={22} />}
                    </button>
                </div>

                {mobileOpen && (
                    <div className="md:hidden absolute top-full left-0 right-0 bg-white border-b border-slate-200 shadow-xl px-4 py-4 flex flex-col gap-2">
                        {NAV.map(({ to, icon: Icon, label }) => (
                            <NavLink
                                key={to}
                                to={to}
                                onClick={() => setMobileOpen(false)}
                                className={({ isActive }) =>
                                    `flex items-center px-4 py-3 rounded-lg text-sm font-medium gap-2 transition-colors ${isActive ? 'bg-violet-50 text-violet-600' : 'text-slate-600 hover:bg-slate-50'}`
                                }
                            >
                                <Icon size={16} /> {label}
                            </NavLink>
                        ))}
                        <div className="pt-3 border-t border-slate-100 mt-1">
                            <button
                                onClick={() => { setMobileOpen(false); handleLogout(); }}
                                className="w-full flex items-center justify-center text-sm font-medium text-rose-600 hover:bg-rose-50 px-4 py-3 rounded-lg gap-2"
                            >
                                <LuLogOut size={16} /> Logout
                            </button>
                        </div>
                    </div>
                )}
            </header>

            <main className="flex-1 overflow-y-auto">
                <Outlet />
            </main>
        </div>
    );
};

export default MerchandiserLayout;
