import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    Loader2, Save, AlertTriangle, CheckCircle2, Building2, Receipt, MapPin, Phone,
    Banknote, FileText, Image as ImageIcon, Trash2, Upload, RefreshCw, Scale,
    Tv, GripVertical, Eye, EyeOff, Sparkles, Type,
} from 'lucide-react';
import { adminApi } from '../../api/adminApi';
import { purchaseDeptApi } from '../../api/purchaseDeptApi';
import { IMAGE_BASE_URL } from '../../utils/api';

// ── Field config ─────────────────────────────────────────────────────────────
// Grouped so render stays declarative and easy to extend.

const SECTIONS = [
    {
        key: 'identity',
        title: 'Identity & Statutory',
        icon: Building2,
        fields: [
            { name: 'legal_name',    label: 'Legal Name',    required: true,  placeholder: 'OMEN Apparel Pvt Ltd', maxLength: 200, col: 2 },
            { name: 'trade_name',    label: 'Trade Name',    placeholder: 'OMEN', col: 2 },
            { name: 'gstin',         label: 'GSTIN',         placeholder: '27ABCDE1234F1Z5', maxLength: 15, mono: true },
            { name: 'pan',           label: 'PAN',           placeholder: 'ABCDE1234F', maxLength: 10, mono: true },
            { name: 'cin',           label: 'CIN',           placeholder: 'U18101MH2018PTC123456', maxLength: 21, mono: true },
            { name: 'iec_code',      label: 'IEC Code',      placeholder: 'ABCDE1234F', maxLength: 10, mono: true },
            { name: 'lut_number',    label: 'LUT Number',    placeholder: 'AD2710240012345', mono: true },
            { name: 'udyam_number',  label: 'Udyam Number',  placeholder: 'UDYAM-MH-12-0001234', mono: true },
        ],
    },
    {
        key: 'address',
        title: 'Registered Address',
        icon: MapPin,
        fields: [
            { name: 'address_line1', label: 'Address Line 1', placeholder: 'Plot 42, MIDC Industrial Area', col: 2 },
            { name: 'address_line2', label: 'Address Line 2', placeholder: 'Near Ambika Yog Kutir', col: 2 },
            { name: 'city',          label: 'City',           placeholder: 'Ulhasnagar' },
            { name: 'state',         label: 'State',          placeholder: 'Maharashtra' },
            { name: 'state_code',    label: 'State Code',     placeholder: '27', maxLength: 2, mono: true },
            { name: 'pin_code',      label: 'PIN Code',       placeholder: '421003', maxLength: 6, mono: true },
            { name: 'country',       label: 'Country',        placeholder: 'India' },
        ],
    },
    {
        key: 'contact',
        title: 'Contact',
        icon: Phone,
        fields: [
            { name: 'phone',   label: 'Phone',   placeholder: '+91-22-2541-0000' },
            { name: 'email',   label: 'Email',   placeholder: 'accounts@omen.example', type: 'email' },
            { name: 'website', label: 'Website', placeholder: 'https://omen.example', col: 2 },
        ],
    },
    {
        key: 'bank',
        title: 'Bank',
        icon: Banknote,
        fields: [
            { name: 'bank_name',           label: 'Bank Name',           placeholder: 'HDFC Bank' },
            { name: 'bank_branch',         label: 'Branch',              placeholder: 'Ulhasnagar Branch' },
            { name: 'bank_account_no',     label: 'Account Number',      placeholder: '50200012345678', mono: true },
            { name: 'bank_ifsc',           label: 'IFSC',                placeholder: 'HDFC0000123', maxLength: 11, mono: true },
            { name: 'bank_account_holder', label: 'Account Holder',      placeholder: 'OMEN Apparel Pvt Ltd', col: 2 },
            { name: 'upi_id',              label: 'UPI ID',              placeholder: 'omen@hdfcbank', mono: true, col: 2 },
        ],
    },
    {
        key: 'invoicing',
        title: 'Invoicing Defaults',
        icon: Receipt,
        fields: [
            { name: 'invoice_prefix',              label: 'Invoice Prefix',        placeholder: 'OMEN/24-25/', mono: true },
            { name: 'place_of_supply_state',       label: 'Place of Supply',       placeholder: 'Maharashtra' },
            { name: 'place_of_supply_state_code',  label: 'POS State Code',        placeholder: '27', maxLength: 2, mono: true },
            { name: 'authorized_signatory_name',   label: 'Authorized Signatory',  placeholder: 'Nitin Wadhwa' },
            { name: 'authorized_signatory_designation', label: 'Designation',      placeholder: 'Director' },
        ],
    },
    {
        key: 'terms',
        title: 'Terms & Conditions',
        icon: FileText,
        fields: [
            { name: 'terms_and_conditions', label: 'T&C (printed on invoices)', placeholder: 'Payment due within 30 days. Interest @18% p.a. on delays.', textarea: true, rows: 4, col: 2 },
        ],
    },
];

const IMAGE_FIELDS = [
    { key: 'logo',         urlKey: 'logo_url',         label: 'Primary Logo',     hint: 'Used on invoices and printed docs' },
    { key: 'brand_logo',   urlKey: 'brand_logo_url',   label: 'Brand Logo',       hint: 'Garment label / marketing artwork (optional)' },
    { key: 'signature',    urlKey: 'signature_url',    label: 'Authorized Signature', hint: 'PNG with transparent background recommended' },
    { key: 'seal',         urlKey: 'seal_url',         label: 'Company Seal',     hint: 'Stamp / chop image' },
];

const ALL_TEXT_FIELDS = SECTIONS.flatMap(s => s.fields.map(f => f.name));

const emptyForm = () => ALL_TEXT_FIELDS.reduce((acc, n) => { acc[n] = ''; return acc; }, {});

const resolveAssetUrl = (url) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    // IMAGE_BASE_URL = `${API_BASE_URL}/uploads` — strip the trailing /uploads then re-append the path the server returned.
    const root = IMAGE_BASE_URL.replace(/\/uploads$/, '');
    return `${root}${url}`;
};

// ── Image card ───────────────────────────────────────────────────────────────

function ImageCard({ field, currentUrl, pendingFile, onPick, onClearPending, onDeleteRemote, deleting }) {
    const inputRef = useRef(null);
    const previewUrl = pendingFile
        ? URL.createObjectURL(pendingFile)
        : (currentUrl ? resolveAssetUrl(currentUrl) : null);

    useEffect(() => () => { if (pendingFile && previewUrl) URL.revokeObjectURL(previewUrl); }, [pendingFile, previewUrl]);

    return (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-100">
                <p className="text-xs font-bold text-slate-700">{field.label}</p>
                <p className="text-[10px] text-slate-500">{field.hint}</p>
            </div>
            <div className="flex-1 flex items-center justify-center p-3 bg-slate-50/50 min-h-[140px]">
                {previewUrl ? (
                    <img src={previewUrl} alt={field.label} className="max-h-32 max-w-full object-contain" />
                ) : (
                    <div className="flex flex-col items-center text-slate-300">
                        <ImageIcon size={28} />
                        <span className="text-[10px] mt-1">No image</span>
                    </div>
                )}
            </div>
            <div className="flex items-center gap-2 px-3 py-2 border-t border-slate-100">
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:bg-indigo-50 border border-indigo-200 px-2 py-1 rounded-md transition"
                >
                    <Upload size={11} /> {pendingFile ? 'Change' : currentUrl ? 'Replace' : 'Upload'}
                </button>
                {pendingFile && (
                    <button
                        type="button"
                        onClick={onClearPending}
                        className="text-[11px] font-bold text-slate-500 hover:bg-slate-100 px-2 py-1 rounded-md transition"
                    >
                        Cancel
                    </button>
                )}
                {!pendingFile && currentUrl && (
                    <button
                        type="button"
                        onClick={onDeleteRemote}
                        disabled={deleting}
                        className="flex items-center gap-1 text-[11px] font-bold text-red-600 hover:bg-red-50 border border-red-200 px-2 py-1 rounded-md transition disabled:opacity-40"
                    >
                        {deleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />} Remove
                    </button>
                )}
                {pendingFile && (
                    <span className="text-[10px] text-amber-600 font-bold ml-auto">Unsaved · {pendingFile.name.slice(0, 18)}</span>
                )}
                <input
                    ref={inputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) onPick(f);
                        e.target.value = '';
                    }}
                />
            </div>
        </div>
    );
}

// ── Main page ────────────────────────────────────────────────────────────────

// Self-contained: the tolerance lives in app_settings (three_way_match_tolerance_pct),
// not on the company profile row, so it loads and saves through its own endpoints.
function MatchToleranceCard() {
    const [pct,     setPct]     = useState('');
    const [loaded,  setLoaded]  = useState(false);
    const [saving,  setSaving]  = useState(false);
    const [msg,     setMsg]     = useState(null); // { ok: bool, text }

    useEffect(() => {
        purchaseDeptApi.getMatchTolerance()
            .then(r => { setPct(String(r.data?.tolerance_pct ?? '')); setLoaded(true); })
            .catch(() => setLoaded(true));
    }, []);

    const save = async () => {
        const n = parseFloat(pct);
        if (!Number.isFinite(n) || n < 0 || n > 100) {
            setMsg({ ok: false, text: 'Enter a percentage between 0 and 100.' });
            return;
        }
        setSaving(true); setMsg(null);
        try {
            const res = await purchaseDeptApi.updateMatchTolerance(n);
            setPct(String(res.data?.tolerance_pct ?? n));
            setMsg({ ok: true, text: 'Tolerance updated. Applies to all future match runs.' });
        } catch (e) {
            setMsg({ ok: false, text: e?.response?.data?.error || 'Failed to update tolerance.' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 bg-slate-50 border-b border-slate-100">
                <Scale size={14} className="text-indigo-500" />
                <h2 className="text-sm font-bold text-slate-700">Three-Way Match Tolerance</h2>
            </div>
            <div className="px-5 py-4 space-y-2">
                <p className="text-xs text-slate-500">
                    Maximum allowed variance between PO, GRN, and supplier invoice (quantity, rate, and value)
                    before booking or payment is blocked. Discrepancies beyond this require a documented override.
                </p>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <input
                            type="number" step="any" min="0" max="100"
                            value={pct}
                            onChange={e => setPct(e.target.value)}
                            disabled={!loaded || saving}
                            className="w-28 text-sm border border-slate-200 rounded-lg pl-3 pr-7 py-2 text-right tabular-nums focus:outline-none focus:border-indigo-400 disabled:bg-slate-50"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
                    </div>
                    <button
                        type="button"
                        onClick={save}
                        disabled={!loaded || saving}
                        className="flex items-center gap-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-3 py-2 rounded-lg transition"
                    >
                        {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                        Update
                    </button>
                    {msg && (
                        <span className={`text-xs flex items-center gap-1 ${msg.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                            {msg.ok ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />} {msg.text}
                        </span>
                    )}
                </div>
            </div>
        </section>
    );
}

// Small on/off switch used by the kiosk card's animation options.
function ToggleSwitch({ checked, onChange, label, hint, icon: Icon }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className="flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-slate-50 transition"
        >
            {Icon && <Icon size={16} className={checked ? 'text-indigo-500 shrink-0' : 'text-slate-300 shrink-0'} />}
            <span className="flex-1 min-w-0">
                <span className={`block text-xs font-bold ${checked ? 'text-slate-700' : 'text-slate-400'}`}>{label}</span>
                {hint && <span className="block text-[11px] text-slate-400">{hint}</span>}
            </span>
            <span className={`relative shrink-0 w-9 h-5 rounded-full transition-colors ${checked ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
            </span>
        </button>
    );
}

// Row order for the public/TV workstation scorecard kiosk page
// (/kiosk/workstation-scorecard). Moved here from a per-device localStorage
// setting on the kiosk page itself — a TV has no keyboard/mouse to drag-reorder
// with, and per-device storage on that screen isn't reachable from anywhere
// else to manage. Self-contained like MatchToleranceCard above: loads/saves
// through its own endpoints (app_settings key kiosk_scorecard_row_order),
// not through the company_profile row/form.
function KioskScorecardOrderCard() {
    const [workstations, setWorkstations] = useState([]); // full active-workstation list, for names
    const [order,        setOrder]        = useState([]); // workstation_id[] as strings
    const [hidden,       setHidden]       = useState(() => new Set()); // workstation_ids switched off for the public screen
    const [options,      setOptions]      = useState({ show_logo: true, show_wordmark: true }); // idle-screen animations
    const [loaded,        setLoaded]       = useState(false);
    const [saving,        setSaving]       = useState(false);
    const [dragId,        setDragId]       = useState(null);
    const [msg,           setMsg]          = useState(null); // { ok: bool, text }

    const load = useCallback(() => {
        setLoaded(false);
        adminApi.getKioskScorecardOrder()
            .then(res => {
                const ws = res.data?.workstations ?? [];
                const savedOrder = (res.data?.order ?? []).map(String);
                const currentIds = ws.map(w => String(w.workstation_id));
                // Reconcile: keep the saved relative order for ids still active,
                // append any new workstation at the end — same reconciliation
                // the kiosk page itself used to do client-side.
                const reconciled = savedOrder.filter(id => currentIds.includes(id));
                currentIds.forEach(id => { if (!reconciled.includes(id)) reconciled.push(id); });
                setWorkstations(ws);
                setOrder(reconciled);
                setHidden(new Set((res.data?.hidden ?? []).map(String).filter(id => currentIds.includes(id))));
                setOptions({
                    show_logo:     res.data?.options?.show_logo     !== false,
                    show_wordmark: res.data?.options?.show_wordmark !== false,
                });
            })
            .catch(() => setMsg({ ok: false, text: 'Failed to load workstation order.' }))
            .finally(() => setLoaded(true));
    }, []);

    useEffect(() => { load(); }, [load]);

    const orderedWorkstations = useMemo(() => {
        const byId = new Map(workstations.map(w => [String(w.workstation_id), w]));
        return order.map(id => byId.get(id)).filter(Boolean);
    }, [workstations, order]);

    const handleDragOver = (e, overId) => {
        e.preventDefault();
        if (!dragId || dragId === overId) return;
        setOrder(prev => {
            const next = [...prev];
            const from = next.indexOf(dragId);
            const to = next.indexOf(overId);
            if (from === -1 || to === -1) return prev;
            next.splice(from, 1);
            next.splice(to, 0, dragId);
            return next;
        });
    };

    const toggleHidden = (id) => setHidden(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    const save = async () => {
        setSaving(true); setMsg(null);
        try {
            await adminApi.saveKioskScorecardOrder(order, [...hidden], options);
            setMsg({ ok: true, text: 'Kiosk scorecard saved. The TV screen picks it up within a minute.' });
        } catch (e) {
            setMsg({ ok: false, text: e?.response?.data?.error || 'Failed to save kiosk row order.' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 bg-slate-50 border-b border-slate-100">
                <Tv size={14} className="text-indigo-500" />
                <h2 className="text-sm font-bold text-slate-700">Kiosk Scorecard — Rows, Visibility &amp; Idle Animations</h2>
            </div>
            <div className="px-5 py-4 space-y-3">
                <p className="text-xs text-slate-500">
                    Controls the order workstations appear in on the public TV scorecard
                    (<span className="font-mono">/kiosk/workstation-scorecard</span>) — both the rotating rows
                    and the top ticker follow this same order. Drag to rearrange; use the eye to show or
                    hide a workstation on the public screen.
                    {hidden.size > 0 && <span className="ml-1 font-semibold text-amber-600">{hidden.size} hidden.</span>}
                </p>
                <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Idle screen animations</p>
                    <p className="text-xs text-slate-500">
                        After a minute on the scorecard the TV plays an animation for a few seconds, then returns.
                        With both on they alternate; with both off the scorecard just stays up.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <ToggleSwitch
                            icon={Sparkles}
                            checked={options.show_logo}
                            onChange={v => setOptions(o => ({ ...o, show_logo: v }))}
                            label="Show logo animation"
                            hint="The animated MC monogram"
                        />
                        <ToggleSwitch
                            icon={Type}
                            checked={options.show_wordmark}
                            onChange={v => setOptions(o => ({ ...o, show_wordmark: v }))}
                            label="Show “MATRIX OVERSEAS” animation"
                            hint="The company name set like a logo"
                        />
                    </div>
                </div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 pt-1">Workstation rows</p>
                {!loaded ? (
                    <div className="flex justify-center py-6"><Loader2 className="animate-spin h-5 w-5 text-indigo-500" /></div>
                ) : orderedWorkstations.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-2">No active workstations found.</p>
                ) : (
                    <div className="max-h-80 overflow-y-auto space-y-1 border border-slate-100 rounded-lg p-2">
                        {orderedWorkstations.map(w => {
                            const id = String(w.workstation_id);
                            const isHidden = hidden.has(id);
                            return (
                                <div
                                    key={id}
                                    draggable
                                    onDragStart={() => setDragId(id)}
                                    onDragOver={e => handleDragOver(e, id)}
                                    onDragEnd={() => setDragId(null)}
                                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs cursor-move select-none ${dragId === id ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                                >
                                    <GripVertical size={13} className="text-slate-400 shrink-0" />
                                    <span className={`font-semibold truncate ${isHidden ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{w.workstation_name}</span>
                                    <span className={`truncate ${isHidden ? 'text-slate-300' : 'text-slate-400'}`}>— {w.user_name || 'Unassigned'}</span>
                                    <button
                                        type="button"
                                        onClick={() => toggleHidden(id)}
                                        title={isHidden ? 'Hidden on the public scorecard — click to show' : 'Shown on the public scorecard — click to hide'}
                                        className={`ml-auto shrink-0 p-1 rounded-md transition ${isHidden ? 'text-slate-400 hover:bg-slate-100' : 'text-indigo-600 hover:bg-indigo-50'}`}
                                    >
                                        {isHidden ? <EyeOff size={15} /> : <Eye size={15} />}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={save}
                        disabled={!loaded || saving || orderedWorkstations.length === 0}
                        className="flex items-center gap-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-3 py-2 rounded-lg transition"
                    >
                        {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                        Save Order
                    </button>
                    <button
                        type="button"
                        onClick={load}
                        disabled={!loaded}
                        className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-indigo-600 border border-slate-200 hover:border-indigo-300 px-3 py-2 rounded-lg transition bg-white disabled:opacity-50"
                    >
                        <RefreshCw size={12} className={!loaded ? 'animate-spin' : ''} /> Reload
                    </button>
                    {msg && (
                        <span className={`text-xs flex items-center gap-1 ${msg.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                            {msg.ok ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />} {msg.text}
                        </span>
                    )}
                </div>
            </div>
        </section>
    );
}

export default function CompanyProfilePage() {
    const [form,       setForm]       = useState(emptyForm);
    const [existing,   setExisting]   = useState(null);   // last loaded row (for image URLs + change detection)
    const [files,      setFiles]      = useState({ logo: null, brand_logo: null, signature: null, seal: null });
    const [loading,    setLoading]    = useState(true);
    const [saving,     setSaving]     = useState(false);
    const [deletingKind, setDeletingKind] = useState(null);
    const [err,        setErr]        = useState(null);
    const [success,    setSuccess]    = useState(null);

    const load = useCallback(async () => {
        setLoading(true); setErr(null);
        try {
            const res = await adminApi.getCompanyProfile();
            const row = res.data ?? null;
            setExisting(row);
            if (row) {
                const next = emptyForm();
                ALL_TEXT_FIELDS.forEach(k => { next[k] = row[k] != null ? String(row[k]) : ''; });
                setForm(next);
            } else {
                setForm(emptyForm());
            }
        } catch (e) {
            setErr(e?.response?.data?.error || 'Failed to load company profile');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    // Auto-clear success after a few seconds
    useEffect(() => {
        if (!success) return;
        const t = setTimeout(() => setSuccess(null), 4000);
        return () => clearTimeout(t);
    }, [success]);

    const setField = (name, value) => setForm(prev => ({ ...prev, [name]: value }));

    const handleSave = async (e) => {
        e?.preventDefault?.();
        setErr(null); setSuccess(null);
        if (!form.legal_name?.trim()) {
            setErr('Legal name is required.');
            return;
        }
        setSaving(true);
        try {
            const fd = new FormData();
            ALL_TEXT_FIELDS.forEach(name => {
                const value = form[name] ?? '';
                // Send only fields the user has touched (anything non-undefined in our form).
                // Empty string clears that column to NULL on the server (per spec).
                if (value !== undefined && value !== null) fd.append(name, value);
            });
            IMAGE_FIELDS.forEach(({ key }) => {
                if (files[key]) fd.append(key, files[key]);
            });
            const res = await adminApi.saveCompanyProfile(fd);
            setExisting(res.data ?? null);
            setFiles({ logo: null, brand_logo: null, signature: null, seal: null });
            setSuccess('Company profile saved.');
        } catch (ex) {
            setErr(ex?.response?.data?.error || ex.message || 'Save failed.');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteImage = async (kind) => {
        if (!window.confirm(`Remove ${kind.replace('_', ' ')}? This deletes the file from the server.`)) return;
        setDeletingKind(kind); setErr(null); setSuccess(null);
        try {
            await adminApi.deleteCompanyProfileImage(kind);
            await load();
            setSuccess(`${kind.replace('_', ' ')} removed.`);
        } catch (ex) {
            setErr(ex?.response?.data?.error || `Failed to remove ${kind}.`);
        } finally {
            setDeletingKind(null);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center py-20">
                <Loader2 className="animate-spin h-8 w-8 text-indigo-500" />
            </div>
        );
    }

    return (
        <form onSubmit={handleSave} className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-slate-800">Company Profile</h1>
                    <p className="text-sm text-slate-500 mt-0.5">
                        Identity, statutory codes, and invoicing defaults used across all printed documents.
                        {existing?.updated_at && (
                            <span className="ml-2 text-slate-400">· Last updated {new Date(existing.updated_at).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                        )}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={load}
                        disabled={loading}
                        className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-indigo-600 border border-slate-200 hover:border-indigo-300 px-3 py-1.5 rounded-lg transition bg-white disabled:opacity-50"
                    >
                        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Reload
                    </button>
                    <button
                        type="submit"
                        disabled={saving}
                        className="flex items-center gap-1.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-4 py-2 rounded-lg shadow-sm transition"
                    >
                        {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                        {saving ? 'Saving…' : 'Save Changes'}
                    </button>
                </div>
            </div>

            {/* Alerts */}
            {err && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-700">
                    <AlertTriangle size={15} /> {err}
                </div>
            )}
            {success && (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 text-sm text-emerald-700">
                    <CheckCircle2 size={15} /> {success}
                </div>
            )}

            {/* Field sections */}
            {SECTIONS.map(section => {
                const Icon = section.icon;
                return (
                    <section key={section.key} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                        <div className="flex items-center gap-2 px-5 py-3 bg-slate-50 border-b border-slate-100">
                            <Icon size={14} className="text-indigo-500" />
                            <h2 className="text-sm font-bold text-slate-700">{section.title}</h2>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 px-5 py-4">
                            {section.fields.map(f => (
                                <div key={f.name} className={f.col === 2 ? 'sm:col-span-2' : ''}>
                                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                                        {f.label}{f.required && <span className="text-red-500 ml-0.5">*</span>}
                                    </label>
                                    {f.textarea ? (
                                        <textarea
                                            rows={f.rows || 3}
                                            value={form[f.name]}
                                            onChange={e => setField(f.name, e.target.value)}
                                            placeholder={f.placeholder}
                                            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 resize-y"
                                        />
                                    ) : (
                                        <input
                                            type={f.type || 'text'}
                                            value={form[f.name]}
                                            onChange={e => setField(f.name, e.target.value)}
                                            placeholder={f.placeholder}
                                            maxLength={f.maxLength}
                                            required={f.required}
                                            className={`w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 ${f.mono ? 'font-mono' : ''}`}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>
                );
            })}

            {/* Purchasing controls */}
            <MatchToleranceCard />

            {/* Kiosk / TV display controls */}
            <KioskScorecardOrderCard />

            {/* Images */}
            <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 bg-slate-50 border-b border-slate-100">
                    <ImageIcon size={14} className="text-indigo-500" />
                    <h2 className="text-sm font-bold text-slate-700">Images</h2>
                    <span className="text-[10px] text-slate-400 ml-auto">JPG / PNG / WEBP · ≤5 MB each</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 px-5 py-4">
                    {IMAGE_FIELDS.map(field => (
                        <ImageCard
                            key={field.key}
                            field={field}
                            currentUrl={existing?.[field.urlKey]}
                            pendingFile={files[field.key]}
                            onPick={(f) => setFiles(prev => ({ ...prev, [field.key]: f }))}
                            onClearPending={() => setFiles(prev => ({ ...prev, [field.key]: null }))}
                            onDeleteRemote={() => handleDeleteImage(field.key)}
                            deleting={deletingKind === field.key}
                        />
                    ))}
                </div>
            </section>

            {/* Sticky save footer for long form */}
            <div className="flex items-center justify-end gap-2 sticky bottom-0 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-slate-50/95 backdrop-blur-sm border-t border-slate-200">
                <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center gap-1.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-5 py-2 rounded-lg shadow-sm transition"
                >
                    {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                    {saving ? 'Saving…' : 'Save Changes'}
                </button>
            </div>
        </form>
    );
}
