import { useState, useEffect, useRef } from 'react';
import MatrixBrand from './MatrixBrand';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LuCircleUserRound, LuLogOut, LuChevronDown, LuMenu, LuX,
  LuSettings, LuBuilding2, LuChartLine, LuPackage, LuArrowUpRight,
} from 'react-icons/lu';
import NotificationBell from './NotificationBell';

// --- DESKTOP DROPDOWN ---
const DesktopNavDropdown = ({ title, children, matchPaths = [] }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef(null);
  const { pathname } = useLocation();

  const isChildActive = matchPaths.some(p => pathname.startsWith(p));

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center text-sm font-medium rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${
          isChildActive ? 'text-blue-600 font-semibold' : 'text-gray-600 hover:text-blue-600'
        }`}
      >
        {title}
        <LuChevronDown className={`ml-1 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div
          className="absolute mt-2 w-64 bg-white rounded-md shadow-lg py-1 z-30 border border-gray-100 animate-in fade-in-0 zoom-in-95 duration-100"
          onClick={() => setIsOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
};

// --- MOBILE DROPDOWN ---
const MobileNavDropdown = ({ title, children }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-l-2 border-gray-100 ml-2 pl-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between py-2 text-base font-medium text-gray-700"
      >
        {title}
        <LuChevronDown className={`ml-1 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      <div className={`overflow-hidden transition-all duration-200 ${isOpen ? 'max-h-96' : 'max-h-0'}`}>
        <div className="flex flex-col space-y-1 pb-2">
          {children}
        </div>
      </div>
    </div>
  );
};

// --- MAIN LAYOUT ---
const AdminLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); };
  const closeMenu = () => setIsMobileMenuOpen(false);

  return (
    <div className="flex flex-col h-screen bg-gray-50">

      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-20">
        <div className="container mx-auto px-4 sm:px-6 py-3">
          <div className="flex justify-between items-center">

            {/* Left: logo + desktop nav */}
            <div className="flex items-center space-x-8">
              <NavLink to="/admin/dashboard" onClick={closeMenu}>
                <MatrixBrand portal="Admin Portal" />
              </NavLink>

              <nav className="hidden md:flex items-center space-x-6">

                <NavLink to="/admin/dashboard" className={({ isActive }) =>
                  `text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}>
                  Dashboard
                </NavLink>

                <DesktopNavDropdown
                  title="User & Supplier"
                  matchPaths={['/admin/users', '/admin/suppliers', '/admin/customers']}
                >
                  <NavLink to="/admin/users"      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">User Management</NavLink>
                  <NavLink to="/admin/suppliers"  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Supplier Management</NavLink>
                  <NavLink to="/admin/customers"  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Customer Management</NavLink>
                </DesktopNavDropdown>

                <DesktopNavDropdown
                  title="Inventory"
                  matchPaths={['/admin/trim-management', '/admin/trim-items', '/admin/trim-clusters', '/admin/fabric-types', '/admin/fabric-colors', '/admin/sizes', '/admin/general-items']}
                >
                  <NavLink to="/admin/trim-management" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Trims Dashboard</NavLink>
                  <NavLink to="/admin/trim-items"      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Trim Items</NavLink>
                  <NavLink to="/admin/trim-clusters"   className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Trim Substitute Clusters</NavLink>
                  <NavLink to="/admin/general-items"   className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage General Items</NavLink>
                  <NavLink to="/admin/fabric-types"    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Fabric Types</NavLink>
                  <NavLink to="/admin/fabric-colors"   className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Fabric Colors</NavLink>
                  <NavLink to="/admin/sizes"           className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Sizes</NavLink>
                </DesktopNavDropdown>

                <DesktopNavDropdown
                  title="Config & Portals"
                  matchPaths={['/admin/workstation-types', '/admin/portal-management', '/admin/asset-management', '/admin/line-config']}
                >
                  <NavLink to="/admin/workstation-types" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Workstation Types</NavLink>
                  <NavLink to="/admin/portal-management" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Manage Portals</NavLink>
                  <NavLink to="/admin/asset-management"  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Asset Management</NavLink>
                  <NavLink to="/admin/line-config"       className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Line Config</NavLink>
                </DesktopNavDropdown>

                <DesktopNavDropdown
                  title="Maintenance"
                  matchPaths={['/admin/maintenance-dashboard', '/admin/maintenance-schedule', '/admin/maintenance-logs']}
                >
                  <NavLink to="/admin/maintenance-dashboard" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Maintenance Dashboard</NavLink>
                  <NavLink to="/admin/maintenance-schedule"  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Maintenance Schedule</NavLink>
                  <NavLink to="/admin/maintenance-logs"      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Maintenance Logs</NavLink>
                </DesktopNavDropdown>

                <DesktopNavDropdown title="Spares" matchPaths={['/admin/spares', '/admin/spares-analytics']}>
                  <NavLink to="/admin/spares"          className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"><LuPackage size={14} /> Manage Spares</NavLink>
                  <NavLink to="/admin/spares-analytics" className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"><LuChartLine size={14} /> Spares Analytics</NavLink>
                </DesktopNavDropdown>

                <DesktopNavDropdown title="Quality" matchPaths={['/admin/qc-analytics', '/admin/defect-code-line-types']}>
                  <NavLink to="/admin/qc-analytics"           className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">QC Analytics</NavLink>
                  <NavLink to="/admin/defect-code-line-types" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Defect Code Config</NavLink>
                </DesktopNavDropdown>

                {/* Cross-portal link — arrow icon signals it leaves this portal */}
                <NavLink
                  to="/merchandiser/planning"
                  title="Opens Merchandiser portal"
                  className={({ isActive }) =>
                    `flex items-center gap-0.5 text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}
                >
                  Planning <LuArrowUpRight size={11} className="opacity-50 mt-px" />
                </NavLink>

                {/* Settings — direct link, no wrapper dropdown */}
                <NavLink
                  to="/admin/company-profile"
                  title="Company Profile & Settings"
                  className={({ isActive }) =>
                    `flex items-center rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${isActive ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}
                >
                  <LuSettings size={17} />
                </NavLink>

              </nav>
            </div>

            {/* Right: user, bell, logout, hamburger */}
            <div className="flex items-center gap-4">
              {user && (
                <NavLink to="/admin/company-profile" className="flex items-center space-x-2 hover:opacity-75 transition-opacity">
                  {user.picture
                    ? <img src={user.picture} alt="User" className="w-8 h-8 rounded-full" />
                    : <LuCircleUserRound size={24} className="text-gray-600" />}
                  <span className="hidden lg:inline text-sm font-medium text-gray-700">{user.name}</span>
                </NavLink>
              )}

              <div className="hidden md:flex">
                <NotificationBell />
              </div>

              <button onClick={handleLogout} className="hidden md:flex items-center text-sm text-gray-600 hover:text-red-600">
                <LuLogOut className="mr-1" /> Logout
              </button>

              <button
                className="md:hidden p-2 text-gray-600 focus:outline-none"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              >
                {isMobileMenuOpen ? <LuX size={24} /> : <LuMenu size={24} />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-gray-200 shadow-inner">
            <nav className="flex flex-col p-4 space-y-2 max-h-[80vh] overflow-y-auto">

              <NavLink to="/admin/dashboard" onClick={closeMenu} className={({ isActive }) =>
                `block py-2 text-base font-medium ${isActive ? 'text-blue-600' : 'text-gray-700'}`}>
                Dashboard
              </NavLink>

              <MobileNavDropdown title="User & Supplier">
                <NavLink to="/admin/users"     onClick={closeMenu} className="block py-2 text-sm text-gray-600 hover:text-blue-600">User Management</NavLink>
                <NavLink to="/admin/suppliers" onClick={closeMenu} className="block py-2 text-sm text-gray-600 hover:text-blue-600">Supplier Management</NavLink>
                <NavLink to="/admin/customers" onClick={closeMenu} className="block py-2 text-sm text-gray-600 hover:text-blue-600">Customer Management</NavLink>
              </MobileNavDropdown>

              <MobileNavDropdown title="Inventory">
                <NavLink to="/admin/trim-management" onClick={closeMenu} className="block py-2 text-sm text-gray-600 hover:text-blue-600">Trims Dashboard</NavLink>
                <NavLink to="/admin/trim-items"      onClick={closeMenu} className="block py-2 text-sm text-gray-600 hover:text-blue-600">Manage Trim Items</NavLink>
                <NavLink to="/admin/trim-clusters"   onClick={closeMenu} className="block py-2 text-sm text-gray-600 hover:text-blue-600">Trim Substitute Clusters</NavLink>
                <NavLink to="/admin/general-items"   onClick={closeMenu} className="block py-2 text-sm text-gray-600 hover:text-blue-600">Manage General Items</NavLink>
                <NavLink to="/admin/fabric-types"    onClick={closeMenu} className="block py-2 text-sm text-gray-600 hover:text-blue-600">Manage Fabric Types</NavLink>
                <NavLink to="/admin/fabric-colors"   onClick={closeMenu} className="block py-2 text-sm text-gray-600 hover:text-blue-600">Manage Fabric Colors</NavLink>
                <NavLink to="/admin/sizes"           onClick={closeMenu} className="block py-2 text-sm text-gray-600 hover:text-blue-600">Manage Sizes</NavLink>
              </MobileNavDropdown>

              <MobileNavDropdown title="Config & Portals">
                <NavLink to="/admin/workstation-types" onClick={closeMenu} className="block py-2 text-sm text-gray-600 hover:text-blue-600">Workstation Types</NavLink>
                <NavLink to="/admin/portal-management" onClick={closeMenu} className="block py-2 text-sm text-gray-600 hover:text-blue-600">Manage Portals</NavLink>
                <NavLink to="/admin/asset-management"  onClick={closeMenu} className="block py-2 text-sm text-gray-600 hover:text-blue-600">Asset Management</NavLink>
                <NavLink to="/admin/line-config"       onClick={closeMenu} className="block py-2 text-sm text-gray-600 hover:text-blue-600">Line Config</NavLink>
              </MobileNavDropdown>

              <MobileNavDropdown title="Maintenance">
                <NavLink to="/admin/maintenance-dashboard" onClick={closeMenu} className="block py-2 text-sm text-gray-600 hover:text-blue-600">Maintenance Dashboard</NavLink>
                <NavLink to="/admin/maintenance-schedule"  onClick={closeMenu} className="block py-2 text-sm text-gray-600 hover:text-blue-600">Maintenance Schedule</NavLink>
                <NavLink to="/admin/maintenance-logs"      onClick={closeMenu} className="block py-2 text-sm text-gray-600 hover:text-blue-600">Maintenance Logs</NavLink>
              </MobileNavDropdown>

              <MobileNavDropdown title={<span className="flex items-center gap-2"><LuPackage size={16} /> Spares</span>}>
                <NavLink to="/admin/spares"           onClick={closeMenu} className="flex items-center gap-2 py-2 text-sm text-gray-600 hover:text-blue-600"><LuPackage size={14} /> Manage Spares</NavLink>
                <NavLink to="/admin/spares-analytics" onClick={closeMenu} className="flex items-center gap-2 py-2 text-sm text-gray-600 hover:text-blue-600"><LuChartLine size={14} /> Spares Analytics</NavLink>
              </MobileNavDropdown>

              <MobileNavDropdown title="Quality">
                <NavLink to="/admin/qc-analytics"           onClick={closeMenu} className="block py-2 text-sm text-gray-600 hover:text-blue-600">QC Analytics</NavLink>
                <NavLink to="/admin/defect-code-line-types" onClick={closeMenu} className="block py-2 text-sm text-gray-600 hover:text-blue-600">Defect Code Config</NavLink>
              </MobileNavDropdown>

              <NavLink to="/merchandiser/planning" onClick={closeMenu} className={({ isActive }) =>
                `flex items-center gap-1 py-2 text-base font-medium ${isActive ? 'text-blue-600' : 'text-gray-700'}`}>
                Planning <LuArrowUpRight size={12} className="opacity-50" />
              </NavLink>

              {/* Footer: notifications + profile + logout */}
              <div className="border-t border-gray-200 pt-4 mt-2 space-y-3">
                <div className="pb-1">
                  <NotificationBell />
                </div>
                <p className="text-sm text-gray-500">Signed in as <span className="font-bold">{user?.name}</span></p>
                <NavLink to="/admin/company-profile" onClick={closeMenu} className="flex items-center gap-2 py-2 text-sm text-gray-600 hover:text-blue-600">
                  <LuBuilding2 size={14} /> Company Profile
                </NavLink>
                <button onClick={() => { closeMenu(); handleLogout(); }} className="flex w-full items-center py-2 text-base font-medium text-red-600 hover:bg-red-50 rounded">
                  <LuLogOut className="mr-2" /> Logout
                </button>
              </div>

            </nav>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 sm:p-6 overflow-y-auto w-full">
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;
