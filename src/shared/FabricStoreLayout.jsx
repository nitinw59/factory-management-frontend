import React, { useState } from 'react';
import MatrixBrand from './MatrixBrand';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LuLogOut, LuLayers, LuInbox, LuCalendarClock, LuMenu, LuX } from 'react-icons/lu';
import ReportBugButton from './ReportBugButton';

const NAV_LINKS = [
    { to: '/fabric-store-portal/rolls', label: 'Fabric Rolls', Icon: LuLayers },
    { to: '/fabric-store-portal/inwards', label: 'Inwards', Icon: LuInbox },
    { to: '/fabric-store-portal/planning', label: 'Planning', Icon: LuCalendarClock },
];

export const FabricStoreLayout = () => {
    const { logout } = useAuth();
    const navigate = useNavigate();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const closeMobileMenu = () => setIsMobileMenuOpen(false);

    const linkCls = ({ isActive }) =>
        `flex items-center text-sm font-medium transition-colors ${isActive ? 'text-blue-600' : 'text-slate-600 hover:text-blue-600'}`;
    const mobileLinkCls = ({ isActive }) =>
        `flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-blue-50 text-blue-600' : 'text-slate-600 hover:bg-slate-50 hover:text-blue-600'}`;

    return (
        <div className="flex flex-col h-screen bg-slate-50 font-sans">
            <header className="bg-white shadow-sm border-b border-slate-200 relative z-30">
                <div className="container mx-auto px-4 sm:px-6 py-3 flex justify-between items-center">

                    <MatrixBrand portal="Fabric Store Portal" wordmarkClassName="text-slate-800" />

                    {/* Desktop Navigation & Actions */}
                    <div className="hidden md:flex items-center space-x-8">
                        <nav className="flex items-center space-x-6">
                            {NAV_LINKS.map(({ to, label, Icon }) => (
                                <NavLink key={to} to={to} className={linkCls}>
                                    <Icon className="mr-1.5" size={18} />
                                    {label}
                                </NavLink>
                            ))}
                        </nav>

                        <ReportBugButton />

                        <button
                            onClick={handleLogout}
                            className="flex items-center text-sm font-medium text-slate-500 hover:text-rose-600 transition-colors bg-slate-50 hover:bg-rose-50 px-3 py-1.5 rounded-lg"
                        >
                            <LuLogOut className="mr-1.5" size={16} />
                            Logout
                        </button>
                    </div>

                    {/* Mobile Menu Toggle Button */}
                    <button
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                        className="md:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors focus:outline-none"
                        aria-label="Toggle navigation menu"
                    >
                        {isMobileMenuOpen ? <LuX size={24} /> : <LuMenu size={24} />}
                    </button>
                </div>

                {/* Mobile Navigation Dropdown */}
                {isMobileMenuOpen && (
                    <div className="md:hidden absolute top-full left-0 right-0 bg-white border-b border-slate-200 shadow-xl px-4 py-4 flex flex-col space-y-2 animate-in slide-in-from-top-2 duration-200">
                        <nav className="flex flex-col space-y-2">
                            {NAV_LINKS.map(({ to, label, Icon }) => (
                                <NavLink key={to} to={to} onClick={closeMobileMenu} className={mobileLinkCls}>
                                    <Icon className="mr-3" size={18} />
                                    {label}
                                </NavLink>
                            ))}
                        </nav>

                        <div className="pt-4 mt-2 border-t border-slate-100 flex flex-col gap-2">
                            <ReportBugButton />
                            <button
                                onClick={() => { closeMobileMenu(); handleLogout(); }}
                                className="w-full flex items-center justify-center text-sm font-medium text-rose-600 hover:bg-rose-50 transition-colors px-4 py-3 rounded-lg"
                            >
                                <LuLogOut className="mr-2" size={18} />
                                Logout
                            </button>
                        </div>
                    </div>
                )}
            </header>

            <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
                <Outlet />
            </main>
        </div>
    );
};

export default FabricStoreLayout;
