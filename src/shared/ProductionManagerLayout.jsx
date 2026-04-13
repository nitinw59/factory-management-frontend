import React, { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
// Added LuSettings to the import
import { LuCircleUserRound, LuLogOut, LuChevronDown, LuPencil, LuSettings } from 'react-icons/lu';

// A reusable dropdown component for the navbar
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
        {title}
        <LuChevronDown className={`ml-1 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="absolute mt-2 w-56 bg-white rounded-md shadow-lg py-1 z-30" onClick={() => setIsOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
};


const ProductionManagerLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="bg-white shadow-md sticky top-0 z-20">
        <div className="container mx-auto px-6 py-3 flex justify-between items-center">
          <div className="flex items-center space-x-8">
            <div className="text-xl font-bold text-gray-800">Production Portal</div>
            <nav className="hidden md:flex items-center space-x-6">

                <NavDropdown title="Workflow">
                  <NavLink to="/production-manager/production-workflow" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Workflow Dashboard</NavLink>
                  <NavLink to="/production-manager/dashboard" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Batches</NavLink>
                  {/* <NavLink to="/production-manager/capacity-dashboard" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Capacity Dashboard</NavLink> */}
                  <NavLink to="/production-manager/production-targets" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Targets</NavLink>
                  <NavLink to="/production-manager/scorecard" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Scorecard</NavLink>
                </NavDropdown>

                <NavDropdown title="Products">
                  <NavLink to="/production-manager/products" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Products</NavLink>
                  <NavLink to="/production-manager/product-brands" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Brands</NavLink>
                  <NavLink to="/production-manager/product-types" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Style</NavLink>
                </NavDropdown>

                <NavDropdown title="Floor">
                  <NavLink to="/production-manager/production-lines" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Lines</NavLink>
                  <NavLink to="/production-manager/production-line-types" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Line Types</NavLink>
                  <NavLink to="/production-manager/workstation-management" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Workstations</NavLink>
                  <NavLink to="/production-manager/factory-layout-planner" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Factory Layout</NavLink>
                </NavDropdown>

                <NavDropdown title="Maintenance">
                  <NavLink to="/production-manager/maintenance-dashboard" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Maintenance Dashboard</NavLink>
                  <NavLink to="/production-manager/maintenance-schedule" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Maintenance Schedule</NavLink>
                  <NavLink to="/production-manager/maintenance-logs" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Maintenance Logs</NavLink>
                  <NavLink to="/production-manager/asset-management" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Asset Management</NavLink>
                  <NavLink to="/maintenance/sewing-machine-complaints" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Sewing Machine Complaints</NavLink>
                </NavDropdown>

                <NavDropdown title="Quality">
                  <NavLink to="/production-manager/qc-analytics" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">QC Analytics</NavLink>
                  <NavLink to="/production-manager/defect-code-line-types" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Defect Codes</NavLink>
                </NavDropdown>

                <NavDropdown title="Reports">
                  <NavLink to="/production-manager/reports/daily-costing" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Daily Costing Report</NavLink>
                  <NavLink to="/production-manager/reports/production-analytics" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Production Analytics</NavLink>
                </NavDropdown>

                <NavLink to="/production-manager/settings" className={({ isActive }) => `text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}>
                  Settings
                </NavLink>

            </nav>
          </div>
          
          <div className="flex items-center space-x-6">
            {user && (
              <>
                <span className="text-sm font-medium text-gray-700">Welcome, {user.name}</span>
                
                {/* NEW: Settings Link */}
                <NavLink 
                  to="/production-manager/settings" 
                  className={({ isActive }) => `flex items-center text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}
                >
                  <LuSettings className="mr-1.5" />
                  Settings
                </NavLink>

                <button onClick={handleLogout} className="flex items-center text-sm font-medium text-gray-600 hover:text-red-600 transition-colors">
                  <LuLogOut className="mr-1.5" />
                  Logout
                </button>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1 p-6 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
};

export default ProductionManagerLayout;