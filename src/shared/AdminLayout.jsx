import React from 'react';
import { Outlet } from 'react-router-dom';
import TopNavbar from './TopNavbar'; // The full admin navbar

const AdminLayout = () => {
  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <TopNavbar />
      <main className="flex-1 p-6 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;
