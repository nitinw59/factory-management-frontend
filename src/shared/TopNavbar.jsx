import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LuCircleUserRound, LuLogOut, LuChevronDown } from 'react-icons/lu';
import { useAuth } from '../context/AuthContext';

// A reusable dropdown component for the navbar
const NavDropdown = ({ title, children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        setIsOpen(false);
      }
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
        <div className="absolute mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-20" onClick={() => setIsOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
};

const TopNavbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="bg-white shadow-md sticky top-0 z-20">
      <div className="container mx-auto px-6 py-3 flex justify-between items-center">
        <div className="flex items-center space-x-8">
          <NavLink to="/" className="text-xl font-bold text-gray-800">FactoryApp</NavLink>
          <nav className="hidden md:flex items-center space-x-6">
            <NavLink to="/admin/dashboard" className={({ isActive }) => `text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}>Dashboard</NavLink>
            
            <NavDropdown title="Users">
              <NavLink to="/admin/users" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">User Management</NavLink>
              <NavLink to="/admin/suppliers" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Supplier Management</NavLink>
            </NavDropdown>

            <NavDropdown title="Production">
              <NavLink to="/admin/production-lines" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Lines</NavLink>
              <NavLink to="/admin/production-line-types" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Line Types</NavLink>
            </NavDropdown>

            <NavDropdown title="Trims Store">
              <NavLink to="/admin/inventory" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Inventory Dashboard</NavLink>
              <NavLink to="/admin/trim-items" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Item Catalog</NavLink>
              <NavLink to="/admin/trim-item-variants" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Item Variants (Stock)</NavLink>
              <NavLink to="/admin/fabric-colors" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Fabric Colors</NavLink>
              <NavLink to="/admin/fabric-types" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Fabric Types</NavLink>
            </NavDropdown>

            <NavDropdown title="Products">
              <NavLink to="/admin/products" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Products</NavLink>
              <NavLink to="/admin/product-brands" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Brands</NavLink>
              <NavLink to="/admin/product-types" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Types</NavLink>
            </NavDropdown>
            
          </nav>
        </div>
        <div className="flex items-center">
          {user && (
            <>
              <div className="flex items-center space-x-2">
                {user.picture ? <img src={user.picture} alt="User" className="w-8 h-8 rounded-full" /> : <LuCircleUserRound size={24} />}
                <span className="hidden md:inline text-sm font-medium">{user.name}</span>
              </div>
              <button onClick={handleLogout} className="ml-6 flex items-center text-sm text-gray-600 hover:text-red-600">
                <LuLogOut className="mr-1" /> Logout
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default TopNavbar;

