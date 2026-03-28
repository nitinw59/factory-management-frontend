import React, { useState, useRef, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
    LuLogOut, LuMenu, LuX, LuBell, LuChevronDown, 
    LuUsers, LuWrench, LuTrendingUp, LuReceipt 
} from 'react-icons/lu';

// --- Shared Dropdown Component ---
const NavDropdown = ({ title, children }) => {
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef(null);
    
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (ref.current && !ref.current.contains(event.target)) setIsOpen(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [ref]);

    return (
        <div className="relative" ref={ref}>
            <button 
                onClick={() => setIsOpen(!isOpen)} 
                className="flex items-center text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors"
            >
                {title} <LuChevronDown className={`ml-1 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>      
            {isOpen && (
                <div className="absolute top-full mt-2 w-56 bg-white rounded-xl shadow-lg border border-slate-100 py-2 z-50" onClick={() => setIsOpen(false)}>
                    {children}
                </div>
            )}
        </div>
    );
};

// --- Main Base Layout ---
export default function BaseManagerLayout({ portalName, basePath, customLinks = [] }) {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const closeMobileMenu = () => setIsMobileMenuOpen(false);

    // Common Use Cases for ALL Production Line Managers
    const commonOperations = [
        { to: `${basePath}/line-staff`, label: 'Staff & Costing', icon: LuUsers },
        { to: `${basePath}/maintenance/sewing-machine-complaints`, label: 'Machine Breakdowns', icon: LuWrench },
        { to: `${basePath}/production-logs`, label: 'Output Logs (D/W/M)', icon: LuTrendingUp },
        { to: `${basePath}/store-invoices`, label: 'Store Invoices', icon: LuReceipt },
    ];

    // Helper function for NavLink classes
    const getNavLinkClass = ({ isActive }) => 
        `flex items-center text-sm font-medium transition-colors px-3 py-2 rounded-lg ${isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50 hover:text-indigo-600'}`;

    return (
        <div className="flex flex-col h-screen bg-slate-50">
            {/* Header */}
            <header className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-30">
                <div className="container mx-auto px-4 lg:px-6 py-3 flex justify-between items-center">
                    
                    {/* Left: Brand & Desktop Nav */}
                    <div className="flex items-center gap-8">
                        <div className="text-xl font-extrabold text-slate-800 tracking-tight">
                            {portalName}
                        </div>
                        
                        {/* Desktop Navigation */}
                        <nav className="hidden lg:flex items-center gap-2">
                            {/* 1. Portal Specific Links */}
                            {customLinks.map((link, idx) => {
                                const Icon = link.icon;
                                return (
                                    <NavLink key={idx} to={link.to} className={getNavLinkClass}>
                                        {Icon && <Icon className="mr-2" size={16} />} {link.label}
                                    </NavLink>
                                );
                            })}
                            
                            {/* 2. Common Operations Dropdown */}
                            <div className="ml-4 pl-4 border-l border-slate-200">
                                <NavDropdown title="Line Operations">
                                    {commonOperations.map((op, idx) => {
                                        const Icon = op.icon;
                                        return (
                                            <NavLink key={idx} to={op.to} className={({ isActive }) => `flex items-center px-4 py-2.5 text-sm transition-colors ${isActive ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'}`}>
                                                <Icon className="mr-3 text-slate-400" size={16} /> {op.label}
                                            </NavLink>
                                        );
                                    })}
                                </NavDropdown>
                            </div>
                        </nav>
                    </div>

                    {/* Right: Controls */}
                    <div className="flex items-center gap-4">
                        <button className="p-2 text-slate-400 hover:text-indigo-600 transition-colors rounded-full hover:bg-slate-50">
                            <LuBell size={20} />
                        </button>
                        
                        <div className="hidden lg:flex items-center gap-4 pl-4 border-l border-slate-200">
                            <span className="text-sm font-bold text-slate-700">{user?.name}</span>
                            <button onClick={handleLogout} className="flex items-center text-sm font-semibold text-slate-500 hover:text-rose-600 transition-colors bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm">
                                <LuLogOut className="mr-2" size={16} /> Logout
                            </button>
                        </div>
                        
                        {/* Mobile Hamburger */}
                        <button className="lg:hidden p-2 text-slate-600" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
                            {isMobileMenuOpen ? <LuX size={24} /> : <LuMenu size={24} />}
                        </button>
                    </div>
                </div>

                {/* Mobile Menu */}
                {isMobileMenuOpen && (
                    <div className="lg:hidden bg-white border-t border-slate-100 shadow-lg absolute w-full left-0 top-full max-h-[calc(100vh-60px)] overflow-y-auto">
                        <nav className="flex flex-col p-4 gap-2">
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-3">Portal Tasks</div>
                            {customLinks.map((link, idx) => {
                                const Icon = link.icon;
                                return (
                                    <NavLink key={idx} to={link.to} onClick={closeMobileMenu} className={getNavLinkClass}>
                                        {Icon && <Icon className="mr-3 text-indigo-500" size={18} />} {link.label}
                                    </NavLink>
                                );
                            })}
                            
                            <hr className="my-2 border-slate-100" />
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-3">Line Operations</div>
                            {commonOperations.map((op, idx) => {
                                const Icon = op.icon;
                                return (
                                    <NavLink key={idx} to={op.to} onClick={closeMobileMenu} className={getNavLinkClass}>
                                        {Icon && <Icon className="mr-3 text-slate-400" size={18} />} {op.label}
                                    </NavLink>
                                );
                            })}

                            <hr className="my-2 border-slate-100" />
                            <div className="px-3 py-2 text-sm font-bold text-slate-700 bg-slate-50 rounded-lg">User: {user?.name}</div>
                            <button onClick={handleLogout} className="flex items-center w-full px-3 py-2 text-sm font-bold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors mt-2">
                                <LuLogOut className="mr-3" size={18} /> Logout
                            </button>
                        </nav>
                    </div>
                )}
            </header>
            
            {/* Main Content Area */}
            <main className="flex-1 overflow-y-auto">
                <Outlet />
            </main>
        </div>
    );
}