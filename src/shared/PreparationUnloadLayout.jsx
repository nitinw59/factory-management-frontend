
import React, { useState, useRef, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LuLogOut, LuClipboardCheck, LuMenu, LuX, LuBell ,LuFileText } from 'react-icons/lu';

const PreparationUnloadLayout = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };
    
    const closeMobileMenu = () => setIsMobileMenuOpen(false);

    return (
        <div className="flex flex-col h-screen bg-gray-50">
            <header className="bg-white shadow-md sticky top-0 z-20">
                <div className="container mx-auto px-6 py-3 flex justify-between items-center">
                    <div className="text-xl font-bold text-gray-800">Preparation Unload Portal</div>

                    {/* Desktop Navigation */}
                    <nav className="hidden md:flex items-center space-x-6">
                        <NavLink 
                            to="/preparation-unload/dashboard" 
                            className={({ isActive }) => `flex items-center text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}
                        >
                            <LuClipboardCheck className="mr-2" /> Unload Queue
                        </NavLink>
                       
                        <NavLink 
                            to="/preparation-unload/summary" 
                            className={({ isActive }) => `flex items-center text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}
                        >
                            <LuFileText className="mr-2" /> Batch QC Summary
                        </NavLink>
                    </nav>

                    <div className="flex items-center space-x-4">
                        {/* Placeholder for Notifications */}
                        <button className="text-gray-600 hover:text-blue-600"><LuBell size={20} /></button>
                        
                        <div className="hidden md:flex items-center space-x-4">
                            <span className="text-sm font-medium">Welcome, {user?.name}</span>
                            <button onClick={handleLogout} className="flex items-center text-sm text-gray-600 hover:text-red-600"><LuLogOut className="mr-1" /> Logout</button>
                        </div>
                        
                        {/* Hamburger Menu Button */}
                        <div className="md:hidden">
                            <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
                                {isMobileMenuOpen ? <LuX size={24} /> : <LuMenu size={24} />}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Mobile Menu */}
                {isMobileMenuOpen && (
                    <div className="md:hidden bg-white shadow-md">
                        <nav className="flex flex-col p-4 space-y-4">
                            <NavLink 
                                to="/preparation-unload/dashboard" 
                                onClick={closeMobileMenu} 
                                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md"
                            >
                                <LuClipboardCheck className="mr-2" /> Unload Queue
                            </NavLink>
                           
                            <NavLink 
                                to="/preparation-unload/summary" 
                                onClick={closeMobileMenu} 
                                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md"
                            >
                                <LuFileText className="mr-2" /> Batch QC Summary
                            </NavLink>
                            <hr />
                            <div className="px-4 py-2 text-sm text-gray-500">Welcome, {user?.name}</div>
                            <button onClick={handleLogout} className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md"><LuLogOut className="mr-2" /> Logout</button>
                        </nav>
                    </div>
                )}
            </header>
            <main className="flex-1 p-6 overflow-y-auto">
                <Outlet />
            </main>
        </div>
    );
};

export default PreparationUnloadLayout;