import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { cuttingPortalApi } from '../../api/cuttingPortalApi';
import { 
    CheckCircle, Loader2, Package, Filter, X, Eye, 
    ChevronDown, Scissors, Ruler, AlertCircle, Box, CircleDashed 
} from 'lucide-react';
import Modal from '../../shared/Modal';
import CuttingForm from './CuttingForm';
import { Link } from 'react-router-dom';

const Spinner = () => <div className="flex justify-center items-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>;

const BatchCard = ({ batch, onOpenCutForm }) => {
    // Logic: Batch is complete if EVERY roll is marked is_cut
    const isBatchComplete = useMemo(() => batch.rolls.every(r => r.is_cut), [batch.rolls]);
    
    // Logic: Calculate progress
    const totalRolls = batch.rolls.length;
    const cutRolls = batch.rolls.filter(r => r.is_cut).length;
    const progressPercent = totalRolls > 0 ? Math.round((cutRolls / totalRolls) * 100) : 0;

    // UI Styles based on status
    const statusConfig = isBatchComplete 
        ? { 
            bg: 'bg-emerald-50', 
            border: 'border-emerald-200', 
            text: 'text-emerald-700', 
            icon: CheckCircle, 
            label: 'Completed',
            accent: 'bg-emerald-500' 
          }
        : { 
            bg: 'bg-white', 
            border: 'border-slate-200', 
            text: 'text-blue-600', 
            icon: Scissors, 
            label: 'In Progress',
            accent: 'bg-blue-500'
          };

    return (
        <div className={`rounded-2xl shadow-sm border ${statusConfig.border} flex flex-col h-full overflow-hidden transition-all duration-200 hover:shadow-md bg-white`}>
            {/* Card Header */}
            <div className={`p-4 border-b ${isBatchComplete ? 'border-emerald-100 bg-emerald-50/30' : 'border-slate-100 bg-white'}`}>
                <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg ${isBatchComplete ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                            <Box size={16} />
                        </div>
                        <span className="text-xs font-bold font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                            #{batch.id}
                        </span>
                    </div>
                    <span className={`flex items-center px-2.5 py-1 text-[10px] uppercase font-bold tracking-wider rounded-full border ${isBatchComplete ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>
                        <statusConfig.icon size={12} className="mr-1.5"/>
                        {statusConfig.label}
                    </span>
                </div>

                <div className="mt-1">
                    <h3 className="font-bold text-lg text-slate-800 leading-tight">{batch.batch_code}</h3>
                    <p className="text-sm text-slate-500 mt-0.5 line-clamp-1">{batch.product_name}</p>
                </div>
            </div>
            
            {/* Progress Section */}
            <div className="px-4 pt-4 pb-2 bg-slate-50/50">
                <div className="flex justify-between items-center mb-2">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center">
                        <Package size={12} className="mr-1.5"/> Fabric Rolls
                    </h4>
                    <span className="text-xs font-medium text-slate-600 bg-white px-2 py-0.5 rounded shadow-sm border border-slate-100">
                        {cutRolls} / {totalRolls} Cut
                    </span>
                </div>
                
                {/* Progress Bar */}
                <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                    <div 
                        className={`h-full rounded-full transition-all duration-500 ${statusConfig.accent}`} 
                        style={{ width: `${progressPercent}%` }}
                    ></div>
                </div>
            </div>

            {/* Roll List */}
            <div className="flex-1 p-2 space-y-2 bg-slate-50/50 overflow-y-auto max-h-60">
                {batch.rolls.map(roll => (
                    <div 
                        key={roll.id} 
                        className={`p-3 rounded-xl border flex justify-between items-center transition-colors shadow-sm ${
                            roll.is_cut 
                            ? 'bg-white border-emerald-100' 
                            : 'bg-white border-slate-200 hover:border-blue-300'
                        }`}
                    >
                        <div className="min-w-0 pr-2">
                            <div className="flex items-center gap-1.5">
                                {roll.is_cut ? (
                                    <CheckCircle size={14} className="text-emerald-500 shrink-0"/>
                                ) : (
                                    <CircleDashed size={14} className="text-slate-300 shrink-0"/>
                                )}
                                <span className={`font-semibold text-sm truncate ${roll.is_cut ? 'text-slate-600' : 'text-slate-800'}`}>
                                    {roll.roll_identifier}
                                    {/* Added Color Number */}
                                    {roll.color_number && <span className="text-slate-500 font-normal ml-1">({roll.color_number})</span>}
                                </span>
                            </div>
                            <div className="text-xs text-slate-400 flex items-center mt-0.5 ml-5">
                                <Ruler size={10} className="mr-1"/> {roll.meter}m
                            </div>
                        </div>
                        
                        <button 
                            onClick={() => onOpenCutForm(batch.id, roll.id, roll.meter)}
                            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all active:scale-95 shrink-0 ${
                                roll.is_cut 
                                ? 'bg-slate-100 text-slate-500 hover:bg-slate-200' 
                                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-200'
                            }`}
                        >
                            {roll.is_cut ? 'Edit' : 'Cut'}
                        </button>
                    </div>
                ))}
            </div>

            {/* Footer */}
            <div className="p-3 bg-white border-t border-slate-100 flex justify-center">
                 <Link 
                    to={`/cutting-portal/batch-details/${batch.id}`} 
                    className="text-xs font-bold text-slate-500 hover:text-blue-600 flex items-center transition-colors px-4 py-2 rounded-lg hover:bg-slate-50 w-full justify-center"
                 >
                    View Details <Eye size={14} className="ml-2"/>
                 </Link>
            </div>
        </div>
    );
};


// --- COLLAPSIBLE GROUP COMPONENT ---
const BatchStatusGroup = ({ title, count, statusColor, children, isOpen, onToggle }) => {
    // Map status colors to Tailwind classes
    const colorClasses = {
        'blue': 'bg-blue-100 text-blue-700',
        'green': 'bg-emerald-100 text-emerald-700'
    }[statusColor] || 'bg-slate-100 text-slate-700';

    return (
        <div className="mb-6 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div 
                onClick={onToggle}
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 transition-colors select-none"
            >
                <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-lg bg-slate-100 text-slate-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
                        <ChevronDown size={18}/>
                    </div>
                    <h3 className="font-bold text-slate-700 text-base md:text-lg">
                        {title}
                    </h3>
                </div>
                <span className={`px-2.5 py-1 text-xs font-extrabold rounded-full ${colorClasses}`}>
                    {count}
                </span>
            </div>
            
            {isOpen && (
                <div className="p-4 md:p-6 bg-slate-50/50 border-t border-slate-100 animate-in slide-in-from-top-2 duration-300">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
  
  // Filter States
  const [filterText, setFilterText] = useState('');
  const [meterFilter, setMeterFilter] = useState('');
  // New State for Mobile Filter Toggle
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  
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

    // Filter by Text (Batch Code/ID)
    if (filterText) {
      const lowerFilter = filterText.toLowerCase();
      result = result.filter(batch => 
        (batch.id?.toString().includes(lowerFilter)) || 
        (batch.batch_code?.toLowerCase().includes(lowerFilter))
      );
    }

    // Filter by Meter
    if (meterFilter) {
        const meterVal = parseFloat(meterFilter);
        if (!isNaN(meterVal)) {
            result = result.filter(batch => 
                batch.rolls.some(r => r.meter.toString().includes(meterFilter))
            );
        }
    }

    setFilteredBatches(result);
  }, [filterText, meterFilter, allBatches]);

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

  const hasActiveFilters = filterText || meterFilter;

  return (
    <div className="min-h-screen bg-slate-50 font-inter text-slate-800 pb-20">
      {/* Responsive Header:
        - Reduced vertical padding (py-3).
        - Stacking logic changed to keep top bar accessible.
      */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 md:px-8 md:py-4 sticky top-0 z-10 shadow-sm transition-all">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between">
            
            {/* Title Row */}
            <div className="flex justify-between items-center w-full md:w-auto mb-2 md:mb-0">
                <div>
                    <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center">
                        <Scissors className="mr-2 text-indigo-600" size={24}/> Cutting Queue
                    </h1>
                    {/* Hide description on mobile to save space */}
                    <p className="text-slate-500 text-sm mt-0.5 hidden sm:block">Manage roll cuts and layer assignments.</p>
                </div>

                {/* Mobile Toggle Button for Filters */}
                <button 
                    onClick={() => setShowMobileFilters(!showMobileFilters)}
                    className={`md:hidden p-2 rounded-lg transition-colors relative ${showMobileFilters || hasActiveFilters ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:bg-slate-100'}`}
                >
                    <Filter size={20} />
                    {hasActiveFilters && !showMobileFilters && (
                        <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
                    )}
                </button>
            </div>
            
            {/* Search Bar Container - Collapsible on Mobile */}
            <div className={`flex flex-col sm:flex-row gap-3 w-full md:w-auto transition-all duration-300 ease-in-out ${showMobileFilters ? 'max-h-40 opacity-100 mt-2' : 'max-h-0 opacity-0 md:max-h-none md:opacity-100 md:mt-0'} overflow-hidden md:overflow-visible`}>
                
                {/* Batch Search */}
                <div className="relative flex-grow md:w-64">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Filter className="text-slate-400" size={16}/>
                    </div>
                    <input 
                        type="text"
                        placeholder="Search Batch ID..."
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        className="w-full pl-9 pr-9 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-slate-50 focus:bg-white transition-all shadow-sm text-sm"
                    />
                    {filterText && (
                        <button 
                            onClick={() => setFilterText('')} 
                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                        >
                            <X size={16}/>
                        </button>
                    )}
                </div>

                {/* Meter Filter */}
                <div className="relative flex-grow md:w-48">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Ruler className="text-slate-400" size={16}/>
                    </div>
                    <input 
                        type="number"
                        placeholder="Filter by Meter..."
                        value={meterFilter}
                        onChange={(e) => setMeterFilter(e.target.value)}
                        className="w-full pl-9 pr-9 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-slate-50 focus:bg-white transition-all shadow-sm text-sm"
                    />
                    {meterFilter && (
                        <button 
                            onClick={() => setMeterFilter('')} 
                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                        >
                            <X size={16}/>
                        </button>
                    )}
                </div>
            </div>
          </div>
      </header>
      
      <main className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8">
          {isLoading ? <Spinner /> : error ? (
            <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-100 flex items-center justify-center font-medium">
                <AlertCircle className="mr-2"/> {error}
            </div>
          ) : filteredBatches.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200 mt-6">
                <Package className="w-16 h-16 text-slate-300 mx-auto mb-4"/>
                <h3 className="text-xl font-bold text-slate-700">No Batches Found</h3>
                <p className="text-slate-400 mt-2">
                    {(filterText || meterFilter) ? "Try adjusting your search filters." : "Your cutting queue is currently empty."}
                </p>
            </div>
          ) : (
            <div className="space-y-6">
                {/* PENDING GROUP */}
                {groupedBatches.PENDING.length > 0 && (
                    <BatchStatusGroup 
                        title="Pending Action" 
                        count={groupedBatches.PENDING.length}
                        statusColor="blue"
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
                        statusColor="green"
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
      </main>

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