import React, { useState, useRef, useEffect } from 'react';

import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext'; // Assuming this is your auth context

import { FiLogOut, FiClipboard, FiMenu, FiX, FiBell, FiFileText } from 'react-icons/fi';

const SewingPartLayout = () => {
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
                    <div className="text-xl font-bold text-gray-800">Sewing Part Portal</div>

                    {/* Desktop Navigation */}
                    <nav className="hidden md:flex items-center space-x-6">
                        <NavLink 
                            to="/sewing-part-operator/dashboard" 
                            className={({ isActive }) => `flex items-center text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}
                        >
                            <FiClipboard className="mr-2" /> Sewing Queue
                        </NavLink>
                       
                        <NavLink 
                            to="/sewing-part-operator/summary" 
                            className={({ isActive }) => `flex items-center text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}
                        >
                            <FiFileText className="mr-2" /> Batch QC Summary
                        </NavLink>
                    </nav>

                    <div className="flex items-center space-x-4">
                        {/* Placeholder for Notifications */}
                        <button className="text-gray-600 hover:text-blue-600"><FiBell size={20} /></button>
                        
                        <div className="hidden md:flex items-center space-x-4">
                            <span className="text-sm font-medium">Welcome, {user?.name}</span>
                            <button onClick={handleLogout} className="flex items-center text-sm text-gray-600 hover:text-red-600"><FiLogOut className="mr-1" /> Logout</button>
                        </div>
                        
                        {/* Hamburger Menu Button */}
                        <div className="md:hidden">
                            <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
                                {isMobileMenuOpen ? <FiX size={24} /> : <FiMenu size={24} />}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Mobile Menu */}
                {isMobileMenuOpen && (
                    <div className="md:hidden bg-white shadow-md">
                        <nav className="flex flex-col p-4 space-y-4">
                            <NavLink 
                                to="/sewing-part-operator/dashboard" 
                                onClick={closeMobileMenu} 
                                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md"
                            >
                                <FiClipboard className="mr-2" /> Sewing Queue
                            </NavLink>
                           
                            <NavLink 
                                to="/sewing-part-operator/summary" 
                                onClick={closeMobileMenu} 
                                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md"
                            >
                                <FiFileText className="mr-2" /> Batch QC Summary
                            </NavLink>
                            <hr />
                            <div className="px-4 py-2 text-sm text-gray-500">Welcome, {user?.name}</div>
                            <button onClick={handleLogout} className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md"><FiLogOut className="mr-2" /> Logout</button>
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

export default SewingPartLayout;