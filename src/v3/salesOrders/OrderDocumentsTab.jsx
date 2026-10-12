// Sales order → Documents tab. PPM sheets per order line: download the template (filled with the
// order's facts), hold the meeting, upload the signed scan back here (versioned: a new upload of
// the same line makes v2, older versions stay listed). Other order documents the same way.
// Removing hides a document from the order (kept on record, with the reason).
import { useState } from 'react';
import { FileDown, FileSpreadsheet, Upload, ExternalLink, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react';
import Modal from '../../shared/Modal';
import { API_BASE_URL } from '../../utils/api';
import { salesOrdersApi } from '../api/salesOrdersApi';
import { apiError } from '../api/mastersApi';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox } from '../components/ui';

const fmtSize = (b) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

function DocRow({ d, canRemove, onRemove }) {
    return (
        <li className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5 text-sm">
            <a href={`${API_BASE_URL}${d.file_url}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-indigo-700 hover:underline">
                {d.display_name} v{d.version} <ExternalLink size={12} />
            </a>
            <span className="text-xs text-slate-500">{d.uploaded_by_name || '—'} · {new Date(d.created_at).toLocaleString('en-IN')} · {d.file_size ? fmtSize(d.file_size) : ''}</span>
            {d.notes && <span className="basis-full text-xs text-slate-600">{d.notes}</span>}
            {canRemove && <button type="button" className="ml-auto p-1 rounded text-slate-400 hover:text-rose-600" onClick={() => onRemove(d)} aria-label={`Remove ${d.display_name} v${d.version}`}><Trash2 size={14} /></button>}
        </li>
    );
}

export default function OrderDocumentsTab({ order, canUpload, onPpmTemplate, onChanged, askReason }) {
    const [form, setForm] = useState(null);   // { doc_type, line_id, display_name, notes, file }
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const docs = order.documents || [];
    const active = order.lines.filter(l => l.status === 'ACTIVE');
    const open = (patch) => { setError(''); setForm({ doc_type: 'PPM', line_id: '', display_name: 'PPM sheet', notes: '', file: null, ...patch }); };

    const upload = async () => {
        setBusy(true); setError('');
        try {
            onChanged((await salesOrdersApi.uploadDocument(order.id, form)).data);
            setForm(null);
        } catch (err) { setError(apiError(err, 'Upload failed.')); } finally { setBusy(false); }
    };
    const remove = (d) => askReason({
        title: `Remove ${d.display_name} v${d.version}`, label: 'Reason *', hint: 'It is hidden from the order and kept on record. Only the uploader or a factory admin can remove it.',
        confirm: 'Remove', danger: true, run: (r) => salesOrdersApi.removeDocument(order.id, d.id, r),
    });
    const cancelled = order.status === 'CANCELLED';
    const others = docs.filter(d => d.doc_type !== 'PPM' || !d.line_id);

    return (
        <div className="space-y-4">
            <section className="bg-white border border-slate-200 rounded-xl p-4">
                <h2 className="font-black text-slate-800 mb-1">PPM sheets</h2>
                <p className="text-xs text-slate-500 mb-3">Download the template for a line as PDF or Excel (buyer, style, order no., quantity, colours and delivery date are filled in; the Excel boxes can be typed in), hold the pre-production meeting, then upload the signed scan.</p>
                <div className="divide-y divide-slate-100">
                    {active.map(l => {
                        const mine = docs.filter(d => d.doc_type === 'PPM' && d.line_id === String(l.id));
                        return (
                            <div key={l.id} className="py-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-bold text-slate-800">Line {l.line_no} · {l.style_code} <span className="font-normal text-slate-500">{l.total_qty.toLocaleString('en-IN')} pcs</span></p>
                                    {mine.length
                                        ? <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><CheckCircle2 size={13} /> uploaded</span>
                                        : <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700"><AlertTriangle size={13} /> not uploaded yet</span>}
                                    <span className="ml-auto flex gap-2">
                                        <SecondaryButton onClick={() => onPpmTemplate(l, 'pdf')}><FileDown size={14} /> PPM template PDF</SecondaryButton>
                                        <SecondaryButton onClick={() => onPpmTemplate(l, 'xlsx')}><FileSpreadsheet size={14} /> Excel</SecondaryButton>
                                        {canUpload && !cancelled && <SecondaryButton onClick={() => open({ line_id: String(l.id) })}><Upload size={14} /> Upload signed PPM</SecondaryButton>}
                                    </span>
                                </div>
                                {mine.length > 0 && <ul className="mt-1 divide-y divide-slate-50">{mine.map(d => <DocRow key={d.id} d={d} canRemove={canUpload} onRemove={remove} />)}</ul>}
                            </div>
                        );
                    })}
                    {active.length === 0 && <p className="text-sm text-slate-400 py-2">No active lines.</p>}
                </div>
            </section>

            <section className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-center mb-1">
                    <h2 className="font-black text-slate-800">Other documents</h2>
                    {canUpload && !cancelled && <span className="ml-auto"><SecondaryButton onClick={() => open({ doc_type: 'OTHER', display_name: '' })}><Upload size={14} /> Upload document</SecondaryButton></span>}
                </div>
                <p className="text-xs text-slate-500 mb-2">Buyer PO, tech pack, approvals — PDF or photos, up to 15 MB each.</p>
                {others.length ? <ul className="divide-y divide-slate-50">{others.map(d => <DocRow key={d.id} d={d} canRemove={canUpload} onRemove={remove} />)}</ul>
                    : <p className="text-sm text-slate-400">None yet.</p>}
            </section>

            {form && (
                <Modal title={form.doc_type === 'PPM' ? 'Upload signed PPM sheet' : 'Upload document'} onClose={() => setForm(null)}>
                    <div className="space-y-3 w-[min(480px,85vw)]">
                        <Field label="Line">
                            <select className={inputCls} value={form.line_id} onChange={e => setForm({ ...form, line_id: e.target.value })}>
                                {form.doc_type !== 'PPM' && <option value="">Whole order</option>}
                                {active.map(l => <option key={l.id} value={l.id}>Line {l.line_no} · {l.style_code}</option>)}
                            </select>
                        </Field>
                        <Field label={form.doc_type === 'PPM' ? 'Name' : 'Name *'} hint="Uploading again with the same name (and line) makes a new version.">
                            <input className={inputCls} value={form.display_name} maxLength={120} onChange={e => setForm({ ...form, display_name: e.target.value })} placeholder="e.g. Buyer PO" />
                        </Field>
                        <Field label="File *" hint="PDF, JPG, PNG or WEBP, up to 15 MB.">
                            <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="block w-full text-sm" onChange={e => setForm({ ...form, file: e.target.files?.[0] || null })} />
                        </Field>
                        <Field label="Notes"><textarea className={`${inputCls} min-h-[60px]`} maxLength={1000} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
                        <ErrorBox text={error} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setForm(null)}>Cancel</SecondaryButton>
                            <PrimaryButton onClick={upload} busy={busy}
                                disabled={busy || !form.file || (form.doc_type === 'PPM' && !form.line_id) || (form.doc_type !== 'PPM' && !form.display_name.trim())}>Upload</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
