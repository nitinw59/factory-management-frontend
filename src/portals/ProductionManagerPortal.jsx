import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { LuPencil } from 'react-icons/lu';

const ProductionManagerPortal = () => {
  return (
    <div>
      {/* This is the PRODUCTION MANAGER'S internal sub-navigation bar. */}
      <nav className="bg-gray-50 border-b">
        <div className="container mx-auto px-6 py-2 flex items-center space-x-6">
           <NavLink 
              to="/production-manager/dashboard" 
              className={({ isActive }) => `flex items-center text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}
            >
                <LuPencil className="mr-1" />
                Production Planning
            </NavLink>
            {/* More production-manager-specific links can be added here in the future */}
        </div>
      </nav>
      
      {/* The page content for the production manager portal will be rendered here. */}
      <div className="p-6">
        <Outlet />
      </div>
    </div>
  );
};

export default ProductionManagerPortal;
