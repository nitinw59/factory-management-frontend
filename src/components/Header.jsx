import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const Header = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login'); // Navigate to login page after logout
  };

  return (
    <header className="bg-white shadow-md p-4 mb-6">
      <div className="container mx-auto flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Admin Dashboard</h1>
        <button
          onClick={handleLogout}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
        >
          Logout
        </button>
      </div>
    </header>
  );
};

export default Header;