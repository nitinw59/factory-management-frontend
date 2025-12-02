import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LuLogOut } from 'react-icons/lu';

const LineLoaderLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="bg-white shadow-md sticky top-0 z-20">
        <div className="container mx-auto px-6 py-3 flex justify-between items-center">
          <div className="flex items-center space-x-8">
            <div className="text-xl font-bold text-gray-800">Line Loader Portal</div>
            <nav className="hidden md:flex items-center space-x-6">
              <NavLink to="/line-loader/dashboard" className={({ isActive }) => `text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}>
                Dashboard
              </NavLink>
              
              <NavLink to="/line-loader/sewing-machine-complaints" className={({ isActive }) => `text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}>
                Sewing Machine Complaints
              </NavLink>
              
            </nav>
          </div>
          <div className="flex items-center">
            {user && (
              <>
                <span className="text-sm font-medium mr-4">Welcome, {console.log(user)}</span>
                <button onClick={handleLogout} className="flex items-center text-sm text-gray-600 hover:text-red-600">
                  <LuLogOut className="mr-1" />
                  Logout
                </button>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1 p-6 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
};

export default LineLoaderLayout;
