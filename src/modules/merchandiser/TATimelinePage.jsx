import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    Calendar, Package, Scissors, Truck, Tag, MoreHorizontal,
    Plus, RefreshCw, Loader2, AlertCircle, ChevronDown, ChevronUp,
    Trash2, Edit2, Check, X, MessageSquare, Paperclip, Send,
    Clock, AlertTriangle, CheckCircle2, Circle, Filter, Search,
    ArrowRight, Link2, User, FileText, ShoppingBag,
} from 'lucide-react';
import { taApi } from '../../api/taApi';

// ─── constants ─────────────────────────────────────────────────────────────────

const CAT = {
    fabric:     { label: 'Fabric',     color: 'bg-blue-100 text-blue-700 border-blue-200',   border: 'border-l-blue-400',   dot: 'bg-blue-400',   bar: 'bg-blue-400'   },
    trim:       { label: 'Trim',       color: 'bg-violet-100 text-violet-700 border-violet-200', border: 'border-l-violet-400', dot: 'bg-violet-400', bar: 'bg-violet-400' },
    production: { label: 'Production', color: 'bg-orange-100 text-orange-700 border-orange-200', border: 'border-l-orange-400', dot: 'bg-orange-400', bar: 'bg-orange-400' },
    delivery:   { label: 'Delivery',   color: 'bg-teal-100 text-teal-700 border-teal-200',   border: 'border-l-teal-400',   dot: 'bg-teal-400',   bar: 'bg-teal-400'   },
    other:      { label: 'Other',      color: 'bg-slate-100 text-slate-600 border-slate-200', border: 'border-l-slate-400',  dot: 'bg-slate-400',  bar: 'bg-slate-400'  },
};

const TL_STATUS = {
    pending:     { label: 'Pending',     color: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: Circle },
    'in-progress':{ label: 'In Progress', color: 'bg-blue-50 text-blue-700 border-blue-200',       icon: Clock },
    completed:   { label: 'Completed',   color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
    delayed:     { label: 'Delayed',     color: 'bg-red-50 text-red-700 border-red-200',          icon: AlertTriangle },
};

const PR_STATUS = {
    pending:    { label: 'Pending',    color: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: Circle },
    'in-transit':{ label: 'In Transit', color: 'bg-blue-50 text-blue-700 border-blue-200',      icon: Truck },
    received:   { label: 'Received',   color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
    delayed:    { label: 'Delayed',    color: 'bg-red-50 text-red-700 border-red-200',         icon: AlertTriangle },
};

const PRIORITY = {
    low:      { label: 'Low',      color: 'bg-slate-100 text-slate-500 border-slate-200',   dot: 'bg-slate-400'   },
    medium:   { label: 'Medium',   color: 'bg-amber-100 text-amber-700 border-amber-200',   dot: 'bg-amber-400'   },
    high:     { label: 'High',     color: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-500'  },
    critical: { label: 'Critical', color: 'bg-red-100 text-red-700 border-red-200',         dot: 'bg-red-500 animate-pulse' },
};

// ─── helpers ───────────────────────────────────────────────────────────────────

const fmt = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—';
const fmtFull = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const daysDiff = (a, b) => a && b ? Math.round((new Date(b) - new Date(a)) / 86400000) : null;
const todayStr = () => new Date().toISOString().split('T')[0];

const Spinner = ({ size = 20 }) => <Loader2 size={size} className="animate-spin text-violet-500" />;

const Pill = ({ cfg, children }) => {
    if (!cfg) return null;
    const Icon = cfg.icon;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${cfg.color}`}>
            {Icon && <Icon size={9} />}{children || cfg.label}
        </span>
    );
};

// ─── Date bar (Gantt mini bar) ─────────────────────────────────────────────────

const DateBar = ({ start, end, category }) => {
    const today = todayStr();
    const s = start || today;
    const e = end || today;
    const totalDays = Math.max(daysDiff(s, e), 1);
    const daysFromStart = daysDiff(s, today);
    const todayPct = Math.max(0, Math.min(100, (daysFromStart / totalDays) * 100));
    const isOverdue = end && today > end;
    const barColor = isOverdue ? 'bg-red-400' : (CAT[category]?.bar || 'bg-slate-400');

    return (
        <div className="relative h-1.5 bg-slate-100 rounded-full overflow-visible mt-1.5">
            <div className={`absolute h-full rounded-full ${barColor} opacity-80`} style={{ width: '100%' }} />
            {/* today marker */}
            {daysFromStart >= 0 && daysFromStart <= totalDays && (
                <div className="absolute top-[-3px] w-[2px] h-[9px] bg-red-500 rounded-full"
                    style={{ left: `${todayPct}%` }} title="Today" />
            )}
        </div>
    );
};

// ─── Message Thread ────────────────────────────────────────────────────────────

const MessageThread = ({ entityType, entityId }) => {
    const [messages, setMessages] = useState([]);
    const [loading,  setLoading]  = useState(true);
    const [text,     setText]     = useState('');
    const [files,    setFiles]    = useState([]);
    const [sending,  setSending]  = useState(false);
    const fileRef = useRef(null);
    const bottomRef = useRef(null);

    useEffect(() => {
        taApi.getMessages(entityType, entityId)
            .then(r => setMessages(r.data?.data ?? r.data ?? []))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [entityType, entityId]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const send = async () => {
        const t = text.trim();
        if (!t && files.length === 0) return;
        setSending(true);
        const fd = new FormData();
        fd.append('text', t);
        fd.append('related_entity_type', entityType);
        fd.append('related_entity_id', String(entityId));
        files.forEach(f => fd.append('attachments[]', f));
        try {
            const res = await taApi.sendMessage(fd);
            setMessages(prev => [...prev, res.data?.data ?? res.data]);
            setText(''); setFiles([]);
        } catch { /* silent */ } finally { setSending(false); }
    };

    const removeFile = (i) => setFiles(prev => prev.filter((_, j) => j !== i));

    if (loading) return <div className="py-3 flex justify-center"><Spinner size={16} /></div>;

    return (
        <div className="border-t border-slate-100 mt-3 pt-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                <MessageSquare size={10} /> Team Messages ({messages.length})
            </p>

            {/* Message list */}
            <div className="space-y-2 max-h-48 overflow-y-auto mb-3">
                {messages.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic text-center py-2">No messages yet. Start the conversation.</p>
                ) : messages.map((msg, i) => (
                    <div key={msg.id ?? i} className="flex gap-2">
                        <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center text-[10px] font-bold text-violet-700 shrink-0">
                            {(msg.sender_name || msg.user_name || '?')[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="text-[10px] font-bold text-slate-700">{msg.sender_name || msg.user_name}</span>
                                <span className="text-[9px] text-slate-400">
                                    {msg.created_at ? new Date(msg.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                                </span>
                            </div>
                            {msg.text && <p className="text-xs text-slate-700 leading-relaxed">{msg.text}</p>}
                            {(msg.attachments || []).length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {msg.attachments.map((att, j) => (
                                        <a key={j} href={att.url} target="_blank" rel="noreferrer"
                                            className="flex items-center gap-1 text-[10px] text-violet-600 hover:underline bg-violet-50 border border-violet-100 px-1.5 py-0.5 rounded">
                                            <Paperclip size={9} /> {att.filename || `File ${j + 1}`}
                                        </a>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>

            {/* File chips */}
            {files.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                    {files.map((f, i) => (
                        <span key={i} className="flex items-center gap-1 text-[10px] bg-violet-50 border border-violet-200 text-violet-700 px-2 py-0.5 rounded-full">
                            <Paperclip size={9} /> {f.name}
                            <button onClick={() => removeFile(i)} className="ml-0.5 text-violet-400 hover:text-red-500"><X size={9} /></button>
                        </span>
                    ))}
                </div>
            )}

            {/* Compose */}
            <div className="flex items-end gap-1.5">
                <textarea
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                    placeholder="Type a message… (Enter to send)"
                    rows={2}
                    className="flex-1 border border-slate-200 rounded-lg px-2.5 py-2 text-xs outline-none focus:ring-2 focus:ring-violet-300 resize-none"
                />
                <div className="flex flex-col gap-1">
                    <button onClick={() => fileRef.current?.click()}
                        className="p-1.5 border border-slate-200 rounded-lg text-slate-400 hover:text-violet-600 hover:border-violet-200 transition-colors" title="Attach files">
                        <Paperclip size={13} />
                    </button>
                    <button onClick={send} disabled={sending || (!text.trim() && files.length === 0)}
                        className="p-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors disabled:opacity-40">
                        {sending ? <Spinner size={13} /> : <Send size={13} />}
                    </button>
                </div>
                <input ref={fileRef} type="file" multiple accept="*/*" className="hidden"
                    onChange={e => setFiles(prev => [...prev, ...Array.from(e.target.files || [])].slice(0, 5))} />
            </div>
        </div>
    );
};

// ─── Timeline Item Form Modal ──────────────────────────────────────────────────

const TimelineItemFormModal = ({ item, formMeta, allItems, onClose, onSaved }) => {
    const isEdit = !!item;
    const [form, setForm] = useState({
        title:                  item?.title || '',
        description:            item?.description || '',
        category:               item?.category || 'fabric',
        start_date:             item?.start_date || '',
        end_date:               item?.end_date || '',
        status:                 item?.status || 'pending',
        priority:               item?.priority || 'medium',
        assignee_user_id:       item?.assignee_user_id || '',
        sales_order_id:         item?.sales_order_id || '',
        sales_order_product_id: item?.sales_order_product_id || '',
        notes:                  item?.notes || '',
        dependency_ids:         item?.dependency_ids || [],
    });
    const [saving, setSaving] = useState(false);
    const [err,    setErr]    = useState(null);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const toggleDep = (id) => set('dependency_ids',
        form.dependency_ids.includes(id)
            ? form.dependency_ids.filter(d => d !== id)
            : [...form.dependency_ids, id]
    );

    const save = async () => {
        if (!form.title.trim() || !form.start_date || !form.end_date) {
            setErr('Title, start date and end date are required.'); return;
        }
        setSaving(true); setErr(null);
        try {
            const payload = { ...form, assignee_user_id: form.assignee_user_id || null, sales_order_id: form.sales_order_id || null, sales_order_product_id: form.sales_order_product_id || null };
            if (isEdit) await taApi.updateTimelineItem(item.id, payload);
            else        await taApi.createTimelineItem(payload);
            onSaved();
        } catch (e) {
            setErr(e?.response?.data?.error || e.message || 'Failed to save.');
        } finally { setSaving(false); }
    };

    const field = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300';

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl my-4">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <h2 className="font-extrabold text-slate-800 text-base">{isEdit ? 'Edit Timeline Item' : 'New Timeline Item'}</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
                </div>
                <div className="px-6 py-5 space-y-3 max-h-[75vh] overflow-y-auto">
                    {err && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-red-600 text-xs"><AlertCircle size={13} />{err}</div>}

                    <input className={field} placeholder="Title *" value={form.title} onChange={e => set('title', e.target.value)} />

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Category</label>
                            <select className={field} value={form.category} onChange={e => set('category', e.target.value)}>
                                {Object.keys(CAT).map(k => <option key={k} value={k}>{CAT[k].label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Priority</label>
                            <select className={field} value={form.priority} onChange={e => set('priority', e.target.value)}>
                                {Object.keys(PRIORITY).map(k => <option key={k} value={k}>{PRIORITY[k].label}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Start Date *</label>
                            <input type="date" className={field} value={form.start_date} onChange={e => set('start_date', e.target.value)} />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">End Date *</label>
                            <input type="date" className={field} value={form.end_date} onChange={e => set('end_date', e.target.value)} />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Status</label>
                            <select className={field} value={form.status} onChange={e => set('status', e.target.value)}>
                                {Object.keys(TL_STATUS).map(k => <option key={k} value={k}>{TL_STATUS[k].label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Assignee</label>
                            <select className={field} value={form.assignee_user_id} onChange={e => set('assignee_user_id', e.target.value)}>
                                <option value="">— Unassigned —</option>
                                {(formMeta.users || []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Sales Order</label>
                            <select className={field} value={form.sales_order_id} onChange={e => set('sales_order_id', e.target.value)}>
                                <option value="">— None —</option>
                                {(formMeta.orders || []).map(o => <option key={o.id} value={o.id}>{o.order_number || o.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">SOP / Product</label>
                            <select className={field} value={form.sales_order_product_id} onChange={e => set('sales_order_product_id', e.target.value)}>
                                <option value="">— None —</option>
                                {(formMeta.sops || []).map(s => <option key={s.id} value={s.id}>{s.product_name || s.name}</option>)}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Description</label>
                        <textarea className={`${field} resize-none`} rows={2} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Optional description" />
                    </div>

                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Notes</label>
                        <textarea className={`${field} resize-none`} rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Internal notes" />
                    </div>

                    {allItems.filter(i => i.id !== item?.id).length > 0 && (
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1.5 block">Dependencies</label>
                            <div className="max-h-32 overflow-y-auto space-y-1 border border-slate-100 rounded-lg p-2">
                                {allItems.filter(i => i.id !== item?.id).map(i => (
                                    <label key={i.id} className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 hover:text-violet-700 py-0.5">
                                        <input type="checkbox" className="accent-violet-600"
                                            checked={form.dependency_ids.includes(i.id)}
                                            onChange={() => toggleDep(i.id)} />
                                        {i.title}
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <div className="border-t border-slate-100 px-6 py-4 flex justify-end gap-3 bg-slate-50 rounded-b-2xl">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">Cancel</button>
                    <button onClick={save} disabled={saving}
                        className="flex items-center gap-1.5 px-5 py-2 text-sm font-bold bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors disabled:opacity-50">
                        {saving ? <Spinner size={13} /> : <Check size={13} />} {isEdit ? 'Save Changes' : 'Create Item'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── Procurement Event Form Modal ──────────────────────────────────────────────

const ProcurementEventFormModal = ({ event, formMeta, allTimelineItems, onClose, onSaved }) => {
    const isEdit = !!event;
    const [form, setForm] = useState({
        item_name:              event?.item_name || '',
        type:                   event?.type || 'fabric',
        order_date:             event?.order_date || '',
        expected_date:          event?.expected_date || '',
        actual_date:            event?.actual_date || '',
        status:                 event?.status || 'pending',
        supplier_id:            event?.supplier_id || '',
        priority:               event?.priority || 'medium',
        timeline_item_id:       event?.timeline_item_id || '',
        purchase_order_id:      event?.purchase_order_id || '',
        sales_order_product_id: event?.sales_order_product_id || '',
        quantity:               event?.quantity || '',
        unit:                   event?.unit || 'meter',
        notes:                  event?.notes || '',
    });
    const [saving, setSaving] = useState(false);
    const [err,    setErr]    = useState(null);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const save = async () => {
        if (!form.item_name.trim() || !form.expected_date) {
            setErr('Item name and expected date are required.'); return;
        }
        setSaving(true); setErr(null);
        try {
            const payload = {
                ...form,
                supplier_id:            form.supplier_id || null,
                timeline_item_id:       form.timeline_item_id || null,
                purchase_order_id:      form.purchase_order_id || null,
                sales_order_product_id: form.sales_order_product_id || null,
                quantity:               form.quantity ? parseFloat(form.quantity) : null,
                actual_date:            form.actual_date || null,
                order_date:             form.order_date || null,
            };
            if (isEdit) await taApi.updateProcurementEvent(event.id, payload);
            else        await taApi.createProcurementEvent(payload);
            onSaved();
        } catch (e) {
            setErr(e?.response?.data?.error || e.message || 'Failed to save.');
        } finally { setSaving(false); }
    };

    const field = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300';

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl my-4">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <h2 className="font-extrabold text-slate-800 text-base">{isEdit ? 'Edit Procurement Event' : 'New Procurement Event'}</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
                </div>
                <div className="px-6 py-5 space-y-3 max-h-[75vh] overflow-y-auto">
                    {err && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-red-600 text-xs"><AlertCircle size={13} />{err}</div>}

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Item Name *</label>
                            <input className={field} placeholder="e.g. Black Cotton Fabric" value={form.item_name} onChange={e => set('item_name', e.target.value)} />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Type</label>
                            <select className={field} value={form.type} onChange={e => set('type', e.target.value)}>
                                <option value="fabric">Fabric</option>
                                <option value="trim">Trim</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Priority</label>
                            <select className={field} value={form.priority} onChange={e => set('priority', e.target.value)}>
                                {Object.keys(PRIORITY).map(k => <option key={k} value={k}>{PRIORITY[k].label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Status</label>
                            <select className={field} value={form.status} onChange={e => set('status', e.target.value)}>
                                {Object.keys(PR_STATUS).map(k => <option key={k} value={k}>{PR_STATUS[k].label}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Order Date</label>
                            <input type="date" className={field} value={form.order_date} onChange={e => set('order_date', e.target.value)} />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Expected Date *</label>
                            <input type="date" className={field} value={form.expected_date} onChange={e => set('expected_date', e.target.value)} />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Actual Date</label>
                            <input type="date" className={field} value={form.actual_date} onChange={e => set('actual_date', e.target.value)} />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Quantity</label>
                            <input type="number" min="0" className={field} placeholder="500" value={form.quantity} onChange={e => set('quantity', e.target.value)} />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Unit</label>
                            <select className={field} value={form.unit} onChange={e => set('unit', e.target.value)}>
                                {['meter', 'yard', 'piece', 'kg', 'roll', 'set', 'dozen'].map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Supplier</label>
                        <select className={field} value={form.supplier_id} onChange={e => set('supplier_id', e.target.value)}>
                            <option value="">— No supplier —</option>
                            {(formMeta.suppliers || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Linked T&A Item</label>
                        <select className={field} value={form.timeline_item_id} onChange={e => set('timeline_item_id', e.target.value)}>
                            <option value="">— None —</option>
                            {allTimelineItems.map(i => <option key={i.id} value={i.id}>{i.title}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">SOP / Product</label>
                        <select className={field} value={form.sales_order_product_id} onChange={e => set('sales_order_product_id', e.target.value)}>
                            <option value="">— None —</option>
                            {(formMeta.sops || []).map(s => <option key={s.id} value={s.id}>{s.product_name || s.name}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Notes</label>
                        <textarea className={`${field} resize-none`} rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Any additional notes" />
                    </div>
                </div>
                <div className="border-t border-slate-100 px-6 py-4 flex justify-end gap-3 bg-slate-50 rounded-b-2xl">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">Cancel</button>
                    <button onClick={save} disabled={saving}
                        className="flex items-center gap-1.5 px-5 py-2 text-sm font-bold bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors disabled:opacity-50">
                        {saving ? <Spinner size={13} /> : <Check size={13} />} {isEdit ? 'Save Changes' : 'Create Event'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── Timeline Item Card ────────────────────────────────────────────────────────

const TimelineItemCard = ({ item, onEdit, onDelete }) => {
    const [expanded, setExpanded] = useState(false);
    const cat  = CAT[item.category]  || CAT.other;
    const sts  = TL_STATUS[item.status] || TL_STATUS.pending;
    const pri  = PRIORITY[item.priority] || PRIORITY.medium;
    const dur  = daysDiff(item.start_date, item.end_date);
    const today = todayStr();
    const isOverdue = item.status !== 'completed' && item.end_date && today > item.end_date;

    return (
        <div className={`bg-white rounded-xl border border-slate-200 border-l-4 ${cat.border} shadow-sm ${expanded ? 'ring-1 ring-violet-200' : 'hover:shadow-md'} transition-all`}>
            <div className="px-4 py-3 cursor-pointer select-none" onClick={() => setExpanded(e => !e)}>
                {/* Row 1: title + badges */}
                <div className="flex items-start gap-2 mb-2">
                    <div className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${pri.dot}`} title={`Priority: ${pri.label}`} />
                    <div className="flex-1 min-w-0">
                        <p className={`font-bold text-slate-800 text-sm leading-tight truncate ${isOverdue ? 'text-red-700' : ''}`}>
                            {item.title}
                            {isOverdue && <span className="ml-2 text-[9px] font-black text-red-500 uppercase tracking-wider">Overdue</span>}
                        </p>
                        {item.order_number && (
                            <p className="text-[10px] text-slate-400 mt-0.5 truncate">{item.order_number}{item.product_name ? ` · ${item.product_name}` : ''}</p>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        <Pill cfg={cat} />
                        <Pill cfg={sts} />
                        {expanded ? <ChevronUp size={13} className="text-slate-400" /> : <ChevronDown size={13} className="text-slate-400" />}
                    </div>
                </div>

                {/* Row 2: dates + assignee + msg count */}
                <div className="flex items-center gap-3 text-[10px] text-slate-500 pl-4">
                    <span className="flex items-center gap-1">
                        <Calendar size={9} />
                        {fmt(item.start_date)} <ArrowRight size={8} /> {fmt(item.end_date)}
                        {dur != null && <span className="text-slate-400 ml-1">({dur}d)</span>}
                    </span>
                    {item.assignee_name && (
                        <span className="flex items-center gap-1 ml-auto">
                            <User size={9} /> {item.assignee_name}
                        </span>
                    )}
                    {item.message_count > 0 && (
                        <span className="flex items-center gap-1 text-violet-500">
                            <MessageSquare size={9} /> {item.message_count}
                        </span>
                    )}
                </div>

                {/* Date bar */}
                <div className="pl-4 mt-1">
                    <DateBar start={item.start_date} end={item.end_date} category={item.category} />
                </div>
            </div>

            {/* Expanded details */}
            {expanded && (
                <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-3">
                    {item.description && (
                        <p className="text-xs text-slate-600 leading-relaxed">{item.description}</p>
                    )}

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {[
                            { label: 'Start',    val: fmtFull(item.start_date) },
                            { label: 'End',      val: fmtFull(item.end_date)   },
                            { label: 'Priority', val: pri.label                },
                            item.assignee_name && { label: 'Assignee', val: item.assignee_name },
                            item.order_number  && { label: 'SO',       val: item.order_number  },
                        ].filter(Boolean).map(({ label, val }) => (
                            <div key={label} className="bg-slate-50 rounded-lg p-2 border border-slate-100">
                                <p className="text-[9px] font-bold text-slate-400 uppercase">{label}</p>
                                <p className="text-xs font-semibold text-slate-700 mt-0.5">{val}</p>
                            </div>
                        ))}
                    </div>

                    {(item.dependency_titles || []).length > 0 && (
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1 flex items-center gap-1"><Link2 size={9} /> Dependencies</p>
                            <div className="flex flex-wrap gap-1">
                                {item.dependency_titles.map((t, i) => (
                                    <span key={i} className="text-[10px] bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded">{t}</span>
                                ))}
                            </div>
                        </div>
                    )}

                    {item.notes && (
                        <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                            <p className="text-[9px] font-bold text-amber-600 uppercase mb-0.5">Notes</p>
                            <p className="text-xs text-amber-800">{item.notes}</p>
                        </div>
                    )}

                    <MessageThread entityType="timeline_item" entityId={item.id} />

                    <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                        <button onClick={(e) => { e.stopPropagation(); onEdit(item); }}
                            className="flex items-center gap-1 text-[11px] font-bold text-violet-600 hover:text-violet-700 px-2 py-1 rounded hover:bg-violet-50 transition-colors">
                            <Edit2 size={11} /> Edit
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); onDelete(item); }}
                            className="flex items-center gap-1 text-[11px] font-bold text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition-colors ml-auto">
                            <Trash2 size={11} /> Delete
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── Procurement Event Card ────────────────────────────────────────────────────

const ProcurementEventCard = ({ event, onEdit, onDelete }) => {
    const [expanded, setExpanded] = useState(false);
    const sts = PR_STATUS[event.status] || PR_STATUS.pending;
    const pri = PRIORITY[event.priority] || PRIORITY.medium;
    const today = todayStr();
    const isOverdue = event.status !== 'received' && event.expected_date && today > event.expected_date && !event.actual_date;
    const typeColor = event.type === 'fabric'
        ? 'bg-blue-50 text-blue-700 border-blue-200'
        : 'bg-violet-50 text-violet-700 border-violet-200';
    const borderColor = event.type === 'fabric' ? 'border-l-blue-400' : 'border-l-violet-400';

    return (
        <div className={`bg-white rounded-xl border border-slate-200 border-l-4 ${borderColor} shadow-sm ${expanded ? 'ring-1 ring-violet-200' : 'hover:shadow-md'} transition-all`}>
            <div className="px-4 py-3 cursor-pointer select-none" onClick={() => setExpanded(e => !e)}>
                <div className="flex items-start gap-2 mb-1.5">
                    <div className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${pri.dot}`} />
                    <div className="flex-1 min-w-0">
                        <p className={`font-bold text-slate-800 text-sm leading-tight truncate ${isOverdue ? 'text-red-700' : ''}`}>
                            {event.item_name}
                            {isOverdue && <span className="ml-2 text-[9px] font-black text-red-500 uppercase">Overdue</span>}
                        </p>
                        {event.supplier_name && <p className="text-[10px] text-slate-400 mt-0.5">{event.supplier_name}</p>}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`text-[9px] font-bold uppercase border px-2 py-0.5 rounded ${typeColor}`}>{event.type}</span>
                        <Pill cfg={sts} />
                        {expanded ? <ChevronUp size={13} className="text-slate-400" /> : <ChevronDown size={13} className="text-slate-400" />}
                    </div>
                </div>

                {/* Date strip */}
                <div className="flex items-center gap-2 text-[10px] text-slate-500 pl-4 flex-wrap">
                    {event.order_date && (
                        <span className="flex items-center gap-1"><Calendar size={9} /> Ordered: {fmt(event.order_date)}</span>
                    )}
                    <span className="flex items-center gap-1 font-bold text-slate-600">
                        <ArrowRight size={8} /> Expected: {fmt(event.expected_date)}
                    </span>
                    {event.actual_date && (
                        <span className="flex items-center gap-1 text-emerald-600 font-bold">
                            <CheckCircle2 size={9} /> Received: {fmt(event.actual_date)}
                        </span>
                    )}
                    {event.quantity && (
                        <span className="ml-auto font-bold text-slate-700">{event.quantity} {event.unit}</span>
                    )}
                </div>
            </div>

            {expanded && (
                <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {[
                            { label: 'Priority',  val: pri.label },
                            event.supplier_name && { label: 'Supplier',  val: event.supplier_name },
                            event.order_date    && { label: 'Ordered',   val: fmtFull(event.order_date) },
                            { label: 'Expected',  val: fmtFull(event.expected_date) },
                            event.actual_date   && { label: 'Received',  val: fmtFull(event.actual_date) },
                            event.quantity      && { label: 'Quantity',  val: `${event.quantity} ${event.unit}` },
                        ].filter(Boolean).map(({ label, val }) => (
                            <div key={label} className="bg-slate-50 rounded-lg p-2 border border-slate-100">
                                <p className="text-[9px] font-bold text-slate-400 uppercase">{label}</p>
                                <p className="text-xs font-semibold text-slate-700 mt-0.5">{val}</p>
                            </div>
                        ))}
                    </div>

                    {event.timeline_item_title && (
                        <div className="flex items-center gap-1.5 text-xs text-violet-700 bg-violet-50 border border-violet-100 rounded-lg px-3 py-2">
                            <Link2 size={11} /> T&A: {event.timeline_item_title}
                        </div>
                    )}

                    {event.notes && (
                        <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                            <p className="text-[9px] font-bold text-amber-600 uppercase mb-0.5">Notes</p>
                            <p className="text-xs text-amber-800">{event.notes}</p>
                        </div>
                    )}

                    <MessageThread entityType="procurement_event" entityId={event.id} />

                    <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                        <button onClick={(e) => { e.stopPropagation(); onEdit(event); }}
                            className="flex items-center gap-1 text-[11px] font-bold text-violet-600 hover:text-violet-700 px-2 py-1 rounded hover:bg-violet-50 transition-colors">
                            <Edit2 size={11} /> Edit
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); onDelete(event); }}
                            className="flex items-center gap-1 text-[11px] font-bold text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition-colors ml-auto">
                            <Trash2 size={11} /> Delete
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function TATimelinePage() {
    const [tab,       setTab]       = useState('timeline');   // 'timeline' | 'procurement'
    const [items,     setItems]     = useState([]);
    const [events,    setEvents]    = useState([]);
    const [formMeta,  setFormMeta]  = useState({ users: [], orders: [], suppliers: [], sops: [] });
    const [loading,   setLoading]   = useState(true);
    const [error,     setError]     = useState(null);

    // forms
    const [tlForm,    setTlForm]    = useState(null);   // null | 'new' | item-object
    const [prForm,    setPrForm]    = useState(null);   // null | 'new' | event-object
    const [delConfirm,setDelConfirm]= useState(null);   // { type, id, name }
    const [deleting,  setDeleting]  = useState(false);

    // timeline filters
    const [tlFilters, setTlFilters] = useState({ category: '', status: '', priority: '', search: '' });
    // procurement filters
    const [prFilters, setPrFilters] = useState({ type: '', status: '', priority: '', supplier_id: '', search: '' });

    // ── load ──
    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const [metaRes, tlRes, prRes] = await Promise.all([
                taApi.getFormData(),
                taApi.getTimeline({}),
                taApi.getProcurement({}),
            ]);
            setFormMeta(metaRes.data?.data ?? metaRes.data ?? {});
            setItems(tlRes.data?.data   ?? tlRes.data   ?? []);
            setEvents(prRes.data?.data  ?? prRes.data   ?? []);
        } catch (e) {
            setError(e?.response?.data?.error || e.message || 'Failed to load.');
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    // ── filtered lists ──
    const filteredItems = useMemo(() => {
        let list = items;
        if (tlFilters.category) list = list.filter(i => i.category === tlFilters.category);
        if (tlFilters.status)   list = list.filter(i => i.status   === tlFilters.status);
        if (tlFilters.priority) list = list.filter(i => i.priority  === tlFilters.priority);
        if (tlFilters.search)   {
            const q = tlFilters.search.toLowerCase();
            list = list.filter(i => (i.title || '').toLowerCase().includes(q) || (i.order_number || '').toLowerCase().includes(q));
        }
        return [...list].sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));
    }, [items, tlFilters]);

    const filteredEvents = useMemo(() => {
        let list = events;
        if (prFilters.type)        list = list.filter(e => e.type        === prFilters.type);
        if (prFilters.status)      list = list.filter(e => e.status      === prFilters.status);
        if (prFilters.priority)    list = list.filter(e => e.priority    === prFilters.priority);
        if (prFilters.supplier_id) list = list.filter(e => String(e.supplier_id) === prFilters.supplier_id);
        if (prFilters.search)      {
            const q = prFilters.search.toLowerCase();
            list = list.filter(e => (e.item_name || '').toLowerCase().includes(q) || (e.supplier_name || '').toLowerCase().includes(q));
        }
        return list;
    }, [events, prFilters]);

    // ── stats ──
    const tlStats = useMemo(() => ({
        total:       items.length,
        pending:     items.filter(i => i.status === 'pending').length,
        inProgress:  items.filter(i => i.status === 'in-progress').length,
        delayed:     items.filter(i => i.status === 'delayed').length,
        completed:   items.filter(i => i.status === 'completed').length,
    }), [items]);

    const prStats = useMemo(() => ({
        total:    events.length,
        pending:  events.filter(e => e.status === 'pending').length,
        inTransit:events.filter(e => e.status === 'in-transit').length,
        delayed:  events.filter(e => e.status === 'delayed').length,
        received: events.filter(e => e.status === 'received').length,
    }), [events]);

    // ── delete ──
    const handleDelete = async () => {
        if (!delConfirm) return;
        setDeleting(true);
        try {
            if (delConfirm.type === 'timeline') await taApi.deleteTimelineItem(delConfirm.id);
            else                                await taApi.deleteProcurementEvent(delConfirm.id);
            await load();
            setDelConfirm(null);
        } catch (e) {
            alert(e?.response?.data?.error || 'Delete failed.');
        } finally { setDeleting(false); }
    };

    const setTlF = (k, v) => setTlFilters(f => ({ ...f, [k]: v }));
    const setPrF = (k, v) => setPrFilters(f => ({ ...f, [k]: v }));

    const selectCls = 'border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 outline-none focus:ring-2 focus:ring-violet-300 bg-white';

    // ── render ──
    return (
        <div className="min-h-screen bg-slate-50">
            {/* ── page header ── */}
            <div className="bg-white border-b border-slate-200 px-6 py-5">
                <div className="flex items-center justify-between mb-5">
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <Calendar size={20} className="text-violet-600" />
                            <h1 className="text-xl font-extrabold text-slate-800">T&A Timeline & Procurement</h1>
                        </div>
                        <p className="text-xs text-slate-400">Centralised procurement planning and team collaboration across all orders.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={load} disabled={loading}
                            className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50">
                            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
                        </button>
                        {tab === 'timeline' && (
                            <button onClick={() => setTlForm('new')}
                                className="flex items-center gap-1.5 text-sm font-bold bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-xl transition-colors">
                                <Plus size={14} /> New Timeline Item
                            </button>
                        )}
                        {tab === 'procurement' && (
                            <button onClick={() => setPrForm('new')}
                                className="flex items-center gap-1.5 text-sm font-bold bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-xl transition-colors">
                                <Plus size={14} /> New Procurement Event
                            </button>
                        )}
                    </div>
                </div>

                {/* ── tabs ── */}
                <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 w-fit">
                    {[
                        { key: 'timeline',    label: `Timeline (${tlStats.total})` },
                        { key: 'procurement', label: `Procurement (${prStats.total})` },
                    ].map(({ key, label }) => (
                        <button key={key} onClick={() => setTab(key)}
                            className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${tab === key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── body ── */}
            <div className="p-6">
                {loading ? (
                    <div className="flex items-center justify-center h-64"><Spinner size={28} /></div>
                ) : error ? (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">
                        <AlertCircle size={16} /> {error}
                    </div>
                ) : tab === 'timeline' ? (
                    <>
                        {/* Timeline stat row */}
                        <div className="grid grid-cols-5 gap-3 mb-5">
                            {[
                                { label: 'Total',       val: tlStats.total,      color: 'text-slate-700' },
                                { label: 'Pending',     val: tlStats.pending,    color: 'text-yellow-700' },
                                { label: 'In Progress', val: tlStats.inProgress, color: 'text-blue-700'  },
                                { label: 'Delayed',     val: tlStats.delayed,    color: 'text-red-600',  urgent: tlStats.delayed > 0 },
                                { label: 'Completed',   val: tlStats.completed,  color: 'text-emerald-700' },
                            ].map(({ label, val, color, urgent }) => (
                                <div key={label} className={`bg-white border rounded-xl p-3 text-center shadow-sm ${urgent ? 'border-red-200 ring-1 ring-red-200' : 'border-slate-200'}`}>
                                    <p className={`text-2xl font-black ${color}`}>{val}</p>
                                    <p className="text-[10px] font-bold uppercase text-slate-400 mt-0.5">{label}</p>
                                </div>
                            ))}
                        </div>

                        {/* Timeline filters */}
                        <div className="flex items-center gap-2 flex-wrap mb-4 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
                            <Filter size={13} className="text-slate-400 shrink-0" />
                            <select value={tlFilters.category} onChange={e => setTlF('category', e.target.value)} className={selectCls}>
                                <option value="">All Categories</option>
                                {Object.keys(CAT).map(k => <option key={k} value={k}>{CAT[k].label}</option>)}
                            </select>
                            <select value={tlFilters.status} onChange={e => setTlF('status', e.target.value)} className={selectCls}>
                                <option value="">All Statuses</option>
                                {Object.keys(TL_STATUS).map(k => <option key={k} value={k}>{TL_STATUS[k].label}</option>)}
                            </select>
                            <select value={tlFilters.priority} onChange={e => setTlF('priority', e.target.value)} className={selectCls}>
                                <option value="">All Priorities</option>
                                {Object.keys(PRIORITY).map(k => <option key={k} value={k}>{PRIORITY[k].label}</option>)}
                            </select>
                            <div className="relative ml-auto">
                                <Search size={12} className="absolute left-2.5 top-2 text-slate-400" />
                                <input type="text" value={tlFilters.search} onChange={e => setTlF('search', e.target.value)}
                                    placeholder="Search items…"
                                    className="pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-violet-300 w-44" />
                            </div>
                        </div>

                        {/* Timeline items grouped by category */}
                        {filteredItems.length === 0 ? (
                            <div className="flex flex-col items-center py-20 gap-3 text-slate-400">
                                <Calendar size={44} strokeWidth={1} />
                                <p className="font-bold text-lg">{tlFilters.search || tlFilters.category || tlFilters.status ? 'No items match your filters.' : 'No timeline items yet.'}</p>
                                <button onClick={() => setTlForm('new')} className="flex items-center gap-1.5 text-sm font-bold bg-violet-600 hover:bg-violet-700 text-white px-5 py-2.5 rounded-xl mt-2 transition-colors">
                                    <Plus size={14} /> Create first item
                                </button>
                            </div>
                        ) : (
                            // Group by category
                            Object.keys(CAT).map(cat => {
                                const catItems = filteredItems.filter(i => i.category === cat);
                                if (catItems.length === 0) return null;
                                const cfg = CAT[cat];
                                return (
                                    <div key={cat} className="mb-6">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                                            <span className="text-xs font-black text-slate-700 uppercase tracking-wider">{cfg.label}</span>
                                            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">{catItems.length}</span>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                            {catItems.map(item => (
                                                <TimelineItemCard
                                                    key={item.id}
                                                    item={item}
                                                    onEdit={(i) => setTlForm(i)}
                                                    onDelete={(i) => setDelConfirm({ type: 'timeline', id: i.id, name: i.title })}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </>
                ) : (
                    <>
                        {/* Procurement stat row */}
                        <div className="grid grid-cols-5 gap-3 mb-5">
                            {[
                                { label: 'Total',      val: prStats.total,     color: 'text-slate-700'   },
                                { label: 'Pending',    val: prStats.pending,   color: 'text-yellow-700'  },
                                { label: 'In Transit', val: prStats.inTransit, color: 'text-blue-700'    },
                                { label: 'Delayed',    val: prStats.delayed,   color: 'text-red-600',  urgent: prStats.delayed > 0 },
                                { label: 'Received',   val: prStats.received,  color: 'text-emerald-700' },
                            ].map(({ label, val, color, urgent }) => (
                                <div key={label} className={`bg-white border rounded-xl p-3 text-center shadow-sm ${urgent ? 'border-red-200 ring-1 ring-red-200' : 'border-slate-200'}`}>
                                    <p className={`text-2xl font-black ${color}`}>{val}</p>
                                    <p className="text-[10px] font-bold uppercase text-slate-400 mt-0.5">{label}</p>
                                </div>
                            ))}
                        </div>

                        {/* Procurement filters */}
                        <div className="flex items-center gap-2 flex-wrap mb-4 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
                            <Filter size={13} className="text-slate-400 shrink-0" />
                            <select value={prFilters.type} onChange={e => setPrF('type', e.target.value)} className={selectCls}>
                                <option value="">All Types</option>
                                <option value="fabric">Fabric</option>
                                <option value="trim">Trim</option>
                            </select>
                            <select value={prFilters.status} onChange={e => setPrF('status', e.target.value)} className={selectCls}>
                                <option value="">All Statuses</option>
                                {Object.keys(PR_STATUS).map(k => <option key={k} value={k}>{PR_STATUS[k].label}</option>)}
                            </select>
                            <select value={prFilters.priority} onChange={e => setPrF('priority', e.target.value)} className={selectCls}>
                                <option value="">All Priorities</option>
                                {Object.keys(PRIORITY).map(k => <option key={k} value={k}>{PRIORITY[k].label}</option>)}
                            </select>
                            {(formMeta.suppliers || []).length > 0 && (
                                <select value={prFilters.supplier_id} onChange={e => setPrF('supplier_id', e.target.value)} className={selectCls}>
                                    <option value="">All Suppliers</option>
                                    {formMeta.suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            )}
                            <div className="relative ml-auto">
                                <Search size={12} className="absolute left-2.5 top-2 text-slate-400" />
                                <input type="text" value={prFilters.search} onChange={e => setPrF('search', e.target.value)}
                                    placeholder="Search procurement…"
                                    className="pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-violet-300 w-44" />
                            </div>
                        </div>

                        {/* Procurement events */}
                        {filteredEvents.length === 0 ? (
                            <div className="flex flex-col items-center py-20 gap-3 text-slate-400">
                                <Package size={44} strokeWidth={1} />
                                <p className="font-bold text-lg">{prFilters.search || prFilters.type || prFilters.status ? 'No events match your filters.' : 'No procurement events yet.'}</p>
                                <button onClick={() => setPrForm('new')} className="flex items-center gap-1.5 text-sm font-bold bg-violet-600 hover:bg-violet-700 text-white px-5 py-2.5 rounded-xl mt-2 transition-colors">
                                    <Plus size={14} /> Create first event
                                </button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                {filteredEvents.map(event => (
                                    <ProcurementEventCard
                                        key={event.id}
                                        event={event}
                                        onEdit={(e) => setPrForm(e)}
                                        onDelete={(e) => setDelConfirm({ type: 'procurement', id: e.id, name: e.item_name })}
                                    />
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* ── Timeline Item Form Modal ── */}
            {tlForm && (
                <TimelineItemFormModal
                    item={tlForm === 'new' ? null : tlForm}
                    formMeta={formMeta}
                    allItems={items}
                    onClose={() => setTlForm(null)}
                    onSaved={() => { setTlForm(null); load(); }}
                />
            )}

            {/* ── Procurement Event Form Modal ── */}
            {prForm && (
                <ProcurementEventFormModal
                    event={prForm === 'new' ? null : prForm}
                    formMeta={formMeta}
                    allTimelineItems={items}
                    onClose={() => setPrForm(null)}
                    onSaved={() => { setPrForm(null); load(); }}
                />
            )}

            {/* ── Delete Confirm ── */}
            {delConfirm && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
                        <div className="flex items-center gap-2 mb-2">
                            <AlertTriangle className="text-amber-500" size={18} />
                            <h3 className="font-extrabold text-slate-800">Delete {delConfirm.type === 'timeline' ? 'Timeline Item' : 'Procurement Event'}?</h3>
                        </div>
                        <p className="text-sm text-slate-600 mb-5">
                            "<span className="font-bold">{delConfirm.name}</span>" will be permanently deleted. This cannot be undone.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button onClick={() => setDelConfirm(null)} disabled={deleting} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
                            <button onClick={handleDelete} disabled={deleting}
                                className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50">
                                {deleting ? <Spinner size={13} /> : <Trash2 size={13} />} Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
