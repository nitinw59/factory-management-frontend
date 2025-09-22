import React, { useState, useEffect, useCallback } from 'react';
// We will create this API module next
// import { storeManagerApi } from '../../api/storeManagerApi';

// --- DUMMY API for now ---
const storeManagerApi = {
    getInventory: () => new Promise(res => res({data: [{id: 1, item_name: "Metal Button", color_name: "Black", main_store_stock: 1500}]})),
    createStockIntake: (data) => new Promise(res => res()),
}
const CrudManager = () => <div>CrudManager Placeholder</div>; // Assuming you have this component
const supplierConfig = {}; // And this config


const Spinner = () => <div className="flex justify-center items-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;

const StoreManagerDashboardPage = () => {
  const [inventory, setInventory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchInventory = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await storeManagerApi.getInventory();
      setInventory(response.data || []);
    } catch (error) {
      console.error("Failed to fetch inventory", error);
      setInventory([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);
  
  const handleSaveIntake = async (data) => {
    await storeManagerApi.createStockIntake(data);
    fetchInventory(); // Refresh inventory after new intake
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Main Store Inventory</h1>
        <button onClick={() => setIsModalOpen(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg">
          Record Stock Intake
        </button>
      </div>

      <div className="bg-white p-4 rounded-lg shadow">
        {isLoading ? <Spinner /> : (
            <table className="min-w-full">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="py-2 px-3 text-left">Item</th>
                        <th className="py-2 px-3 text-left">Color</th>
                        <th className="py-2 px-3 text-left">Current Stock</th>
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {inventory.map(item => (
                        <tr key={item.id}>
                            <td className="py-2 px-3">{item.item_name}</td>
                            <td className="py-2 px-3">{item.color_name}</td>
                            <td className="py-2 px-3">{item.main_store_stock}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        )}
      </div>
      
      {/* The form for adding new stock would be in a modal */}
      {/* {isModalOpen && <StockIntakeForm onSave={handleSaveIntake} onClose={() => setIsModalOpen(false)} />} */}
    </div>
  );
};

export default StoreManagerDashboardPage;
