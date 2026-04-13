import React, { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LuLogOut, LuClipboardCheck, LuLayoutGrid, LuMenu, LuX, LuFileText } from 'react-icons/lu';

const NumberingPortalLayout = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [showNav, setShowNav] = useState(false); // nav hidden by default

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <div className="flex flex-col h-screen bg-gray-50">
            <header className="bg-white shadow-sm sticky top-0 z-20 border-b border-gray-100">
                {/* Always-visible minimal bar */}
                <div className="px-4 py-2 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        {/* Donut button — circle to toggle nav */}
                        <button
                            onClick={() => setShowNav(n => !n)}
                            title={showNav ? 'Hide navigation' : 'Show navigation'}
                            className="w-8 h-8 rounded-full border-2 border-gray-300 bg-white hover:bg-gray-50 flex items-center justify-center shadow-sm transition shrink-0"
                        >
                            {showNav ? <LuX size={14} className="text-gray-600" /> : <LuMenu size={14} className="text-gray-600" />}
                        </button>
                        <span className="text-base font-bold text-gray-800">Workstation</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-500 hidden sm:block">{user?.name}</span>
                        <button onClick={handleLogout} className="flex items-center text-sm text-gray-600 hover:text-red-600">
                            <LuLogOut className="mr-1" size={14} /> Logout
                        </button>
                    </div>
                </div>

                {/* Collapsible nav — shown on donut click */}
                {showNav && (
                    <nav className="border-t border-gray-100 px-6 py-2 flex flex-wrap items-center gap-5" onClick={() => setShowNav(false)}>
                        <NavLink
                            to="/numbering-portal/dashboard"
                            className={({ isActive }) => `flex items-center text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}
                        >
                            <LuClipboardCheck className="mr-1.5" size={14} /> My Numbering Queue
                        </NavLink>
                        <NavLink
                            to="/numbering-portal/summary"
                            className={({ isActive }) => `flex items-center text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}
                        >
                            <LuFileText className="mr-1.5" size={14} /> Batch QC Summary
                        </NavLink>
                        <NavLink
                            to="/numbering-portal/sewing-machine-complaints"
                            className={({ isActive }) => `flex items-center text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}
                        >
                            <LuLayoutGrid className="mr-1.5" size={14} /> Sewing Machine Complaints
                        </NavLink>
                    </nav>
                )}
            </header>
            <main className="flex-1 p-6 overflow-y-auto">
                <Outlet />
            </main>
        </div>
    );
};

export default NumberingPortalLayout;

