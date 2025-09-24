import React, { useState, useEffect, useCallback } from 'react';
import { productionManagerApi } from '../../api/productionManagerApi';
import CreateProductionBatchForm from './CreateProductionBatchForm';
import Modal from '../../shared/Modal';
import { LuPlus } from 'react-icons/lu';

// --- SHARED COMPONENTS ---
const Spinner = () => <div className="flex justify-center items-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;

// --- MAIN PAGE CONTAINER ---
const ProductionPlanningPage = () => {
  const [batches, setBatches] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Function to fetch the list of production batches
  const fetchBatches = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await productionManagerApi.getAll();
      setBatches(response.data || []);
    } catch (err) {
      console.error("Failed to fetch production batches", err);
      setError("Could not load production batches.");
      setBatches([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch data when the component mounts
  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);
  
  // Handler for successfully saving a new batch
  const handleSave = () => {
    setIsModalOpen(false);
    fetchBatches(); // Refresh the list after a new batch is created
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Production Planning</h1>
        <button 
          onClick={() => setIsModalOpen(true)} 
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <LuPlus className="mr-2" />
          Create New Batch
        </button>
      </div>
      
      <div className="bg-white p-4 rounded-lg shadow">
        {isLoading ? <Spinner /> : error ? (
          <div className="text-center p-4 text-red-600">{error}</div>
        ) : (
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="py-2 px-3 text-left text-xs font-semibold text-gray-500 uppercase">Batch Code</th>
                <th className="py-2 px-3 text-left text-xs font-semibold text-gray-500 uppercase">Product</th>
                <th className="py-2 px-3 text-left text-xs font-semibold text-gray-500 uppercase">Created On</th>
                {/* Add more columns as needed, e.g., Status, Rolls Count */}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {batches.length > 0 ? batches.map(batch => (
                <tr key={batch.id} className="hover:bg-gray-50">
                  <td className="py-2 px-3 font-mono text-sm">{batch.batch_code || `BATCH-${batch.id}`}</td>
                  <td className="py-2 px-3">{batch.product_name}</td>
                  <td className="py-2 px-3">{new Date(batch.created_at).toLocaleDateString()}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="3" className="text-center p-4 text-gray-500">No production batches have been created yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {isModalOpen && (
        <Modal title="Create New Production Batch" onClose={() => setIsModalOpen(false)}>
          <CreateProductionBatchForm onClose={handleSave} />
        </Modal>
      )}
    </div>
  );
};

export default ProductionPlanningPage;

