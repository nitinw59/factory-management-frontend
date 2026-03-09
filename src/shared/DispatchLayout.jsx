import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LuLogOut, LuClipboardCheck, LuTruck, LuMenu, LuX, LuArchive } from 'react-icons/lu';

export const DispatchLayout = () => {
    const { logout } = useAuth();
    const navigate = useNavigate();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const closeMobileMenu = () => {
        setIsMobileMenuOpen(false);
    };
    
    return (    
        <div className="flex flex-col h-screen bg-slate-50 font-sans">
            <header className="bg-white shadow-sm border-b border-slate-200 relative z-30">
                <div className="container mx-auto px-4 sm:px-6 py-3 flex justify-between items-center">
                    
                    {/* Dispatch Branding */}
                    <div className="flex items-center space-x-2 text-lg sm:text-xl font-bold text-slate-800">
                        <div className="bg-blue-600 p-1.5 rounded-lg shadow-sm">
                            <LuTruck className="text-white" size={20} />
                        </div>
                        <span className="tracking-tight">Dispatch Portal</span>
                    </div>
                    
                    {/* Desktop Navigation & Actions */}
                    <div className="hidden md:flex items-center space-x-8">
                        <nav className="flex items-center space-x-6">
                            <NavLink 
                                to="/dispatch-portal/dashboard" 
                                className={({ isActive }) => `flex items-center text-sm font-medium transition-colors ${isActive ? 'text-blue-600' : 'text-slate-600 hover:text-blue-600'}`}
                            >
                                <LuClipboardCheck className="mr-1.5" size={18} />
                                Dispatch Queue
                            </NavLink>
                            <NavLink 
                                to="/dispatch-portal/receipts" 
                                className={({ isActive }) => `flex items-center text-sm font-medium transition-colors ${isActive ? 'text-blue-600' : 'text-slate-600 hover:text-blue-600'}`}
                            >
                                <LuArchive className="mr-1.5" size={18} />
                                Dispatch Receipts
                            </NavLink>
                        </nav>

                        {/* Logout Action */}
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
                            <NavLink 
                                to="/dispatch-portal/dashboard" 
                                onClick={closeMobileMenu}
                                className={({ isActive }) => `flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-blue-50 text-blue-600' : 'text-slate-600 hover:bg-slate-50 hover:text-blue-600'}`}
                            >
                                <LuClipboardCheck className="mr-3" size={18} />
                                Dispatch Queue
                            </NavLink>
                            <NavLink 
                                to="/dispatch-portal/receipts" 
                                onClick={closeMobileMenu}
                                className={({ isActive }) => `flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-blue-50 text-blue-600' : 'text-slate-600 hover:bg-slate-50 hover:text-blue-600'}`}
                            >
                                <LuArchive className="mr-3" size={18} />
                                Dispatch Receipts
                            </NavLink>
                        </nav>
                        
                        <div className="pt-4 mt-2 border-t border-slate-100">
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

export default DispatchLayout;