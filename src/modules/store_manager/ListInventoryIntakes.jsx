import React, { useState, useEffect, useMemo } from 'react';
import { 
    FileText, Calendar, User, Package, X, Search, Box, Truck, Loader2, Image as ImageIcon, ExternalLink, Scissors, Wrench, DollarSign 
} from 'lucide-react';

import { storeManagerApi } from '../../api/storeManagerApi';
import api from '../../utils/api';


const Spinner = () => <div className="flex justify-center items-center p-12"><Loader2 className="animate-spin h-8 w-8 text-blue-600" /></div>;

const Modal = ({ title, onClose, children }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4 backdrop-blur-sm" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                <h2 className="text-lg font-black text-gray-800">{title}</h2>
                <button onClick={onClose} className="text-gray-400 hover:bg-gray-200 p-1.5 rounded-md transition-colors"><X size={20}/></button>
            </div>
            <div className="p-6 overflow-y-auto bg-gray-50/30">{children}</div>
        </div>
    </div>
);

const DetailView = ({ intake, onClose }) => {
    const isTrims = intake.inventory_category === 'TRIMS';
    
    const imageUrl = useMemo(() => {
        if (!intake.challan_document_path) return null;
        const filename = intake.challan_document_path.split(/[/\\]/).pop();
        return `${api.defaults.baseURLImage}/${filename}`;
    }, [intake.challan_document_path]);

    // Calculate total value of the intake
    const grandTotalValue = useMemo(() => {
        if (!intake.items) return 0;
        return intake.items.reduce((sum, item) => {
            const qty = isTrims ? item.total_units : item.quantity_received;
            const cost = parseFloat(item.unit_cost) || 0;
            return sum + (qty * cost);
        }, 0);
    }, [intake.items, isTrims]);

    return (
        <Modal title={`Goods Receipt Note: ${intake.grn_number}`} onClose={onClose}>
            <div className="space-y-6">
                
                {/* Header Info */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                    <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Category</p>
                        <div className="flex items-center font-bold text-sm">
                            {isTrims ? <><Scissors size={14} className="mr-1.5 text-blue-600"/> <span className="text-blue-700">TRIMS</span></> 
                                     : <><Wrench size={14} className="mr-1.5 text-orange-600"/> <span className="text-orange-700">SPARES</span></>}
                        </div>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Supplier</p>
                        <p className="font-bold text-gray-800 text-sm truncate" title={intake.supplier_name}>{intake.supplier_name}</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Challan / Bill No.</p>
                        <p className="font-mono font-bold text-gray-800 text-sm">{intake.challan_number}</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Received Date</p>
                        <p className="font-bold text-gray-800 text-sm">{new Date(intake.created_at).toLocaleDateString()}</p>
                    </div>
                </div>

                {/* Dynamic Items Table */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                        <h3 className="font-bold text-gray-800 flex items-center"><Package size={18} className="mr-2 text-indigo-500"/> Received Items</h3>
                        <span className="text-xs font-bold text-gray-500 bg-gray-200 px-2.5 py-1 rounded-full">{intake.items?.length || 0} Items</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm text-left">
                            <thead className="bg-white text-gray-500 font-bold border-b border-gray-200 text-xs uppercase tracking-wider">
                                <tr>
                                    <th className="px-4 py-3">{isTrims ? 'Trim Variant' : 'Part Details'}</th>
                                    {isTrims && <th className="px-4 py-3 text-right">Packs</th>}
                                    {isTrims && <th className="px-4 py-3 text-right">Units/Pack</th>}
                                    <th className="px-4 py-3 text-right">Total Qty</th>
                                    <th className="px-4 py-3 text-right">Unit Cost</th>
                                    <th className="px-4 py-3 text-right">Total Value</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {intake.items && intake.items.map((item, idx) => {
                                    const qty = isTrims ? item.total_units : item.quantity_received;
                                    const cost = parseFloat(item.unit_cost) || 0;
                                    const total = qty * cost;

                                    return (
                                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-3 font-medium text-gray-900">
                                                {isTrims ? item.variant_name : (
                                                    <div>
                                                        <span>{item.part_name}</span>
                                                        <span className="block text-[10px] font-mono text-gray-500 mt-0.5">{item.part_number}</span>
                                                    </div>
                                                )}
                                            </td>
                                            {isTrims && <td className="px-4 py-3 text-right text-gray-600 font-mono">{item.packs_received}</td>}
                                            {isTrims && <td className="px-4 py-3 text-right text-gray-600 font-mono">{item.units_per_pack}</td>}
                                            
                                            <td className="px-4 py-3 text-right font-black text-gray-800">{qty}</td>
                                            <td className="px-4 py-3 text-right text-gray-600 font-mono">${cost.toFixed(2)}</td>
                                            <td className="px-4 py-3 text-right font-bold text-emerald-600 font-mono">${total.toFixed(2)}</td>
                                        </tr>
                                    );
                                })}
                                {(!intake.items || intake.items.length === 0) && (
                                    <tr><td colSpan={isTrims ? 6 : 4} className="text-center py-6 text-gray-400 italic font-medium">No items recorded.</td></tr>
                                )}
                            </tbody>
                            <tfoot className="bg-gray-50/80 font-bold text-gray-900 border-t-2 border-gray-200">
                                <tr>
                                    <td colSpan={isTrims ? 5 : 3} className="px-4 py-4 text-right uppercase tracking-wider text-xs text-gray-500">Grand Total Value:</td>
                                    <td className="px-4 py-4 text-right text-lg text-emerald-700 font-black font-mono">
                                        ${grandTotalValue.toFixed(2)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>

                {/* Challan Image Section */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                    <h3 className="font-bold text-gray-800 mb-4 flex items-center"><ImageIcon size={18} className="mr-2 text-blue-500"/> Attached Challan / Bill</h3>
                    <div className="border border-dashed border-gray-300 rounded-lg p-4 bg-gray-50 flex flex-col items-center justify-center min-h-[200px] relative group">
                        {imageUrl ? (
                            <>
                                <img 
                                    src={imageUrl} 
                                    alt="Challan" 
                                    className="max-h-72 object-contain rounded shadow-sm border border-gray-200"
                                    onError={(e) => {
                                        e.target.onerror = null; 
                                        e.target.src = "data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22400%22%20height%3D%22150%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20400%20150%22%20preserveAspectRatio%3D%22none%22%3E%3Cdefs%3E%3Cstyle%20type%3D%22text%2Fcss%22%3E%23holder_18e26%20text%20%7B%20fill%3A%23999%3Bfont-weight%3Anormal%3Bfont-family%3AHelvetica%2C%20monospace%3Bfont-size%3A20pt%20%7D%20%3C%2Fstyle%3E%3C%2Fdefs%3E%3Cg%20id%3D%22holder_18e26%22%3E%3Crect%20width%3D%22400%22%20height%3D%22150%22%20fill%3D%22%23eeeeee%22%3E%3C%2Frect%3E%3Cg%3E%3Ctext%20x%3D%22100%22%20y%3D%2280%22%3EImage%20Not%20Found%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E";
                                    }}
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                                    <a 
                                        href={imageUrl} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="flex items-center px-5 py-2.5 bg-white text-gray-900 rounded-lg hover:bg-gray-100 transition-colors shadow-lg text-sm font-bold"
                                    >
                                        <ExternalLink size={16} className="mr-2" /> Open Full Image
                                    </a>
                                </div>
                            </>
                        ) : (
                            <div className="text-center text-gray-400">
                                <FileText size={48} className="mx-auto mb-3 opacity-30"/>
                                <p className="font-medium">No image uploaded for this intake.</p>
                            </div>
                        )}
                    </div>
                </div>

            </div>
             <div className="mt-6 flex justify-end pt-4 border-t border-gray-200">
                <button onClick={onClose} className="px-6 py-2.5 bg-gray-900 text-white rounded-xl hover:bg-black font-bold transition-all shadow-sm active:scale-95">Close Details</button>
            </div>
        </Modal>
    );
};

export default function ListInventoryIntakes() {
    const [intakes, setIntakes] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedIntake, setSelectedIntake] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCategory, setFilterCategory] = useState('ALL');

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                // Ensure api function is named getInventoryIntakes
                const res = await storeManagerApi.getInventoryIntakes();
                setIntakes(res.data || []);
            } catch (err) {
                console.error("Failed to fetch intakes", err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, []);

    const filteredIntakes = useMemo(() => {
        return intakes.filter(intake => {
            const matchesSearch = 
                (intake.grn_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (intake.challan_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (intake.supplier_name || '').toLowerCase().includes(searchTerm.toLowerCase());
            
            const matchesCategory = filterCategory === 'ALL' || intake.inventory_category === filterCategory;
            
            return matchesSearch && matchesCategory;
        });
    }, [intakes, searchTerm, filterCategory]);

    return (
        <div className="p-4 md:p-8 bg-gray-50 min-h-screen font-sans text-gray-900">
            <div className="max-w-7xl mx-auto">
                {/* Header & Title */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 flex items-center tracking-tight">
                            <Box className="mr-3 text-indigo-600" size={32}/> Inventory Intakes (GRN)
                        </h1>
                        <p className="text-gray-500 font-medium mt-1">Audit log of all Trims and Spare Parts received into the main store.</p>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 mb-6 flex flex-col sm:flex-row gap-4">
                     <div className="relative flex-1">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                            <Search className="text-gray-400" size={18}/>
                        </div>
                        <input 
                            type="text"
                            placeholder="Search GRN, Challan, or Supplier..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-gray-50 outline-none font-medium transition-all"
                        />
                    </div>
                    <div className="sm:w-64">
                        <select 
                            value={filterCategory}
                            onChange={(e) => setFilterCategory(e.target.value)}
                            className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 bg-gray-50 outline-none font-medium cursor-pointer"
                        >
                            <option value="ALL">All Categories</option>
                            <option value="TRIMS">Trims & Accessories</option>
                            <option value="SPARES">Machine Spare Parts</option>
                        </select>
                    </div>
                </div>

                {/* Main Table */}
                {isLoading ? <Spinner /> : (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-left text-sm whitespace-nowrap">
                                <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 font-bold uppercase tracking-wider text-xs">
                                    <tr>
                                        <th className="px-6 py-4">GRN Number</th>
                                        <th className="px-6 py-4">Category</th>
                                        <th className="px-6 py-4">Date</th>
                                        <th className="px-6 py-4">Supplier & Challan</th>
                                        <th className="px-6 py-4">Received By</th>
                                        <th className="px-6 py-4 text-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredIntakes.length === 0 ? (
                                        <tr><td colSpan="6" className="p-12 text-center text-gray-400 font-medium text-base">No GRN records found matching your filters.</td></tr>
                                    ) : filteredIntakes.map(intake => (
                                        <tr key={intake.id} className="hover:bg-blue-50/50 transition-colors group">
                                            <td className="px-6 py-4">
                                                <span className="font-mono font-black text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-100">
                                                    {intake.grn_number || 'LEGACY-TRIM'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                {intake.inventory_category === 'TRIMS' ? (
                                                    <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700 px-2 py-1 rounded"><Scissors size={12} className="mr-1"/> Trims</span>
                                                ) : (
                                                    <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider bg-orange-100 text-orange-700 px-2 py-1 rounded"><Wrench size={12} className="mr-1"/> Spares</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 font-medium text-gray-700">
                                                {new Date(intake.created_at).toLocaleDateString()}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-gray-900">{intake.supplier_name}</div>
                                                <div className="text-xs text-gray-500 flex items-center mt-0.5 font-mono">
                                                    Ref: {intake.challan_number}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-gray-600 font-medium flex items-center">
                                                <User size={14} className="mr-1.5 text-gray-400"/> {intake.received_by || intake.requested_by}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <button 
                                                    onClick={() => setSelectedIntake(intake)}
                                                    className="inline-flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-bold text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 transition-all shadow-sm active:scale-95"
                                                >
                                                    <FileText size={16} className="mr-1.5" /> View GRN
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {selectedIntake && (
                    <DetailView intake={selectedIntake} onClose={() => setSelectedIntake(null)} />
                )}
            </div>
        </div>
    );
}