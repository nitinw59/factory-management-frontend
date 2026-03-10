import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { storeManagerApi } from '../../api/storeManagerApi';
import { FiClock, FiCheckCircle, FiList, FiPackage } from 'react-icons/fi'; 
import { FileText, ChevronRight, Search, RefreshCw, AlertCircle, Receipt, IndianRupee, Loader2 } from 'lucide-react';

const Spinner = () => <div className="flex justify-center items-center p-12"><Loader2 className="animate-spin h-10 w-10 text-blue-600" /></div>;

// --- KPI Summary Card Component ---
const KPICard = ({ title, count, icon: Icon, colorClass, bgColorClass, prefix = '' }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex items-center justify-between">
        <div>
            <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-1">{title}</p>
            <p className="text-2xl lg:text-3xl font-black text-gray-800">{prefix}{count}</p>
        </div>
        <div className={`p-3 rounded-lg ${bgColorClass} ${colorClass}`}>
            <Icon size={24} />
        </div>
    </div>
);

// --- Reusable Order Card ---
const OrderCard = ({ order }) => {
    const statusInfo = {
        PENDING: { color: 'yellow', icon: FiClock, text: 'Pending' },
        PREPARED: { color: 'blue', icon: FiPackage, text: 'Prepared' },
        COMPLETED: { color: 'green', icon: FiCheckCircle, text: 'Completed' },
    }[order.status] || { color: 'gray', icon: FiList, text: order.status };

    const Icon = statusInfo.icon;

    const borderColorClass = {
        'yellow': 'border-yellow-500 hover:border-yellow-600',
        'blue': 'border-blue-500 hover:border-blue-600',
        'green': 'border-green-500 hover:border-green-600',
        'gray': 'border-gray-500 hover:border-gray-600',
    }[statusInfo.color];

    const badgeColorClass = {
        'yellow': 'bg-yellow-100 text-yellow-800',
        'blue': 'bg-blue-100 text-blue-800',
        'green': 'bg-green-100 text-green-800',
        'gray': 'bg-gray-100 text-gray-800',
    }[statusInfo.color];

    // Billing Status Logic
    const billStatus = order.billing_status || 'UNBILLED';
    const billColors = {
        'BILLED': 'bg-emerald-100 text-emerald-800 border-emerald-200',
        'PARTIAL': 'bg-amber-100 text-amber-800 border-amber-200',
        'UNBILLED': 'bg-rose-100 text-rose-800 border-rose-200',
    }[billStatus] || 'bg-gray-100 text-gray-800 border-gray-200';

    return (
        <div className={`bg-white rounded-xl shadow-sm border border-gray-200 border-l-4 ${borderColorClass} transition-all duration-200 flex flex-col h-full hover:shadow-md`}>
            <Link 
                to={`/store-manager/trim-orders/${order.id}`} 
                className="block p-5 flex-grow hover:bg-gray-50 rounded-t-xl transition-colors"
            >
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h3 className="font-bold text-lg text-gray-900">Order #{order.id}</h3>
                        <p className="text-sm font-medium text-gray-500 mt-0.5">
                            Batch <span className="text-blue-600">#{order.production_batch_id ||order.batch_code}</span>
                        </p>

                         <p className="text-sm font-medium text-gray-500 mt-0.5">
                            CODE <span className="text-blue-600">#{order.batch_code || order.production_batch_id}</span>
                        </p>
                    </div>
                    <span className={`inline-flex items-center text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-full ${badgeColorClass}`}>
                        <Icon size={12} className="mr-1.5"/>
                        {statusInfo.text}
                    </span>
                </div>

                <div className="pt-3 border-t border-gray-100 flex justify-between items-center mb-3">
                    <p className="text-xs text-gray-500 flex items-center">
                        <span className="font-semibold text-gray-700 mr-1">{order.created_by}</span>
                    </p>
                    <p className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-1 rounded">
                        {new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                </div>

                {/* BILLING DETAILS */}
                <div className="flex justify-between items-center p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="flex items-center text-xs font-medium text-slate-600">
                        <Receipt size={14} className="mr-1.5 text-indigo-500" />
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${billColors}`}>
                            {billStatus}
                        </span>
                    </div>
                    <span className="text-sm font-bold text-slate-800 flex items-center">
                        <IndianRupee size={12} className="mr-0.5 text-slate-500" />
                        {parseFloat(order.billed_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                </div>
            </Link>

            {/* FOOTER ACTIONS WITH BILLING LINK */}
            <div className="px-4 py-3 bg-gray-50/80 border-t border-gray-100 rounded-b-xl flex flex-wrap justify-between items-center gap-2">
                <div className="flex gap-1">
                    <Link 
                        to={`/store-manager/trim-orders/${order.id}/summary`} 
                        className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center transition-colors px-2 py-1.5 rounded hover:bg-indigo-50"
                        title="View Summary"
                    >
                        <FileText size={14} className="mr-1" /> Summary
                    </Link>
                    <Link 
                        to={`/store-manager/trim-orders/${order.id}/billing`} 
                        className="text-xs font-bold text-emerald-600 hover:text-emerald-800 flex items-center transition-colors px-2 py-1.5 rounded hover:bg-emerald-50"
                        title="Manage Billing"
                    >
                        <Receipt size={14} className="mr-1" /> Billing
                    </Link>
                </div>
                <Link 
                    to={`/store-manager/trim-orders/${order.id}`} 
                    className="text-xs font-bold text-white bg-gray-800 hover:bg-black flex items-center transition-colors px-3 py-1.5 rounded shadow-sm"
                >
                    Process <ChevronRight size={14} className="ml-1" />
                </Link>
            </div>
        </div>
    );
};

// --- MAIN PAGE COMPONENT ---
const TrimOrdersPage = () => {
    // Data State
    const [orders, setOrders] = useState([]);
    const [kpis, setKpis] = useState({ 
        pending: 0, prepared: 0, completedToday: 0, 
        pendingBilling: 0, totalBilled: 0, activeTotal: 0, completedTotal: 0 
    });
    
    // UI State
    const [activeTab, setActiveTab] = useState('active'); // 'active' or 'completed'
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    
    // Pagination & Loading State
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isFetchingMore, setIsFetchingMore] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [refreshCount, setRefreshCount] = useState(0); // Trigger for manual refresh
    const [error, setError] = useState(null);

    // Debounce the search input
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(searchTerm);
        }, 500);
        return () => clearTimeout(handler);
    }, [searchTerm]);

    // Fetch KPIs
    const fetchKPIs = useCallback(async () => {
        try {
            const res = await storeManagerApi.getTrimOrdersKPIs();
            setKpis(res.data);
        } catch (err) {
            console.error("Failed to load KPIs", err);
        }
    }, []);

    useEffect(() => {
        fetchKPIs();
    }, [fetchKPIs, refreshCount]);

    // Handle Tab or Search Change -> Reset to page 1
    const handleTabChange = (tab) => {
        setActiveTab(tab);
        setPage(1);
        setOrders([]);
    };

    useEffect(() => {
        setPage(1);
        setOrders([]);
    }, [debouncedSearch]);

    // The Main Paginated Fetcher
    useEffect(() => {
        const loadData = async () => {
            if (page === 1 && !isRefreshing) setIsLoading(true);
            else if (page > 1) setIsFetchingMore(true);

            setError(null);
            
            try {
                const res = await storeManagerApi.getAllTrimOrders({
                    tab: activeTab,
                    page: page,
                    limit: 12,
                    search: debouncedSearch
                });
                
                // Safely extract data depending on API response format
                let newOrders = [];
                let pagination = {};
                
                if (res.data && res.data.pagination) {
                    newOrders = res.data.data || [];
                    pagination = res.data.pagination;
                } else if (Array.isArray(res.data)) {
                    // Fallback just in case backend isn't updated yet
                    newOrders = res.data;
                    pagination = { currentPage: 1, totalPages: 1 };
                }

                if (page === 1) {
                    setOrders(newOrders);
                } else {
                    setOrders(prev => [...prev, ...newOrders]);
                }
                
                setHasMore(pagination.currentPage < pagination.totalPages);

            } catch (err) {
                console.error("Failed to fetch trim orders", err);
                setError("Could not load trim orders. Please try again.");
            } finally {
                setIsLoading(false);
                setIsFetchingMore(false);
                setIsRefreshing(false);
            }
        };

        loadData();
    }, [page, activeTab, debouncedSearch, refreshCount]);

    // Handlers
    const handleRefresh = () => {
        setIsRefreshing(true);
        if (page === 1) {
            setRefreshCount(c => c + 1); // Force re-trigger of useEffect
        } else {
            setPage(1); // Changing page back to 1 will trigger useEffect automatically
            setOrders([]);
        }
    };

    return (
        <div className="p-4 md:p-6 bg-gray-50 min-h-screen font-inter pb-24">
            {/* --- HEADER & ACTIONS --- */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div>
                    <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Trim Orders</h1>
                    <p className="text-gray-500 text-sm mt-1">Manage and fulfill trim requirements for production batches.</p>
                </div>
                <div className="flex w-full md:w-auto gap-3">
                    <div className="relative flex-1 md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input 
                            type="text" 
                            placeholder="Search orders, batches..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none shadow-sm text-sm"
                        />
                    </div>
                    <button 
                        onClick={handleRefresh} 
                        disabled={isRefreshing || isLoading}
                        className="p-2.5 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 text-gray-700 transition-all disabled:opacity-50"
                        title="Refresh Orders"
                    >
                        <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
                    </button>
                </div>
            </div>

            {/* --- KPI CARDS --- */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
                <KPICard title="Pending Fulfillment" count={kpis.pending || 0} icon={FiClock} colorClass="text-amber-600" bgColorClass="bg-amber-100" />
                <KPICard title="Prepared / Partial" count={kpis.prepared || 0} icon={FiPackage} colorClass="text-blue-600" bgColorClass="bg-blue-100" />
                <KPICard title="Completed Today" count={kpis.completedToday || 0} icon={FiCheckCircle} colorClass="text-emerald-600" bgColorClass="bg-emerald-100" />
                <KPICard title="Pending Billing" count={kpis.pendingBilling || 0} icon={Receipt} colorClass="text-rose-600" bgColorClass="bg-rose-100" />
                <KPICard 
                    title="Total Billed" 
                    count={(kpis.totalBilled || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })} 
                    prefix="₹"
                    icon={IndianRupee} 
                    colorClass="text-indigo-600" 
                    bgColorClass="bg-indigo-100" 
                />
            </div>

            {error && (
                <div className="p-5 mb-6 bg-red-50 text-red-700 rounded-xl shadow-sm border border-red-200 flex items-center">
                    <AlertCircle className="h-5 w-5 mr-3" /> {error}
                </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                {/* --- TABS NAVIGATION --- */}
                <div className="flex border-b border-gray-200 bg-gray-50/50 px-2 pt-2 overflow-x-auto hide-scrollbar">
                    <button 
                        onClick={() => handleTabChange('active')}
                        className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap flex items-center ${activeTab === 'active' ? 'border-blue-600 text-blue-700 bg-white rounded-t-lg shadow-sm' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        Active Orders 
                        {kpis.activeTotal !== undefined && (
                            <span className="ml-2 bg-blue-100 text-blue-700 py-0.5 px-2 rounded-full text-xs">{kpis.activeTotal}</span>
                        )}
                    </button>
                    <button 
                        onClick={() => handleTabChange('completed')}
                        className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap flex items-center ${activeTab === 'completed' ? 'border-emerald-600 text-emerald-700 bg-white rounded-t-lg shadow-sm' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        Completed History 
                        {kpis.completedTotal !== undefined && (
                            <span className="ml-2 bg-gray-200 text-gray-700 py-0.5 px-2 rounded-full text-xs">{kpis.completedTotal}</span>
                        )}
                    </button>
                </div>

                {/* --- TABS CONTENT --- */}
                <div className="p-4 md:p-6 bg-gray-50/30 min-h-[400px]">
                    {isLoading ? (
                        <Spinner />
                    ) : orders.length > 0 ? (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
                                {orders.map(order => <OrderCard key={order.id} order={order} />)}
                            </div>
                            
                            {hasMore && (
                                <div className="mt-8 flex justify-center border-t border-gray-200 pt-8">
                                    <button 
                                        onClick={() => setPage(p => p + 1)}
                                        disabled={isFetchingMore}
                                        className="px-6 py-3 bg-white border border-gray-300 text-gray-700 font-bold rounded-lg shadow-sm hover:bg-gray-50 hover:text-blue-600 transition-all flex items-center disabled:opacity-70 disabled:cursor-not-allowed"
                                    >
                                        {isFetchingMore ? <Loader2 className="w-5 h-5 animate-spin mr-2"/> : null}
                                        {isFetchingMore ? 'Loading More...' : 'Load More Orders'}
                                    </button>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <div className="w-20 h-20 bg-white text-gray-400 rounded-full flex items-center justify-center mb-4 shadow-sm border border-gray-200">
                                {activeTab === 'active' ? <FiPackage size={40} className="text-blue-500" /> : <FiList size={40} />}
                            </div>
                            <h3 className="text-xl font-bold text-gray-800">
                                {activeTab === 'active' ? 'All Caught Up!' : 'No History Found'}
                            </h3>
                            <p className="text-gray-500 mt-2 max-w-sm">
                                {searchTerm 
                                    ? `No orders matching "${searchTerm}" were found in this section.`
                                    : activeTab === 'active' 
                                        ? 'There are no pending or prepared trim orders matching your criteria right now.' 
                                        : 'No completed orders match your search criteria.'}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TrimOrdersPage;