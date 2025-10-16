import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LuLogOut, LuClipboardCheck } from 'react-icons/lu';

const PreparationPortalLayout = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="bg-white shadow-md">
        <div className="container mx-auto px-6 py-3 flex justify-between items-center">
          <div className="flex items-center space-x-8">
            <div className="text-xl font-bold text-gray-800">Preparation Portal</div>
            <nav>
              <NavLink to="/preparation-portal/dashboard" className={({ isActive }) => `flex items-center text-sm font-medium ${isActive ? 'text-purple-600' : 'text-gray-600 hover:text-purple-600'}`}>  
                <LuClipboardCheck className="mr-1" />
                My Queue
              </NavLink>
            </nav>
          </div>
          <button onClick={handleLogout} className="flex items-center text-sm text-gray-600 hover:text-red-600">
            <LuLogOut className="mr-1" />
            Logout
          </button>
        </div>
      </header>
      <main className="flex-1 p-6 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
};

export default PreparationPortalLayout;
