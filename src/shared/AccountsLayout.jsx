// src/shared/AccountsLayout.jsx
import { Outlet, Link, useLocation } from 'react-router-dom';

const SALES_NAV = [
    { to: '/accounts/sales/orders', label: 'Sales Orders' },
    { to: '/accounts/sales/new',    label: 'Create Order' },
];

const PURCHASE_NAV = [
    { to: '/accounts/purchase/orders',               label: 'Orders'         },
    { to: '/accounts/purchase/invoices',             label: 'Invoices'       },
    { to: '/accounts/fabric-rolls',                  label: 'Fabric Rolls'   },
    { to: '/accounts/purchase/trims-ledger',         label: 'Trims Ledger'   },
    { to: '/accounts/purchase/supplier-color-codes', label: 'Supplier Codes' },
];

const JOB_WORK_NAV = [
    { to: '/accounts/job-work', label: 'Job Work Challans' },
];

const AccountsLayout = () => {
    const { pathname } = useLocation();

    const activeClass = (to) => {
        const isActive = pathname === to || pathname.startsWith(to + '/');
        if (!isActive) return 'text-gray-600 hover:bg-gray-50';
        return to.startsWith('/accounts/sales')
            ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
            : 'bg-orange-50 text-orange-700 border border-orange-100';
    };

    return (
        <div className="flex flex-col h-screen bg-gray-100">
            <header className="bg-white shadow-sm border-b border-gray-200 flex-shrink-0">
                <div className="flex items-center gap-3 px-6 h-14 overflow-x-auto">
                    <Link
                        to="/accounts/production-workflow"
                        className="flex items-center gap-1.5 text-sm font-semibold text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="15 18 9 12 15 6"/>
                        </svg>
                        Production
                    </Link>

                    <span className="w-px h-5 bg-gray-200" />

                    <span className="font-black text-lg text-indigo-600 tracking-tight">Accounts</span>

                    <span className="w-px h-5 bg-gray-200 mx-1" />

                    {/* Sales group */}
                    <span className="text-xs font-bold uppercase tracking-widest text-indigo-400 shrink-0">Sales</span>
                    <nav className="flex items-center gap-1">
                        {SALES_NAV.map(({ to, label }) => (
                            <Link
                                key={to}
                                to={to}
                                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${activeClass(to)}`}
                            >
                                {label}
                            </Link>
                        ))}
                    </nav>

                    <span className="w-px h-5 bg-gray-200 mx-1" />

                    {/* Purchase group */}
                    <span className="text-xs font-bold uppercase tracking-widest text-orange-400 shrink-0">Purchase</span>
                    <nav className="flex items-center gap-1">
                        {PURCHASE_NAV.map(({ to, label }) => (
                            <Link
                                key={to}
                                to={to}
                                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${activeClass(to)}`}
                            >
                                {label}
                            </Link>
                        ))}
                    </nav>

                    <span className="w-px h-5 bg-gray-200 mx-1" />

                    {/* Job Work group */}
                    <span className="text-xs font-bold uppercase tracking-widest text-amber-500 shrink-0">Job Work</span>
                    <nav className="flex items-center gap-1">
                        {JOB_WORK_NAV.map(({ to, label }) => (
                            <Link
                                key={to}
                                to={to}
                                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${activeClass(to)}`}
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
