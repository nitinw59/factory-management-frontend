import React, { useState, useEffect, useCallback } from 'react';
import { productionManagerApi } from '../../api/productionManagerApi';
import { LuPlus, LuPen, LuTrash2 } from 'react-icons/lu';

// --- UI Components ---
const Spinner = () => <div className="flex justify-center items-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
const Modal = ({ title, children, onClose }) => (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center" onClick={onClose}>
        <div className="bg-white rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b"><h2 className="text-lg font-semibold">{title}</h2></div>
            <div className="p-6">{children}</div>
        </div>
    </div>
);

// --- Form Modal for Production Lines ---
const ProductionLineFormModal = ({ onSave, onClose, initialData = {}, lineTypes = [], lineManagers = [] }) => {
    const [formData, setFormData] = useState({ 
        name: '', 
        production_line_type_id: '', 
        line_manager_user_id: '', 
        ...initialData 
    });
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState(null);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        setError(null);
        try {
            await onSave(formData);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to save production line.');
            setIsSaving(false); // Keep modal open on error
        }
        // Success case is handled by parent closing modal
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="p-3 mb-4 bg-red-100 text-red-700 rounded-md">{error}</div>}
            <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">Line Name</label>
                <input id="name" name="name" value={formData.name} onChange={handleChange} required className="mt-1 w-full p-2 border rounded-md" />
            </div>
            <div>
                <label htmlFor="production_line_type_id" className="block text-sm font-medium text-gray-700">Line Type</label>
                <select id="production_line_type_id" name="production_line_type_id" value={formData.production_line_type_id} onChange={handleChange} required className="mt-1 w-full p-2 border rounded-md">
                    <option value="">Select Type</option>
                    {lineTypes.map(lt => <option key={lt.id} value={lt.id}>{lt.type_name}</option>)}
                </select>
            </div>
            <div>
                <label htmlFor="line_manager_user_id" className="block text-sm font-medium text-gray-700">Line Manager (Optional)</label>
                <select id="line_manager_user_id" name="line_manager_user_id" value={formData.line_manager_user_id || ''} onChange={handleChange} className="mt-1 w-full p-2 border rounded-md">
                    <option value="">Select Manager</option>
                    {lineManagers.map(lm => <option key={lm.id} value={lm.id}>{lm.name}</option>)}
                </select>
            </div>
            <div className="flex justify-end space-x-3 pt-4 border-t">
                <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-md">Cancel</button>
                <button type="submit" disabled={isSaving} className="px-4 py-2 bg-blue-600 text-white rounded-md disabled:bg-gray-400">
                    {isSaving ? 'Saving...' : 'Save Line'}
                </button>
            </div>
        </form>
    );
};


// --- Main Page Component ---
const ProductionLinesPage = () => {
    const [lines, setLines] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [editingLine, setEditingLine] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [error, setError] = useState(null);

    // Data for dropdowns
    const [lineTypes, setLineTypes] = useState([]);
    const [lineManagers, setLineManagers] = useState([]);

    const fetchLinesAndOptions = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            // Fetch lines and dropdown options in parallel
            const [linesRes, typesRes, managersRes] = await Promise.all([
                productionManagerApi.getAllProductionLines(),
                productionManagerApi.getLineTypes(),
                productionManagerApi.getLineManagers(),
            ]);
            setLines(linesRes.data || []);
            setLineTypes(typesRes.data || []);
            setLineManagers(managersRes.data || []);
        } catch (err) {
            console.error("Failed to fetch production lines or options:", err);
            setError("Could not load data. Please try again.");
            setLines([]); // Clear lines on error
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchLinesAndOptions();
    }, [fetchLinesAndOptions]);

    const handleOpenModal = (line = null) => {
        setEditingLine(line); // If line is null, it's an "Add New" action
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingLine(null);
    };

    const handleSave = async (lineData) => {
        try {
            if (lineData.id) {
                // Update existing line
                await productionManagerApi.updateProductionLine(lineData.id, lineData);
            } else {
                // Create new line
                await productionManagerApi.createProductionLine(lineData);
            }
            handleCloseModal();
            fetchLinesAndOptions(); // Refresh the list
        } catch (error) {
             console.error("Failed to save production line:", error);
            // Re-throw the error to be caught by the modal's handler
             throw error; 
        }
    };

    const handleDelete = async (lineId) => {
        if (window.confirm('Are you sure you want to delete this production line? This might affect related data.')) {
            try {
                await productionManagerApi.deleteProductionLine(lineId);
                fetchLinesAndOptions(); // Refresh the list
            } catch (error) {
                console.error("Failed to delete production line:", error);
                alert(error.response?.data?.error || 'Could not delete line.');
            }
        }
    };

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            <header className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800">Production Lines</h1>
                <button onClick={() => handleOpenModal()} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center font-semibold">
                    <LuPlus size={18} className="mr-1"/> Add New Line
                </button>
            </header>

            {error && <div className="p-4 mb-4 bg-red-100 text-red-700 rounded-lg">{error}</div>}

            <div className="bg-white rounded-lg shadow-md border overflow-hidden">
                {isLoading ? <Spinner /> : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full bg-white">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Line Name</th>
                                    <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                                    <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Manager</th>
                                    <th className="py-3 px-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {lines.length === 0 && !isLoading && (
                                     <tr><td colSpan="4" className="text-center py-6 text-gray-500">No production lines found.</td></tr>
                                )}
                                {lines.map(line => (
                                    <tr key={line.id} className="hover:bg-gray-50">
                                        <td className="py-4 px-4 whitespace-nowrap font-medium text-gray-900">{line.name}</td>
                                        <td className="py-4 px-4 whitespace-nowrap text-gray-600">{line.type_name}</td>
                                        <td className="py-4 px-4 whitespace-nowrap text-gray-600">{line.line_manager_name || <span className="text-gray-400 italic">None</span>}</td>
                                        <td className="py-4 px-4 whitespace-nowrap text-center">
                                            <div className="flex items-center justify-center space-x-4">
                                                <button onClick={() => handleOpenModal(line)} className="text-gray-400 hover:text-blue-600" title="Edit"><LuPen size={16}/></button>
                                                <button onClick={() => handleDelete(line.id)} className="text-gray-400 hover:text-red-600" title="Delete"><LuTrash2 size={16}/></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {isModalOpen && (
                <Modal title={editingLine ? 'Edit Production Line' : 'Add New Production Line'} onClose={handleCloseModal}>
                    <ProductionLineFormModal 
                        onSave={handleSave}
                        onClose={handleCloseModal}
                        initialData={editingLine || {}}
                        lineTypes={lineTypes}
                        lineManagers={lineManagers}
                    />
                </Modal>
            )}
        </div>
    );
};

export default ProductionLinesPage;
