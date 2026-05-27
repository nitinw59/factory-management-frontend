import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Save, Plus, Trash2, IndianRupee, Receipt,
    ChevronDown, ChevronRight, Search, Loader2, FileText, CheckCircle2,
    Printer, Edit2, X, RotateCcw, AlertTriangle, Undo2
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { storeManagerApi } from '../../api/storeManagerApi';

// --- Toast Notification Component ---
const Toast = ({ message, type }) => {
    if (!message) return null;
    const bg = type === 'error' ? 'bg-red-500' : 'bg-green-500';
    return (
        <div className={`fixed bottom-4 right-4 ${bg} text-white px-6 py-3 rounded-lg shadow-xl z-50 animate-bounce`}>
            {message}
        </div>
    );
};

// --- Searchable Dropdown Component ---
const SearchableDropdown = ({ options = [], value, onChange, placeholder, disabled, labelKey = 'name' }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const wrapperRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredOptions = options.filter(option => 
        (option[labelKey] || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const selectedOption = options.find(opt => 
        value !== '' && value !== null && value !== undefined && String(opt.id) === String(value)
    );

    const handleSelect = (option) => {
        onChange(option.id);
        setIsOpen(false);
        setSearchTerm('');
    };

    return (
        <div className="relative w-full" ref={wrapperRef}>
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={`w-full p-3 border border-gray-300 rounded-lg bg-white text-left flex justify-between items-center focus:ring-2 focus:ring-indigo-500 outline-none transition-all ${disabled ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'hover:border-gray-400'}`}
            >
                <span className={`block truncate ${!selectedOption ? 'text-gray-400 font-normal' : 'text-gray-900 font-bold'}`}>
                    {selectedOption ? selectedOption[labelKey] : placeholder}
                </span>
                <ChevronDown size={18} className="text-gray-400 shrink-0" />
            </button>

            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-2xl max-h-72 overflow-hidden flex flex-col">
                    <div className="p-2 border-b border-gray-100 bg-gray-50 sticky top-0">
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                            <input
                                type="text"
                                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                placeholder="Search variants..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                autoFocus
                            />
                        </div>
                    </div>
                    <div className="overflow-y-auto flex-1">
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map((option) => (
                                <div
                                    key={option.id}
                                    onClick={() => handleSelect(option)}
                                    className={`px-4 py-3 text-sm cursor-pointer border-b border-gray-50 last:border-b-0 hover:bg-indigo-50 transition-colors ${String(option.id) === String(value) ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-gray-700 font-medium'}`}
                                >
                                    {option[labelKey]}
                                </div>
                            ))
                        ) : (
                            <div className="px-4 py-6 text-sm text-gray-500 text-center italic">No items found matching your search.</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// --- Main Page Component ---
const TrimBillingPage = () => {
    const { orderId } = useParams();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState({ message: '', type: '' });

    const [existingBills, setExistingBills] = useState([]);
    const [draftItems, setDraftItems] = useState([]);
    const [batchInfo, setBatchInfo] = useState({});
    const [editingBill, setEditingBill] = useState(null); // Track which bill is being edited
    
    // 2-Step Dropdown State
    const [trimItemsList, setTrimItemsList] = useState([]);
    const [selectedTrimItemId, setSelectedTrimItemId] = useState('');
    const [availableVariants, setAvailableVariants] = useState([]);
    const [selectedVariantId, setSelectedVariantId] = useState('');
    const [fetchingVariants, setFetchingVariants] = useState(false);
    const [addQty, setAddQty] = useState(1);

    // Draft-table bulk-ops state
    const [selectedIds, setSelectedIds] = useState(() => new Set());
    const [searchTerm, setSearchTerm] = useState('');
    const [recentlyRemoved, setRecentlyRemoved] = useState(null);
    const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
    const undoTimerRef = useRef(null);

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast({ message: '', type: '' }), 3000);
    };

    const initializeBilling = useCallback(async () => {
        setLoading(true);
        try {
            // 1. Fetch Trim Items for Dropdown
            const itemsRes = await storeManagerApi.getAllTrimItems();
            setTrimItemsList(itemsRes.data || []);
            
            // 2. Fetch Consumption Summary & Past Bills
            const [summaryRes, billsRes] = await Promise.all([
                storeManagerApi.getTrimOrderSummary(orderId),
                storeManagerApi.getTrimBillsForOrder(orderId)
            ]);

            setBatchInfo(summaryRes.data.order);
            const pastBills = billsRes.data || [];
            setExistingBills(pastBills);

            // 3. Calculate what has ALREADY been billed
            const billedQuantities = {};
            pastBills.forEach(bill => {
                bill.items.forEach(item => {
                    billedQuantities[item.variant_id] = (billedQuantities[item.variant_id] || 0) + parseFloat(item.quantity);
                });
            });

            // 4. Calculate UNBILLED items (Consumed - Billed)
            const unbilledItems = [];
            summaryRes.data.consumption_report.forEach(cr => {
                const consumed = parseFloat(cr.total_consumed) || 0;
                const billed = billedQuantities[cr.variant_id] || 0;
                const remainingToBill = consumed - billed;
                if (remainingToBill > 0) {
                    unbilledItems.push({
                        id: cr.variant_id,
                        variant_id: cr.variant_id,
                        item_name: cr.item_name,
                        color_name: cr.color_name,
                        color_number: cr.color_number,
                        quantity: remainingToBill,
                        selling_price: parseFloat(cr.selling_price) || 0,
                        main_store_stock: cr.main_store_stock,
                        consumed_qty: consumed,
                        previously_billed_qty: billed,
                        original_quantity: remainingToBill,
                        origin: 'consumption',
                    });
                }
            });

            setDraftItems(unbilledItems);
            setCollapsedGroups(new Set(unbilledItems.map(i => i.item_name)));
            setEditingBill(null); // Reset edit state on load
        } catch (err) {
            console.error("Billing init error", err);
            showToast("Failed to load billing data.", "error");
        } finally {
            setLoading(false);
        }
    }, [orderId]);

    useEffect(() => {
        if (orderId) initializeBilling();
    }, [orderId, initializeBilling]);

    // Fetch Variants when Trim Item is selected
    useEffect(() => {
        const fetchVariants = async () => {
            if (!selectedTrimItemId) {
                setAvailableVariants([]);
                setSelectedVariantId('');
                return;
            }
            
            setFetchingVariants(true);
            try {
                const res = await storeManagerApi.getVariantsByTrimItem(selectedTrimItemId);
                const formattedVariants = (res.data || []).map(v => ({
                    ...v,
                    id: v.variant_id,
                    dropdownLabel: `${v.color_number ? v.color_number + ' - ' : ''}${v.color_name} (₹${parseFloat(v.selling_price || 0).toFixed(2)}) • Stock: ${v.main_store_stock}`
                }));
                setAvailableVariants(formattedVariants);
            } catch (err) {
                console.error("Failed to fetch variants", err);
                showToast("Failed to load item variants.", "error");
            } finally {
                setFetchingVariants(false);
            }
        };
        fetchVariants();
    }, [selectedTrimItemId]);

    // --- PDF INVOICE GENERATION ---
    const handlePrintInvoice = (bill) => {
        const doc = new jsPDF({ unit: 'pt', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 40;
        const contentWidth = pageWidth - margin * 2;

        // Palette
        const indigo = [79, 70, 229];
        const slate900 = [15, 23, 42];
        const slate700 = [51, 65, 85];
        const slate500 = [100, 116, 139];
        const slate400 = [148, 163, 184];
        const slate200 = [226, 232, 240];
        const slate100 = [241, 245, 249];
        const white = [255, 255, 255];

        const fmtAmount = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const fmtQty = (n) => Number(n || 0).toLocaleString('en-IN');

        // Group bill items by trim name (mirrors the on-screen draft grouping).
        const groupsMap = new Map();
        bill.items.forEach((it) => {
            const key = it.item_name || 'Other';
            if (!groupsMap.has(key)) groupsMap.set(key, { name: key, items: [], qty: 0, total: 0 });
            const g = groupsMap.get(key);
            g.items.push(it);
            g.qty += parseFloat(it.quantity) || 0;
            g.total += parseFloat(it.total_price) || 0;
        });
        const groups = Array.from(groupsMap.values());
        const totalQty = bill.items.reduce((s, i) => s + (parseFloat(i.quantity) || 0), 0);
        const grand = parseFloat(bill.total_amount) || 0;

        // 1. Header block
        let y = margin + 18;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(26);
        doc.setTextColor(slate900[0], slate900[1], slate900[2]);
        doc.text('INVOICE', margin, y);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(slate500[0], slate500[1], slate500[2]);
        doc.text(bill.bill_number, margin, y + 16);

        // Right meta column: label + value pairs
        const metaRight = pageWidth - margin;
        const labelLeft = metaRight - 110;
        const writeMeta = (label, value, lineY) => {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(slate400[0], slate400[1], slate400[2]);
            doc.text(label, labelLeft, lineY);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(slate900[0], slate900[1], slate900[2]);
            doc.text(value, metaRight, lineY, { align: 'right' });
        };
        const metaLines = [
            ['ORDER',     `#${orderId}`],
            ['BATCH ID',  `#${batchInfo.production_batch_id ?? 'N/A'}`],
            ['BATCH',     `${batchInfo.batch_code || 'N/A'}`],
            ['DATE',      new Date(bill.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })],
        ];
        metaLines.forEach((line, idx) => {
            writeMeta(line[0], line[1], y - 12 + idx * 12);
        });

        y += 44;

        // Divider
        doc.setDrawColor(slate200[0], slate200[1], slate200[2]);
        doc.setLineWidth(0.75);
        doc.line(margin, y, pageWidth - margin, y);
        y += 22;

        // 3. Stat cards
        const cards = [
            { label: 'TRIMS', value: String(groups.length) },
            { label: 'VARIANTS', value: String(bill.items.length) },
            { label: 'TOTAL QTY', value: fmtQty(totalQty) },
            { label: 'AMOUNT', value: fmtAmount(grand) },
        ];
        const gap = 10;
        const cardWidth = (contentWidth - gap * (cards.length - 1)) / cards.length;
        const cardHeight = 54;
        cards.forEach((c, i) => {
            const x = margin + i * (cardWidth + gap);
            doc.setFillColor(slate100[0], slate100[1], slate100[2]);
            doc.roundedRect(x, y, cardWidth, cardHeight, 4, 4, 'F');
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(slate500[0], slate500[1], slate500[2]);
            doc.text(c.label, x + 12, y + 18);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(c.label === 'AMOUNT' ? 13 : 16);
            doc.setTextColor(slate900[0], slate900[1], slate900[2]);
            doc.text(c.value, x + 12, y + 40);
        });
        y += cardHeight + 24;

        // 4. Grouped trim tables
        const ensureSpace = (needed) => {
            if (y + needed > pageHeight - 80) {
                doc.addPage();
                y = margin + 18;
            }
        };

        groups.forEach((group) => {
            ensureSpace(70);

            // Group header bar
            const headerH = 26;
            doc.setFillColor(slate900[0], slate900[1], slate900[2]);
            doc.roundedRect(margin, y, contentWidth, headerH, 4, 4, 'F');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(white[0], white[1], white[2]);
            doc.text(group.name.toUpperCase(), margin + 14, y + 17);

            const subtotalText = fmtAmount(group.total);
            const subtotalWidth = doc.getTextWidth(subtotalText);
            doc.setFontSize(11);
            doc.text(subtotalText, pageWidth - margin - 14, y + 17, { align: 'right' });

            const meta = `${group.items.length} ${group.items.length === 1 ? 'variant' : 'variants'}  ·  Qty ${fmtQty(group.qty)}`;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(slate200[0], slate200[1], slate200[2]);
            doc.text(meta, pageWidth - margin - 14 - subtotalWidth - 12, y + 17, { align: 'right' });

            y += headerH + 2;

            // Variants table
            autoTable(doc, {
                startY: y,
                head: [['Color', 'Color #', 'Unit Price', 'Qty', 'Line Total']],
                body: group.items.map((item) => [
                    item.color_name || '—',
                    item.color_number || '—',
                    fmtAmount(item.selling_price),
                    fmtQty(item.quantity),
                    fmtAmount(item.total_price),
                ]),
                theme: 'plain',
                styles: {
                    fontSize: 9.5,
                    cellPadding: { top: 7, bottom: 7, left: 10, right: 10 },
                    textColor: slate700,
                    lineColor: slate200,
                    lineWidth: 0.4,
                },
                headStyles: {
                    fillColor: slate100,
                    textColor: slate500,
                    fontStyle: 'bold',
                    fontSize: 8,
                    cellPadding: { top: 6, bottom: 6, left: 10, right: 10 },
                },
                bodyStyles: {
                    lineWidth: { bottom: 0.4 },
                    lineColor: slate200,
                },
                columnStyles: {
                    0: { cellWidth: 'auto' },
                    1: { cellWidth: 70, halign: 'center' },
                    2: { cellWidth: 90, halign: 'right' },
                    3: { cellWidth: 60, halign: 'center' },
                    4: { cellWidth: 100, halign: 'right', fontStyle: 'bold', textColor: slate900 },
                },
                margin: { left: margin, right: margin },
            });

            y = doc.lastAutoTable.finalY + 18;
        });

        // 5. Grand total band
        ensureSpace(60);
        const grandH = 44;
        doc.setFillColor(indigo[0], indigo[1], indigo[2]);
        doc.roundedRect(margin, y, contentWidth, grandH, 5, 5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(white[0], white[1], white[2]);
        doc.text('GRAND TOTAL', margin + 18, y + 27);
        doc.setFontSize(20);
        doc.text(fmtAmount(grand), pageWidth - margin - 18, y + 28, { align: 'right' });

        // 6. Per-page footer
        const pageCount = doc.internal.getNumberOfPages();
        for (let p = 1; p <= pageCount; p++) {
            doc.setPage(p);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(slate400[0], slate400[1], slate400[2]);
            doc.text(`Generated ${new Date().toLocaleString('en-IN')}`, margin, pageHeight - 22);
            doc.text(`Page ${p} of ${pageCount}`, pageWidth - margin, pageHeight - 22, { align: 'right' });
        }

        doc.save(`${bill.bill_number}.pdf`);
    };

    // --- EDIT LOGIC ---
    const handleEditInvoice = (bill) => {
        setEditingBill(bill);
        
        // Load the bill's items into the draft editor
        const editItems = bill.items.map(item => ({
            id: item.variant_id,
            variant_id: item.variant_id,
            item_name: item.item_name,
            color_name: item.color_name,
            color_number: item.color_number,
            quantity: parseFloat(item.quantity),
            selling_price: parseFloat(item.selling_price),
            main_store_stock: item.main_store_stock,
            consumed_qty: 0,
            previously_billed_qty: 0,
            original_quantity: parseFloat(item.quantity),
            origin: 'bill',
            source_bill_number: bill.bill_number,
        }));
        
        setDraftItems(editItems);
        setCollapsedGroups(new Set(editItems.map(i => i.item_name)));
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    };

    const handleCancelEdit = () => {
        setEditingBill(null);
        initializeBilling(); // Reset back to unbilled draft items
    };

    // --- DRAFT / BILLING LOGIC ---
    const handleQuantityChange = (id, newQty) => {
        setDraftItems(prev => prev.map(item =>
            item.id === id ? { ...item, quantity: parseFloat(newQty) || 0 } : item
        ));
    };

    const queueRemoval = useCallback((items) => {
        if (!items || items.length === 0) return;
        setRecentlyRemoved({ items, at: Date.now() });
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
        undoTimerRef.current = setTimeout(() => setRecentlyRemoved(null), 8000);
    }, []);

    const handleRemoveItem = (id) => {
        const removed = draftItems.find(item => item.id === id);
        setDraftItems(prev => prev.filter(item => item.id !== id));
        setSelectedIds(prev => {
            if (!prev.has(id)) return prev;
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
        if (removed) queueRemoval([removed]);
    };

    const handleResetRow = (id) => {
        setDraftItems(prev => prev.map(item =>
            item.id === id ? { ...item, quantity: item.original_quantity } : item
        ));
    };

    const handleToggleSelect = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleToggleSelectAll = (visibleIds) => {
        setSelectedIds(prev => {
            const allSelected = visibleIds.length > 0 && visibleIds.every(id => prev.has(id));
            if (allSelected) {
                const next = new Set(prev);
                visibleIds.forEach(id => next.delete(id));
                return next;
            }
            const next = new Set(prev);
            visibleIds.forEach(id => next.add(id));
            return next;
        });
    };

    const handleBulkRemove = () => {
        if (selectedIds.size === 0) return;
        const removed = draftItems.filter(item => selectedIds.has(item.id));
        setDraftItems(prev => prev.filter(item => !selectedIds.has(item.id)));
        setSelectedIds(new Set());
        queueRemoval(removed);
    };

    const handleBulkKeep = () => {
        if (selectedIds.size === 0) return;
        const removed = draftItems.filter(item => !selectedIds.has(item.id));
        setDraftItems(prev => prev.filter(item => selectedIds.has(item.id)));
        setSelectedIds(new Set());
        queueRemoval(removed);
    };

    const handleClearSelection = () => setSelectedIds(new Set());

    const handleUndoRemoval = () => {
        if (!recentlyRemoved) return;
        setDraftItems(prev => {
            const existingIds = new Set(prev.map(i => i.id));
            const restored = recentlyRemoved.items.filter(i => !existingIds.has(i.id));
            return [...prev, ...restored];
        });
        setRecentlyRemoved(null);
        if (undoTimerRef.current) {
            clearTimeout(undoTimerRef.current);
            undoTimerRef.current = null;
        }
    };

    useEffect(() => () => {
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    }, []);

    const handleAddItem = () => {
        if (!selectedVariantId) return;
        
        const variant = availableVariants.find(v => String(v.id) === String(selectedVariantId));
        if (!variant) return;

        const existingItem = draftItems.find(i => String(i.variant_id) === String(selectedVariantId));
        if (existingItem) {
            handleQuantityChange(selectedVariantId, existingItem.quantity + parseFloat(addQty));
        } else {
            const qty = parseFloat(addQty);
            setDraftItems([...draftItems, {
                id: variant.variant_id,
                variant_id: variant.variant_id,
                item_name: `${variant.item_name} ${variant.brand ? '- ' + variant.brand : ''}`.trim(),
                color_name: variant.color_name,
                color_number: variant.color_number,
                quantity: qty,
                selling_price: parseFloat(variant.selling_price) || 0,
                main_store_stock: variant.main_store_stock,
                consumed_qty: 0,
                previously_billed_qty: 0,
                original_quantity: qty,
                origin: 'manual',
            }]);
        }
        
        setSelectedVariantId('');
        setAddQty(1);
    };

    const handleSaveBill = async () => {
        if (draftItems.length === 0) return showToast("Cannot save an empty bill.", "error");

        setSaving(true);
        try {
            const payload = {
                production_batch_id: batchInfo.production_batch_id,
                status: 'FINALIZED',
                items: draftItems,
                bill_id: editingBill ? editingBill.id : null // Pass ID if editing
            };
            
            await storeManagerApi.saveTrimBill(orderId, payload);
            showToast(editingBill ? "Invoice updated successfully!" : "New Invoice generated successfully!");

            setRecentlyRemoved(null);
            setSelectedIds(new Set());
            setSearchTerm('');
            if (undoTimerRef.current) {
                clearTimeout(undoTimerRef.current);
                undoTimerRef.current = null;
            }

            await initializeBilling(); // Refresh everything
        } catch (err) {
            showToast(err.response?.data?.error || err.message || "Failed to save bill", "error");
        } finally {
            setSaving(false);
        }
    };

    const grandTotal = draftItems.reduce((sum, item) => sum + (item.quantity * item.selling_price), 0);

    const filteredItems = useMemo(() => {
        if (!searchTerm.trim()) return draftItems;
        const q = searchTerm.trim().toLowerCase();
        return draftItems.filter(it =>
            ((it.item_name || '') + ' ' + (it.color_name || '') + ' ' + (it.color_number || ''))
                .toLowerCase().includes(q)
        );
    }, [draftItems, searchTerm]);

    const groupedItems = useMemo(() => {
        const map = new Map();
        filteredItems.forEach(item => {
            const key = item.item_name || 'Other';
            if (!map.has(key)) {
                map.set(key, { name: key, items: [], totalQty: 0, totalAmount: 0, overStockCount: 0 });
            }
            const g = map.get(key);
            g.items.push(item);
            const qty = Number(item.quantity) || 0;
            const price = Number(item.selling_price) || 0;
            g.totalQty += qty;
            g.totalAmount += qty * price;
            const stockNum = parseFloat(item.main_store_stock);
            if (!Number.isNaN(stockNum) && qty > stockNum) g.overStockCount += 1;
        });
        return Array.from(map.values());
    }, [filteredItems]);

    const visibleIds = filteredItems.map(it => it.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
    const someVisibleSelected = visibleIds.some(id => selectedIds.has(id));
    const otherDraftCount = draftItems.length - selectedIds.size;
    const showGroups = groupedItems.length > 1;
    const anyCollapsed = collapsedGroups.size > 0;

    const handleToggleGroupCollapse = (name) => {
        setCollapsedGroups(prev => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    };

    const handleExpandAll = () => setCollapsedGroups(new Set());
    const handleCollapseAll = () => setCollapsedGroups(new Set(groupedItems.map(g => g.name)));

    const handleToggleGroupSelect = (group) => {
        const groupIds = group.items.map(it => it.id);
        setSelectedIds(prev => {
            const allSelected = groupIds.every(id => prev.has(id));
            const next = new Set(prev);
            if (allSelected) {
                groupIds.forEach(id => next.delete(id));
            } else {
                groupIds.forEach(id => next.add(id));
            }
            return next;
        });
    };

    if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin rounded-full h-8 w-8 text-indigo-600" /></div>;

    return (
        <div className="p-6 max-w-5xl mx-auto bg-gray-50 min-h-screen font-inter pb-24">
            <Toast message={toast.message} type={toast.type} />
            
            <div className="flex justify-between items-center mb-6">
                <button onClick={() => navigate(-1)} className="flex items-center text-gray-600 hover:text-gray-900 font-medium transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back to Summary
                </button>
                <div className="flex gap-3">
                    {editingBill && (
                        <button onClick={handleCancelEdit} className="px-5 py-2.5 bg-gray-200 text-gray-800 rounded-lg shadow-sm hover:bg-gray-300 font-bold transition-all flex items-center">
                            <X className="w-4 h-4 mr-2" /> Cancel Edit
                        </button>
                    )}
                    <button 
                        onClick={handleSaveBill} 
                        disabled={saving || draftItems.length === 0}
                        className="flex items-center px-6 py-2.5 bg-indigo-600 text-white rounded-lg shadow-md hover:bg-indigo-700 font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                        {saving ? 'Saving...' : (editingBill ? 'Update Invoice' : 'Generate Invoice')}
                    </button>
                </div>
            </div>

            {/* PREVIOUS BILLS SECTION */}
            {existingBills.length > 0 && !editingBill && (
                <div className="mb-8">
                    <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                        <FileText className="w-5 h-5 mr-2 text-indigo-600"/> Previous Invoices Generated
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {existingBills.map(bill => (
                            <div key={bill.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:border-indigo-300 transition-colors">
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <h3 className="font-bold text-gray-900 flex items-center">
                                            {bill.bill_number}
                                            <CheckCircle2 className="w-4 h-4 ml-2 text-green-500" />
                                        </h3>
                                        <p className="text-xs text-gray-500 mt-0.5">{new Date(bill.created_at).toLocaleString()}</p>
                                    </div>
                                    <div className="flex flex-col items-end gap-2">
                                        <span className="bg-indigo-50 text-indigo-800 text-sm font-bold px-3 py-1 rounded-lg">₹{parseFloat(bill.total_amount).toFixed(2)}</span>
                                        <div className="flex gap-1">
                                            <button onClick={() => handlePrintInvoice(bill)} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors" title="Print/Download PDF">
                                                <Printer size={16} />
                                            </button>
                                            <button onClick={() => handleEditInvoice(bill)} className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors" title="Edit this Invoice">
                                                <Edit2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-gray-50 rounded-lg p-3">
                                    <ul className="text-xs space-y-2">
                                        {bill.items.slice(0, 3).map(item => (
                                            <li key={item.id} className="flex justify-between text-gray-600 border-b border-gray-200 last:border-0 pb-1 last:pb-0">
                                                <span className="truncate pr-2 font-medium">
                                                    <span className="font-bold text-gray-800 mr-1">{item.quantity}x</span> 
                                                    {item.item_name} ({item.color_name}) <span className="text-gray-500">[{item.color_number}]</span>
                                                </span>
                                                <span className="font-mono">₹{parseFloat(item.total_price).toFixed(2)}</span>
                                            </li>
                                        ))}
                                        {bill.items.length > 3 && (
                                            <li className="text-center text-gray-400 pt-1 italic">...and {bill.items.length - 3} more items</li>
                                        )}
                                    </ul>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* HEADER FOR DRAFT / EDITOR */}
            <div className={`bg-white rounded-xl shadow-sm border p-6 mb-6 flex flex-col md:flex-row md:justify-between md:items-center gap-4 border-t-4 ${editingBill ? 'border-t-amber-500 border-x-amber-200 border-b-amber-200' : 'border-t-indigo-500 border-gray-200'}`}>
                <div>
                    <h1 className="text-2xl font-extrabold text-gray-900 flex items-center">
                        {editingBill ? <Edit2 className="w-6 h-6 mr-3 text-amber-500" /> : <Receipt className="w-6 h-6 mr-3 text-indigo-500" />}
                        {editingBill ? `Editing: ${editingBill.bill_number}` : 'Draft Invoice (Unbilled Items)'}
                    </h1>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                        <span className="text-gray-500 text-sm font-medium bg-gray-100 px-2.5 py-1 rounded">Order #{orderId}</span>
                        <span className="text-gray-500 text-sm font-medium bg-gray-100 px-2.5 py-1 rounded">Batch: {batchInfo.batch_code || 'N/A'}</span>
                    </div>
                </div>
                <div className={`text-right p-4 rounded-xl border min-w-[200px] ${editingBill ? 'bg-amber-50 border-amber-100' : 'bg-indigo-50 border-indigo-100'}`}>
                    <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${editingBill ? 'text-amber-600' : 'text-indigo-400'}`}>
                        {editingBill ? 'Updated Total' : 'Draft Total'}
                    </p>
                    <p className={`text-3xl font-black flex items-center justify-end ${editingBill ? 'text-amber-700' : 'text-indigo-700'}`}>
                        <IndianRupee className="w-6 h-6 mr-1" /> {grandTotal.toFixed(2)}
                    </p>
                </div>
            </div>

            {/* FILTER + BULK ACTIONS */}
            {draftItems.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 mb-3 flex flex-col md:flex-row md:items-center gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Filter by item, color, or color number..."
                            className="w-full pl-9 pr-9 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                        />
                        {searchTerm && (
                            <button
                                type="button"
                                onClick={() => setSearchTerm('')}
                                className="absolute right-2 top-2 p-0.5 text-gray-400 hover:text-gray-700"
                                title="Clear filter"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                    {selectedIds.size > 0 ? (
                        <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
                            <span className="text-sm font-bold text-indigo-700 whitespace-nowrap">{selectedIds.size} selected</span>
                            <span className="text-indigo-300">·</span>
                            <button
                                type="button"
                                onClick={handleBulkKeep}
                                className="px-3 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors whitespace-nowrap"
                                title={`Keep only the ${selectedIds.size} selected; drop the other ${otherDraftCount}`}
                            >
                                Keep only these{otherDraftCount > 0 ? ` (drop ${otherDraftCount})` : ''}
                            </button>
                            <button
                                type="button"
                                onClick={handleBulkRemove}
                                className="px-3 py-1.5 text-xs font-bold bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors whitespace-nowrap"
                            >
                                Remove selected
                            </button>
                            <button
                                type="button"
                                onClick={handleClearSelection}
                                className="px-2 py-1.5 text-xs font-bold text-gray-600 hover:text-gray-900 transition-colors"
                            >
                                Clear
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-3 whitespace-nowrap">
                            <span className="text-xs text-gray-500">
                                {filteredItems.length} of {draftItems.length} {draftItems.length === 1 ? 'row' : 'rows'}
                                {showGroups && ` · ${groupedItems.length} trims`}
                            </span>
                            {showGroups && (
                                <button
                                    type="button"
                                    onClick={anyCollapsed ? handleExpandAll : handleCollapseAll}
                                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                                >
                                    {anyCollapsed ? 'Expand all' : 'Collapse all'}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* DRAFT ITEMS TABLE */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-500 font-bold tracking-wider sticky top-0 z-10">
                            <tr>
                                <th className="px-4 py-4 w-10">
                                    <input
                                        type="checkbox"
                                        checked={allVisibleSelected}
                                        ref={el => { if (el) el.indeterminate = !allVisibleSelected && someVisibleSelected; }}
                                        onChange={() => handleToggleSelectAll(visibleIds)}
                                        disabled={visibleIds.length === 0}
                                        className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-40"
                                        title={allVisibleSelected ? 'Clear selection' : 'Select all visible'}
                                    />
                                </th>
                                <th className="px-6 py-4">Item Description</th>
                                <th className="px-6 py-4 w-28 text-center">In Stock</th>
                                <th className="px-6 py-4 w-28 text-right">Unit Price</th>
                                <th className="px-6 py-4 w-44 text-center">Quantity</th>
                                <th className="px-6 py-4 w-32 text-right">Line Total</th>
                                <th className="px-6 py-4 w-16"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {groupedItems.map(group => {
                                const groupIds = group.items.map(it => it.id);
                                const allSelectedInGroup = groupIds.length > 0 && groupIds.every(id => selectedIds.has(id));
                                const someSelectedInGroup = !allSelectedInGroup && groupIds.some(id => selectedIds.has(id));
                                // When the user is filtering, force-expand so matches aren't hidden.
                                const collapsed = showGroups && !searchTerm.trim() && collapsedGroups.has(group.name);
                                return (
                                    <React.Fragment key={group.name}>
                                        {showGroups && (
                                            <tr className="bg-slate-50 border-y border-slate-200">
                                                <td className="px-4 py-2.5">
                                                    <input
                                                        type="checkbox"
                                                        checked={allSelectedInGroup}
                                                        ref={el => { if (el) el.indeterminate = someSelectedInGroup; }}
                                                        onChange={() => handleToggleGroupSelect(group)}
                                                        className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                        title={allSelectedInGroup ? 'Deselect group' : 'Select group'}
                                                    />
                                                </td>
                                                <td colSpan="6" className="px-4 py-2.5">
                                                    <div className="flex items-center gap-3">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleToggleGroupCollapse(group.name)}
                                                            className="flex items-center gap-2 text-left flex-1 hover:opacity-80 transition-opacity"
                                                            title={collapsed ? 'Expand' : 'Collapse'}
                                                        >
                                                            {collapsed
                                                                ? <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
                                                                : <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />}
                                                            <span className="font-bold text-gray-900 uppercase tracking-wide text-sm">{group.name}</span>
                                                            <span className="text-[11px] font-bold text-gray-500 bg-white px-2 py-0.5 rounded-full border border-gray-200">
                                                                {group.items.length} {group.items.length === 1 ? 'variant' : 'variants'}
                                                            </span>
                                                            {group.overStockCount > 0 && (
                                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                                                    <AlertTriangle className="w-3 h-3" />
                                                                    {group.overStockCount} over stock
                                                                </span>
                                                            )}
                                                        </button>
                                                        <div className="flex items-center gap-4 text-xs font-mono text-gray-600 shrink-0">
                                                            <span>Qty <span className="font-bold text-gray-900">{group.totalQty.toLocaleString()}</span></span>
                                                            <span className="flex items-center"><IndianRupee className="w-3 h-3" /><span className="font-bold text-gray-900">{group.totalAmount.toFixed(2)}</span></span>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                        {!collapsed && group.items.map((item) => {
                                            const stockNum = parseFloat(item.main_store_stock);
                                            const hasStock = !Number.isNaN(stockNum);
                                            const overStock = hasStock && item.quantity > stockNum;
                                            const qtyChanged = item.original_quantity !== undefined && item.quantity !== item.original_quantity;
                                            const isSelected = selectedIds.has(item.id);
                                            return (
                                    <tr
                                        key={item.id}
                                        className={`transition-colors ${isSelected ? 'bg-indigo-50/60' : 'hover:bg-gray-50/50'}`}
                                    >
                                        <td className="px-4 py-4">
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => handleToggleSelect(item.id)}
                                                className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                            />
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-gray-900 text-base">{item.item_name}</div>
                                            <div className="text-sm font-medium text-gray-500">{item.color_name} ({item.color_number})</div>
                                            {item.origin === 'consumption' && item.consumed_qty > 0 && (
                                                <div className="text-xs text-gray-500 mt-1">
                                                    <span className="font-semibold text-gray-700">{Number(item.original_quantity).toLocaleString()}</span> of <span className="font-semibold text-gray-700">{Number(item.consumed_qty).toLocaleString()}</span> remaining
                                                    {item.previously_billed_qty > 0 && (
                                                        <> · <span className="text-gray-400">{Number(item.previously_billed_qty).toLocaleString()} already billed</span></>
                                                    )}
                                                </div>
                                            )}
                                            {item.origin === 'manual' && (
                                                <span className="inline-block mt-1 text-[10px] uppercase tracking-wider font-bold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">added manually</span>
                                            )}
                                            {item.origin === 'bill' && item.source_bill_number && (
                                                <span className="inline-block mt-1 text-[10px] uppercase tracking-wider font-bold bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">from {item.source_bill_number}</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span
                                                className={`font-mono text-xs px-2 py-1 rounded border ${overStock ? 'bg-red-50 text-red-700 border-red-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}
                                            >
                                                {hasStock ? stockNum : '--'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono text-gray-600">
                                            ₹{item.selling_price.toFixed(2)}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center justify-center gap-1.5">
                                                <input
                                                    type="number"
                                                    value={item.quantity}
                                                    onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                                                    onWheel={(e) => e.target.blur()}
                                                    className={`w-full text-center border rounded-lg p-2 outline-none font-bold text-gray-900 transition-all shadow-sm focus:ring-2 ${overStock ? 'border-amber-400 bg-amber-50 focus:ring-amber-400 focus:border-amber-500' : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500'}`}
                                                    min="1"
                                                />
                                                {qtyChanged && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleResetRow(item.id)}
                                                        className="shrink-0 p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                                                        title={`Reset to ${item.original_quantity}`}
                                                    >
                                                        <RotateCcw className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                            {overStock && (
                                                <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-amber-700 mt-1">
                                                    <AlertTriangle className="w-3 h-3" />
                                                    over stock ({stockNum} avail)
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono font-bold text-gray-900 text-lg">
                                            ₹{(item.quantity * item.selling_price).toFixed(2)}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <button onClick={() => handleRemoveItem(item.id)} className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors" title="Remove row">
                                                <Trash2 className="w-5 h-5" />
                                            </button>
                                        </td>
                                    </tr>
                                            );
                                        })}
                                    </React.Fragment>
                                );
                            })}
                            {filteredItems.length === 0 && (
                                <tr>
                                    <td colSpan="7" className="text-center py-16">
                                        {searchTerm && draftItems.length > 0 ? (
                                            <>
                                                <p className="text-gray-500 font-medium mb-2">No draft items match <span className="font-bold text-gray-700">"{searchTerm}"</span>.</p>
                                                <button
                                                    type="button"
                                                    onClick={() => setSearchTerm('')}
                                                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 underline"
                                                >
                                                    Clear filter
                                                </button>
                                            </>
                                        ) : editingBill ? (
                                            <p className="text-gray-500 font-medium mb-1">You have removed all items from this bill.</p>
                                        ) : (
                                            <>
                                                <p className="text-gray-500 font-medium mb-1">All consumed items have been fully billed!</p>
                                                <p className="text-sm text-gray-400">You can manually add extra items using the form below if needed.</p>
                                            </>
                                        )}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* UNDO BANNER */}
            {recentlyRemoved && !saving && (
                <div className="fixed bottom-4 left-4 bg-gray-900 text-white px-4 py-3 rounded-lg shadow-xl z-50 flex items-center gap-3">
                    <span className="text-sm font-medium">
                        Removed {recentlyRemoved.items.length} {recentlyRemoved.items.length === 1 ? 'item' : 'items'}
                    </span>
                    <button
                        type="button"
                        onClick={handleUndoRemoval}
                        className="flex items-center gap-1 px-3 py-1 bg-white/10 hover:bg-white/20 rounded-md text-xs font-bold transition-colors"
                    >
                        <Undo2 className="w-3.5 h-3.5" /> Undo
                    </button>
                    <button
                        type="button"
                        onClick={() => setRecentlyRemoved(null)}
                        className="text-gray-400 hover:text-white p-0.5"
                        title="Dismiss"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* ADD MORE ITEMS SECTION */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col md:flex-row gap-4 items-end">
                <div className="flex-1 w-full md:w-1/3">
                    <label className="block text-sm font-bold text-gray-700 mb-2">1. Select Trim Item</label>
                    <select 
                        value={selectedTrimItemId}
                        onChange={(e) => {
                            setSelectedTrimItemId(e.target.value);
                            setSelectedVariantId(''); 
                        }}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white shadow-sm outline-none transition-all text-sm"
                    >
                        <option value="">Choose a Trim Item...</option>
                        {trimItemsList.map(item => (
                            <option key={item.id} value={item.id}>
                                {item.name} {item.brand ? `- ${item.brand}` : ''}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex-1 w-full md:w-1/3">
                    <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center">
                        2. Select Color / Variant
                        {fetchingVariants && <Loader2 className="w-3 h-3 animate-spin ml-2 text-indigo-500" />}
                    </label>
                    <SearchableDropdown 
                        options={availableVariants}
                        value={selectedVariantId}
                        onChange={(val) => setSelectedVariantId(val)}
                        placeholder={selectedTrimItemId ? (fetchingVariants ? "Loading..." : "Search available variants...") : "Select an item first..."}
                        labelKey="dropdownLabel"
                        disabled={!selectedTrimItemId || fetchingVariants}
                    />
                </div>

                <div className="w-24 shrink-0">
                    <label className="block text-sm font-bold text-gray-700 mb-2">Qty</label>
                    <input 
                        type="number" 
                        value={addQty} 
                        onChange={(e) => setAddQty(e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded-lg text-center font-bold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none shadow-sm text-sm"
                        min="1"
                    />
                </div>

                <button 
                    onClick={handleAddItem}
                    disabled={!selectedVariantId}
                    className="px-6 py-3 bg-gray-900 text-white font-bold rounded-lg shadow-sm hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center shrink-0"
                >
                    <Plus className="w-5 h-5 mr-2" /> Add Extra
                </button>
            </div>
        </div>
    );
};

export default TrimBillingPage;