// src/shared/AccountsLayout.jsx
import { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import MatrixBrand from './MatrixBrand';
import ReportBugButton from './ReportBugButton';
import NotificationBell from './NotificationBell';
import {
    LuLayoutDashboard, LuShoppingCart, LuPackageCheck, LuFileText, LuPackageX,
    LuBoxes, LuChevronDown, LuMenu, LuX, LuLogOut,
} from 'react-icons/lu';

const SALES_NAV = [
    { to: '/accounts/sales/orders', label: 'Sales Orders' },
    { to: '/accounts/sales/new',    label: 'Create Order' },
];

const PURCHASE_NAV = [
    { to: '/accounts/purchase/orders',               label: 'Orders'         },
    { to: '/accounts/purchase/inwards',              label: 'Inwards'        },
    { to: '/accounts/purchase/invoices',             label: 'Invoices'       },
    { to: '/accounts/fabric-rolls',                  label: 'Fabric Rolls'   },
    { to: '/accounts/purchase/trims-ledger',         label: 'Trims Ledger'   },
    { to: '/accounts/purchase/supplier-color-codes', label: 'Supplier Codes' },
];

const SINGLE_NAV = [
    { to: '/accounts/job-work',         icon: LuFileText,        label: 'Job Work' },
    { to: '/trim-loss',                 icon: LuPackageX,        label: 'Trim Loss' },
    { to: '/accounts/asset-management', icon: LuBoxes,           label: 'Asset' },
];

const linkClass = ({ isActive }) =>
    `flex items-center gap-1.5 text-sm font-medium transition-colors ${isActive ? 'text-indigo-600' : 'text-gray-600 hover:text-indigo-600'}`;

const mobileLinkClass = ({ isActive }) =>
    `flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-50'}`;

const NavDropdown = ({ title, icon: Icon, items, active }) => {
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (ref.current && !ref.current.contains(event.target)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setIsOpen((o) => !o)}
                className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${active ? 'text-indigo-600' : 'text-gray-600 hover:text-indigo-600'}`}
            >
                <Icon size={15} /> {title}
                <LuChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
                <div
                    className="absolute left-0 mt-2 w-52 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-30"
                    onClick={() => setIsOpen(false)}
                >
                    {items.map(({ to, label }) => (
                        <NavLink
                            key={to}
                            to={to}
                            className={({ isActive }) =>
                                `block px-4 py-2 text-sm transition-colors ${isActive ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`
                            }
                        >
                            {label}
                        </NavLink>
                    ))}
                </div>
            )}
        </div>
    );
};

const AccountsLayout = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const [mobileOpen, setMobileOpen] = useState(false);

    const handleLogout = () => { logout(); navigate('/login'); };
    const closeMobile = () => setMobileOpen(false);

    const isGroupActive = (items) => items.some(({ to }) => pathname === to || pathname.startsWith(to + '/'));

    return (
        <div className="flex flex-col h-screen bg-gray-50 font-sans">
            <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-20 flex-shrink-0">
                <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-6 min-w-0">
                        <MatrixBrand portal="Accounts Portal" />

                        <nav className="hidden md:flex items-center gap-5">
                            <NavLink to="/accounts/production-workflow" className={linkClass}>
                                <LuLayoutDashboard size={15} /> Dashboard
                            </NavLink>

                            <NavDropdown title="Sales" icon={LuShoppingCart} items={SALES_NAV} active={isGroupActive(SALES_NAV)} />
                            <NavDropdown title="Purchase" icon={LuPackageCheck} items={PURCHASE_NAV} active={isGroupActive(PURCHASE_NAV)} />

                            {SINGLE_NAV.map(({ to, icon: Icon, label }) => (
                                <NavLink key={to} to={to} className={linkClass}>
                                    <Icon size={15} /> {label}
                                </NavLink>
                            ))}
                        </nav>
                    </div>

                    <div className="hidden md:flex items-center gap-4 shrink-0">
                        {user && <span className="text-sm font-medium text-gray-700">Welcome, {user.name}</span>}
                        <ReportBugButton />
                        <NotificationBell />
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-rose-600 transition-colors bg-gray-50 hover:bg-rose-50 px-3 py-1.5 rounded-lg"
                        >
                            <LuLogOut size={15} /> Logout
                        </button>
                    </div>

                    <button
                        onClick={() => setMobileOpen((o) => !o)}
                        className="md:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                    >
                        {mobileOpen ? <LuX size={22} /> : <LuMenu size={22} />}
                    </button>
                </div>

                {mobileOpen && (
                    <div className="md:hidden border-t border-gray-200 bg-white px-4 py-4 flex flex-col gap-1 max-h-[calc(100vh-56px)] overflow-y-auto">
                        <NavLink to="/accounts/production-workflow" onClick={closeMobile} className={mobileLinkClass}>
                            <LuLayoutDashboard size={16} /> Dashboard
                        </NavLink>

                        <div className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Sales</div>
                        {SALES_NAV.map(({ to, label }) => (
                            <NavLink key={to} to={to} onClick={closeMobile} className={mobileLinkClass}>
                                {label}
                            </NavLink>
                        ))}

                        <div className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Purchase</div>
                        {PURCHASE_NAV.map(({ to, label }) => (
                            <NavLink key={to} to={to} onClick={closeMobile} className={mobileLinkClass}>
                                {label}
                            </NavLink>
                        ))}

                        <div className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">More</div>
                        {SINGLE_NAV.map(({ to, icon: Icon, label }) => (
                            <NavLink key={to} to={to} onClick={closeMobile} className={mobileLinkClass}>
                                <Icon size={16} /> {label}
                            </NavLink>
                        ))}

                        <div className="border-t border-gray-100 mt-2 pt-3 flex items-center gap-3 px-4">
                            <ReportBugButton />
                            <NotificationBell />
                        </div>
                        {user && <div className="px-4 pt-2 text-sm text-gray-500">Welcome, {user.name}</div>}
                        <button
                            onClick={() => { closeMobile(); handleLogout(); }}
                            className="flex items-center justify-center gap-2 w-full text-sm font-medium text-rose-600 hover:bg-rose-50 px-4 py-2.5 rounded-lg mt-1"
                        >
                            <LuLogOut size={16} /> Logout
                        </button>
                    </div>
                )}
            </header>

            <main className="flex-1 overflow-y-auto p-6 sm:p-8">
                <Outlet />
            </main>
        </div>
    );
};

export default AccountsLayout;
