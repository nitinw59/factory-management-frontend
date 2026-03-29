import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
    Users, 
    Clock, 
    UploadCloud, 
    DollarSign, 
    Menu, 
    X, 
    LogOut, 
    ShieldCheck,
    Building2
} from 'lucide-react';

const HRLayout = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const handleLogout = async () => {
        await logout();
        navigate('/');
    };

    // Define the navigation links for the HR Portal
    const navLinks = [
        { name: 'Daily Attendance', path: '/hr-portal/attendance', icon: Clock },
        { name: 'Data Imports', path: '/hr-portal/data-import', icon: UploadCloud },
        { name: 'Shift Management', path: '/hr-portal/shifts', icon: Clock, disabled: false },
        
        // Placeholders for the features we discussed building next:
        { name: 'Employee Directory', path: '/hr-portal/employees', icon: Users, disabled: false },
        { name: 'Payroll Processing', path: '/hr-portal/payroll', icon: DollarSign, disabled: true },
    ];

    const SidebarContent = () => (
        <div className="flex flex-col h-full bg-slate-900 text-slate-300">
            {/* Sidebar Header */}
            <div className="p-6 flex items-center gap-3 bg-slate-950">
                <div className="bg-indigo-500 p-2 rounded-lg text-white">
                    <Building2 size={24} />
                </div>
                <div>
                    <h2 className="text-white font-bold tracking-tight leading-tight">EnterpriseOS</h2>
                    <p className="text-[10px] uppercase tracking-widest text-indigo-400 font-bold">HR & Payroll</p>
                </div>
            </div>

            {/* Navigation Links */}
            <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
                {navLinks.map((link) => (
                    link.disabled ? (
                        <div key={link.name} className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 cursor-not-allowed opacity-50" title="Coming Soon">
                            <link.icon size={20} />
                            <span className="font-medium text-sm">{link.name}</span>
                        </div>
                    ) : (
                        <NavLink
                            key={link.name}
                            to={link.path}
                            onClick={() => setIsMobileMenuOpen(false)}
                            className={({ isActive }) =>
                                `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                                    isActive
                                        ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/20'
                                        : 'hover:bg-slate-800 hover:text-white'
                                }`
                            }
                        >
                            <link.icon size={20} />
                            <span className="font-medium text-sm">{link.name}</span>
                        </NavLink>
                    )
                ))}
            </nav>

            {/* User Profile & Logout */}
            <div className="p-4 bg-slate-950">
                <div className="flex items-center gap-3 mb-4 px-2">
                    <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 text-indigo-400 font-bold">
                        {user?.name?.charAt(0) || 'U'}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{user?.name || 'HR User'}</p>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center gap-1">
                            <ShieldCheck size={10} /> {user?.role ? user.role.replace('_', ' ') : 'HR Staff'}
                        </p>
                    </div>
                </div>
                <button
                    onClick={handleLogout}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-rose-500 hover:text-white rounded-lg text-sm font-bold transition-colors duration-200"
                >
                    <LogOut size={16} /> Logout
                </button>
            </div>
        </div>
    );

    return (
        <div className="flex h-screen bg-slate-50 font-sans overflow-hidden">
            
            {/* Desktop Sidebar (Hidden on mobile) */}
            <aside className="hidden md:flex w-72 flex-col shrink-0 shadow-xl z-20">
                <SidebarContent />
            </aside>

            {/* Mobile Header & Hamburger Menu */}
            <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-slate-900 text-white flex items-center justify-between px-4 z-30 shadow-md">
                <div className="flex items-center gap-2">
                    <Building2 className="text-indigo-400" size={20} />
                    <span className="font-bold text-lg tracking-tight">HR Portal</span>
                </div>
                <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 bg-slate-800 rounded-lg text-slate-300 hover:text-white">
                    {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
            </div>

            {/* Mobile Sidebar Overlay */}
            {isMobileMenuOpen && (
                <div className="md:hidden fixed inset-0 z-40 bg-slate-900/80 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)}>
                    <div className="w-3/4 max-w-sm h-full shadow-2xl" onClick={e => e.stopPropagation()}>
                        <SidebarContent />
                    </div>
                </div>
            )}

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col h-full w-full relative pt-16 md:pt-0 overflow-y-auto">
                <div className="flex-1">
                    {/* The specific page (Attendance, Import, etc.) renders inside this Outlet */}
                    <Outlet /> 
                </div>
            </main>
        </div>
    );
};

export default HRLayout;