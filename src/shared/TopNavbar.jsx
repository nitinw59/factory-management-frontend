import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LuCircleUserRound, LuLogOut } from 'react-icons/lu';

// This is the new, "dumber" top navbar. Its only jobs are to display the
// portal title, the user's profile, and the logout button.
const TopNavbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };
  
  // This helper function dynamically changes the title based on the user's role.
  const getPortalTitle = () => {
      if(!user) return "Factory App";
      switch(user.role) {
          case 'factory_admin': return "Admin Portal";
          case 'store_manager': return "Store Manager Portal";
          case 'production_manager': return "Production Portal";
          default: return "Factory App";
      }
  }

  return (
    <header className="bg-white shadow-md sticky top-0 z-20">
      <div className="container mx-auto px-6 py-3 flex justify-between items-center">
        {/* The title now dynamically updates based on the user's role */}
        <NavLink to="/" className="text-xl font-bold text-gray-800">
          {getPortalTitle()}
        </NavLink>
        
        {/* User Profile and Logout section remains the same */}
        <div className="flex items-center">
          {user && (
            <>
              <div className="flex items-center space-x-2">
                {user.picture ? <img src={user.picture} alt="User" className="w-8 h-8 rounded-full" /> : <LuCircleUserRound size={24} />}
                <span className="hidden md:inline text-sm font-medium">{user.name}</span>
              </div>
              <button onClick={handleLogout} className="ml-6 flex items-center text-sm text-gray-600 hover:text-red-600">
                <LuLogOut className="mr-1" /> Logout
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default TopNavbar;

