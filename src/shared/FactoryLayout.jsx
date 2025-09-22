import React from 'react';
import { Outlet } from 'react-router-dom';
import TopNavbar from './TopNavbar';

const FactoryLayout = () => {
  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* The TopNavbar will be present on all pages within this layout */}
      <TopNavbar />
      
      {/* The <Outlet> is the placeholder where your actual page components will be rendered */}
      <main className="flex-1 p-6 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
};

export default FactoryLayout;

