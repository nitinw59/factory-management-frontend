import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { LuLayoutDashboard } from 'react-icons/lu';

const StoreManagerPortal = () => {
  return (
    <div>
      {/* This is the STORE MANAGER'S internal sub-navigation bar. */}
      {/* It is rendered inside the common MainLayout. */}
      <nav className="bg-gray-50 border-b">
        <div className="container mx-auto px-6 py-2 flex items-center space-x-6">
           <NavLink 
              to="/store-manager/dashboard" 
              className={({ isActive }) => `flex items-center text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}
            >
                <LuLayoutDashboard className="mr-1" />
                Inventory Dashboard
            </NavLink>
            {/* More store-manager-specific links can be added here in the future */}
        </div>
      </nav>
      
      {/* The actual page content for the store manager portal (e.g., StoreManagerDashboardPage) will be rendered here. */}
      <div className="p-6">
        <Outlet />
      </div>
    </div>
  );
};

export default StoreManagerPortal;

