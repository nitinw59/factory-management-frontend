import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { cuttingPortalApi } from '../../api/cuttingPortalApi';
import { 
    CheckCircle, Loader2, Package, Filter, X, Eye, 
    ChevronDown, ChevronRight, Scissors, Ruler, AlertCircle, Box 
} from 'lucide-react';
import Modal from '../../shared/Modal';
import CuttingForm from './CuttingForm';
import { Link } from 'react-router-dom'; // Import Link for navigation

const Spinner = () => <div className="flex justify-center items-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
const BatchCard = ({ batch, onOpenCutForm }) => {
    // Logic: Batch is complete if EVERY roll is marked is_cut
    const isBatchComplete = useMemo(() => batch.rolls.every(r => r.is_cut), [batch.rolls]);
    
    // Logic: Calculate progress
    const totalRolls = batch.rolls.length;
    const cutRolls = batch.rolls.filter(r => r.is_cut).length;
    const progressPercent = totalRolls > 0 ? Math.round((cutRolls / totalRolls) * 100) : 0;

    let statusStyles = 'bg-blue-50 text-blue-700 border-blue-200 ring-1 ring-blue-500/20';
    let borderColor = 'border-t-blue-500';
    
    if (isBatchComplete) {
        statusStyles = 'bg-green-50 text-green-700 border-green-200 ring-1 ring-green-500/20';
        borderColor = 'border-t-green-500';
    }

    return (
        <div className={`bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-full hover:shadow-lg transition-all duration-300 border-t-4 ${borderColor}`}>
            <div className="p-5 border-b border-gray-100">
                <div className="flex justify-between items-start mb-3">
                    <div className="flex flex-col">
                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Batch ID</span>
                        <div className="bg-gradient-to-r from-slate-700 to-slate-800 text-white px-3 py-1 rounded-md shadow-md flex items-center">
                            <Box size={14} className="mr-1.5 opacity-80" />
                            <span className="text-sm font-bold font-mono tracking-wide">#{batch.id}</span>
                        </div>
                    </div>
                    <span className={`flex items-center px-2.5 py-1 text-[10px] uppercase font-bold tracking-wider rounded-full border ${statusStyles}`}>
                        {isBatchComplete ? <CheckCircle size={12} className="mr-1"/> : <Scissors size={12} className="mr-1"/>}
                        {isBatchComplete ? 'Completed' : 'Pending Cuts'}
                    </span>
                </div>

                <div>
                    <h3 className="font-bold text-lg text-gray-800 leading-tight">{batch.batch_code}</h3>
                    <p className="text-sm text-gray-500 mt-1">{batch.product_name}</p>
                </div>
            </div>
            
            <div className="p-5 flex-1 bg-gray-50/30">
                <div className="flex justify-between items-center mb-3">
                    <h4 className="text-xs font-bold text-gray-500 uppercase flex items-center"><Package size={14} className="mr-1.5"/> Fabric Rolls</h4>
                    <span className="text-xs font-medium text-gray-500">{cutRolls} / {totalRolls} Cut</span>
                </div>
                
                {/* Progress Bar */}
                <div className="w-full bg-gray-200 rounded-full h-1.5 mb-4">
                    <div className="bg-blue-600 h-1.5 rounded-full transition-all duration-500" style={{ width: `${progressPercent}%` }}></div>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {batch.rolls.map(roll => (
                        <div 
                            key={roll.id} 
                            className={`p-2.5 rounded-lg border text-sm flex justify-between items-center transition-colors ${
                                roll.is_cut 
                                ? 'bg-green-50/50 border-green-100 text-green-800' 
                                : 'bg-white border-gray-200 text-gray-700 hover:border-blue-300'
                            }`}
                        >
                            <div>
                                <div className="font-medium flex items-center">
                                    {roll.roll_identifier}
                                    {roll.is_cut && <CheckCircle size={12} className="ml-1.5 text-green-600"/>}
                                </div>
                                <div className="text-xs text-gray-500 flex items-center mt-0.5">
                                    <Ruler size={10} className="mr-1"/> {roll.meter}m
                                </div>
                            </div>
                            
                            <button 
                                onClick={() => onOpenCutForm(batch.id, roll.id, roll.meter)}
                                className={`px-3 py-1.5 rounded text-xs font-medium transition-all shadow-sm ${
                                    roll.is_cut 
                                    ? 'bg-white border border-green-200 text-green-700 hover:bg-green-50' 
                                    : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow'
                                }`}
                            >
                                {roll.is_cut ? 'Edit' : 'Enter Cut'}
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            <div className="p-3 bg-white border-t border-gray-100 rounded-b-xl flex justify-end">
                 <Link 
                    to={`/cutting-portal/batch-details/${batch.id}`} 
                    className="text-xs font-bold text-slate-600 hover:text-blue-600 flex items-center transition-colors px-3 py-1 rounded hover:bg-slate-50"
                 >
                    View Full Details <Eye size={14} className="ml-1.5"/>
                 </Link>
            </div>
        </div>
    );
};


// --- COLLAPSIBLE GROUP COMPONENT ---
const BatchStatusGroup = ({ title, count, statusColor, children, isOpen, onToggle }) => {
    return (
        <div className="mb-6 border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white">
            <div 
                onClick={onToggle}
                className="flex items-center justify-between p-4 cursor-pointer bg-gray-50/80 hover:bg-gray-100 transition-colors select-none"
            >
                <div className="flex items-center space-x-3">
                    <div className={`p-1.5 rounded-full bg-white shadow-sm border border-gray-100 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
                        <ChevronDown className="w-4 h-4 text-gray-600"/>
                    </div>
                    <h3 className="font-bold text-gray-800 text-lg flex items-center">
                        {title}
                        <span className={`ml-3 px-2.5 py-0.5 text-xs font-bold rounded-full ${statusColor}`}>
                            {count}
                        </span>
                    </h3>
                </div>
            </div>
            
            {isOpen && (
                <div className="p-4 bg-gray-50/30 border-t border-gray-200 animate-in slide-in-from-top-2 duration-200">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3  gap-6">
                        {children}
                    </div>
                </div>
            )}
        </div>
    );
};


// --- MAIN PAGE ---
const CuttingDashboardPage = () => {
  const [allBatches, setAllBatches] = useState([]); 
  const [filteredBatches, setFilteredBatches] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedCutInfo, setSelectedCutInfo] = useState(null);
  const [filterText, setFilterText] = useState('');
  
  // State for collapsible sections
  const [expandedSections, setExpandedSections] = useState({
      PENDING: true,
      COMPLETED: false
  });

  const fetchQueue = useCallback(() => {
    setIsLoading(true);
    setError(null);
    cuttingPortalApi.getMyQueue()
      .then(res => {
        const fetchedBatches = res.data || [];
        console.log("Fetched Batches:", fetchedBatches);
        setAllBatches(fetchedBatches);
        setFilteredBatches(fetchedBatches);
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

  // Filtering Logic
  useEffect(() => {
    let result = [...allBatches];
    if (filterText) {
      const lowerFilter = filterText.toLowerCase();
      result = result.filter(batch => 
        (batch.id?.toString().includes(lowerFilter)) || 
        (batch.batch_code?.toLowerCase().includes(lowerFilter))
      );
    }
    setFilteredBatches(result);
  }, [filterText, allBatches]);

  // Grouping Logic
  const groupedBatches = useMemo(() => {
      const groups = {
          PENDING: [],
          COMPLETED: []
      };

      filteredBatches.forEach(batch => {
          const isComplete = batch.rolls.every(r => r.is_cut);
          if (isComplete) {
              groups.COMPLETED.push(batch);
          } else {
              groups.PENDING.push(batch);
          }
      });
      return groups;
  }, [filteredBatches]);

  const toggleSection = (section) => {
      setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

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
    fetchQueue();
  };

  return (
    <div className="p-6 bg-gray-100 min-h-screen font-inter text-slate-800">
      <header className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
                <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Cutting Queue</h1>
                <p className="text-gray-500 mt-1">Manage fabric cuts and layer details.</p>
            </div>
            
            {/* Search Bar */}
            <div className="relative w-full md:w-80">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Filter className="text-gray-400" size={16}/>
                </div>
                <input 
                    type="text"
                    placeholder="Filter by Batch ID or Code..."
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm"
                />
                {filterText && (
                    <button 
                        onClick={() => setFilterText('')} 
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                    >
                        <X size={16}/>
                    </button>
                )}
            </div>
          </div>
      </header>
      
      {isLoading ? <Spinner /> : error ? (
        <div className="p-4 bg-red-100 text-red-700 rounded-lg shadow-sm border border-red-200 flex items-center justify-center">
            <AlertCircle className="mr-2"/> {error}
        </div>
      ) : filteredBatches.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-4"/>
            <h3 className="text-xl font-semibold text-gray-700">Queue is Empty</h3>
            <p className="text-gray-500 mt-2">
                {filterText ? "No batches match your filter." : "No batches currently assigned."}
            </p>
        </div>
      ) : (
        <div className="space-y-4">
            {/* PENDING GROUP */}
            {groupedBatches.PENDING.length > 0 && (
                <BatchStatusGroup 
                    title="Pending Action" 
                    count={groupedBatches.PENDING.length}
                    statusColor="bg-blue-100 text-blue-800"
                    isOpen={expandedSections.PENDING}
                    onToggle={() => toggleSection('PENDING')}
                >
                    {groupedBatches.PENDING.map(batch => (
                        <BatchCard 
                            key={batch.id} 
                            batch={batch} 
                            onOpenCutForm={handleOpenCutForm} 
                        />
                    ))}
                </BatchStatusGroup>
            )}

            {/* COMPLETED GROUP */}
            {groupedBatches.COMPLETED.length > 0 && (
                <BatchStatusGroup 
                    title="Completed" 
                    count={groupedBatches.COMPLETED.length}
                    statusColor="bg-green-100 text-green-800"
                    isOpen={expandedSections.COMPLETED}
                    onToggle={() => toggleSection('COMPLETED')}
                >
                    {groupedBatches.COMPLETED.map(batch => (
                        <BatchCard 
                            key={batch.id} 
                            batch={batch} 
                            onOpenCutForm={handleOpenCutForm} 
                        />
                    ))}
                </BatchStatusGroup>
            )}
        </div>
      )}

      {isFormOpen && (
        <Modal title={`Enter Cut Data: Roll #${selectedCutInfo.rollId}`} onClose={handleCloseForm}>
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