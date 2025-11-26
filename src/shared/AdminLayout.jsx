import React, { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LuCircleUserRound, LuLogOut, LuChevronDown, LuMenu, LuX } from 'react-icons/lu';

// --- DESKTOP DROPDOWN (Popover style) ---
const DesktopNavDropdown = ({ title, children }) => {
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
      <button onClick={() => setIsOpen(!isOpen)} className="flex items-center text-sm font-medium text-gray-600 hover:text-blue-600 focus:outline-none">
        {title}
        <LuChevronDown className={`ml-1 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="absolute mt-2 w-56 bg-white rounded-md shadow-lg py-1 z-30 border border-gray-100" onClick={() => setIsOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
};

// --- MOBILE DROPDOWN (Accordion style) ---
const MobileNavDropdown = ({ title, children }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-l-2 border-gray-100 ml-2 pl-2">
      <button 
        onClick={() => setIsOpen(!isOpen)} 
        className="flex w-full items-center justify-between py-2 text-base font-medium text-gray-700"
      >
        {title}
        <LuChevronDown className={`ml-1 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {/* Smooth expansion logic */}
      <div className={`${isOpen ? 'block' : 'hidden'} flex flex-col space-y-1 pb-2`}>
        {children}
      </div>
    </div>
  );
};

// --- MAIN LAYOUT ---
const AdminLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Helper to close menu when a link is clicked
  const closeMenu = () => setIsMobileMenuOpen(false);

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-md sticky top-0 z-20">
        <div className="container mx-auto px-4 sm:px-6 py-3">
          <div className="flex justify-between items-center">
            
            {/* Left Side: Logo & Desktop Nav */}
            <div className="flex items-center space-x-8">
              <NavLink to="/admin/dashboard" className="text-xl font-bold text-gray-800" onClick={closeMenu}>
                Admin Portal
              </NavLink>
              
              {/* Desktop Navigation (Hidden on Mobile) */}
              <nav className="hidden md:flex items-center space-x-6">
                <NavLink to="/admin/dashboard" className={({ isActive }) => `text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}>
                  Dashboard
                </NavLink>
                
                <DesktopNavDropdown title="User & Supplier">
                  <NavLink to="/admin/users" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">User Management</NavLink>
                  <NavLink to="/admin/suppliers" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Supplier Management</NavLink>
                </DesktopNavDropdown>
                
                <DesktopNavDropdown title="Inventory">
                   <NavLink to="/admin/trim-management" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Trims Dashboard</NavLink>
                   <NavLink to="/admin/trim-items" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Trim Items</NavLink>
                   <NavLink to="/admin/fabric-types" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Fabric Types</NavLink>
                   <NavLink to="/admin/fabric-colors" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Fabric Colors</NavLink>
                </DesktopNavDropdown>
                
                <DesktopNavDropdown title="Portals">
                   <NavLink to="/admin/workstation-types" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Workstation Types</NavLink>
                   <NavLink to="/admin/portal-management" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Portals</NavLink>
                </DesktopNavDropdown>

                <NavLink to="/admin/asset-management" className={({ isActive }) => `text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}>
                  Asset Management
                </NavLink>  
              </nav>
            </div>

            {/* Right Side: User Info & Mobile Toggle */}
            <div className="flex items-center gap-4">
              {/* User Profile (Visible on both, compressed on mobile) */}
              {user && (
                <div className="flex items-center space-x-2">
                  {user.picture ? (
                    <img src={user.picture} alt="User" className="w-8 h-8 rounded-full" />
                  ) : (
                    <LuCircleUserRound size={24} className="text-gray-600" />
                  )}
                  <span className="hidden lg:inline text-sm font-medium text-gray-700">{user.name}</span>
                </div>
              )}

              {/* Desktop Logout Button */}
              <button onClick={handleLogout} className="hidden md:flex items-center text-sm text-gray-600 hover:text-red-600">
                <LuLogOut className="mr-1" /> Logout
              </button>

              {/* Mobile Hamburger Button */}
              <button 
                className="md:hidden p-2 text-gray-600 focus:outline-none" 
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              >
                {isMobileMenuOpen ? <LuX size={24} /> : <LuMenu size={24} />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu (Collapsible) */}
        {isMobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-gray-200 shadow-inner">
            <nav className="flex flex-col p-4 space-y-2 max-h-[80vh] overflow-y-auto">
              
              <NavLink to="/admin/dashboard" onClick={closeMenu} className={({ isActive }) => `block py-2 text-base font-medium ${isActive ? 'text-blue-600' : 'text-gray-700'}`}>
                Dashboard
              </NavLink>

              <MobileNavDropdown title="User & Supplier">
                <NavLink to="/admin/users" onClick={closeMenu} className="block py-2 text-sm text-gray-600 hover:text-blue-600">User Management</NavLink>
                <NavLink to="/admin/suppliers" onClick={closeMenu} className="block py-2 text-sm text-gray-600 hover:text-blue-600">Supplier Management</NavLink>
              </MobileNavDropdown>

              <MobileNavDropdown title="Inventory">
                <NavLink to="/admin/trim-management" onClick={closeMenu} className="block py-2 text-sm text-gray-600 hover:text-blue-600">Trims Dashboard</NavLink>
                <NavLink to="/admin/trim-items" onClick={closeMenu} className="block py-2 text-sm text-gray-600 hover:text-blue-600">Manage Trim Items</NavLink>
                <NavLink to="/admin/fabric-types" onClick={closeMenu} className="block py-2 text-sm text-gray-600 hover:text-blue-600">Manage Fabric Types</NavLink>
                <NavLink to="/admin/fabric-colors" onClick={closeMenu} className="block py-2 text-sm text-gray-600 hover:text-blue-600">Manage Fabric Colors</NavLink>
              </MobileNavDropdown>

              <MobileNavDropdown title="Portals">
                <NavLink to="/admin/workstation-types" onClick={closeMenu} className="block py-2 text-sm text-gray-600 hover:text-blue-600">Workstation Types</NavLink>
                <NavLink to="/admin/portal-management" onClick={closeMenu} className="block py-2 text-sm text-gray-600 hover:text-blue-600">Manage Portals</NavLink>
              </MobileNavDropdown>

              <NavLink to="/admin/asset-management" onClick={closeMenu} className={({ isActive }) => `block py-2 text-base font-medium ${isActive ? 'text-blue-600' : 'text-gray-700'}`}>
                Asset Management
              </NavLink>

              <div className="border-t border-gray-200 pt-4 mt-2">
                <div className="flex items-center mb-3">
                  <span className="text-sm text-gray-500">Signed in as <span className="font-bold">{user?.name}</span></span>
                </div>
                <button onClick={() => { closeMenu(); handleLogout(); }} className="flex w-full items-center py-2 text-base font-medium text-red-600 hover:bg-red-50 rounded">
                  <LuLogOut className="mr-2" /> Logout
                </button>
              </div>

            </nav>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 sm:p-6 overflow-y-auto w-full">
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;