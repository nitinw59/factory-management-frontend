import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LuLogOut, LuChevronDown, LuLayers, LuScissors, LuArchive, LuBell, LuCircle, LuClipboardList } from 'react-icons/lu';
import { notificationApi } from '../api/notificationApi';

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
    const [notifications, setNotifications] = useState([]);

    const fetchNotifications = useCallback(async () => {
        try {
            const response = await notificationApi.getUnread();
            setNotifications(response.data);
        } catch (error) {
            console.error("Failed to fetch notifications", error);
        }
    }, []);
    
    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 60000);
        return () => clearInterval(interval);
    }, [fetchNotifications]);

    const handleNotificationClick = async (notificationId) => {
        try {
            await notificationApi.markAsRead(notificationId);
            setNotifications(prev => prev.filter(n => n.id !== notificationId));
        } catch (error) {
            console.error("Failed to mark notification as read", error);
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <div className="flex flex-col h-screen bg-gray-50">
            <header className="bg-white shadow-md sticky top-0 z-20">
                <div className="container mx-auto px-6 py-3 flex justify-between items-center">
                    <div className="flex items-center space-x-8">
                        <div className="text-xl font-bold text-gray-800">Store Portal</div>
                        <nav className="hidden md:flex items-center space-x-6">
                            <NavDropdown title="Fabric">
                                <NavLink to="/store-manager/fabric-stock" className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                    <LuLayers className="mr-2" /> Fabric Intake & Stock
                                </NavLink>
                            </NavDropdown>
                             <NavDropdown title="Trims">
                                <NavLink to="/store-manager/trim-management" className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                    <LuScissors className="mr-2" /> Trim Management
                                </NavLink>
                            </NavDropdown>
                             <NavDropdown title="Store">
                                <NavLink to="/store-manager/record-trim-purchase" className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                    <LuCircle className="mr-2" /> Record Trim Purchase
                                </NavLink>
                                 <NavLink to="/store-manager/trim-orders" className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                    <LuClipboardList className="mr-2" /> Trim Orders
                                </NavLink>
                            </NavDropdown>
                        </nav>
                    </div>
                    <div className="flex items-center space-x-4">
                        <NavDropdown title={
                            <div className="relative">
                                <LuBell size={20} />
                                {notifications.length > 0 && (
                                <span className="absolute -top-1 -right-1 flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span></span>
                                )}
                            </div>
                        }>
                            <div className="w-80">
                                <div className="font-bold p-2 border-b">Notifications</div>
                                {notifications.length > 0 ? (
                                notifications.map(n => (
                                    <NavLink key={n.id} to={n.link_to} onClick={() => handleNotificationClick(n.id)} className="block p-3 text-sm text-gray-700 hover:bg-gray-100 border-b">
                                        {n.message}
                                        <div className="text-xs text-gray-400 mt-1">{new Date(n.created_at).toLocaleString()}</div>
                                    </NavLink>
                                ))
                                ) : (
                                <div className="p-4 text-sm text-center text-gray-500">No new notifications</div>
                                )}
                            </div>
                        </NavDropdown>
                        {user && (
                            <>
                                <span className="text-sm font-medium">Welcome, {user.name}</span>
                                <button onClick={handleLogout} className="flex items-center text-sm text-gray-600 hover:text-red-600"><LuLogOut className="mr-1" /> Logout</button>
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

export default StoreManagerLayout;
