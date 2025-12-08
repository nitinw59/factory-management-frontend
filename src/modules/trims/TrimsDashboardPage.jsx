import React, { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { trimsApi } from '../../api/trimsApi';
import CrudManager from '../../shared/CrudManager';
import { trimItemConfig, trimItemVariantConfig } from '../../config/crudConfigs';
import { Download, FileSpreadsheet, Loader2, Package, Layers } from 'lucide-react';




const downloadAsExcel = (data, fileName = 'inventory_export.csv') => {
    if (!data || !data.length) {
        alert("No data to export.");
        return;
    }

    // 1. Extract Headers
    const headers = Object.keys(data[0]);
    
    // 2. Convert Data to CSV Format
    const csvContent = [
        headers.join(','), // Header Row
        ...data.map(row => 
            headers.map(fieldName => {
                // Escape quotes and wrap in quotes to handle commas within data
                const val = row[fieldName] === null ? '' : row[fieldName].toString();
                return `"${val.replace(/"/g, '""')}"`;
            }).join(',')
        )
    ].join('\n');

    // 3. Create Blob and Trigger Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};

// --- SHARED COMPONENTS ---
const Spinner = () => <div className="flex justify-center items-center p-8"><Loader2 className="animate-spin h-8 w-8 text-blue-600" /></div>;

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

    const mostStockedItem = data.stock_by_item && data.stock_by_item.length > 0 
        ? data.stock_by_item.reduce((prev, current) => (prev.total_stock > current.total_stock) ? prev : current).name 
        : 'N/A';

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <KPICard title="Total Stock Value" value={parseFloat(data.total_stock_value || 0).toFixed(2)} prefix="$" color="text-green-600" />
            <KPICard title="Items Low on Stock" value={data.items_low_on_stock} color="text-yellow-600" />
            <KPICard title="Most Stocked Item" value={mostStockedItem} color="text-indigo-600" />
            
            <div className="md:col-span-3 bg-white p-4 rounded-lg shadow">
                <h2 className="font-semibold mb-4">Stock Quantity by Item Type</h2>
                <ResponsiveContainer width="100%" height={300}>
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
  const [isExporting, setIsExporting] = useState(false);

  // New Export Handler
  const handleExport = async () => {
      setIsExporting(true);
      try {
          const res = await trimsApi.exportInventory(); 
          const date = new Date().toISOString().split('T')[0];
          downloadAsExcel(res.data, `Trim_Inventory_Export_${date}.csv`);
      } catch (error) {
          console.error("Export failed", error);
          alert("Failed to download inventory data.");
      } finally {
          setIsExporting(false);
      }
  };

  const tabs = {
    analytics: { label: 'Analytics Overview', component: <AnalyticsTab /> },
    items: { label: 'Manage Item Catalog', component: <CrudManager config={trimItemConfig} /> },
    variants: { label: 'Manage Stock Variants', component: <CrudManager config={trimItemVariantConfig} /> },
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen font-sans text-gray-900">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Trims & Accessories Store</h1>
            <p className="text-gray-500 text-sm mt-1">Manage inventory, definitions, and analytics.</p>
          </div>
          
          {/* EXPORT BUTTON */}
          <button 
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg shadow-sm transition-all disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isExporting ? <Loader2 className="animate-spin w-4 h-4"/> : <FileSpreadsheet className="w-4 h-4"/>}
            <span>{isExporting ? 'Generating...' : 'Download Excel Report'}</span>
          </button>
      </div>
      
      <div className="border-b mb-6 bg-white rounded-t-lg px-4 shadow-sm">
        <nav className="-mb-px flex space-x-8">
          {Object.entries(tabs).map(([key, { label }]) => (
            <button 
              key={key} 
              onClick={() => setActiveTab(key)}
              className={`py-4 px-1 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === key 
                  ? 'border-blue-600 text-blue-600' 
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      <div className="animate-in fade-in duration-300">
        {tabs[activeTab].component}
      </div>
    </div>
  );
};

export default TrimsDashboardPage;