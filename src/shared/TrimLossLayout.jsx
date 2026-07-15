import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LuLogOut, LuArrowLeft, LuPackageX } from 'react-icons/lu';
import NotificationBell from './NotificationBell';

// Where "back to my portal" sends each role.
const PORTAL_HOME = {
    line_loader: '/line-loader/dashboard',
    line_supervisor: '/production-manager/dashboard',
    line_manager: '/production-manager/dashboard',
    production_manager: '/production-manager/dashboard',
    factory_admin: '/admin/dashboard',
    hr_manager: '/hr-portal/dashboard',
    purchase_manager: '/purchase-department/requirements',
    store_manager: '/store-manager/trim-orders',
    accountant: '/accounts',
};

const TrimLossLayout = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => { logout(); navigate('/login'); };
    const home = PORTAL_HOME[user?.role] || '/init';

    // HR lands on the recovery queue; everyone else on the register.
    const isHr = ['hr_manager', 'factory_admin'].includes(user?.role);

    return (
        <div className="flex flex-col h-screen bg-slate-50 font-sans">
            <header className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-20">
                <div className="container mx-auto px-4 sm:px-6 py-3 flex justify-between items-center gap-4">
                    <div className="flex items-center gap-4 sm:gap-8 min-w-0">
                        <NavLink to={home} className="flex items-center gap-1.5 text-sm font-semibold text-slate-400 hover:text-slate-600 transition-colors shrink-0">
                            <LuArrowLeft size={16} /> <span className="hidden sm:inline">My portal</span>
                        </NavLink>
                        <span className="w-px h-5 bg-slate-200 shrink-0" />
                        <div className="flex items-center gap-2 min-w-0">
                            <div className="p-1.5 bg-red-100 rounded-lg text-red-600 shrink-0"><LuPackageX size={18} /></div>
                            <span className="font-black text-base sm:text-lg text-slate-800 tracking-tight truncate">Trim Loss</span>
                        </div>
                        <nav className="hidden md:flex items-center gap-5">
                            <NavLink end to="/trim-loss" className={({ isActive }) => `text-sm font-medium transition-colors ${isActive ? 'text-red-600' : 'text-slate-600 hover:text-red-600'}`}>
                                Register
                            </NavLink>
                            <NavLink to="/trim-loss/near-misses" className={({ isActive }) => `text-sm font-medium transition-colors ${isActive ? 'text-red-600' : 'text-slate-600 hover:text-red-600'}`}>
                                Near-misses
                            </NavLink>
                            {isHr && (
                                <NavLink to="/trim-loss/recovery" className={({ isActive }) => `text-sm font-medium transition-colors ${isActive ? 'text-red-600' : 'text-slate-600 hover:text-red-600'}`}>
                                    Salary Recovery
                                </NavLink>
                            )}
                        </nav>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                        {user && <span className="hidden lg:inline text-sm font-medium text-slate-700">Welcome, {user.name}</span>}
                        <NotificationBell />
                        <button onClick={handleLogout} className="flex items-center text-sm font-medium text-slate-500 hover:text-rose-600 transition-colors gap-1.5">
                            <LuLogOut size={15} /> <span className="hidden sm:inline">Logout</span>
                        </button>
                    </div>
                </div>
            </header>
            <main className="flex-1 overflow-y-auto p-4 sm:p-6">
                <Outlet />
            </main>
        </div>
    );
};

export default TrimLossLayout;
