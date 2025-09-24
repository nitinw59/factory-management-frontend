import React, { useState, useEffect, useCallback } from 'react';
import { storeManagerApi } from '../../api/storeManagerApi';
import FabricIntakeForm from './FabricIntakeForm';
import Modal from '../../shared/Modal';

const Spinner = () => <div className="flex justify-center items-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;

const StoreManagerDashboardPage = () => {
  const [inventory, setInventory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchInventory = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await storeManagerApi.getFabricInventory();
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
    await storeManagerApi.createFabricIntake(data);
    setIsModalOpen(false);
    fetchInventory(); // Refresh inventory after new intake
  };

  const getStatusColor = (status) => {
    if (status === 'IN_STOCK') return 'bg-green-100 text-green-800';
    return 'bg-gray-100 text-gray-800';
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Fabric Pool (Main Store Inventory)</h1>
        <button onClick={() => setIsModalOpen(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          Record New Fabric Intake
        </button>
      </div>

      <div className="bg-white p-4 rounded-lg shadow">
        {isLoading ? <Spinner /> : (
            <table className="min-w-full">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="py-2 px-3 text-left">Roll ID</th>
                        <th className="py-2 px-3 text-left">Fabric Type</th>
                        <th className="py-2 px-3 text-left">Color</th>
                        <th className="py-2 px-3 text-left">Meters</th>
                        <th className="py-2 px-3 text-left">Status</th>
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {inventory.map(item => (
                        <tr key={item.id}>
                            <td className="py-2 px-3 font-mono text-xs">ROLL-{item.id}</td>
                            <td className="py-2 px-3">{item.fabric_type}</td>
                            <td className="py-2 px-3">{item.fabric_color}</td>
                            <td className="py-2 px-3 font-semibold">{item.meter}</td>
                            <td className="py-2 px-3">
                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(item.status)}`}>
                                    {item.status.replace('_', ' ')}
                                </span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        )}
      </div>
      
      {isModalOpen && <Modal title="Record New Fabric Intake" onClose={() => setIsModalOpen(false)}><FabricIntakeForm onSave={handleSaveIntake} onClose={() => setIsModalOpen(false)} /></Modal>}
    </div>
  );
};

export default StoreManagerDashboardPage;

