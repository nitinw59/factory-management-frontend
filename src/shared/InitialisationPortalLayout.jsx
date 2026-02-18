import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LuLogOut, LuChevronDown, LuLayoutDashboard, LuHammer, LuMenu, LuX, LuBell ,LuFileText} from 'react-icons/lu';
// Assuming notificationApi exists
// import { notificationApi } from '../api/notificationApi';

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
      <button onClick={() => setIsOpen(!isOpen)} className="flex items-center text-sm font-medium text-gray-600 hover:text-blue-600">
        {title} <LuChevronDown className={`ml-1 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>      
      {isOpen && (
        <div className="absolute mt-2 w-56 bg-white rounded-md shadow-lg py-1 z-30" onClick={() => setIsOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
};

const InitializationPortalLayout = () => {
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
                    <div className="text-xl font-bold text-gray-800">Initialization Portal</div>
                    
                    {/* Desktop Navigation */}
                    <nav className="hidden md:flex items-center space-x-6">

                        <NavLink to="/initialization-portal/production-workflow" className={({ isActive }) => `text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}>
                            Workflow Dashboard
                        </NavLink>

                        <NavLink to="/initialization-portal/dashboard" className={({ isActive }) => `flex items-center text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}>
                            <LuLayoutDashboard className="mr-2" /> Initialization Queue
                        </NavLink>
                        <NavLink to="/initialization-portal/alter-pieces" className={({ isActive }) => `flex items-center text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}>
                            <LuHammer className="mr-2" /> Alter Pieces
                        </NavLink>
                        <NavLink to="/initialization-portal/summary" className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md">
                                <LuFileText className="mr-2" /> Batch QC Summary
                        </NavLink>
                        <NavDropdown title="Reports">
                            <NavLink to="/initialization-portal/reports/daily" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Cutting Manager Report</NavLink>
                            {/* Add more report links as needed */}
                        </NavDropdown>
                        <NavDropdown title="Management">
                            <NavLink to="/initialization-portal/management/interlining-rules" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Interlining Rules</NavLink>
                            {/* Add more management links as needed */}
                        </NavDropdown>
                        <NavDropdown title="Settings">
                            <NavLink to="/initialization-portal/settings/profile" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Profile</NavLink>
                            <NavLink to="/initialization-portal/settings/account" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Account</NavLink>
                           <NavLink to="/initialization-portal/settings/notifications" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Notification Preferences</NavLink>

                        </NavDropdown>
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
                            
                            <NavLink to="/initialization-portal/production-workflow" className={({ isActive }) => `text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}>
                                               Workflow Dashboard
                            </NavLink>
                            <NavLink to="/initialization-portal/dashboard" onClick={closeMobileMenu} className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md">
                                <LuLayoutDashboard className="mr-2" /> Initialization Queue
                            </NavLink>
                            <NavLink to="/initialization-portal/alter-pieces" onClick={closeMobileMenu} className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md">
                                <LuHammer className="mr-2" /> Alter Pieces
                            </NavLink>
                            <NavLink to="/numbering-portal/summary" className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md">
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

export default InitializationPortalLayout;
