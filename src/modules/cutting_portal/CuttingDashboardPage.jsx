import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { cuttingPortalApi } from '../../api/cuttingPortalApi';
// Using Fi icons as Lu was causing issues previously
import { FiCheckCircle, FiLoader, FiPackage, FiFilter, FiX, FiEye } from 'react-icons/fi'; 
import Modal from '../../shared/Modal';
import CuttingForm from './CuttingForm';
import { Link } from 'react-router-dom'; // Import Link for navigation

const Spinner = () => <div className="flex justify-center items-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;

const BatchCard = ({ batch, onOpenCutForm }) => {
    // Check if ALL rolls in this batch are marked as cut
    const isBatchComplete = useMemo(() => batch.rolls.every(r => r.is_cut), [batch.rolls]);

    return (
        // Use different border colors and background shades based on completion status
        <div className={`bg-white p-4 rounded-lg shadow border-l-4 ${isBatchComplete ? 'border-green-500 bg-green-50' : 'border-blue-500'}`}>
            <div className="flex justify-between items-start mb-3">
                <div>
                    <h3 className="font-bold text-lg text-gray-800">{batch.batch_code || `Batch #${batch.id}`}</h3>
                    <p className="text-sm text-gray-600">{batch.product_name}</p>
                </div>
                <span className={`flex items-center text-xs font-bold px-2 py-1 rounded-full ${isBatchComplete ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                   {isBatchComplete ? <FiCheckCircle className="mr-1" /> : <FiLoader className="mr-1 animate-spin" />}
                   {isBatchComplete ? 'Completed' : 'Pending Cuts'}
                </span>
            </div>
            
            <div className="mt-4 border-t pt-3">
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Fabric Rolls</h4>
                <div className="space-y-2">
                    {batch.rolls.map(roll => (
                        <div key={roll.id} className={`p-2 rounded-md text-sm font-medium flex justify-between items-center ${roll.is_cut ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                            <span className="flex items-center"> <FiPackage size={14} className="mr-2"/> {roll.roll_identifier} ({roll.meter}m)</span>
                            {/* Button to open the cutting form */}
                            <button 
                                onClick={() => onOpenCutForm(batch.id, roll.id, roll.meter)}
                                className={`px-2 py-0.5 rounded text-xs transition-colors ${roll.is_cut ? 'bg-green-200 hover:bg-green-300' : 'bg-yellow-200 hover:bg-yellow-300'}`}
                            >
                                {roll.is_cut ? 'View/Edit Cut' : 'Enter Cut Data'} &rarr;
                            </button>
                        </div>
                    ))}
                     {/* Link to the new details page */}
                     <Link 
                        to={`/cutting-portal/batch-details/${batch.id}`} 
                        className="mt-2 text-xs text-blue-600 hover:underline flex items-center justify-end"
                     >
                        View Full Details <FiEye className="ml-1"/>
                     </Link>
                </div>
            </div>
        </div>
    );
};

const CuttingDashboardPage = () => {
  const [allBatches, setAllBatches] = useState([]); // Store the original fetched list
  const [filteredBatches, setFilteredBatches] = useState([]); // Store the list to display
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedCutInfo, setSelectedCutInfo] = useState(null);
  const [filterText, setFilterText] = useState('');

  const fetchQueue = useCallback(() => {
    setIsLoading(true);
    setError(null); // Clear previous errors
    cuttingPortalApi.getMyQueue()
      .then(res => {
        const fetchedBatches = res.data || [];
        setAllBatches(fetchedBatches);
        setFilteredBatches(fetchedBatches); // Initially, show all
      })
      .catch((err) => {
          console.error("API Error:", err);
          setError("Could not load your cutting queue. Please check API connection.");
          setAllBatches([]);
          setFilteredBatches([]);
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  // Apply filtering and sorting whenever filterText or allBatches changes
  useEffect(() => {
    let result = [...allBatches]; // Start with a copy of all batches

    // Apply filter
    if (filterText) {
      const lowerFilter = filterText.toLowerCase();
      result = result.filter(batch => 
        (batch.id?.toString().includes(lowerFilter)) || 
        (batch.batch_code?.toLowerCase().includes(lowerFilter))
      );
    }

    // Apply sorting: Pending first, then Completed
    result.sort((a, b) => {
        const aComplete = a.rolls.every(r => r.is_cut);
        const bComplete = b.rolls.every(r => r.is_cut);
        if (aComplete === bComplete) return 0; // Keep original order if status is same
        return aComplete ? 1 : -1; // Put incomplete (false) first
    });

    setFilteredBatches(result);
  }, [filterText, allBatches]);

  const handleOpenCutForm = (batchId, rollId, meter) => {
    setSelectedCutInfo({ batchId, rollId, meter });
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setSelectedCutInfo(null);
  };

  const handleSaveSuccess = () => {
    handleCloseForm();
    fetchQueue(); // Refresh the dashboard
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <header className="pb-4 border-b border-gray-200 mb-6">
          <h1 className="text-3xl font-bold text-gray-800">My Cutting Queue</h1>
          <div className="mt-4 relative max-w-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <FiFilter className="text-gray-400" size={16}/>
              </div>
              <input 
                  type="text"
                  placeholder="Filter by Batch ID or Code..."
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              />
              {filterText && (
                  <button 
                      onClick={() => setFilterText('')} 
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                      title="Clear filter"
                  >
                      <FiX size={18}/>
                  </button>
              )}
          </div>
      </header>
      
      {isLoading ? <Spinner /> : error ? (
        <div className="p-4 bg-red-100 text-red-700 rounded-lg shadow-sm border border-red-200">{error}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredBatches.length > 0 ? (
            filteredBatches.map(batch => <BatchCard key={batch.id} batch={batch} onOpenCutForm={handleOpenCutForm} />)
          ) : (
            <div className="col-span-full text-center py-10 px-4 bg-white rounded-lg shadow-sm border">
                <FiPackage className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-lg font-medium text-gray-900">Queue is Empty</h3>
                <p className="mt-1 text-sm text-gray-500">
                    {filterText ? "No batches match your filter." : "No batches are currently assigned to your line."}
                </p>
            </div>
          )}
        </div>
      )}

      {isFormOpen && (
        <Modal title={`Enter Cut Data for Roll #${selectedCutInfo.rollId}`} onClose={handleCloseForm}>
          <CuttingForm 
            batchId={selectedCutInfo.batchId}
            rollId={selectedCutInfo.rollId}
            meter={selectedCutInfo.meter}
            onSaveSuccess={handleSaveSuccess}
            onClose={handleCloseForm}
          />
        </Modal>
      )}
    </div>
  );
};

export default CuttingDashboardPage;
