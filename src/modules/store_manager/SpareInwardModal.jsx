import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
    X, ChevronDown, Search, Plus, Trash2, Loader2,
    Truck, FileText, Image as ImageIcon, AlertCircle,
} from 'lucide-react';

import { sparesApi } from '../../api/sparesApi';
import { storeManagerApi } from '../../api/storeManagerApi';
import { purchaseDeptApi } from '../../api/purchaseDeptApi';

// --- SearchableDropdown (copy of UnifiedIntakeForm pattern; extract to shared in a separate PR) ---
const DROPDOWN_HEIGHT = 280; // approx max-h-60 panel + search header
const SearchableDropdown = ({ options = [], value, onChange, placeholder, disabled, labelKey = 'name' }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [openUp, setOpenUp] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const wrapperRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredOptions = options.filter(o => (o[labelKey] || '').toLowerCase().includes(searchTerm.toLowerCase()));
    const selectedOption = options.find(opt =>
        value !== '' && value != null && String(opt.id) === String(value)
    );

    const handleSelect = (option) => {
        onChange(option.id);
        setIsOpen(false);
        setSearchTerm('');
    };

    const handleToggle = () => {
        if (disabled) return;
        if (!isOpen && wrapperRef.current) {
            const rect = wrapperRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            setOpenUp(spaceBelow < DROPDOWN_HEIGHT && spaceAbove > spaceBelow);
        }
        setIsOpen(!isOpen);
    };

    return (
        <div className="relative w-full" ref={wrapperRef}>
            <button
                type="button"
                onClick={handleToggle}
                disabled={disabled}
                className={`w-full p-2 border rounded-lg bg-white text-left flex justify-between items-center text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all ${disabled ? 'bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200' : 'hover:border-gray-400 border-gray-300'}`}
            >
                <span className={`block truncate ${!selectedOption ? 'text-gray-400' : 'text-gray-800 font-medium'}`}>
                    {selectedOption ? selectedOption[labelKey] : placeholder}
                </span>
                <ChevronDown size={16} className="text-gray-400 shrink-0 ml-2" />
            </button>
            {isOpen && (
                <div className={`absolute z-30 w-full bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-hidden flex flex-col ${openUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                    <div className="p-2 border-b border-gray-100 bg-gray-50 sticky top-0">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                            <input
                                type="text"
                                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                placeholder="Search..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                autoFocus
                            />
                        </div>
                    </div>
                    <div className="overflow-y-auto flex-1">
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map(option => (
                                <div
                                    key={option.id}
                                    onClick={() => handleSelect(option)}
                                    className={`px-4 py-2 text-sm cursor-pointer hover:bg-indigo-50 transition-colors ${String(option.id) === String(value) ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-gray-700'}`}
                                >
                                    {option[labelKey]}
                                </div>
                            ))
                        ) : (
                            <div className="px-4 py-4 text-sm text-gray-500 text-center italic">No matches.</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const today = () => new Date().toISOString().slice(0, 10);
const newKey = () => Math.random().toString(36).slice(2);

const blankFreeRow = (prefill = {}) => ({
    _key: newKey(),
    spare_part_id: prefill.spare_part_id ?? '',
    qty_received: '',
    unit_price: prefill.unit_price ?? '',
    description: '',
});

// --- Main Modal ---
const SpareInwardModal = ({ spares = [], prefilledPartId = null, onClose, onSuccess }) => {
    const [mode, setMode] = useState('free'); // 'free' | 'po'

    // Common fields
    const [receivedDate, setReceivedDate] = useState(today());
    const [grnNumber, setGrnNumber] = useState('');
    const [condition, setCondition] = useState('');
    const [notes, setNotes] = useState('');
    const [scanFile, setScanFile] = useState(null);

    // Free-form
    const [supplierId, setSupplierId] = useState('');
    const [suppliers, setSuppliers] = useState([]);
    const [freeItems, setFreeItems] = useState(() => {
        if (prefilledPartId) {
            const part = spares.find(s => String(s.id) === String(prefilledPartId));
            return [blankFreeRow({ spare_part_id: prefilledPartId, unit_price: part?.unit_cost || '' })];
        }
        return [blankFreeRow()];
    });

    // PO-linked
    const [availablePOs, setAvailablePOs] = useState([]);
    const [selectedPOId, setSelectedPOId] = useState('');
    const [poDetail, setPoDetail] = useState(null);
    const [loadingPos, setLoadingPos] = useState(false);
    const [loadingPoDetail, setLoadingPoDetail] = useState(false);
    const [poItems, setPoItems] = useState([]); // derived from poDetail when picked

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    // Load suppliers once.
    useEffect(() => {
        let cancelled = false;
        storeManagerApi.getSuppliers()
            .then(r => { if (!cancelled) setSuppliers(r.data?.data ?? r.data ?? []); })
            .catch(() => { if (!cancelled) setSuppliers([]); });
        return () => { cancelled = true; };
    }, []);

    // Lazy-load PO list when the user switches to PO mode the first time.
    useEffect(() => {
        if (mode !== 'po' || availablePOs.length > 0 || loadingPos) return;
        setLoadingPos(true);
        Promise.all(['ISSUED', 'PARTIAL_RECEIPT'].map(s =>
            purchaseDeptApi.getOrders({ status: s })
                .then(r => r.data?.data ?? r.data ?? [])
                .catch(() => [])
        )).then(arrs => {
            const seen = new Set();
            const merged = arrs.flat().filter(po => {
                if (!po || seen.has(po.id)) return false;
                seen.add(po.id);
                return true;
            }).map(po => ({
                ...po,
                _label: `${po.po_number || po.po_code || `PO #${po.id}`}${po.supplier_name ? ` — ${po.supplier_name}` : ''}`,
            }));
            setAvailablePOs(merged);
        }).finally(() => setLoadingPos(false));
    }, [mode, availablePOs.length, loadingPos]);

    // Fetch PO detail + derive spare items when one is picked.
    useEffect(() => {
        if (!selectedPOId) {
            setPoDetail(null);
            setPoItems([]);
            return;
        }
        let cancelled = false;
        setLoadingPoDetail(true);
        purchaseDeptApi.getOrderById(selectedPOId)
            .then(r => {
                if (cancelled) return;
                const po = r.data?.data ?? r.data;
                setPoDetail(po);
                const spareLines = (po?.items || []).filter(it => it.item_type === 'spare');
                setPoItems(spareLines.map(line => ({
                    _key: newKey(),
                    purchase_order_item_id: line.id,
                    spare_part_id: line.spare_part_id,
                    name: line.description || line.spare_part_name || line.name || `Spare #${line.spare_part_id}`,
                    qty_required: parseFloat(line.quantity ?? line.qty_required ?? 0) || 0,
                    qty_received: '',
                    unit_price: line.unit_price ?? '',
                    include: true,
                })));
            })
            .catch(() => {
                if (!cancelled) { setPoDetail(null); setPoItems([]); }
            })
            .finally(() => { if (!cancelled) setLoadingPoDetail(false); });
        return () => { cancelled = true; };
    }, [selectedPOId]);

    const updateFreeRow = (key, patch) => {
        setFreeItems(prev => prev.map(it => it._key === key ? { ...it, ...patch } : it));
    };

    const updatePoRow = (key, patch) => {
        setPoItems(prev => prev.map(it => it._key === key ? { ...it, ...patch } : it));
    };

    const handleAddFreeRow = () => setFreeItems(prev => [...prev, blankFreeRow()]);
    const handleRemoveFreeRow = (key) => setFreeItems(prev => prev.filter(it => it._key !== key));

    const handleModeSwitch = (next) => {
        if (mode === next) return;
        setMode(next);
        setError(null);
    };

    const sparesPickerOptions = useMemo(() => spares.map(s => ({
        ...s,
        _label: `${s.name}${s.part_number ? ` · ${s.part_number}` : ''}`,
    })), [spares]);

    const handleSubmit = useCallback(async (e) => {
        e?.preventDefault();
        setError(null);

        if (!receivedDate) {
            setError('Received date is required.');
            return;
        }

        let payload;
        if (mode === 'free') {
            const cleaned = freeItems
                .map(it => ({
                    spare_part_id: it.spare_part_id,
                    qty_received: parseFloat(it.qty_received),
                    unit_price: it.unit_price === '' ? undefined : parseFloat(it.unit_price),
                    description: it.description?.trim() || undefined,
                }))
                .filter(it => it.spare_part_id && Number.isFinite(it.qty_received) && it.qty_received > 0);
            if (cleaned.length === 0) {
                setError('Add at least one row with a spare and a positive qty.');
                return;
            }
            payload = {
                received_date: receivedDate,
                supplier_id: supplierId || undefined,
                grn_number: grnNumber || undefined,
                condition: condition || undefined,
                notes: notes || undefined,
                items: cleaned,
            };
        } else {
            if (!selectedPOId) { setError('Pick a purchase order first.'); return; }
            const cleaned = poItems
                .filter(it => it.include)
                .map(it => ({
                    purchase_order_item_id: it.purchase_order_item_id,
                    qty_received: parseFloat(it.qty_received),
                    unit_price: it.unit_price === '' || it.unit_price == null
                        ? undefined
                        : parseFloat(it.unit_price),
                }))
                .filter(it => Number.isFinite(it.qty_received) && it.qty_received > 0);
            if (cleaned.length === 0) {
                setError('Tick at least one line and enter a positive qty.');
                return;
            }
            payload = {
                purchase_order_id: selectedPOId,
                received_date: receivedDate,
                grn_number: grnNumber || undefined,
                condition: condition || undefined,
                notes: notes || undefined,
                items: cleaned,
            };
        }

        setSubmitting(true);
        try {
            const r = await sparesApi.createSpareInward(payload, scanFile);
            onSuccess?.(r.data);
        } catch (err) {
            const msg = err.response?.data?.error || err.message || 'Failed to create spare inward.';
            setError(msg);
        } finally {
            setSubmitting(false);
        }
    }, [mode, freeItems, poItems, receivedDate, supplierId, grnNumber, condition, notes, scanFile, selectedPOId, onSuccess]);

    const submitDisabled = submitting || (
        mode === 'free'
            ? !freeItems.some(it => it.spare_part_id && parseFloat(it.qty_received) > 0)
            : !selectedPOId || !poItems.some(it => it.include && parseFloat(it.qty_received) > 0)
    );

    return (
        <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-white flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                    <Truck className="w-5 h-5 text-indigo-600" />
                    <h3 className="font-bold text-gray-900 text-lg">Receive Stock — Spares</h3>
                </div>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors flex items-center gap-1.5 text-sm font-medium" type="button">
                    <X size={18} /> Close
                </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto">
                    <div className="max-w-5xl mx-auto p-6 space-y-5">
                        {/* Mode toggle */}
                        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
                            <button
                                type="button"
                                onClick={() => handleModeSwitch('free')}
                                className={`px-4 py-1.5 text-sm font-bold rounded-md transition-colors ${mode === 'free' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Free-form
                            </button>
                            <button
                                type="button"
                                onClick={() => handleModeSwitch('po')}
                                className={`px-4 py-1.5 text-sm font-bold rounded-md transition-colors ${mode === 'po' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Against PO
                            </button>
                        </div>

                        {error && (
                            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                <div>{error}</div>
                            </div>
                        )}

                        {/* Common fields */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Received Date *</label>
                                <input
                                    type="date"
                                    required
                                    value={receivedDate}
                                    onChange={e => setReceivedDate(e.target.value)}
                                    className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">GRN Number</label>
                                <input
                                    type="text"
                                    value={grnNumber}
                                    onChange={e => setGrnNumber(e.target.value)}
                                    placeholder="GRN-2026-..."
                                    className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Condition</label>
                                <input
                                    type="text"
                                    value={condition}
                                    onChange={e => setCondition(e.target.value)}
                                    placeholder="Good"
                                    className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5 flex items-center gap-1">
                                    <ImageIcon className="w-3 h-3" /> Scan (JPG)
                                </label>
                                <input
                                    type="file"
                                    accept="image/jpeg"
                                    onChange={e => setScanFile(e.target.files?.[0] || null)}
                                    className="w-full text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5 flex items-center gap-1">
                                    <FileText className="w-3 h-3" /> Notes
                                </label>
                                <textarea
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                    rows={2}
                                    placeholder="Free-text notes about this receipt..."
                                    className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                                />
                            </div>
                        </div>

                        {/* Mode-specific body */}
                        {mode === 'free' && (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Supplier (optional)</label>
                                    <SearchableDropdown
                                        options={suppliers}
                                        value={supplierId}
                                        onChange={(id) => setSupplierId(id)}
                                        placeholder="Select supplier..."
                                        labelKey="name"
                                    />
                                </div>

                                <div className="border border-gray-200 rounded-lg overflow-hidden">
                                    <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex justify-between items-center">
                                        <span className="text-xs font-bold text-gray-700 uppercase">Items</span>
                                        <button
                                            type="button"
                                            onClick={handleAddFreeRow}
                                            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                                        >
                                            <Plus className="w-3.5 h-3.5" /> Add row
                                        </button>
                                    </div>
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50 text-[10px] uppercase text-gray-500 font-bold tracking-wider border-b border-gray-200">
                                            <tr>
                                                <th className="px-3 py-2 text-left">Spare Part</th>
                                                <th className="px-3 py-2 text-right w-24">Qty Received</th>
                                                <th className="px-3 py-2 text-right w-28">Unit Price</th>
                                                <th className="px-3 py-2 text-left">Description</th>
                                                <th className="px-3 py-2 w-10"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {freeItems.map(row => (
                                                <tr key={row._key}>
                                                    <td className="px-3 py-2 min-w-[220px]">
                                                        <SearchableDropdown
                                                            options={sparesPickerOptions}
                                                            value={row.spare_part_id}
                                                            onChange={(id) => {
                                                                const part = spares.find(s => String(s.id) === String(id));
                                                                updateFreeRow(row._key, {
                                                                    spare_part_id: id,
                                                                    unit_price: row.unit_price || part?.unit_cost || '',
                                                                });
                                                            }}
                                                            placeholder="Pick part..."
                                                            labelKey="_label"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="1"
                                                            value={row.qty_received}
                                                            onChange={e => updateFreeRow(row._key, { qty_received: e.target.value })}
                                                            onWheel={e => e.target.blur()}
                                                            className="w-full text-right p-1.5 border border-gray-300 rounded text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="0.01"
                                                            value={row.unit_price}
                                                            onChange={e => updateFreeRow(row._key, { unit_price: e.target.value })}
                                                            onWheel={e => e.target.blur()}
                                                            placeholder="(optional)"
                                                            className="w-full text-right p-1.5 border border-gray-300 rounded text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2 min-w-[140px]">
                                                        <input
                                                            type="text"
                                                            value={row.description}
                                                            onChange={e => updateFreeRow(row._key, { description: e.target.value })}
                                                            placeholder="(optional)"
                                                            className="w-full p-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2 text-center">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveFreeRow(row._key)}
                                                            disabled={freeItems.length === 1}
                                                            className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-1 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                                                            title="Remove row"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {mode === 'po' && (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5 flex items-center gap-2">
                                        Purchase Order *
                                        {loadingPos && <Loader2 className="w-3 h-3 animate-spin text-indigo-500" />}
                                    </label>
                                    <SearchableDropdown
                                        options={availablePOs}
                                        value={selectedPOId}
                                        onChange={(id) => setSelectedPOId(id)}
                                        placeholder={loadingPos ? 'Loading POs...' : 'Search PO by number...'}
                                        labelKey="_label"
                                        disabled={loadingPos}
                                    />
                                </div>

                                {selectedPOId && (
                                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                                        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex justify-between items-center">
                                            <span className="text-xs font-bold text-gray-700 uppercase">Spare Lines on PO</span>
                                            {loadingPoDetail && <Loader2 className="w-3 h-3 animate-spin text-indigo-500" />}
                                        </div>
                                        {!loadingPoDetail && poItems.length === 0 && (
                                            <div className="p-6 text-center text-sm text-gray-500 italic">
                                                {poDetail ? 'This PO has no item_type=spare lines.' : 'Loading PO details...'}
                                            </div>
                                        )}
                                        {poItems.length > 0 && (
                                            <table className="w-full text-sm">
                                                <thead className="bg-gray-50 text-[10px] uppercase text-gray-500 font-bold tracking-wider border-b border-gray-200">
                                                    <tr>
                                                        <th className="px-3 py-2 w-10"></th>
                                                        <th className="px-3 py-2 text-left">Spare Part</th>
                                                        <th className="px-3 py-2 text-right w-24">Required</th>
                                                        <th className="px-3 py-2 text-right w-24">Qty Received</th>
                                                        <th className="px-3 py-2 text-right w-28">Unit Price</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {poItems.map(row => (
                                                        <tr key={row._key} className={row.include ? '' : 'opacity-50'}>
                                                            <td className="px-3 py-2 text-center">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={row.include}
                                                                    onChange={e => updatePoRow(row._key, { include: e.target.checked })}
                                                                    className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                                />
                                                            </td>
                                                            <td className="px-3 py-2 font-medium text-gray-900">{row.name}</td>
                                                            <td className="px-3 py-2 text-right font-mono text-gray-600">{row.qty_required.toLocaleString()}</td>
                                                            <td className="px-3 py-2">
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    step="1"
                                                                    value={row.qty_received}
                                                                    onChange={e => updatePoRow(row._key, { qty_received: e.target.value })}
                                                                    onWheel={e => e.target.blur()}
                                                                    disabled={!row.include}
                                                                    className="w-full text-right p-1.5 border border-gray-300 rounded text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-gray-50 disabled:text-gray-400"
                                                                />
                                                            </td>
                                                            <td className="px-3 py-2">
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    step="0.01"
                                                                    value={row.unit_price}
                                                                    onChange={e => updatePoRow(row._key, { unit_price: e.target.value })}
                                                                    onWheel={e => e.target.blur()}
                                                                    disabled={!row.include}
                                                                    placeholder="(override)"
                                                                    className="w-full text-right p-1.5 border border-gray-300 rounded text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-gray-50 disabled:text-gray-400"
                                                                />
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-200 bg-white flex justify-end gap-3 shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-bold text-gray-700 bg-white border border-gray-300 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={submitDisabled}
                        className="px-5 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                    >
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
                        {submitting ? 'Submitting...' : 'Receive Stock'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default SpareInwardModal;
