import React from 'react';
import { Outlet } from 'react-router-dom';
import TopNavbar from './TopNavbar'; // The new, common top navbar

const MainLayout = () => {
  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* This top navbar will be shared by all portals */}
      <TopNavbar />
      
      {/* The <Outlet> is the placeholder where the specific portal's
          entire UI (including its own internal navigation) will be rendered. */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
};

export default MainLayout;
