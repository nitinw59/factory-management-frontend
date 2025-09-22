import React from 'react';
import { LuMenu } from 'react-icons/lu'; // Hamburger menu icon

const Header = ({ toggleSidebar }) => {
  return (
    <header className="bg-white shadow-sm p-4 sticky top-0 z-10">
      <div className="flex items-center">
        {/* Hamburger Menu Button - Only shows on small (mobile) screens */}
        <button
          onClick={toggleSidebar}
          className="text-gray-600 focus:outline-none md:hidden"
          aria-label="Open sidebar"
        >
          <LuMenu size={24} />
        </button>

        {/* You can make this title dynamic later if you wish */}
        <h1 className="text-xl font-semibold ml-4 md:ml-0">
          Admin Dashboard
        </h1>
      </div>
    </header>
  );
};

export default Header;

