import React from 'react';
import { Outlet } from 'react-router-dom';
import TopNavbar from './TopNavbar'; // The new, common top navbar

const MainLayout = () => {
  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* The common top navbar is rendered here */}
      <TopNavbar />
      
      {/* The <Outlet> is the placeholder where your role-specific portals
          (like AdminPortal or StoreManagerPortal) will be rendered. */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
};

export default MainLayout;

