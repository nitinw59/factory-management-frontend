import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LuLogOut, LuClipboardCheck } from 'react-icons/lu'; // Changed icon

const CheckingPortalLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // The workstation ID would ideally be fetched from the user's session or another source
  // For now, we'll use a placeholder or assume it's retrieved elsewhere.
  const workstationId = user?.workstationId || '1'; // Placeholder

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="bg-white shadow-md sticky top-0 z-20">
        <div className="container mx-auto px-6 py-3 flex justify-between items-center">
          <div className="flex items-center space-x-8">
            <div className="text-xl font-bold text-gray-800">Checking Workstation</div>
            <nav className="hidden md:flex items-center space-x-6">
                {/* Updated NavLink for the checking queue */}
                <NavLink to={`/checking-portal/queue/${workstationId}`} className={({ isActive }) => `flex items-center text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}>
                    <LuClipboardCheck className="inline-block mr-1" />
                    My Checking Queue
                </NavLink>
            </nav>
          </div>
          <div className="flex items-center">
            {user && (
              <>
                <span className="text-sm font-medium mr-4">Welcome, {user.name}</span>
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

export default CheckingPortalLayout;
