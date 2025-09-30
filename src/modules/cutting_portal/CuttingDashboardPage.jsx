import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { cuttingPortalApi } from '../../api/cuttingPortalApi';
import { LuCircle, LuLoader } from 'react-icons/lu';
import Modal from '../../shared/Modal'; // Assuming a modal component exists
import CuttingForm from './CuttingForm'; // Import the refactored form

const Spinner = () => <div className="flex justify-center items-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;

const BatchCard = ({ batch, onOpenCutForm }) => {
    const isBatchComplete = useMemo(() => batch.rolls.every(r => r.is_cut), [batch.rolls]);

    return (
        <div className={`bg-white p-4 rounded-lg shadow border-l-4 ${isBatchComplete ? 'border-green-500' : 'border-blue-500'}`}>
            <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-lg text-gray-800">{batch.batch_code}</h3>
                <span className={`flex items-center text-xs font-bold px-2 py-1 rounded-full ${isBatchComplete ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                   {isBatchComplete ? <LuCircle className="mr-1" /> : <LuLoader className="mr-1 animate-spin" />}
                   {isBatchComplete ? 'Completed' : 'Pending Cuts'}
                </span>
            </div>
            <p className="text-sm text-gray-600 mb-4">{batch.product_name}</p>
            
            <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Fabric Rolls</h4>
                <div className="space-y-2">
                    {batch.rolls.map(roll => (
                        <button 
                            key={roll.id} 
                            onClick={() => onOpenCutForm(batch.id, roll.id)}
                            className={`w-full text-left p-2 rounded-md transition-colors text-sm font-medium flex justify-between items-center ${roll.is_cut ? 'bg-green-50 text-green-800 hover:bg-green-100' : 'bg-yellow-50 text-yellow-800 hover:bg-yellow-100'}`}
                        >
                            <span>{roll.roll_identifier} ({roll.meter}m)</span>
                            <span>{roll.is_cut ? 'View/Edit Cut' : 'Enter Cut Data'} &rarr;</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

const CuttingDashboardPage = () => {
  const [batches, setBatches] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedCutInfo, setSelectedCutInfo] = useState(null);

  const fetchQueue = useCallback(() => {
    setIsLoading(true);
    cuttingPortalApi.getMyQueue()
      .then(res => {
        // Add this line for debugging
        console.log("API Response for MyQueue:", res.data); 
        
        setBatches(res.data || []);
      })
      .catch(() => setError("Could not load your cutting queue."))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const handleOpenCutForm = (batchId, rollId) => {
    setSelectedCutInfo({ batchId, rollId });
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setSelectedCutInfo(null);
  };

  const handleSaveSuccess = () => {
    handleCloseForm();
    fetchQueue(); // Refresh the dashboard to show updated roll status
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">My Cutting Queue</h1>
      
      {isLoading ? <Spinner /> : error ? (
        <div className="p-4 bg-red-100 text-red-700 rounded-lg">{error}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {batches.length > 0 ? (
            batches.map(batch => <BatchCard key={batch.id} batch={batch} onOpenCutForm={handleOpenCutForm} />)
          ) : (
            <p className="text-center text-gray-500 p-8 col-span-full">Your queue is empty. No batches are currently assigned to your line.</p>
          )}
        </div>
      )}

      {isFormOpen && (
        <Modal title="Enter Cut Data" onClose={handleCloseForm}>
          <CuttingForm 
            batchId={selectedCutInfo.batchId}
            rollId={selectedCutInfo.rollId}
            onSaveSuccess={handleSaveSuccess}
            onClose={handleCloseForm}
          />
        </Modal>
      )}
    </div>
  );
};

export default CuttingDashboardPage;

