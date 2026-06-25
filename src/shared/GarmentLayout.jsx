import React, { useState, useEffect } from 'react';

import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import MatrixBrand from './MatrixBrand';
import { useAuth } from '../context/AuthContext';
import { assemblyApi } from '../api/assemblyApi';

import { FiLogOut, FiClipboard, FiMenu, FiX, FiBell } from 'react-icons/fi';

const AssemblyLayout = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [lineName, setLineName] = useState('');

    useEffect(() => {
        assemblyApi.getMonitorData()
            .then(res => setLineName(res.data?.workstation?.line_name ?? ''))
            .catch(() => {});
    }, []);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const closeMobileMenu = () => setIsMobileMenuOpen(false);

    return (
        <div className="flex flex-col h-screen bg-gray-50">
            <header className="bg-white shadow-md sticky top-0 z-20">
                <div className="container mx-auto px-6 py-3 flex justify-between items-center">
                    <MatrixBrand portal="Assembly Portal" />

                    {/* Desktop Navigation */}
                    <nav className="hidden md:flex items-center space-x-6">
                        <NavLink
                            to="/garment-checker/dashboard"
                            className={({ isActive }) => `flex items-center text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}
                        >
                            <FiClipboard className="mr-2" /> Assembly Queue
                        </NavLink>

                        <NavLink
                            to="/garment-checker/monitor"
                            className={({ isActive }) => `flex items-center text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}
                        >
                            <FiClipboard className="mr-2" /> Monitor
                        </NavLink>
                    </nav>

                    <div className="flex items-center space-x-4">
                        <button className="text-gray-600 hover:text-blue-600"><FiBell size={20} /></button>

                        <div className="hidden md:flex items-center space-x-4">
                            <div className="flex flex-col items-end leading-tight">
                                {lineName && <span className="text-xs font-black text-indigo-700">{lineName}</span>}
                                <span className="text-sm font-medium text-gray-700">{user?.name}</span>
                                {user?.email && <span className="text-xs text-gray-400">{user.email}</span>}
                            </div>
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
                                to="/garment-checker/dashboard"
                                onClick={closeMobileMenu}
                                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md"
                            >
                                <FiClipboard className="mr-2" /> Assembly Queue
                            </NavLink>
                            <NavLink
                                to="/garment-checker/monitor"
                                onClick={closeMobileMenu}
                                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md"
                            >
                                <FiClipboard className="mr-2" /> Monitor
                            </NavLink>
                            <hr />
                            <div className="px-4 py-2">
                                {lineName && <div className="text-xs font-black text-indigo-700">{lineName}</div>}
                                <div className="text-sm text-gray-700">{user?.name}</div>
                                {user?.email && <div className="text-xs text-gray-400">{user.email}</div>}
                            </div>
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

export default AssemblyLayout;
