import React, { useState, useEffect } from 'react';
import { adminApi } from '../../api/adminApi';

// The Updated Schema Tables
const TRACKING_TABLES = [
    { value: 'SKIP', label: 'Do Not Track (e.g., Staging)' },
    { value: 'cut_piece_log', label: '1. Cut Piece Log (Raw Cut & Number Generation)' },
    { value: 'numbering_piece_log', label: '1b. Numbering Piece Log' },
    { value: 'preparation_bundle_log', label: '2. Preparation Bundle Log' },
    { value: 'sewing_piece_log', label: '3. Sewing Piece Log' },
    { value: 'assembly_garment_log', label: '4. Assembly Garment Log (Serialized Funnel)' },
    { value: 'finishing_garment_log', label: '5. Finishing Garment Log (Post-Assembly)' },
    { value: 'generic_standard_piece_log', label: '6a. Generic Piece Table (Future Expansions)' },
    { value: 'generic_standard_bundle_log', label: '6b. Generic Bundle Table (Future Expansions)' }
];

const PROCESSING_MODES = [
    { value: 'PIECE', label: 'Piece-by-Piece (Scan 1 part/garment)' },
    { value: 'BUNDLE', label: 'Bundle Mode (Scan grouped parts)' },
    { value: 'ROLL', label: 'Raw Roll (Scan fabric roll)' },
    { value: 'SERIALIZED', label: 'Serialized (Generate Garment QR)' }
];

const PROCESSING_SCOPES = [
    { value: 'ALL_PARTS', label: 'All Parts' },
    { value: 'PRIMARY_ONLY', label: 'Primary Panels Only' },
    { value: 'SUPPORTING_ONLY', label: 'Supporting Parts Only' },
    { value: 'ASSEMBLY', label: 'Garment Assembly (Funnel)' },
    { value: 'FINISHING', label: 'Finishing & Packing' }
];

const AdminLineConfigPage = () => {
    const [lines, setLines] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({
        type_name: '',
        tracking_table_name: 'cut_piece_log', // Updated default
        processing_mode: 'ROLL',
        processing_scope: 'ALL_PARTS'
    });

    useEffect(() => {
        fetchLines();
    }, []);

    const fetchLines = async () => {
        try {
            const res = await adminApi.getAllLines();
            setLines(res.data);
        } catch (error) {
            console.error("Failed to load lines", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleInputChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleEdit = (line) => {
        setEditingId(line.id);
        setFormData({
            type_name: line.type_name,
            tracking_table_name: line.tracking_table_name || 'SKIP',
            processing_mode: line.processing_mode || 'PIECE',
            processing_scope: line.processing_scope || 'ALL_PARTS'
        });
    };

    const handleCancel = () => {
        setEditingId(null);
        setFormData({ type_name: '', tracking_table_name: 'cut_piece_log', processing_mode: 'ROLL', processing_scope: 'ALL_PARTS' });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            if (editingId) {
                await adminApi.updateLine(editingId, formData);
            } else {
                await adminApi.createLine(formData);
            }
            await fetchLines();
            handleCancel(); 
        } catch (error) {
            // This safely catches and displays the custom validation strings sent from the backend!
            alert(error.response?.data?.error || "Failed to save configuration.");
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <div className="p-8 text-center text-slate-500">Loading configurations...</div>;

    return (
        <div className="max-w-6xl mx-auto p-6">
            <h1 className="text-2xl font-black text-slate-800 mb-6">Factory Architecture Configuration</h1>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-8">
                <h2 className="text-lg font-bold text-slate-700 mb-4">
                    {editingId ? 'Edit Line Configuration' : 'Create New Line'}
                </h2>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Display Name</label>
                            <input 
                                type="text" name="type_name" required placeholder="e.g., Main Sewing Line"
                                value={formData.type_name} onChange={handleInputChange}
                                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Processing Mode</label>
                            <select 
                                name="processing_mode" value={formData.processing_mode} onChange={handleInputChange}
                                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                            >
                                {PROCESSING_MODES.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Database Table Routing</label>
                            <select 
                                name="tracking_table_name" value={formData.tracking_table_name} onChange={handleInputChange}
                                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white font-mono text-sm"
                            >
                                {TRACKING_TABLES.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Processing Scope</label>
                            <select 
                                name="processing_scope" value={formData.processing_scope} onChange={handleInputChange}
                                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                            >
                                {PROCESSING_SCOPES.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        {editingId && (
                            <button type="button" onClick={handleCancel} className="px-4 py-2 bg-slate-100 text-slate-600 font-bold rounded-lg hover:bg-slate-200 transition">
                                Cancel
                            </button>
                        )}
                        <button type="submit" disabled={isSaving} className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition disabled:opacity-50">
                            {isSaving ? 'Saving...' : (editingId ? 'Update Configuration' : 'Save New Line')}
                        </button>
                    </div>
                </form>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-bold">
                        <tr>
                            <th className="p-4 border-b">ID</th>
                            <th className="p-4 border-b">Department Name</th>
                            <th className="p-4 border-b">Mode & Scope</th>
                            <th className="p-4 border-b">Database Target</th>
                            <th className="p-4 border-b text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {lines.map((line) => (
                            <tr key={line.id} className="hover:bg-slate-50 transition">
                                <td className="p-4 text-slate-500 font-mono">{line.id}</td>
                                <td className="p-4 font-bold text-slate-800">{line.type_name}</td>
                                <td className="p-4">
                                    <span className="inline-block px-2 py-1 bg-indigo-50 text-indigo-700 rounded text-xs font-bold mr-2">{line.processing_mode || 'N/A'}</span>
                                    <span className="inline-block px-2 py-1 bg-emerald-50 text-emerald-700 rounded text-xs font-bold">{line.processing_scope || 'N/A'}</span>
                                </td>
                                <td className="p-4 font-mono text-xs text-slate-600">{line.tracking_table_name || 'NULL'}</td>
                                <td className="p-4 text-right">
                                    <button 
                                        onClick={() => handleEdit(line)}
                                        className="text-blue-600 hover:text-blue-800 font-bold text-xs uppercase tracking-wider"
                                    >
                                        Edit
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AdminLineConfigPage;