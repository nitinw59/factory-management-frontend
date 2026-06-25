import React from 'react';
import MatrixBrand from './MatrixBrand';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LuLogOut, LuPackageCheck } from 'react-icons/lu';

export const ReceiverLayout = () => {
    const { logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <div className="flex flex-col h-screen bg-slate-50 font-sans">
            <header className="bg-white shadow-sm border-b border-slate-200 z-30">
                <div className="container mx-auto px-4 sm:px-6 py-3 flex justify-between items-center">

                    <MatrixBrand portal="Receiver Portal" wordmarkClassName="text-slate-800" />

                    <div className="flex items-center space-x-8">
                        <nav className="flex items-center space-x-6">
                            <NavLink
                                to="/receiver/dashboard"
                                className={({ isActive }) =>
                                    `flex items-center text-sm font-medium transition-colors ${isActive ? 'text-slate-900' : 'text-slate-600 hover:text-slate-900'}`
                                }
                            >
                                <LuPackageCheck className="mr-1.5" size={18} />
                                Receiving Queue
                            </NavLink>
                        </nav>

                        <button
                            onClick={handleLogout}
                            className="flex items-center text-sm font-medium text-slate-500 hover:text-rose-600 transition-colors bg-slate-50 hover:bg-rose-50 px-3 py-1.5 rounded-lg"
                        >
                            <LuLogOut className="mr-1.5" size={16} />
                            Logout
                        </button>
                    </div>
                </div>
            </header>

            <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
                <Outlet />
            </main>
        </div>
    );
};

export default ReceiverLayout;
