// Raise on a requisition from the Order BOM (25 Oct 2026, owner: "on clicking raise it takes me to buy list why not
// add to request list modal" → "build raise dialog but also make requisition list dropdown to select list by default
// if any requisition list else select new requisition list"). One item (a row's Raise) or several ("Raise all short"),
// this order's need only (order_id per item, as the buy list's "this order"). The requisition: a draft (or one sent
// back) the user may add to — by default the one already holding this order, else the latest — or a new one.
// The server applies the same rules as the buy list (each store raises only its own kind).
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from '../../shared/Modal';
import { planningApi } from '../api/planningApi';
import { apiError } from '../api/mastersApi';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';

const fmt = (n, uom) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: uom === 'pcs' ? 0 : 2 });
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// "≈ 5 × 50 m" when the item is bought in packs / rolls (purchasing rounds up to whole ones).
const packs = (it) => {
    const per = Number(it.usage_per_purchase_uom);
    if (!it.purchase_uom || !per || per === 1 || !(it.to_raise > 0)) return '';
    return `≈ ${Math.ceil(it.to_raise / per - 1e-9)} × ${fmt(per, it.uom)} ${it.uom}`;
};
const onPr = (it) => (it.pr_pending || 0) + (it.pr_approved || 0);

export default function RaiseDialog({ order, items, onClose, onRaised }) {
    const [drafts, setDrafts] = useState(null);
    const [target, setTarget] = useState('new');
    const [notes, setNotes] = useState('');
    const [picked, setPicked] = useState(() => new Set(items.map(i => i.key)));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        Promise.all([planningApi.prs({ status: 'DRAFT' }), planningApi.prs({ status: 'REJECTED' })])
            .then(([d, r]) => {
                // Requisitions this user can add to: production ones still open for edit; the one already holding this
                // order first, then the latest. Default: the first of them, else a new requisition.
                const list = [...new Map([...d.data, ...r.data].map(p => [String(p.id), p])).values()].filter(p => p.purpose !== 'STORE')
                    .sort((a, b) => (String(b.order_nos || '').includes(order.order_no) - String(a.order_nos || '').includes(order.order_no)) || Number(b.id) - Number(a.id));
                setDrafts(list);
                setTarget(list.length ? String(list[0].id) : 'new');
            })
            .catch(() => { setDrafts([]); setTarget('new'); });
    }, [order.order_no]);

    const chosen = useMemo(() => items.filter(i => picked.has(i.key)), [items, picked]);
    const single = items.length === 1;
    const toggle = (k) => setPicked(p => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });
    const draftLabel = (p) => `${p.pr_no}${p.status === 'REJECTED' ? ' (sent back)' : ' (draft)'} · ${p.line_count} line${p.line_count === 1 ? '' : 's'}${p.order_nos ? ` · ${p.order_nos}` : ''}`;

    const raise = async () => {
        setBusy(true); setError('');
        const payload = chosen.map(it => ({ kind: it.kind, item_id: it.item_id, order_id: order.id }));
        try {
            const res = target === 'new'
                ? await planningApi.createPr({ items: payload, notes: notes.trim() || undefined })
                : await planningApi.addPrLines(target, payload, order.id);
            onRaised({ id: res.data.id, pr_no: res.data.pr_no, count: payload.length, added: target !== 'new' });
        } catch (err) { setError(apiError(err, 'Failed to raise.')); setBusy(false); }
    };

    const it0 = items[0];
    return (
        <Modal title={single ? `Raise on a requisition — ${it0.label}` : `Raise ${items.length} short item${items.length === 1 ? '' : 's'} on a requisition`} onClose={onClose}>
            <div className="space-y-3 w-[min(640px,90vw)]">
                {single ? (
                    <table className="w-full text-sm">
                        <tbody>
                            <tr><td className="py-1 text-slate-500">This order needs</td><td className="py-1 text-right tabular-nums font-bold">{fmt(it0.required_display, it0.uom)} {it0.uom}</td>
                                <td className="py-1 pl-3 text-xs text-slate-500">{it0.needed_by ? <>needed by {fmtDate(it0.needed_by)}{it0.needed_by < today() && <b className="text-rose-700"> — passed</b>}</> : ''}</td></tr>
                            {(it0.allocated || 0) + (it0.issued || 0) > 0 && <tr><td className="py-1 text-slate-500">Allocated / issued</td><td className="py-1 text-right tabular-nums">{fmt((it0.allocated || 0) + (it0.issued || 0), it0.uom)} {it0.uom}</td><td /></tr>}
                            {onPr(it0) > 0 && <tr><td className="py-1 text-slate-500">Already on requisitions</td><td className="py-1 text-right tabular-nums">{fmt(onPr(it0), it0.uom)} {it0.uom}</td>
                                <td className="py-1 pl-3 text-xs text-slate-500">{(it0.incoming_pos || []).map(p => p.po_no).join(', ')}</td></tr>}
                            <tr className="border-t border-slate-200"><td className="py-1.5 font-bold text-slate-800">To raise</td><td className="py-1.5 text-right tabular-nums font-black text-rose-700">{fmt(it0.to_raise, it0.uom)} {it0.uom}</td>
                                <td className="py-1.5 pl-3 text-xs text-slate-500">{packs(it0) && `${packs(it0)} (purchasing rounds up)`}</td></tr>
                        </tbody>
                    </table>
                ) : (
                    <div className="max-h-[40vh] overflow-y-auto border border-slate-200 rounded-lg">
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider text-left">
                                <tr><th className="px-2 py-1.5 w-8"><input type="checkbox" checked={picked.size === items.length} onChange={e => setPicked(e.target.checked ? new Set(items.map(i => i.key)) : new Set())} aria-label="Tick all" /></th>
                                    <th className="px-2 py-1.5">Item</th><th className="px-2 py-1.5 text-right">To raise</th><th className="px-2 py-1.5">Needed by</th></tr>
                            </thead>
                            <tbody>{items.map(it => (
                                <tr key={it.key} className="border-t border-slate-100">
                                    <td className="px-2 py-1"><input type="checkbox" checked={picked.has(it.key)} onChange={() => toggle(it.key)} aria-label={`Raise ${it.label}`} /></td>
                                    <td className="px-2 py-1">{it.label}</td>
                                    <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap">{fmt(it.to_raise, it.uom)} {it.uom}{packs(it) && <span className="block text-[11px] text-slate-500">{packs(it)}</span>}</td>
                                    <td className={`px-2 py-1 whitespace-nowrap ${it.needed_by && it.needed_by < today() ? 'text-rose-700 font-bold' : 'text-slate-600'}`}>{it.needed_by ? fmtDate(it.needed_by) : '—'}</td>
                                </tr>
                            ))}</tbody>
                            <tfoot className="sticky bottom-0 bg-slate-50 border-t-2 border-slate-200 font-bold text-xs">
                                <tr><td className="px-2 py-1.5" colSpan={4}>{chosen.length} of {items.length} item{items.length === 1 ? '' : 's'} ticked</td></tr>
                            </tfoot>
                        </table>
                    </div>
                )}

                {drafts === null ? <Loading /> : (
                    <Field label="Put it on">
                        <select className={inputCls} value={target} onChange={e => setTarget(e.target.value)}>
                            {drafts.map(p => <option key={p.id} value={String(p.id)}>{draftLabel(p)}</option>)}
                            <option value="new">New requisition</option>
                        </select>
                    </Field>
                )}
                {target === 'new' && <Field label="Notes"><input className={inputCls} value={notes} onChange={e => setNotes(e.target.value)} placeholder="optional" /></Field>}
                {chosen.some(it => it.needed_by && it.needed_by < today()) && (
                    <p className="text-xs text-rose-700 flex items-center gap-1"><AlertTriangle size={12} /> Needed-by date already passed — submit the requisition and tell purchasing.</p>
                )}
                <p className="text-xs text-slate-500">Only this order's need ({order.order_no}) is raised. The requisition stays a draft until it is submitted to purchasing.</p>
                <ErrorBox text={error} />
                <div className="flex justify-end gap-2">
                    <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
                    <PrimaryButton onClick={raise} busy={busy} disabled={busy || drafts === null || chosen.length === 0}>
                        {single ? `Raise ${fmt(it0.to_raise, it0.uom)} ${it0.uom}` : `Raise ${chosen.length} item${chosen.length === 1 ? '' : 's'}`}
                    </PrimaryButton>
                </div>
            </div>
        </Modal>
    );
}
