// Allocate (reserve free stock for an order) or release it back, for one
// order × item. Allocation never moves stock; release needs a reason.
import { useState } from 'react';
import Modal from '../../shared/Modal';
import { planningApi } from '../api/planningApi';
import { apiError } from '../api/mastersApi';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox } from '../components/ui';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });

// target: { mode: 'allocate' | 'release', orderId, orderNo, kind, itemId, label, uom, open, allocated, free }
export default function AllocateModal({ target, onClose, onDone }) {
    const allocating = target.mode === 'allocate';
    const max = allocating ? Math.max(0, Math.min(target.open, target.free)) : target.allocated;
    const [qty, setQty] = useState(max > 0 ? String(max) : '');
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const save = async () => {
        setBusy(true); setError('');
        try {
            const body = { order_id: target.orderId, kind: target.kind, item_id: target.itemId, qty: Number(qty) };
            if (allocating) await planningApi.allocate(body); else await planningApi.release({ ...body, reason });
            onDone();
        } catch (err) {
            setError(apiError(err, 'Failed.'));
            setBusy(false);
        }
    };

    return (
        <Modal title={`${allocating ? 'Allocate' : 'Release'} — ${target.orderNo}`} onClose={onClose}>
            <div className="space-y-3 w-[min(460px,85vw)]">
                <p className="text-sm font-semibold text-slate-800">{target.label}</p>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="bg-slate-50 rounded-lg py-2"><p className="text-slate-500">Still needed</p><p className="font-black text-slate-800">{fmt(target.open)} {target.uom}</p></div>
                    <div className="bg-slate-50 rounded-lg py-2"><p className="text-slate-500">Allocated</p><p className="font-black text-slate-800">{fmt(target.allocated)} {target.uom}</p></div>
                    <div className="bg-slate-50 rounded-lg py-2"><p className="text-slate-500">Free stock</p><p className={`font-black ${target.free < 0 ? 'text-rose-700' : 'text-slate-800'}`}>{fmt(target.free)} {target.uom}</p></div>
                </div>
                {allocating && max <= 0 && <p className="text-sm text-amber-700">{target.open <= 0 ? 'Already fully allocated.' : target.kind === 'FABRIC' ? 'No free fabric: add rolls in Masters → Fabric stock, or release from another order.' : 'No free stock to allocate.'}</p>}
                <Field label={`Quantity (${target.uom}) *`} hint={allocating ? `Up to ${fmt(max)} ${target.uom}. Stock isn't moved; it's reserved for this order.` : `Up to ${fmt(max)} ${target.uom} back to free stock.`}>
                    <input className={inputCls} type="number" min="0" step={target.uom === 'pcs' ? 1 : 'any'} value={qty} onChange={e => setQty(e.target.value)} autoFocus />
                </Field>
                {!allocating && <Field label="Reason *"><input className={inputCls} value={reason} onChange={e => setReason(e.target.value)} /></Field>}
                <ErrorBox text={error} />
                <div className="flex justify-end gap-2">
                    <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
                    <PrimaryButton onClick={save} busy={busy} disabled={busy || !(Number(qty) > 0) || (!allocating && !reason.trim()) || (allocating && max <= 0)}>{allocating ? 'Allocate' : 'Release'}</PrimaryButton>
                </div>
            </div>
        </Modal>
    );
}
