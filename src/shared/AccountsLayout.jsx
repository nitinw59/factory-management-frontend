// src/shared/AccountsLayout.jsx
import React from 'react';
import { Outlet, Link } from 'react-router-dom';
// Import your TopBar or Sidebar components here if you have them
// import Sidebar from './Sidebar'; 

const AccountsLayout = () => {
  return (
    <div className="flex h-screen bg-gray-100">
      {/* Temporary Sidebar for navigation */}
      <aside className="w-64 bg-white shadow-md hidden md:block">
        <div className="p-4 font-bold text-lg text-blue-600">Accounting</div>
        <nav className="mt-4 px-2 space-y-2">
            <Link to="/accounts/sales/orders" className="block px-4 py-2 rounded hover:bg-blue-50 text-gray-700">All Sales Orders</Link>
            <Link to="/accounts/sales/new" className="block px-4 py-2 rounded hover:bg-blue-50 text-gray-700">Create Order</Link>
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto p-8">
        <Outlet />
      </main>
    </div>
  );
};

export default AccountsLayout;