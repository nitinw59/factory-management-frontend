import React from 'react';
import { Link, useNavigate } from 'react-router-dom'; 
import { useAuth } from '../context/AuthContext'; // 1. Import useAuth
import { LuFileText, LuUser, LuX, LuBriefcase, LuTruck, LuSettings, LuShieldCheck, LuLogOut, LuReceipt, LuLayoutDashboard } from 'react-icons/lu'; // 2. Import new icons

const Sidebar = ({ isOpen, onClose }) => {
  const { logout } = useAuth(); // 3. Get the logout function
  const navigate = useNavigate();

  const handleLogout = () => {
    onClose(); // Close the sidebar on mobile
    logout();
    navigate('/login'); // Navigate to login page after logout
  };



  return (
    <>
      {isOpen && <div onClick={onClose} className="md:hidden fixed inset-0 bg-black opacity-50 z-30"></div>}
      <aside className={`fixed top-0 left-0 h-full w-64 bg-gray-800 text-white shadow-xl flex flex-col z-40 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0`}>
        <div className="p-4 flex items-center justify-between border-b border-gray-700">
          <h2 className="text-xl font-bold">Job-Work App</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white md:hidden"><LuX /></button>
        </div>
        <nav className="p-4 flex-1">
          <h3 className="text-sm font-semibold uppercase text-gray-400 tracking-wider mb-2">Modules</h3>
          <ul className="space-y-2">
            <li>
              <Link to="/production-line-dashboard" className="flex items-center ...">
                <LuLayoutDashboard className="mr-3" /> Production Dashboard
              </Link>
            </li>
            <li>
              <Link to="/analytics" className="flex items-center ...">
                <LuLayoutDashboard className="mr-3" /> Analytics Dashboard
              </Link>
            </li>
            <li>
              <Link to="/users" onClick={onClose} className="flex items-center px-4 py-2 my-1 text-gray-100 hover:bg-gray-700 rounded-lg">
                <LuUser className="mr-3" /> User Management
              </Link>
            </li>
            <li>
              <Link to="/jobbers" onClick={onClose} className="flex items-center px-4 py-2 my-1 text-gray-100 hover:bg-gray-700 rounded-lg">
                <LuBriefcase className="mr-3" /> Jobber Management
              </Link>
            </li>
            <li>
              <Link to="/suppliers" onClick={onClose} className="flex items-center px-4 py-2 my-1 text-gray-100 hover:bg-gray-700 rounded-lg">
                <LuTruck className="mr-3" /> Supplier Management
              </Link>
            </li>
            {/* 2. Add the new link to the Settings page */}
            <li>
              <Link to="/settings" onClick={onClose} className="flex items-center px-4 py-2 my-1 text-gray-100 hover:bg-gray-700 rounded-lg">
                <LuSettings className="mr-3" /> Settings
              </Link>
            </li>

            <li>
              <Link to="/admins" onClick={onClose} className="flex items-center px-4 py-2 my-1 text-gray-100 hover:bg-gray-700 rounded-lg">
                <LuSettings className="mr-3" /> ADMINS
              </Link>
            </li>
          

          <li>
            <Link to="/purchase-orders" onClick={onClose} className="flex items-center ...">
              <LuFileText className="mr-3" /> Purchase Orders
            </Link>
          </li>
        <li>
          <Link to="/bills" onClick={onClose} className="flex items-center ...">
            <LuReceipt className="mr-3" /> Bill Management
          </Link>
        </li>
        </ul>


        <div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center px-4 py-2 my-1 text-gray-100 bg-red-600/20 hover:bg-red-600/40 rounded-lg">
              <LuLogOut className="mr-3" /> Logout
            </button>
          </div>


        </nav>
      </aside>
    </>
  );
};

export default Sidebar;