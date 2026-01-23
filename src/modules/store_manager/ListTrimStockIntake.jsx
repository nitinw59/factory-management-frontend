import React, { useState, useEffect, useMemo } from 'react';
import { 
    FileText, Calendar, User, Package, X, Search, Box, Truck, Loader2, Image as ImageIcon, ExternalLink 
} from 'lucide-react';
import { storeManagerApi } from '../../api/storeManagerApi';
import api from '../../utils/api';
const Spinner = () => <div className="flex justify-center items-center p-12"><Loader2 className="animate-spin h-8 w-8 text-blue-600" /></div>;

const Modal = ({ title, onClose, children }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4 backdrop-blur-sm" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
            </div>
            <div className="p-6 overflow-y-auto">{children}</div>
        </div>
    </div>
);

const DetailView = ({ intake, onClose }) => {
    console.log('Intake DetailView props:', intake);    
    // Logic to construct image URL from the stored path
    const imageUrl = useMemo(() => {
        if (!intake.challan_document_path) return null;
        // 1. Extract filename from full path (works for both Unix / and Windows \ paths)
        const filename = intake.challan_document_path.split(/[/\\]/).pop();
        // 2. Construct static URL (Backend serves /uploads statically)
        console.log('Constructed image URL:', `${api.defaults.baseURLImage}/${filename}`);
        return `${api.defaults.baseURLImage}/${filename}`;
    }, [intake.challan_document_path]);

    return (
        <Modal title={`Intake Details: ${intake.challan_number}`} onClose={onClose}>
            <div className="space-y-6">
                {/* Header Info */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-blue-50 p-4 rounded-lg border border-blue-100">
                    <div>
                        <p className="text-xs font-bold text-blue-500 uppercase mb-1">Supplier</p>
                        <p className="font-medium text-gray-800 flex items-center"><Truck size={14} className="mr-1.5"/>{intake.supplier_name}</p>
                    </div>
                    <div>
                        <p className="text-xs font-bold text-blue-500 uppercase mb-1">Received By</p>
                        <p className="font-medium text-gray-800 flex items-center"><User size={14} className="mr-1.5"/>{intake.requested_by}</p>
                    </div>
                    <div>
                        <p className="text-xs font-bold text-blue-500 uppercase mb-1">Date</p>
                        <p className="font-medium text-gray-800 flex items-center"><Calendar size={14} className="mr-1.5"/>{new Date(intake.created_at).toLocaleDateString()}</p>
                    </div>
                </div>

                {/* Items Table */}
                <div>
                    <h3 className="font-bold text-gray-700 mb-3 flex items-center"><Package size={18} className="mr-2"/> Received Items</h3>
                    <div className="border rounded-lg overflow-hidden">
                        <table className="min-w-full text-sm text-left">
                            <thead className="bg-gray-100 text-gray-600 font-medium">
                                <tr>
                                    <th className="px-4 py-3">Item Variant</th>
                                    <th className="px-4 py-3 text-right">Packs</th>
                                    <th className="px-4 py-3 text-right">Unit/Pack</th>
                                    <th className="px-4 py-3 text-right">Total Units</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {intake.items && intake.items.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 text-gray-800 font-medium">{item.variant_name}</td>
                                        <td className="px-4 py-3 text-right text-gray-600">{item.packs_received}</td>
                                        <td className="px-4 py-3 text-right text-gray-600">{item.units_per_pack}</td>
                                        <td className="px-4 py-3 text-right font-bold text-blue-600">{item.total_units}</td>
                                    </tr>
                                ))}
                                {(!intake.items || intake.items.length === 0) && (
                                    <tr><td colSpan="4" className="text-center py-4 text-gray-500 italic">No items recorded.</td></tr>
                                )}
                            </tbody>
                            <tfoot className="bg-gray-50 font-semibold text-gray-800">
                                <tr>
                                    <td colSpan="3" className="px-4 py-3 text-right">Grand Total:</td>
                                    <td className="px-4 py-3 text-right text-indigo-700">
                                        {intake.items ? intake.items.reduce((sum, i) => sum + i.total_units, 0) : 0}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>

                {/* Challan Image Section */}
                <div>
                    <h3 className="font-bold text-gray-700 mb-3 flex items-center"><ImageIcon size={18} className="mr-2"/> Challan Document</h3>
                    <div className="border rounded-lg p-4 bg-gray-50 flex flex-col items-center justify-center min-h-[150px]">
                        {imageUrl ? (
                            <>
                                <img 
                                    src={imageUrl} 
                                    alt="Challan" 
                                    className="max-h-60 object-contain rounded shadow-sm border border-gray-200 mb-3"
                                    onError={(e) => {
                                        e.target.onerror = null; 
                                        //e.target.src = "https://via.placeholder.com/400x150?text=Image+Not+Found";
                                    }}
                                />
                                <a 
                                    href={imageUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="flex items-center px-4 py-2 bg-white text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors shadow-sm text-sm font-medium"
                                >
                                    <ExternalLink size={16} className="mr-2" />
                                    Open Full Size Image
                                </a>
                            </>
                        ) : (
                            <div className="text-center text-gray-400">
                                <FileText size={40} className="mx-auto mb-2 opacity-50"/>
                                <p>No image uploaded for this intake.</p>
                            </div>
                        )}
                    </div>
                </div>

            </div>
             <div className="mt-8 flex justify-end">
                <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-medium transition-colors">Close</button>
            </div>
        </Modal>
    );
};

const ListTrimStockIntake = () => {
    const [intakes, setIntakes] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedIntake, setSelectedIntake] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const res = await storeManagerApi.getTrimStockIntakes();
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
        return intakes.filter(intake => 
            intake.challan_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
            intake.supplier_name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [intakes, searchTerm]);

    return (
        <div className="p-6 bg-gray-100 min-h-screen font-inter text-slate-800">
            <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                        <Box className="mr-3 text-indigo-600" size={28}/> Trim Stock Intakes
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">History of all accessories and trims received.</p>
                </div>
                 <div className="relative w-full md:w-72">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="text-gray-400" size={16}/>
                    </div>
                    <input 
                        type="text"
                        placeholder="Search Challan or Supplier..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white shadow-sm"
                    />
                </div>
            </div>

            {isLoading ? <Spinner /> : (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <table className="min-w-full text-left text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-4 font-semibold text-gray-700">Challan No.</th>
                                <th className="px-6 py-4 font-semibold text-gray-700">Date</th>
                                <th className="px-6 py-4 font-semibold text-gray-700">Supplier</th>
                                <th className="px-6 py-4 font-semibold text-gray-700">Received By</th>
                                <th className="px-6 py-4 font-semibold text-gray-700 text-right">Items Count</th>
                                <th className="px-6 py-4 font-semibold text-gray-700 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredIntakes.length === 0 ? (
                                <tr><td colSpan="6" className="p-8 text-center text-gray-500 italic">No records found.</td></tr>
                            ) : filteredIntakes.map(intake => (
                                <tr key={intake.id} className="hover:bg-gray-50 transition-colors group">
                                    <td className="px-6 py-4 font-mono font-medium text-indigo-600">{intake.challan_number}</td>
                                    <td className="px-6 py-4 text-gray-600">{new Date(intake.created_at).toLocaleDateString()}</td>
                                    <td className="px-6 py-4 text-gray-800 font-medium">{intake.supplier_name}</td>
                                    <td className="px-6 py-4 text-gray-500">{intake.requested_by}</td>
                                    <td className="px-6 py-4 text-right">
                                        <span className="bg-gray-100 text-gray-700 py-1 px-2.5 rounded-full text-xs font-bold">
                                            {intake.items?.length || 0}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <button 
                                            onClick={() => setSelectedIntake(intake)}
                                            className="text-gray-400 hover:text-indigo-600 transition-colors p-1.5 rounded-md hover:bg-indigo-50"
                                            title="View Details & Challan"
                                        >
                                            <FileText size={18} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {selectedIntake && (
                <DetailView intake={selectedIntake} onClose={() => setSelectedIntake(null)} />
            )}
        </div>
    );
};

export default ListTrimStockIntake;