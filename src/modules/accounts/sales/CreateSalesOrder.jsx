import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2, Save, Palette, Loader2, AlertCircle, AlertTriangle, CheckCircle2, DollarSign, X, ClipboardCheck, ChevronDown, ChevronRight, Paperclip, FileText, Copy } from 'lucide-react';
import { accountingApi } from '../../../api/accountingApi';

const skippedLabel = (entry) => {
  switch (entry?.reason) {
    case 'has_bom':
      return `Product (SOP #${entry.sales_order_product_id}) couldn't be removed — BOM ${entry.bom_id} is linked. Unlink the BOM first.`;
    case 'has_downstream_production':
      return `Product (SOP #${entry.sales_order_product_id}) couldn't be removed — production work has already started on it.`;
    default:
      return `Product (SOP #${entry?.sales_order_product_id ?? '?'}) couldn't be removed.`;
  }
};

const formatFileSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const freshColor = () => ({ colorId: '', price: '', sizes: {} });

const CreateSalesOrder = () => {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const isEditMode = Boolean(orderId);

  const [options, setOptions] = useState({ customers: [], products: [], fabricTypes: [], fabricColors: [], sizes: [] });
  const [header, setHeader] = useState({ customerId: '', orderNumber: '', buyerPoNumber: '', deliveryDate: '', notes: '' });

  const [productGroups, setProductGroups] = useState([
    { salesOrderProductId: null, productId: '', fabricTypeId: '', colors: [freshColor()] }
  ]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [skippedRemovals, setSkippedRemovals] = useState([]);
  const [reloading, setReloading] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState(() => new Set([0]));
  const [originalSopsById, setOriginalSopsById] = useState(() => new Map());
  const [stagedFiles, setStagedFiles] = useState([]);
  const [existingAttachments, setExistingAttachments] = useState([]);
  const fileInputRef = useRef(null);
  // copySizesPanel: { gIndex, sizes: { [sizeId]: qty } } | null
  const [copySizesPanel, setCopySizesPanel] = useState(null);

  const loadOrderForEdit = useCallback(async ({ silent = false } = {}) => {
    if (silent) setReloading(true);
    else setIsLoading(true);
    if (!silent) setError(null);
    try {
      const promises = [accountingApi.getSalesOrderFormData(), accountingApi.getSizes()];
      if (isEditMode) promises.push(accountingApi.getSalesOrderDetails(orderId));

      const [formRes, sizesRes, soRes] = await Promise.all(promises);
      const opts = { ...formRes.data, sizes: sizesRes.data?.data ?? sizesRes.data ?? [] };
      setOptions(opts);

      if (isEditMode && soRes?.data) {
        const so = soRes.data;
        const matchedCustomer = opts.customers.find(c =>
          (so.customer_id && String(c.id) === String(so.customer_id)) ||
          c.name?.toLowerCase() === so.customer_name?.toLowerCase()
        );
        setHeader({
          customerId:    matchedCustomer ? String(matchedCustomer.id) : '',
          orderNumber:   so.order_number   || '',
          buyerPoNumber: so.buyer_po_number || '',
          deliveryDate:  so.delivery_date   ? so.delivery_date.split('T')[0] : '',
          notes:         so.notes           || '',
        });

        const groups = (so.products || []).map(prod => {
          const matchedProduct = opts.products.find(p =>
            (prod.product_id && String(p.id) === String(prod.product_id)) ||
            p.name?.toLowerCase() === prod.product_name?.toLowerCase()
          );
          const matchedFabric = opts.fabricTypes.find(f =>
            (prod.fabric_type_id && String(f.id) === String(prod.fabric_type_id)) ||
            f.name?.toLowerCase() === prod.fabric_type?.toLowerCase()
          );

          // New: read per-color sizes from colors[].sizes; ignore size_breakdown
          const colors = (prod.colors || []).map(c => {
            const matchedColor = opts.fabricColors.find(fc =>
              (c.fabric_color_id && String(fc.id) === String(c.fabric_color_id)) ||
              fc.name?.toLowerCase() === c.color_name?.toLowerCase() ||
              fc.number === c.color_number
            );
            const sizes = {};
            (c.sizes || []).forEach(sz => {
              if (Number(sz.quantity) > 0) sizes[String(sz.size_id)] = sz.quantity;
            });
            return {
              colorId: matchedColor ? String(matchedColor.id) : '',
              price:   String(c.unit_price || ''),
              sizes,
            };
          });

          const sopId = prod.id ?? prod.sales_order_product_id ?? null;
          return {
            salesOrderProductId: sopId != null ? String(sopId) : null,
            productId:    matchedProduct ? String(matchedProduct.id) : '',
            fabricTypeId: matchedFabric  ? String(matchedFabric.id)  : '',
            colors: colors.length > 0 ? colors : [freshColor()],
          };
        });

        if (groups.length > 0) {
          setProductGroups(groups);
          setExpandedGroups(new Set(groups.length <= 2 ? groups.map((_, i) => i) : []));
        }
        setOriginalSopsById(new Map(
          groups.filter(g => g.salesOrderProductId).map(g => [g.salesOrderProductId, { productId: g.productId }])
        ));
        setExistingAttachments(so.attachments || []);
      } else if (!isEditMode) {
        const year = new Date().getFullYear();
        const randomStr = Math.floor(1000 + Math.random() * 9000);
        setHeader(prev => ({ ...prev, orderNumber: `SO-${year}-${randomStr}` }));
      }
    } catch (err) {
      console.error("Failed to load form options:", err);
      if (!silent) setError("Could not load form options. Please check your connection.");
    } finally {
      if (silent) setReloading(false);
      else setIsLoading(false);
    }
  }, [orderId, isEditMode]);

  useEffect(() => { loadOrderForEdit(); }, [loadOrderForEdit]);

  // --- Copy-sizes-to-all-colors handlers ---
  const openCopySizesPanel = (gIndex) => {
    const group = productGroups[gIndex];
    const seed = group.colors.find(c => Object.keys(c.sizes).length > 0);
    setCopySizesPanel({ gIndex, sizes: seed ? { ...seed.sizes } : {} });
  };

  const addSizeToCopyTemplate = (sizeId) => {
    setCopySizesPanel(prev => ({ ...prev, sizes: { ...prev.sizes, [String(sizeId)]: 0 } }));
  };

  const updateCopyTemplateSizeQty = (sizeId, qty) => {
    setCopySizesPanel(prev => ({ ...prev, sizes: { ...prev.sizes, [String(sizeId)]: parseInt(qty) || 0 } }));
  };

  const removeSizeFromCopyTemplate = (sizeId) => {
    setCopySizesPanel(prev => {
      const { [String(sizeId)]: _, ...rest } = prev.sizes;
      return { ...prev, sizes: rest };
    });
  };

  const applyCopySizesToAllColors = () => {
    const { gIndex, sizes } = copySizesPanel;
    const newGroups = [...productGroups];
    newGroups[gIndex] = {
      ...newGroups[gIndex],
      colors: newGroups[gIndex].colors.map(c => ({ ...c, sizes: { ...sizes } })),
    };
    setProductGroups(newGroups);
    setCopySizesPanel(null);
  };

  // --- File handlers ---
  const handleFilesSelected = (fileList) => {
    const incoming = Array.from(fileList);
    setStagedFiles(prev => [...prev, ...incoming]);
  };

  const removeStagedFile = (index) => {
    setStagedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    handleFilesSelected(e.dataTransfer.files);
  };

  // --- Helpers ---
  const colorTotal = (color) =>
    Object.values(color.sizes).reduce((s, v) => s + (Number(v) || 0), 0);
  const groupTotal = (group) =>
    group.colors.reduce((s, c) => s + colorTotal(c), 0);

  // --- Handlers ---
  const removeGroup = (index) => {
    const group = productGroups[index];
    const productName = options.products.find(p => String(p.id) === String(group?.productId))?.name;
    const label = productName || `Product line #${index + 1}`;
    const wasOriginal = isEditMode && group?.salesOrderProductId && originalSopsById.has(group.salesOrderProductId);
    const msg = wasOriginal
      ? `Remove "${label}" from this sales order?\n\nIf production has already started for this product, the backend will keep it and report it back after save.`
      : `Remove "${label}"?`;
    if (!window.confirm(msg)) return;
    setProductGroups(prev => prev.filter((_, i) => i !== index));
    setExpandedGroups(prev => {
      const next = new Set();
      prev.forEach(i => { if (i < index) next.add(i); else if (i > index) next.add(i - 1); });
      return next;
    });
  };

  const toggleExpanded = (index) => {
    setExpandedGroups(prev => { const next = new Set(prev); next.has(index) ? next.delete(index) : next.add(index); return next; });
  };

  const addGroup = () => {
    setProductGroups(prev => {
      const next = [...prev, { salesOrderProductId: null, productId: '', fabricTypeId: '', colors: [freshColor()] }];
      setExpandedGroups(es => new Set([...es, prev.length]));
      return next;
    });
  };

  const updateGroup = (index, field, value) => {
    const newGroups = [...productGroups];
    newGroups[index][field] = value;
    setProductGroups(newGroups);
  };

  const addColorToGroup = (gIndex) => {
    const newGroups = [...productGroups];
    newGroups[gIndex].colors.push(freshColor());
    setProductGroups(newGroups);
  };

  const removeColorFromGroup = (gIndex, cIndex) => {
    const newGroups = [...productGroups];
    newGroups[gIndex].colors = newGroups[gIndex].colors.filter((_, i) => i !== cIndex);
    setProductGroups(newGroups);
  };

  const updateColor = (gIndex, cIndex, field, value) => {
    const newGroups = [...productGroups];
    newGroups[gIndex].colors[cIndex][field] = value;
    setProductGroups(newGroups);
  };

  const addSizeToColor = (gIndex, cIndex, sizeId) => {
    if (!sizeId) return;
    const newGroups = [...productGroups];
    newGroups[gIndex].colors[cIndex].sizes = { ...newGroups[gIndex].colors[cIndex].sizes, [String(sizeId)]: 0 };
    setProductGroups(newGroups);
  };

  const removeSizeFromColor = (gIndex, cIndex, sizeId) => {
    const newGroups = [...productGroups];
    const { [String(sizeId)]: _, ...rest } = newGroups[gIndex].colors[cIndex].sizes;
    newGroups[gIndex].colors[cIndex].sizes = rest;
    setProductGroups(newGroups);
  };

  const updateColorSize = (gIndex, cIndex, sizeId, qty) => {
    const newGroups = [...productGroups];
    newGroups[gIndex].colors[cIndex].sizes[String(sizeId)] = parseInt(qty) || 0;
    setProductGroups(newGroups);
  };

  // --- Calculations ---
  const calculateTotal = () => {
    let grandTotal = 0;
    let totalPieces = 0;
    productGroups.forEach(group => {
      group.colors.forEach(color => {
        const qty = colorTotal(color);
        const price = parseFloat(color.price) || 0;
        grandTotal += qty * price;
        totalPieces += qty;
      });
    });
    return { grandTotal: grandTotal.toFixed(2), totalPieces };
  };

  const { grandTotal, totalPieces } = calculateTotal();

  // --- Submit ---
  const handleOpenReview = (e) => {
    e.preventDefault();
    setError(null); setSuccess(null); setSkippedRemovals([]);
    setShowReview(true);
  };

  const handleConfirmSubmit = async () => {
    setShowReview(false);
    setError(null); setSuccess(null); setSkippedRemovals([]);
    setIsSubmitting(true);
    try {
      const payload = {
        customer_id:    header.customerId,
        order_number:   header.orderNumber,
        buyer_po_number: header.buyerPoNumber,
        delivery_date:  header.deliveryDate,
        notes: header.notes || (header.buyerPoNumber ? `Buyer PO: ${header.buyerPoNumber}` : ''),
        products: productGroups.map(group => {
          const base = {
            product_id:    group.productId,
            fabric_type_id: group.fabricTypeId,
            colors: group.colors.map(c => ({
              fabric_color_id: c.colorId,
              unit_price: parseFloat(c.price) || 0,
              sizes: Object.entries(c.sizes)
                .filter(([, v]) => Number(v) > 0)
                .map(([sizeId, qty]) => ({ size_id: parseInt(sizeId), quantity: Number(qty) })),
            })),
          };
          if (group.salesOrderProductId) return { id: parseInt(group.salesOrderProductId, 10), ...base };
          return base;
        }),
      };
      const res = isEditMode
        ? await accountingApi.updateSalesOrder(orderId, payload)
        : await accountingApi.createSalesOrder(payload);
      const body = res?.data || {};
      const skipped = body.skipped_product_removals ?? [];

      const soId = isEditMode ? orderId : body.orderId;
      if (stagedFiles.length > 0 && soId) {
        try {
          await accountingApi.uploadSalesOrderAttachments(String(soId), stagedFiles);
          setStagedFiles([]);
        } catch (uploadErr) {
          console.warn('[CreateSalesOrder] File upload failed after SO save:', uploadErr);
        }
      }

      if (isEditMode) {
        setSuccess(body.message || 'Sales order updated.');
        setSkippedRemovals(skipped);
        await loadOrderForEdit({ silent: true });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        if (body.orderId) navigate(`/accounts/sales/${body.orderId}/edit`, { replace: true });
        else navigate('/accounts/sales/orders');
      }
    } catch (err) {
      const status = err?.response?.status;
      const apiErr = err?.response?.data?.error;
      if (status === 404) {
        setError('Sales order not found. It may have been deleted in another tab.');
      } else if (status === 400 && apiErr === 'Order number already exists.') {
        setError('That order number is already in use. Pick a different one.');
      } else if (status === 400 && apiErr) {
        setError(apiErr);
      } else if (status >= 500) {
        setError('Something went wrong on our side. Please try again. If it keeps happening, contact support.');
        console.error('[CreateSalesOrder] 500 from backend:', apiErr || err?.message);
      } else {
        setError(apiErr || err?.message || 'Failed to save sales order.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return (
    <div className="flex flex-col justify-center items-center min-h-[60vh] bg-gray-50 gap-2">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      <p className="text-sm text-slate-500">Loading sales order…</p>
    </div>
  );

  return (
    <div className="p-4 max-w-6xl mx-auto bg-gray-50 min-h-screen font-inter text-slate-800 pb-24">
      <header className="mb-5">
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          {isEditMode ? 'Edit Sales Order' : 'Create Sales Order'}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {isEditMode
            ? 'Update order header and product lines, then review before save.'
            : 'Set order header, add product lines, then review before save.'}
        </p>
      </header>

      {error && (
        <div className="mb-4 bg-red-50 text-red-700 px-4 py-3 rounded-xl border border-red-200 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}
      {success && (
        <div className="mb-4 bg-emerald-50 text-emerald-800 px-4 py-3 rounded-xl border border-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <p className="text-sm font-medium">{success}</p>
          {reloading && <Loader2 className="w-4 h-4 ml-1 animate-spin text-emerald-600" />}
        </div>
      )}
      {skippedRemovals.length > 0 && (
        <div className="mb-4 bg-amber-50 text-amber-800 px-4 py-3 rounded-xl border border-amber-200">
          <div className="flex items-center gap-2 text-sm font-bold">
            <AlertTriangle className="w-5 h-5" /> Some products were kept
          </div>
          <ul className="ml-6 list-disc text-sm space-y-1 mt-1.5">
            {skippedRemovals.map(s => <li key={s.sales_order_product_id}>{skippedLabel(s)}</li>)}
          </ul>
        </div>
      )}

      <form onSubmit={handleOpenReview} className="space-y-5">
        {/* Order header */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Order Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Order # *</label>
              <input
                className="w-full text-base border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="SO-100"
                value={header.orderNumber}
                onChange={e => setHeader({ ...header, orderNumber: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Buyer PO</label>
              <input
                className="w-full text-base border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="PO-9982"
                value={header.buyerPoNumber}
                onChange={e => setHeader({ ...header, buyerPoNumber: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Customer *</label>
              <select
                className="w-full text-base border border-gray-300 p-3 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                value={header.customerId}
                onChange={e => setHeader({ ...header, customerId: e.target.value })}
                required
              >
                <option value="">Select customer…</option>
                {options.customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Delivery Date *</label>
              <input
                type="date"
                className="w-full text-base border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                value={header.deliveryDate}
                onChange={e => setHeader({ ...header, deliveryDate: e.target.value })}
                required
              />
            </div>
          </div>
          <details className="mt-4">
            <summary className="text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-700 select-none">
              + Notes
            </summary>
            <textarea
              className="w-full mt-2 border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-base resize-y"
              rows="2"
              placeholder="Special instructions, references…"
              value={header.notes}
              onChange={e => setHeader({ ...header, notes: e.target.value })}
            />
          </details>

          {/* Supporting documents */}
          <div className="mt-4">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
              Supporting Documents
            </label>

            {existingAttachments.length > 0 && (
              <div className="mb-3 space-y-1.5">
                {existingAttachments.map((att) => (
                  <div key={att.id} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                    <a
                      href={att.file_url || att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline flex-1 truncate"
                    >
                      {att.original_filename || att.filename || att.name}
                    </a>
                    {att.file_size != null && (
                      <span className="text-xs text-slate-400 shrink-0">{formatFileSize(att.file_size)}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              onDragEnter={e => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/40 transition-colors select-none"
            >
              <Paperclip className="w-5 h-5 text-slate-400 mx-auto mb-1" />
              <p className="text-sm text-slate-500">
                Drop files here or <span className="text-blue-600 font-semibold">browse</span>
              </p>
              <p className="text-xs text-slate-400 mt-0.5">PDF, Excel, Word, images — any type</p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={e => { handleFilesSelected(e.target.files); e.target.value = ''; }}
              />
            </div>

            {stagedFiles.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {stagedFiles.map((file, i) => (
                  <div key={i} className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                    <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                    <span className="text-sm text-slate-700 flex-1 truncate">{file.name}</span>
                    <span className="text-xs text-slate-400 shrink-0">{formatFileSize(file.size)}</span>
                    <button
                      type="button"
                      onClick={() => removeStagedFile(i)}
                      className="text-slate-400 hover:text-red-500 transition-colors ml-1"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Products heading */}
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Product Lines · {productGroups.length}
          </h2>
          <div className="text-sm text-slate-400">Click a row to expand / collapse</div>
        </div>

        {/* Product groups */}
        {productGroups.map((group, gIndex) => {
          const isExpanded   = expandedGroups.has(gIndex);
          const productName  = options.products.find(p => String(p.id) === String(group.productId))?.name;
          const fabricName   = options.fabricTypes.find(f => String(f.id) === String(group.fabricTypeId))?.name;
          const gQty         = groupTotal(group);
          const gValue       = group.colors.reduce((s, c) => s + (colorTotal(c) * (parseFloat(c.price) || 0)), 0);
          const filledColors = group.colors.filter(c => c.colorId).length;
          return (
            <div key={gIndex} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              {/* Collapsed header */}
              <div
                onClick={() => toggleExpanded(gIndex)}
                className={`flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-slate-50 transition-colors ${isExpanded ? 'border-b border-slate-100 bg-slate-50/50' : ''}`}
              >
                {isExpanded
                  ? <ChevronDown size={18} className="text-slate-400 shrink-0" />
                  : <ChevronRight size={18} className="text-slate-400 shrink-0" />}
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider shrink-0">#{gIndex + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-bold text-base ${productName ? 'text-slate-800' : 'text-slate-400 italic'}`}>
                      {productName || '— pick product —'}
                    </span>
                    {fabricName && <span className="text-sm text-slate-500">· {fabricName}</span>}
                    {group.salesOrderProductId && (
                      <span className="text-[11px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded">
                        SOP #{group.salesOrderProductId}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                    <span>{filledColors} color{filledColors === 1 ? '' : 's'}</span>
                    <span>·</span>
                    <span className="font-bold text-slate-700">{gQty.toLocaleString()} pcs</span>
                    <span>·</span>
                    <span className="font-bold text-slate-700">₹{gValue.toFixed(2)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); removeGroup(gIndex); }}
                  disabled={productGroups.length === 1}
                  title={productGroups.length === 1 ? 'A sales order needs at least one product line.' : 'Remove this product line'}
                  className="shrink-0 p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-400"
                >
                  <Trash2 size={18} />
                </button>
              </div>

              {/* Expanded body */}
              {isExpanded && (
                <div className="p-5 space-y-5">
                  {/* Product + Fabric */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Product Style *</label>
                      <select
                        className="w-full text-base p-3 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                        value={group.productId}
                        onChange={e => updateGroup(gIndex, 'productId', e.target.value)}
                        required
                      >
                        <option value="">Select product…</option>
                        {options.products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Fabric Type *</label>
                      <select
                        className="w-full text-base p-3 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                        value={group.fabricTypeId}
                        onChange={e => updateGroup(gIndex, 'fabricTypeId', e.target.value)}
                        required
                      >
                        <option value="">Select fabric…</option>
                        {options.fabricTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Colors + per-color sizes */}
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        <Palette size={13} className="text-indigo-500" /> Colors & Sizes
                      </label>
                      <div className="flex items-center gap-1">
                        {group.colors.length > 1 && (
                          <button
                            type="button"
                            onClick={() => openCopySizesPanel(gIndex)}
                            className="text-sm font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 px-2 py-1 rounded hover:bg-indigo-50"
                            title="Set the same sizes & quantities on every color at once"
                          >
                            <Copy size={13} /> Set sizes for all
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => addColorToGroup(gIndex)}
                          className="text-sm font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 px-2 py-1 rounded hover:bg-blue-50"
                        >
                          <Plus size={14} /> Add color
                        </button>
                      </div>
                    </div>

                    {/* Copy-sizes inline panel */}
                    {copySizesPanel?.gIndex === gIndex && (
                      <div className="mb-3 bg-indigo-50 border border-indigo-200 rounded-xl p-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-indigo-700 uppercase tracking-wider">
                            Size template — apply to all {group.colors.length} colors
                          </p>
                          <button type="button" onClick={() => setCopySizesPanel(null)} className="text-indigo-400 hover:text-indigo-700 transition-colors">
                            <X size={14} />
                          </button>
                        </div>

                        <div className="flex flex-wrap gap-2 items-center">
                          {Object.entries(copySizesPanel.sizes).map(([sizeId, qty]) => {
                            const sizeName = options.sizes.find(s => String(s.id) === sizeId)?.name ?? sizeId;
                            return (
                              <div key={sizeId} className="flex items-center gap-1.5 bg-white border border-indigo-300 rounded-lg px-2.5 py-1.5 shadow-sm">
                                <span className="text-xs font-bold text-indigo-700 min-w-[2rem] text-center shrink-0">{sizeName}</span>
                                <input
                                  type="number"
                                  min="0"
                                  className="w-16 text-sm text-center border border-indigo-200 rounded px-1 py-0.5 font-bold text-slate-700 outline-none focus:border-indigo-500 bg-white"
                                  placeholder="0"
                                  value={qty === 0 ? '' : qty}
                                  onChange={e => updateCopyTemplateSizeQty(sizeId, e.target.value)}
                                />
                                <button type="button" onClick={() => removeSizeFromCopyTemplate(sizeId)} className="text-indigo-300 hover:text-red-500 transition ml-0.5">
                                  <X size={12} />
                                </button>
                              </div>
                            );
                          })}
                          {options.sizes.filter(s => !(String(s.id) in copySizesPanel.sizes)).length > 0 && (
                            <select
                              value=""
                              onChange={e => { if (e.target.value) addSizeToCopyTemplate(e.target.value); }}
                              className="text-sm border border-dashed border-indigo-300 rounded-lg px-3 py-1.5 text-indigo-500 bg-white cursor-pointer outline-none hover:border-indigo-500 transition"
                            >
                              <option value="">+ Add size</option>
                              {options.sizes.filter(s => !(String(s.id) in copySizesPanel.sizes)).map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                          )}
                          {options.sizes.length === 0 && Object.keys(copySizesPanel.sizes).length === 0 && (
                            <p className="text-xs text-indigo-400 italic">No sizes configured yet.</p>
                          )}
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <p className="text-[11px] text-indigo-400">Overwrites existing sizes on all colors in this product line.</p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setCopySizesPanel(null)}
                              className="text-xs font-bold px-3 py-1.5 rounded-lg text-indigo-600 hover:bg-indigo-100 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={applyCopySizesToAllColors}
                              disabled={Object.keys(copySizesPanel.sizes).length === 0}
                              className="text-xs font-bold px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              Apply to all {group.colors.length} colors
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="space-y-3">
                      {group.colors.map((color, cIndex) => {
                        const cTotal = colorTotal(color);
                        const availableSizes = options.sizes.filter(s => !(String(s.id) in color.sizes));
                        return (
                          <div key={cIndex} className="border border-gray-200 rounded-xl p-3 space-y-2.5 bg-slate-50/50">
                            {/* Color row */}
                            <div className="flex items-center gap-2">
                              <select
                                className="flex-1 text-sm p-2 border border-gray-200 rounded-lg bg-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                value={color.colorId}
                                onChange={e => updateColor(gIndex, cIndex, 'colorId', e.target.value)}
                                required
                              >
                                <option value="" disabled>Color…</option>
                                {options.fabricColors.map(c => (
                                  <option key={c.id} value={c.id}>{c.color_number} — {c.name}</option>
                                ))}
                              </select>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="₹ Price"
                                className="w-28 text-sm text-right p-2 border border-gray-200 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                value={color.price}
                                onChange={e => updateColor(gIndex, cIndex, 'price', e.target.value)}
                                required
                              />
                              <span className={`text-sm font-bold tabular-nums min-w-[72px] text-right ${cTotal > 0 ? 'text-slate-700' : 'text-slate-300'}`}>
                                {cTotal > 0 ? `${cTotal.toLocaleString()} pcs` : '— pcs'}
                              </span>
                              {group.colors.length > 1 ? (
                                <button
                                  type="button"
                                  onClick={() => removeColorFromGroup(gIndex, cIndex)}
                                  className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded transition-colors"
                                  title="Remove color"
                                >
                                  <Trash2 size={15} />
                                </button>
                              ) : (
                                <span className="w-7" />
                              )}
                            </div>
                            {/* Per-color size chips */}
                            <div className="flex flex-wrap gap-2 items-center pl-1">
                              {Object.entries(color.sizes).map(([sizeId, qty]) => {
                                const sizeName = options.sizes.find(s => String(s.id) === sizeId)?.name ?? sizeId;
                                return (
                                  <div key={sizeId} className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-1.5">
                                    <span className="text-xs font-bold text-indigo-700 min-w-[2rem] text-center shrink-0">{sizeName}</span>
                                    <input
                                      type="number"
                                      min="0"
                                      className="w-16 text-sm text-center border border-indigo-200 rounded px-1 py-0.5 font-bold text-slate-700 outline-none focus:border-indigo-500 bg-white"
                                      placeholder="0"
                                      value={qty === 0 ? '' : qty}
                                      onChange={e => updateColorSize(gIndex, cIndex, sizeId, e.target.value)}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => removeSizeFromColor(gIndex, cIndex, sizeId)}
                                      className="text-indigo-300 hover:text-red-500 transition ml-0.5"
                                      title={`Remove ${sizeName}`}
                                    >
                                      <X size={12} />
                                    </button>
                                  </div>
                                );
                              })}
                              {availableSizes.length > 0 && (
                                <select
                                  value=""
                                  onChange={e => { if (e.target.value) addSizeToColor(gIndex, cIndex, e.target.value); }}
                                  className="text-sm border border-dashed border-slate-300 rounded-lg px-3 py-1.5 text-slate-500 bg-white hover:border-indigo-400 hover:text-indigo-600 cursor-pointer outline-none transition"
                                >
                                  <option value="">+ Add size</option>
                                  {availableSizes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                              )}
                              {options.sizes.length === 0 && Object.keys(color.sizes).length === 0 && (
                                <p className="text-xs text-slate-400 italic">No sizes configured. Add sizes in Admin → Inventory → Manage Sizes.</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </form>

      {/* Sticky bottom toolbar */}
      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 shadow-lg z-20">
        <div className="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={addGroup}
            className="text-sm font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 px-4 py-2 rounded-lg flex items-center gap-1.5 transition-colors shrink-0"
          >
            <Plus size={16} /> Add product
          </button>
          <div className="hidden md:flex items-center gap-4 text-sm text-slate-600">
            <span><strong className="text-slate-800">{productGroups.length}</strong> line{productGroups.length === 1 ? '' : 's'}</span>
            <span className="text-slate-300">·</span>
            <span><strong className="text-slate-800 tabular-nums">{totalPieces.toLocaleString()}</strong> pcs</span>
            <span className="text-slate-300">·</span>
            <span className="flex items-center"><DollarSign size={14} className="text-slate-500" /><strong className="text-slate-800 tabular-nums">{grandTotal}</strong></span>
            {stagedFiles.length > 0 && (
              <>
                <span className="text-slate-300">·</span>
                <span className="flex items-center gap-1">
                  <Paperclip size={13} className="text-slate-500" />
                  <strong className="text-slate-800">{stagedFiles.length}</strong>
                </span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={handleOpenReview}
            disabled={isSubmitting || totalPieces === 0}
            className="text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed px-5 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-colors shrink-0"
          >
            {isSubmitting
              ? <><Loader2 size={16} className="animate-spin" /> Saving…</>
              : <><Save size={16} /> Review & Save</>}
          </button>
        </div>
      </div>

      {/* Review modal */}
      {showReview && (() => {
        const customer = options.customers.find(c => String(c.id) === String(header.customerId));
        const customerName = customer?.name || (header.customerId ? `Customer #${header.customerId}` : '—');
        const productById = new Map(options.products.map(p => [String(p.id), p]));
        const fabricById  = new Map(options.fabricTypes.map(f => [String(f.id), f]));
        const colorById   = new Map(options.fabricColors.map(c => [String(c.id), c]));
        const currentSopIds = new Set(productGroups.map(g => g.salesOrderProductId).filter(Boolean));
        const removedSops = isEditMode
          ? [...originalSopsById.entries()].filter(([sopId]) => !currentSopIds.has(sopId))
          : [];
        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => !isSubmitting && setShowReview(false)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="w-5 h-5 text-indigo-600" />
                  <h3 className="font-bold text-slate-900 text-base">
                    Review {isEditMode ? 'updated sales order' : 'new sales order'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowReview(false)}
                  disabled={isSubmitting}
                  className="p-1.5 hover:bg-slate-100 rounded-full transition disabled:opacity-40"
                >
                  <X size={18} className="text-slate-500" />
                </button>
              </div>

              <div className="overflow-y-auto flex-1 px-5 py-5 space-y-5">
                {/* Order info */}
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Order Information</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Customer',      value: customerName },
                      { label: 'Order #',       value: header.orderNumber || '—' },
                      { label: 'Buyer PO',      value: header.buyerPoNumber || '—' },
                      { label: 'Delivery Date', value: header.deliveryDate || '—' },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-slate-50 border border-slate-100 rounded-lg px-4 py-3">
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
                        <p className="text-base font-bold text-slate-800 mt-1 truncate">{value}</p>
                      </div>
                    ))}
                    {header.notes && (
                      <div className="col-span-2 bg-slate-50 border border-slate-100 rounded-lg px-4 py-3">
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Notes</p>
                        <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">{header.notes}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Products */}
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Products · {productGroups.length}</p>
                  <div className="space-y-3">
                    {productGroups.map((g, idx) => {
                      const pName = productById.get(String(g.productId))?.name || (g.productId ? `Product #${g.productId}` : '— pick product —');
                      const fName = fabricById.get(String(g.fabricTypeId))?.name  || (g.fabricTypeId ? `Fabric #${g.fabricTypeId}` : '— pick fabric —');
                      const gQty   = groupTotal(g);
                      const gValue = g.colors.reduce((s, c) => s + (colorTotal(c) * (parseFloat(c.price) || 0)), 0);
                      return (
                        <div key={idx} className="border border-slate-200 rounded-lg p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-base font-bold text-slate-800">{pName}</p>
                              <p className="text-sm text-slate-500 truncate">{fName}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-[11px] font-bold text-slate-400 uppercase">Subtotal</p>
                              <p className="text-base font-bold text-slate-800">₹{gValue.toFixed(2)}</p>
                            </div>
                          </div>
                          <div className="mt-3 space-y-2">
                            {g.colors.map((c, ci) => {
                              const colorName = colorById.get(String(c.colorId))?.name || (c.colorId ? `Color #${c.colorId}` : '— color —');
                              const cQty  = colorTotal(c);
                              const price = parseFloat(c.price) || 0;
                              const sizeEntries = Object.entries(c.sizes).filter(([, v]) => Number(v) > 0);
                              return (
                                <div key={ci} className="border border-slate-100 rounded-lg p-2.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-medium text-slate-700 truncate">{colorName}</span>
                                    <span className="text-xs font-mono tabular-nums text-slate-500 shrink-0">
                                      {cQty.toLocaleString()} × ₹{price.toFixed(2)} = ₹{(cQty * price).toFixed(2)}
                                    </span>
                                  </div>
                                  {sizeEntries.length > 0 && (
                                    <div className="mt-1.5 flex flex-wrap gap-1">
                                      {sizeEntries.map(([sizeId, qty]) => {
                                        const sizeName = options.sizes.find(s => String(s.id) === sizeId)?.name ?? sizeId;
                                        return (
                                          <span key={sizeId} className="text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded">
                                            {sizeName}: {qty}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            <div className="flex justify-between text-slate-500 text-sm pt-2 border-t border-slate-100">
                              <span>Group total</span>
                              <span className="font-mono tabular-nums">{gQty.toLocaleString()} pcs</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Removals */}
                {removedSops.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 font-bold text-red-700 text-sm mb-1.5">
                      <AlertTriangle className="w-5 h-5" />
                      {removedSops.length} product{removedSops.length === 1 ? '' : 's'} will be removed
                    </div>
                    <ul className="ml-6 list-disc text-sm text-red-700 space-y-1">
                      {removedSops.map(([sopId, entry]) => {
                        const name = productById.get(String(entry.productId))?.name || `Product #${entry.productId || '—'}`;
                        return <li key={sopId}>{name} <span className="text-red-400">(SOP #{sopId})</span></li>;
                      })}
                    </ul>
                    <p className="text-xs text-red-600 italic mt-2">
                      Note: products with linked BOMs or in-progress production will be retained by the backend.
                    </p>
                  </div>
                )}

                {/* Attachments */}
                {stagedFiles.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                      Attachments · {stagedFiles.length}
                    </p>
                    <div className="space-y-1.5">
                      {stagedFiles.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                          <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                          <span className="text-sm text-slate-700 flex-1 truncate">{f.name}</span>
                          <span className="text-xs text-slate-400 shrink-0">{formatFileSize(f.size)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Grand total */}
                <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-5 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-bold text-indigo-500 uppercase tracking-wider">Grand Total</p>
                    <p className="text-sm text-slate-600 mt-1">
                      {totalPieces.toLocaleString()} pcs across {productGroups.length} product{productGroups.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <p className="text-2xl font-black text-indigo-700 tabular-nums">₹{grandTotal}</p>
                </div>
              </div>

              <div className="px-5 py-4 border-t bg-slate-50 flex justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowReview(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition disabled:opacity-40"
                >
                  Back to edit
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSubmit}
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 px-5 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm disabled:opacity-50 transition"
                >
                  {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {isSubmitting ? 'Saving…' : (isEditMode ? 'Confirm & Update' : 'Confirm & Create')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default CreateSalesOrder;
