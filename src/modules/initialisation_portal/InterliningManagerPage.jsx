import React, { useState, useEffect } from 'react';
import { Layers, Plus, Save, ArrowRight, Loader2, AlertCircle, FileText, X, Check, AlertTriangle, Edit3 } from 'lucide-react';
import api from '../../utils/api'; 

const Spinner = () => <div className="flex justify-center p-8"><Loader2 className="animate-spin h-8 w-8 text-indigo-600" /></div>;

const InterliningManagerPage = () => {
    // Data State
    const [templates, setTemplates] = useState([]);
    const [products, setProducts] = useState([]);
    const [fabricTypes, setFabricTypes] = useState([]); 
    const [colors, setColors] = useState([]);
    
    // UI State
    const [isLoading, setIsLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const [editingId, setEditingId] = useState(null); // ✅ NEW: Track if we are editing

    // Form State
    const [formData, setFormData] = useState({
        product_id: '',
        interlining_fabric_type_id: '',
        consumption: '',
    });

    // Mapping State: { [shell_color_id]: interlining_color_id }
    const [mappingSelections, setMappingSelections] = useState({});

    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        setIsLoading(true);
        try {
            const [templatesRes, formRes] = await Promise.all([
                api.get('/initialization-portal/interlining/templates'),
                api.get('/initialization-portal/interlining/form-data')
            ]);
            setTemplates(templatesRes.data);
            setProducts(formRes.data.products);
            setFabricTypes(formRes.data.fabricTypes);
            setColors(formRes.data.fabricColors);
        } catch (err) {
            console.error(err);
            setError('Failed to load data.');
        } finally {
            setIsLoading(false);
        }
    };

    // --- Form Handlers ---

    const handleMappingSelection = (shellColorId, interliningColorId) => {
        setMappingSelections(prev => ({
            ...prev,
            [shellColorId]: interliningColorId
        }));
    };

    const autoMatchColors = () => {
        const newMappings = {};
        colors.forEach(shellColor => {
            const match = colors.find(c => c.id === shellColor.id); 
            if (match) newMappings[shellColor.id] = match.id;
        });
        setMappingSelections(newMappings);
    };

    // ✅ NEW: Handle Editing Population
    const handleEdit = (template) => {
        setFormData({
            product_id: template.product_id,
            interlining_fabric_type_id: template.interlining_fabric_type_id,
            consumption: template.consumption_per_piece,
        });

        const initialMappings = {};
        if (template.mappings) {
            template.mappings.forEach(m => {
                initialMappings[m.fabric_color_id] = m.interlining_color_id;
            });
        }
        setMappingSelections(initialMappings);
        setEditingId(template.id);
        setShowForm(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancel = () => {
        setShowForm(false);
        setEditingId(null);
        setFormData({
            product_id: '',
            interlining_fabric_type_id: '',
            consumption: ''
        });
        setMappingSelections({});
        setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        
        if (!formData.product_id || !formData.interlining_fabric_type_id || !formData.consumption) {
            setError('Please fill in all required fields.');
            return;
        }

        const validMappings = Object.entries(mappingSelections).map(([shellId, interliningId]) => ({
            fabric_color_id: parseInt(shellId),
            interlining_color_id: parseInt(interliningId)
        })).filter(m => m.interlining_color_id); 

        if (validMappings.length === 0) {
            setError('Please map at least one shell fabric color to an interlining color.');
            return;
        }

        setIsSaving(true);
        try {
            // ✅ Handle PUT for Edit, POST for Create
            if (editingId) {
                await api.put(`/initialization-portal/interlining/templates/${editingId}`, {
                    ...formData,
                    mappings: validMappings
                });
            } else {
                await api.post('/initialization-portal/interlining/templates', {
                    ...formData,
                    mappings: validMappings
                });
            }
            
            handleCancel();
            fetchInitialData();
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.error || 'Failed to save template. It might already exist for this product/type combination.');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <Spinner />;

    return (
        <div className="p-6 bg-slate-50 min-h-screen font-inter text-slate-800">
            <header className="mb-8 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-extrabold text-slate-900 flex items-center">
                        <Layers className="mr-3 text-indigo-600" /> Interlining Management
                    </h1>
                    <p className="text-slate-500 mt-1">Define consumption and color mapping rules for interlining.</p>
                </div>
                {!showForm && (
                    <button 
                        onClick={() => {
                            handleCancel(); // clear any edit state
                            setShowForm(true);
                        }}
                        className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm font-medium"
                    >
                        <Plus className="w-4 h-4 mr-2" /> New Template
                    </button>
                )}
            </header>

            {/* --- CREATE / EDIT FORM --- */}
            {showForm && (
                <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6 mb-8 animate-in slide-in-from-top-4">
                    <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                        <h2 className="text-lg font-bold text-slate-800">
                            {editingId ? 'Edit Interlining Rule' : 'Create New Interlining Rule'}
                        </h2>
                        <button onClick={handleCancel} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
                    </div>

                    {error && (
                        <div className="mb-4 p-3 bg-rose-50 text-rose-700 rounded-lg flex items-center text-sm border border-rose-100">
                            <AlertCircle className="w-4 h-4 mr-2" /> {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit}>
                        {/* 1. Header Details */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Product Style</label>
                                <select 
                                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-slate-100"
                                    value={formData.product_id}
                                    onChange={e => setFormData({...formData, product_id: e.target.value})}
                                    required
                                    disabled={editingId !== null} // Prevent changing product on edit
                                >
                                    <option value="">Select Product...</option>
                                    {products.map(p => (
                                        <option key={p.id} value={p.id}>{p.name} ({p.style_code})</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Interlining Fabric Type</label>
                                <select 
                                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-slate-100"
                                    value={formData.interlining_fabric_type_id}
                                    onChange={e => setFormData({...formData, interlining_fabric_type_id: e.target.value})}
                                    required
                                    disabled={editingId !== null} // Prevent changing type on edit
                                >
                                    <option value="">Select Interlining Type...</option>
                                    {fabricTypes.map(t => (
                                        <option key={t.id} value={t.id}>{t.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Avg. Consumption (Meters)</label>
                                <input 
                                    type="number" 
                                    step="0.001"
                                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                    placeholder="e.g. 0.25"
                                    value={formData.consumption}
                                    onChange={e => setFormData({...formData, consumption: e.target.value})}
                                    required
                                />
                            </div>
                        </div>

                        {/* 2. Color Mapping Table */}
                        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                            <div className="flex justify-between items-end mb-3">
                                <h3 className="text-sm font-bold text-slate-700 flex items-center">
                                    <Layers className="w-4 h-4 mr-2 text-indigo-500"/> Color Mapping Rules
                                </h3>
                                <button 
                                    type="button" 
                                    onClick={autoMatchColors}
                                    className="text-xs text-blue-600 hover:text-blue-800 underline"
                                >
                                    Auto-match same colors
                                </button>
                            </div>

                            <div className="overflow-hidden border border-slate-200 rounded-lg bg-white">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                                        <tr>
                                            <th className="px-4 py-2 text-left">Shell Fabric Color</th>
                                            <th className="px-4 py-2 text-center w-8"></th>
                                            <th className="px-4 py-2 text-left">Interlining Color</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {colors.map((shellColor) => (
                                            <tr key={shellColor.id} className="hover:bg-slate-50">
                                                <td className="px-4 py-2 text-slate-700 font-medium">
                                                    {shellColor.name} <span className="text-slate-400 text-xs">({shellColor.color_number})</span>
                                                </td>
                                                <td className="px-4 py-2 text-center text-slate-300">
                                                    <ArrowRight size={16} />
                                                </td>
                                                <td className="px-4 py-2">
                                                    <select 
                                                        className={`w-full p-2 text-sm border rounded focus:ring-1 focus:ring-indigo-500 outline-none ${mappingSelections[shellColor.id] ? 'border-indigo-200 bg-indigo-50 text-indigo-900' : 'border-slate-300 text-slate-500'}`}
                                                        value={mappingSelections[shellColor.id] || ''}
                                                        onChange={e => handleMappingSelection(shellColor.id, e.target.value)}
                                                    >
                                                        <option value="">Select Interlining Color...</option>
                                                        {colors.map(c => (
                                                            <option key={c.id} value={c.id}>{c.name} ({c.color_number})</option>
                                                        ))}
                                                    </select>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className="text-xs text-slate-500 mt-2 text-right">
                                Unmapped colors will trigger warnings in production.
                            </p>
                        </div>

                        {/* Actions */}
                        <div className="mt-6 flex justify-end gap-3">
                            <button 
                                type="button"
                                onClick={handleCancel}
                                className="px-5 py-2.5 border border-slate-300 rounded-lg text-slate-600 font-medium hover:bg-slate-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                type="submit"
                                disabled={isSaving}
                                className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 shadow-sm disabled:opacity-70 flex items-center"
                            >
                                {isSaving ? <Loader2 className="animate-spin w-4 h-4 mr-2"/> : <Save className="w-4 h-4 mr-2"/>}
                                {editingId ? 'Update Template' : 'Save Template'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* --- LIST OF TEMPLATES --- */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {templates.map(tmpl => {
                    const mappedCount = tmpl.mappings ? tmpl.mappings.length : 0;
                    const totalColors = colors.length;
                    const isMissingMappings = mappedCount < totalColors;

                    return (
                        <div key={tmpl.id} className={`bg-white rounded-xl shadow-sm border transition-shadow overflow-hidden group ${isMissingMappings ? 'border-amber-300 ring-1 ring-amber-100' : 'border-slate-200 hover:shadow-md'}`}>
                            <div className={`p-4 border-b flex justify-between items-start ${isMissingMappings ? 'bg-amber-50 border-amber-200' : 'bg-slate-50/50 border-slate-50'}`}>
                                <div>
                                    <h3 className="font-bold text-slate-800">{tmpl.product_name}</h3>
                                    <p className="text-xs text-slate-500">{tmpl.style_code}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={() => handleEdit(tmpl)}
                                        className="text-slate-400 hover:text-indigo-600 p-1 bg-white rounded border border-slate-200 shadow-sm transition-colors"
                                        title="Edit Template"
                                    >
                                        <Edit3 size={14}/>
                                    </button>
                                    <div className="bg-white px-2 py-1 rounded border border-slate-200 text-xs font-mono text-indigo-600 shadow-sm">
                                        {tmpl.consumption_per_piece}m
                                    </div>
                                </div>
                            </div>
                            
                            <div className="p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center text-xs font-bold text-slate-400 uppercase">
                                        <FileText className="w-3 h-3 mr-1.5" />
                                        {tmpl.interlining_type}
                                    </div>
                                    {isMissingMappings ? (
                                        <span className="text-[10px] font-bold text-amber-600 flex items-center bg-amber-100 px-2 py-0.5 rounded-full">
                                            <AlertTriangle className="w-3 h-3 mr-1" />
                                            {totalColors - mappedCount} Missing
                                        </span>
                                    ) : (
                                        <span className="text-[10px] font-bold text-emerald-600 flex items-center bg-emerald-50 px-2 py-0.5 rounded-full">
                                            <Check className="w-3 h-3 mr-1" />
                                            Complete
                                        </span>
                                    )}
                                </div>
                                
                                <div className="space-y-1.5">
                                    {tmpl.mappings && tmpl.mappings.slice(0, 3).map((map, i) => (
                                        <div key={i} className="flex items-center justify-between text-xs text-slate-700 bg-slate-50 p-1.5 rounded">
                                            <span>{map.fabric_color}</span>
                                            <ArrowRight className="w-3 h-3 text-slate-300" />
                                            <span className="font-medium text-indigo-700">{map.interlining_color}</span>
                                        </div>
                                    ))}
                                    {tmpl.mappings && tmpl.mappings.length > 3 && (
                                        <p className="text-[10px] text-center text-slate-400 pt-1">
                                            + {tmpl.mappings.length - 3} more color rules
                                        </p>
                                    )}
                                    {(!tmpl.mappings || tmpl.mappings.length === 0) && (
                                        <p className="text-xs text-center text-gray-400 italic">No color mappings defined.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
                
                {templates.length === 0 && !isLoading && !showForm && (
                    <div className="col-span-full py-20 text-center border-2 border-dashed border-slate-200 rounded-xl">
                        <Layers className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-500 font-medium">No interlining templates found.</p>
                        <button onClick={() => setShowForm(true)} className="mt-2 text-indigo-600 font-bold hover:underline">Create your first template</button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default InterliningManagerPage;