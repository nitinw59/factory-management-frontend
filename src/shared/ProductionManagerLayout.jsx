import React, { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LuCircleUserRound, LuLogOut, LuChevronDown, LuPencil } from 'react-icons/lu';


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


                <NavDropdown title="WORKFLOW">
                  <NavLink to="/production-manager/production-workflow" className={({ isActive }) => `text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}>
                   Workflow Dashboard
                </NavLink>
                  <NavLink to="/production-manager/dashboard" className={({ isActive }) => `text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}>
                   Batches
                </NavLink>
                </NavDropdown>
                <NavDropdown title="Products">
                                <NavLink to="/production-manager/products" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Products</NavLink>
                                {/* <NavLink to="/production-manager/product-piece-parts" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Piece Parts</NavLink> */}
                                <NavLink to="/production-manager/product-brands" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Brands</NavLink>
                                <NavLink to="/production-manager/product-types" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Style</NavLink>
                </NavDropdown>
                {/* <NavDropdown title="Line Management">
                    <NavLink to="/production-manager/production-lines" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Lines</NavLink>
                    <NavLink to="/production-manager/production-line-types" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Line Types</NavLink>
                    <NavLink to="/production-manager/workstations" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Workstations</NavLink>
                    <NavLink to="/production-manager/workstation-types" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Workstation Types</NavLink>
                </NavDropdown> */}
                <NavDropdown title="Floor Management">
                    <NavLink to="/production-manager/production-lines" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Lines</NavLink>
                    <NavLink to="/production-manager/production-line-types" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Line Types</NavLink>
                    <NavLink to="/production-manager/workstation-management" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Workstations</NavLink>
                    <NavLink to="/production-manager/factory-layout-planner" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Factory Layout</NavLink>
                </NavDropdown>
                 
            </nav>
          </div>
          <div className="flex items-center">
            {user && (
              <>
                <span className="text-sm font-medium mr-4">Welcome, {user.name}</span>
                <button onClick={handleLogout} className="flex items-center text-sm text-gray-600 hover:text-red-600">
                  <LuLogOut className="mr-1" />
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

