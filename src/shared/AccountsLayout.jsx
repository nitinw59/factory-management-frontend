// src/shared/AccountsLayout.jsx
import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';

const NAV = [
    { to: '/accounts/sales/orders', label: 'All Sales Orders' },
    { to: '/accounts/sales/new',    label: 'Create Order' },
];

const AccountsLayout = () => {
    const { pathname } = useLocation();

    return (
        <div className="flex flex-col h-screen bg-gray-100">
            <header className="bg-white shadow-sm border-b border-gray-200 flex-shrink-0">
                <div className="flex items-center gap-6 px-6 h-14">
                    <Link
                        to="/accounts/production-workflow"
                        className="flex items-center gap-1.5 text-sm font-semibold text-gray-400 hover:text-gray-600 transition-colors mr-2"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="15 18 9 12 15 6"/>
                        </svg>
                        Production
                    </Link>
                    <span className="font-black text-lg text-indigo-600 tracking-tight">Accounts</span>
                    <nav className="flex items-center gap-1 ml-4">
                        {NAV.map(({ to, label }) => (
                            <Link
                                key={to}
                                to={to}
                                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                                    pathname === to
                                        ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                                        : 'text-gray-600 hover:bg-gray-50'
                                }`}
                            >
                                {label}
                            </Link>
                        ))}
                    </nav>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-8">
                <Outlet />
            </main>
        </div>
    );
};

export default AccountsLayout;