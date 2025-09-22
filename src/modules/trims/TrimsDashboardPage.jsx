import React, { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { trimsApi } from '../../api/trimsApi';
import CrudManager from '../../shared/CrudManager';
import { trimItemConfig, trimItemVariantConfig } from '../../config/crudConfigs';

// --- SHARED COMPONENTS ---
const Spinner = () => <div className="flex justify-center items-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
const KPICard = ({ title, value, color, prefix = '', suffix = '' }) => (
    <div className="p-4 bg-white rounded-lg shadow">
        <p className="text-sm text-gray-500">{title}</p>
        <p className={`text-3xl font-bold ${color}`}>{prefix}{value || 0}{suffix}</p>
    </div>
);

// --- DASHBOARD TABS ---
const AnalyticsTab = () => {
    const [data, setData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        trimsApi.getAnalyticsData()
            .then(res => setData(res.data))
            .finally(() => setIsLoading(false));
    }, []);

    if (isLoading) return <Spinner />;
    if (!data) return <p>Could not load analytics data.</p>;

    const mostStockedItem = data.stock_by_item ? data.stock_by_item[0]?.name : 'N/A';

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <KPICard title="Total Stock Value" value={parseFloat(data.total_stock_value || 0).toFixed(2)} prefix="$" color="text-green-600" />
            <KPICard title="Items Low on Stock" value={data.items_low_on_stock} color="text-yellow-600" />
            <KPICard title="Most Stocked Item" value={mostStockedItem} color="text-indigo-600" />
            
            <div className="md:col-span-3 bg-white p-4 rounded-lg shadow">
                <h2 className="font-semibold mb-4">Stock Quantity by Item Type</h2>
                <ResponsiveContainer width="100%" height={300}>
                    {/* --- THIS IS THE FIX --- */}
                    {/* We provide a fallback empty array to prevent crashes if the data is missing */}
                    <BarChart data={data.stock_by_item || []} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="total_stock" fill="#8884d8" name="Total Stock" />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

// --- MAIN DASHBOARD PAGE ---
const TrimsDashboardPage = () => {
  const [activeTab, setActiveTab] = useState('analytics');

  const tabs = {
    analytics: { label: 'Analytics Overview', component: <AnalyticsTab /> },
    items: { label: 'Manage Item Catalog', component: <CrudManager config={trimItemConfig} /> },
    variants: { label: 'Manage Stock Variants', component: <CrudManager config={trimItemVariantConfig} /> },
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-4">Trims & Accessories Store</h1>
      
      <div className="border-b mb-6">
        <nav className="-mb-px flex space-x-6">
          {Object.entries(tabs).map(([key, { label }]) => (
            <button 
              key={key} 
              onClick={() => setActiveTab(key)}
              className={`py-3 px-1 text-sm font-medium ${activeTab === key ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      <div>
        {tabs[activeTab].component}
      </div>
    </div>
  );
};

export default TrimsDashboardPage;

