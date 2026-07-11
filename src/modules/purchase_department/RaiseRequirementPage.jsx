import { useState, useEffect } from 'react';
import { CheckCircle2, Loader2, AlertTriangle, Plus, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { purchaseDeptApi } from '../../api/purchaseDeptApi';
import { storeManagerApi } from '../../api/storeManagerApi';
import { trimsApi } from '../../api/trimsApi';
import { sparesApi } from '../../api/sparesApi';
import SearchableSelect from '../../shared/SearchableSelect';

const TYPES = [
    { key: 'fabric', label: 'Fabric',     cls: 'bg-violet-100 text-violet-700 border-violet-200' },
    { key: 'trim',   label: 'Trim',       cls: 'bg-amber-100 text-amber-700 border-amber-200' },
    { key: 'spare',  label: 'Spare Part', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
    { key: 'other',  label: 'Other',      cls: 'bg-slate-100 text-slate-700 border-slate-200' },
];

const URGENCIES = [
    { key: 'LOW',    label: 'Low',    cls: 'bg-slate-100 text-slate-600 border-slate-200' },
    { key: 'NORMAL', label: 'Normal', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
    { key: 'HIGH',   label: 'High',   cls: 'bg-orange-100 text-orange-700 border-orange-200' },
    { key: 'URGENT', label: 'Urgent', cls: 'bg-red-100 text-red-700 border-red-200' },
];

const RaiseRequirementPage = () => {
    const navigate = useNavigate();

    const [fabricTypes,   setFabricTypes]   = useState([]);
    const [fabricColors,  setFabricColors]  = useState([]);
    const [trimItems,     setTrimItems]     = useState([]);
    const [trimVariants,  setTrimVariants]  = useState([]);
    const [spareParts,    setSpareParts]    = useState([]);
    const [loadingVars,   setLoadingVars]   = useState(false);

    const [type,          setType]          = useState('fabric');
    const [fabricTypeId,  setFabricTypeId]  = useState('');
    const [fabricColorId, setFabricColorId] = useState('');
    const [metersRequired, setMeters]       = useState('');
    const [trimItemId,    setTrimItemId]    = useState('');
    const [trimVariantId, setTrimVariantId] = useState('');
    const [spareId,       setSpareId]       = useState('');
    const [quantity,      setQuantity]      = useState('');
    const [uom,           setUom]           = useState('');
    const [description,   setDescription]   = useState('');
    const [urgency,       setUrgency]       = useState('NORMAL');
    const [notes,         setNotes]         = useState('');
    const [unitPrice,     setUnitPrice]     = useState('');

    const [busy,    setBusy]    = useState(false);
    const [err,     setErr]     = useState(null);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        storeManagerApi.getFabricTypes()
            .then(r => setFabricTypes(r.data?.data ?? r.data ?? []))
            .catch(() => {});
        storeManagerApi.getFabricColors()
            .then(r => setFabricColors(r.data?.data ?? r.data ?? []))
            .catch(() => {});
        trimsApi.getItems()
            .then(r => setTrimItems(r.data?.data ?? r.data ?? []))
            .catch(() => {});
        sparesApi.getAllSpares()
            .then(data => setSpareParts(Array.isArray(data) ? data : (data?.data || [])))
            .catch(() => {});
    }, []);

    useEffect(() => {
        setTrimVariantId('');
        setTrimVariants([]);
        if (!trimItemId) return;
        setLoadingVars(true);
        storeManagerApi.getVariantsByTrimItem(trimItemId)
            .then(r => setTrimVariants(r.data?.data ?? r.data ?? []))
            .catch(() => {})
            .finally(() => setLoadingVars(false));
    }, [trimItemId]);

    const resetForm = () => {
        setFabricTypeId(''); setFabricColorId(''); setMeters('');
        setTrimItemId(''); setTrimVariantId(''); setTrimVariants([]);
        setSpareId(''); setQuantity(''); setUom(''); setDescription('');
        setNotes(''); setUnitPrice(''); setErr(null); setSuccess(false);
    };

    const handleTypeChange = (t) => { setType(t); setErr(null); };

    const handleSubmit = async () => {
        setErr(null);
        const body = { type, urgency };
        if (notes.trim())      body.notes      = notes.trim();
        if (unitPrice !== '')  body.unit_price  = parseFloat(unitPrice) || 0;

        if (type === 'fabric') {
            if (!fabricTypeId) { setErr('Please select a fabric type.'); return; }
            if (!metersRequired || parseFloat(metersRequired) <= 0) { setErr('Enter meters required.'); return; }
            body.fabric_type_id  = parseInt(fabricTypeId);
            body.meters_required = parseFloat(metersRequired);
            if (fabricColorId) body.fabric_color_id = parseInt(fabricColorId);
        } else if (type === 'trim') {
            if (!trimVariantId) { setErr('Please select a trim variant.'); return; }
            if (!quantity || parseFloat(quantity) <= 0) { setErr('Enter quantity required.'); return; }
            body.trim_item_variant_id = parseInt(trimVariantId);
            body.quantity_required    = parseFloat(quantity);
            if (uom.trim()) body.unit_of_measure = uom.trim();
        } else if (type === 'spare') {
            if (!spareId) { setErr('Please select a spare part.'); return; }
            if (!quantity || parseFloat(quantity) <= 0) { setErr('Enter quantity required.'); return; }
            body.spare_part_id     = parseInt(spareId);
            body.quantity_required = parseFloat(quantity);
        } else {
            if (!description.trim()) { setErr('Please enter a description.'); return; }
            if (!quantity || parseFloat(quantity) <= 0) { setErr('Enter quantity required.'); return; }
            body.description       = description.trim();
            body.quantity_required = parseFloat(quantity);
            if (uom.trim()) body.unit_of_measure = uom.trim();
        }

        setBusy(true);
        try {
            await purchaseDeptApi.raiseStandaloneRequirement(body);
            setSuccess(true);
        } catch (e) {
            setErr(e?.response?.data?.error || 'Failed to raise requirement.');
        } finally {
            setBusy(false);
        }
    };

    if (success) {
        return (
            <div className="flex items-center justify-center min-h-[60vh] p-6">
                <div className="max-w-sm w-full text-center bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
                    <CheckCircle2 size={44} className="mx-auto text-emerald-500 mb-4" />
                    <h2 className="text-lg font-bold text-slate-800 mb-1">Request Submitted</h2>
                    <p className="text-sm text-slate-500 mb-6">
                        The purchase team will review and raise a PO.
                    </p>
                    <div className="flex justify-center gap-3">
                        <button
                            onClick={() => { resetForm(); }}
                            className="text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 px-4 py-2 rounded-xl transition-colors"
                        >
                            Raise Another
                        </button>
                        <button
                            onClick={() => navigate(-1)}
                            className="text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 px-5 py-2 rounded-xl transition-colors"
                        >
                            Done
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-5">
            <div className="flex items-center gap-3">
                <button
                    onClick={() => navigate(-1)}
                    className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors"
                >
                    <ArrowLeft size={18} />
                </button>
                <div>
                    <h1 className="text-xl font-bold text-slate-800">Raise Purchase Request</h1>
                    <p className="text-sm text-slate-500">Request material or items from the purchase team</p>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-5">

                {/* Type selector */}
                <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Request Type *</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {TYPES.map(t => (
                            <button
                                key={t.key}
                                onClick={() => handleTypeChange(t.key)}
                                className={`px-3 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                                    type === t.key
                                        ? `${t.cls} ring-2 ring-offset-1 ring-current shadow-sm`
                                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                                }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── FABRIC ── */}
                {type === 'fabric' && (
                    <>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Fabric Type *</label>
                            <SearchableSelect
                                value={fabricTypeId}
                                onChange={setFabricTypeId}
                                options={fabricTypes.map(f => ({ value: f.id, label: f.name || f.type_name || `Type #${f.id}` }))}
                                placeholder="— Select fabric type —"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                                Color <span className="text-slate-300 normal-case font-normal">(optional)</span>
                            </label>
                            <SearchableSelect
                                value={fabricColorId}
                                onChange={setFabricColorId}
                                options={fabricColors.map(c => ({
                                    value: c.id,
                                    label: `${c.name}${c.color_number ? ` · ${c.color_number}` : ''}`,
                                }))}
                                placeholder="— No specific color —"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Meters Required *</label>
                            <input
                                type="number" min="0" step="any"
                                value={metersRequired} onChange={e => setMeters(e.target.value)}
                                placeholder="0.00"
                                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-orange-400"
                            />
                        </div>
                    </>
                )}

                {/* ── TRIM ── */}
                {type === 'trim' && (
                    <>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Trim Item *</label>
                            <SearchableSelect
                                value={trimItemId}
                                onChange={v => { setTrimItemId(v); setTrimVariantId(''); }}
                                options={trimItems.map(t => ({
                                    value: t.id,
                                    label: `${t.name}${t.code ? ` (${t.code})` : ''}`,
                                }))}
                                placeholder="— Select trim item —"
                            />
                        </div>
                        {trimItemId && (
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Variant *</label>
                                <SearchableSelect
                                    value={trimVariantId}
                                    onChange={setTrimVariantId}
                                    options={trimVariants.map(v => ({
                                        value: v.id,
                                        label: [
                                            v.color_name,
                                            v.color_number,
                                            v.size ? `Sz ${v.size}` : null,
                                        ].filter(Boolean).join(' · ') || `Variant #${v.id}`,
                                    }))}
                                    placeholder={loadingVars ? 'Loading variants…' : (trimVariants.length ? '— Select variant —' : 'No variants found')}
                                />
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Quantity *</label>
                                <input
                                    type="number" min="0" step="any"
                                    value={quantity} onChange={e => setQuantity(e.target.value)}
                                    placeholder="0"
                                    className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-orange-400"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Unit</label>
                                <input
                                    type="text" value={uom} onChange={e => setUom(e.target.value)}
                                    placeholder="pcs"
                                    className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-orange-400"
                                />
                            </div>
                        </div>
                    </>
                )}

                {/* ── SPARE ── */}
                {type === 'spare' && (
                    <>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Spare Part *</label>
                            <SearchableSelect
                                value={spareId}
                                onChange={setSpareId}
                                options={spareParts.map(s => ({
                                    value: s.id,
                                    label: `${s.name}${s.part_number ? ` (${s.part_number})` : ''}`,
                                }))}
                                placeholder="— Select spare part —"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Quantity *</label>
                            <input
                                type="number" min="0" step="any"
                                value={quantity} onChange={e => setQuantity(e.target.value)}
                                placeholder="0"
                                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-orange-400"
                            />
                        </div>
                    </>
                )}

                {/* ── OTHER ── */}
                {type === 'other' && (
                    <>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Description *</label>
                            <input
                                type="text" value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder="e.g. Needle #14 × 5 boxes, packaging tape, etc."
                                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-orange-400"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Quantity *</label>
                                <input
                                    type="number" min="0" step="any"
                                    value={quantity} onChange={e => setQuantity(e.target.value)}
                                    placeholder="0"
                                    className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-orange-400"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Unit</label>
                                <input
                                    type="text" value={uom} onChange={e => setUom(e.target.value)}
                                    placeholder="pcs / boxes / kg"
                                    className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-orange-400"
                                />
                            </div>
                        </div>
                    </>
                )}

                {/* ── SHARED: Urgency ── */}
                <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Urgency</p>
                    <div className="flex gap-2 flex-wrap">
                        {URGENCIES.map(u => (
                            <button
                                key={u.key}
                                onClick={() => setUrgency(u.key)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                                    urgency === u.key
                                        ? `${u.cls} ring-1 ring-current`
                                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                                }`}
                            >
                                {u.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── SHARED: Estimated Unit Price ── */}
                <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                        Estimated Unit Price <span className="text-slate-300 normal-case font-normal">(optional)</span>
                    </label>
                    <input
                        type="number" min="0" step="any"
                        value={unitPrice} onChange={e => setUnitPrice(e.target.value)}
                        placeholder="0.00"
                        className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-orange-400"
                    />
                </div>

                {/* ── SHARED: Notes ── */}
                <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                        Notes <span className="text-slate-300 normal-case font-normal">(optional)</span>
                    </label>
                    <textarea
                        rows={3}
                        value={notes} onChange={e => setNotes(e.target.value)}
                        placeholder="Reason for this request, special requirements, which machine it's for, etc."
                        className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-orange-400 resize-none"
                    />
                </div>

                {err && (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600">
                        <AlertTriangle size={15} className="shrink-0" /> {err}
                    </div>
                )}

                <div className="flex justify-end pt-1">
                    <button
                        onClick={handleSubmit}
                        disabled={busy}
                        className="flex items-center gap-2 text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-40 px-6 py-2.5 rounded-xl transition-colors"
                    >
                        {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                        Submit Request
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RaiseRequirementPage;
