
import React, { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { LuChevronDown } from 'react-icons/lu';

// A reusable dropdown component for the admin's internal navigation
const NavDropdown = ({ title, children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef(null);

  // Close dropdown on click outside
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
      <button 
        onClick={() => setIsOpen(!isOpen)} 
        className="flex items-center text-sm font-medium text-gray-600 hover:text-blue-600"
      >
        {title}
        <LuChevronDown className={`ml-1 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div 
          className="absolute mt-2 w-56 bg-white rounded-md shadow-lg py-1 z-30" 
          onClick={() => setIsOpen(false)} // Close dropdown on item click
        >
          {children}
        </div>
      )}
    </div>
  );
};

const AdminPortal = () => {
  return (
    <div>
      {/* This is the ADMIN'S internal sub-navigation bar */}
      <nav className="bg-gray-50 border-b">
        <div className="container mx-auto px-6 py-2 flex items-center space-x-6">
            <NavLink to="/admin/dashboard" className={({ isActive }) => `text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}>Dashboard</NavLink>
            
            <NavDropdown title="User & Supplier Mgmt">
              <NavLink to="/admin/users" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">User Management</NavLink>
              <NavLink to="/admin/suppliers" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Supplier Management</NavLink>
            </NavDropdown>

            <NavDropdown title="Product Catalog">
              <NavLink to="/admin/products" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Products</NavLink>
              <NavLink to="/admin/product-brands" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Brands</NavLink>
              <NavLink to="/admin/product-types" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Types</NavLink>
            </NavDropdown>

            <NavDropdown title="Inventory & Trims">
              <NavLink to="/admin/inventory" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Trims Dashboard</NavLink>
              <NavLink to="/admin/trim-items" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Trim Items</NavLink>
              <NavLink to="/admin/trim-item-variants" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Stock Variants</NavLink>
              <NavLink to="/admin/fabric-colors" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Fabric Colors</NavLink>
              <NavLink to="/admin/fabric-types" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Fabric Types</NavLink>
            </NavDropdown>

             <NavDropdown title="Production">
               <NavLink to="/admin/production-lines" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Lines</NavLink>
               <NavLink to="/admin/production-line-types" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Line Types</NavLink>
            </NavDropdown>

        </div>
      </nav>
      
      {/* The actual page content for the admin portal will be rendered here */}
      <div className="p-6">
        <Outlet />
      </div>
    </div>
  );
};

export default AdminPortal;

