import React, { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import MatrixBrand from './MatrixBrand';
import { LuPackage, LuLogOut, LuChevronDown, LuLayers, LuScissors, LuClipboardList, LuMenu, LuX, LuCalendarClock, LuChartLine, LuBookmark, LuTag, LuScrollText, LuInbox, LuFilePlus, LuBoxes, LuPackageX } from 'react-icons/lu';
import NotificationBell from './NotificationBell';

// No changes to NavDropdown component
const NavDropdown = ({ title, children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [ref]);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setIsOpen(!isOpen)} className="flex items-center text-sm font-medium text-gray-600 hover:text-blue-600">
        {title}
        <LuChevronDown className={`ml-1 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>      
      {isOpen && (
        <div className="absolute mt-2 w-56 bg-white rounded-md shadow-lg py-1 z-30" onClick={() => setIsOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
};


const StoreManagerLayout = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };
    
    // Function to close mobile menu when a link is clicked
    const closeMobileMenu = () => setIsMobileMenuOpen(false);

    return (
        <div className="flex flex-col h-screen bg-gray-50">
            <header className="bg-white shadow-md sticky top-0 z-20">
                <div className="container mx-auto px-6 py-3 flex justify-between items-center">
                    <div className="flex items-center space-x-8">
                        <MatrixBrand portal="Store Portal" />
                        {/* This is the original desktop navigation */}
                        <nav className="hidden md:flex items-center space-x-6">
                            <NavLink to="/store-manager/fabric-rolls" className="flex items-center text-sm font-medium text-gray-600 hover:text-blue-600">
                                <LuLayers className="mr-1" /> Fabric
                            </NavLink>
                             <NavDropdown title="Trims">
                                <NavLink to="/store-manager/trim-management" className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                    <LuScissors className="mr-2" /> Trim Management
                                </NavLink>
                                <NavLink to="/store-manager/trim-orders" className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                    <LuClipboardList className="mr-2" /> Trim Orders
                                </NavLink>
                                <NavLink to="/store-manager/trim-reservations" className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                    <LuBookmark className="mr-2" /> My Reservations
                                </NavLink>
                                <NavLink to="/store-manager/supplier-color-codes" className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                    <LuTag className="mr-2" /> Supplier Codes
                                </NavLink>
                                <NavLink to="/store-manager/trim-stock-ledger" className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                    <LuScrollText className="mr-2" /> Stock Ledger
                                </NavLink>
                                <NavLink to="/trim-loss" className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                    <LuPackageX className="mr-2" /> Trim Loss
                                </NavLink>
                            </NavDropdown>
                            



                            <NavDropdown title="Requests">
                                <NavLink to="/store-manager/general-items" className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                    <LuBoxes className="mr-2" /> General Items
                                </NavLink>
                                <NavLink to="/store-manager/raise-requirement" className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                    <LuFilePlus className="mr-2" /> Raise Request
                                </NavLink>
                            </NavDropdown>

                            <NavDropdown title="Spares">
                                <NavLink to="/store-manager/spare-parts" className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                    <LuPackage className="mr-2" /> Spare Inventory
                                </NavLink>
                                <NavLink to="/store-manager/spare-parts-issuance" className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                    <LuPackage className="mr-2" /> Spare Billing
                                </NavLink>
                                <NavLink to="/store-manager/spares-analytics" className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                    <LuChartLine className="mr-2" /> Spares Analytics
                                </NavLink>
                            </NavDropdown>

                            <NavDropdown title="Purchase">
                                <NavLink to="/store-manager/orders" className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                    <LuClipboardList className="mr-2" /> Orders
                                </NavLink>
                                <NavLink to="/store-manager/inwards" className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                    <LuInbox className="mr-2" /> Inwards
                                </NavLink>
                            </NavDropdown>

                            <NavLink to="/store-manager/planning" className="flex items-center text-sm font-medium text-gray-600 hover:text-blue-600">
                                <LuCalendarClock className="mr-1" /> Production Planning
                            </NavLink>
                        </nav>
                    </div>
                    <div className="flex items-center space-x-4">
                        <NotificationBell />
                        {user && (
                            // Hide user name on smaller screens to save space
                            <div className="hidden md:flex items-center space-x-4">
                                <span className="text-sm font-medium">Welcome, {user.name}</span>
                                <button onClick={handleLogout} className="flex items-center text-sm text-gray-600 hover:text-red-600"><LuLogOut className="mr-1" /> Logout</button>
                            </div>
                        )}
                        {/* 2. HAMBURGER BUTTON - visible only on mobile (md:hidden) */}
                        <div className="md:hidden">
                            <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
                                {isMobileMenuOpen ? <LuX size={24} /> : <LuMenu size={24} />}
                            </button>
                        </div>
                    </div>
                </div>

                {/* 3. MOBILE MENU - Conditionally rendered */}
                {isMobileMenuOpen && (
                    <div className="md:hidden bg-white shadow-md">
                        <nav className="flex flex-col p-4 space-y-4">
                            <NavLink to="/store-manager/fabric-rolls" onClick={closeMobileMenu} className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md">
                                <LuLayers className="mr-2" /> Fabric
                            </NavLink>
                            <NavLink to="/store-manager/trim-management" onClick={closeMobileMenu} className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md">
                                <LuScissors className="mr-2" /> Trim Management
                            </NavLink>
                            <NavLink to="/store-manager/trim-orders" onClick={closeMobileMenu} className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md">
                                <LuClipboardList className="mr-2" /> Trim Orders
                            </NavLink>
                            <NavLink to="/store-manager/trim-reservations" onClick={closeMobileMenu} className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md">
                                <LuBookmark className="mr-2" /> My Reservations
                            </NavLink>
                            <NavLink to="/store-manager/supplier-color-codes" onClick={closeMobileMenu} className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md">
                                <LuTag className="mr-2" /> Supplier Codes
                            </NavLink>
                            <NavLink to="/store-manager/trim-stock-ledger" onClick={closeMobileMenu} className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md">
                                <LuScrollText className="mr-2" /> Stock Ledger
                            </NavLink>
                            <NavLink to="/trim-loss" onClick={closeMobileMenu} className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md">
                                <LuPackageX className="mr-2" /> Trim Loss
                            </NavLink>
                            <div className="px-4 pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">Requests</div>
                            <NavLink to="/store-manager/general-items" onClick={closeMobileMenu} className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md">
                                <LuBoxes className="mr-2" /> General Items
                            </NavLink>
                            <NavLink to="/store-manager/raise-requirement" onClick={closeMobileMenu} className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md">
                                <LuFilePlus className="mr-2" /> Raise Request
                            </NavLink>
                            <div className="px-4 pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">Spares</div>
                            <NavLink to="/store-manager/spare-parts" onClick={closeMobileMenu} className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md">
                                <LuPackage className="mr-2" /> Spare Parts
                            </NavLink>
                            <NavLink to="/store-manager/spares-analytics" onClick={closeMobileMenu} className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md">
                                <LuChartLine className="mr-2" /> Spares Analytics
                            </NavLink>
                            <div className="px-4 pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">Purchase</div>
                            <NavLink to="/store-manager/orders" onClick={closeMobileMenu} className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md">
                                <LuClipboardList className="mr-2" /> Orders
                            </NavLink>
                            <NavLink to="/store-manager/inwards" onClick={closeMobileMenu} className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md">
                                <LuInbox className="mr-2" /> Inwards
                            </NavLink>
                            <NavLink to="/store-manager/planning" onClick={closeMobileMenu} className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md">
                                <LuCalendarClock className="mr-2" /> Production Planning
                            </NavLink>

                            <hr />
                            {/* Logout button for mobile menu */}
                             {user && (
                                <>
                                    <div className="px-4 py-2 text-sm text-gray-500">Welcome, {user.name}</div>
                                    <button onClick={handleLogout} className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md"><LuLogOut className="mr-2" /> Logout</button>
                                </>
                            )}
                        </nav>
                    </div>
                )}
            </header>
            <main className="flex-1 p-6 overflow-y-auto">
                <Outlet />
            </main>
        </div>
    );
};

export default StoreManagerLayout;