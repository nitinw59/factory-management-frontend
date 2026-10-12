// Trim card preview: the merchandiser ticks what the card shows (header, colours, rows and how
// each prints, bottom construction boxes, sign-off), sees it at once, saves the choices for this
// BOM and downloads the PDF exactly as previewed. Others can preview and print with the saved
// choices (their own ticks are for that print only).
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowUp, ArrowDown, FileDown, FileSpreadsheet, Save, RotateCcw, Plus, Trash2 } from 'lucide-react';
import { stylesApi } from '../api/stylesApi';
import { apiError } from '../api/mastersApi';
import { adminApi } from '../../api/adminApi';
import { inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import BomStatusBadge from './BomStatusBadge';
import { SHOW_AS, SIZES_AS, BOTTOM_BOXES, lineKeys, variesBySize, defaultSettings, normalizeSettings, buildCard } from './trimCardLayout';
import { exportTrimCardFactoryPdf } from './trimCardPdf';
import { exportTrimCardXlsx } from './trimCardXlsx';

const Section = ({ title, children, aside }) => (
    <section className="border-b border-slate-200 pb-3">
        <div className="flex items-center justify-between mb-2">
            <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-500">{title}</h3>
            {aside}
        </div>
        <div className="space-y-1.5">{children}</div>
    </section>
);
const Tick = ({ checked, onChange, children }) => (
    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
        <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={!!checked} onChange={e => onChange(e.target.checked)} />
        <span className="min-w-0">{children}</span>
    </label>
);

// The card as it prints: black ruled grid on white.
function CardPreview({ m }) {
    const td = 'border border-black px-1.5 py-1 align-top text-[12px] leading-snug';
    return (
        <div className="bg-white text-black shadow-md mx-auto p-5 min-w-[760px] max-w-[1120px]" style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>
            <div className="flex items-start justify-between gap-4 mb-2">
                <p className="text-xl font-bold">{m.title}</p>
                {m.company && (
                    <div className="text-center flex-1">
                        <p className="text-lg font-bold">{m.company.name}</p>
                        {m.company.sub && <p className="text-xs">{m.company.sub}</p>}
                    </div>
                )}
                <div className="w-24" />
            </div>
            {m.header.length > 0 && (
                <table className="w-full border-collapse mb-2">
                    <tbody>
                        {Array.from({ length: Math.ceil(m.header.length / 3) }, (_, k) => m.header.slice(k * 3, k * 3 + 3)).map((row, i) => (
                            <tr key={i}>
                                {row.map(([label, value]) => [<td key={`l${label}`} className={`${td} font-bold w-[9%]`}>{label}</td>, <td key={`v${label}`} className={`${td} w-[24%]`}>{value || ' '}</td>])}
                                {Array.from({ length: 3 - row.length }, (_, k) => [<td key={`a${k}`} className={td} />, <td key={`b${k}`} className={td} />])}
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            <table className="w-full border-collapse table-fixed">
                <colgroup><col style={{ width: '18%' }} />{m.colours.map(c => <col key={c.id} />)}</colgroup>
                <thead>
                    <tr>
                        <th className={`${td} text-left`}>Colour</th>
                        {m.colours.map(c => <th key={c.id} className={`${td} text-center`}>{c.name}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {m.grid.map((r, i) => (
                        <tr key={i} style={r.swatch ? { height: 84 } : undefined}>
                            <td className={`${td} font-bold`}>{r.label}{r.sub && <span className="block font-normal text-[11px]">{r.sub}</span>}</td>
                            {r.cells.map((lines, k) => (
                                <td key={k} className={`${td} ${r.bold ? 'font-bold' : ''}`}>
                                    {lines.map((t, j) => <span key={j} className={`block ${t.startsWith('! ') ? 'text-rose-700' : ''}`}>{t}</span>)}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
            {m.strips.length > 0 && (
                <table className="w-full border-collapse table-fixed mt-2">
                    <colgroup><col style={{ width: '18%' }} /><col /></colgroup>
                    <tbody>
                        {m.strips.map((s, i) => (
                            <tr key={i}><td className={`${td} font-bold`}>{s.label}</td><td className={td}>{s.lines.map((t, j) => <span key={j} className="block">{t}</span>)}</td></tr>
                        ))}
                    </tbody>
                </table>
            )}
            {m.bottom.length > 0 && Array.from({ length: Math.ceil(m.bottom.length / 7) }, (_, k) => m.bottom.slice(k * 7, k * 7 + 7)).map((part, i) => (
                <table key={i} className="w-full border-collapse table-fixed mt-2">
                    <thead><tr>{part.map(b => <th key={b.label} className={`${td} text-center text-[11px]`}>{b.label}</th>)}</tr></thead>
                    <tbody><tr style={{ height: 76 }}>{part.map(b => <td key={b.label} className={`${td} whitespace-pre-line`}>{b.text}</td>)}</tr></tbody>
                </table>
            ))}
            {m.footer && (
                <div className="grid grid-cols-3 gap-4 mt-10 text-sm font-bold">
                    <p>Prepared by: ______________</p><p>Checked by: ______________</p><p>Approved by: ______________</p>
                </div>
            )}
        </div>
    );
}

export default function TrimCardDesignerPage() {
    const { id } = useParams();
    const [params] = useSearchParams();
    const fromOrder = params.get('order');   // opened from a sales order line: that order is picked
    const [card, setCard] = useState(null);
    const [meta, setMeta] = useState(null);         // { orders, updated_at, updated_by_name }
    const [saved, setSaved] = useState(null);       // normalized saved settings (for "unsaved changes")
    const [s, setS] = useState(null);
    const [canSave, setCanSave] = useState(false);
    const [company, setCompany] = useState(null);
    const [orderId, setOrderId] = useState('');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        Promise.all([stylesApi.trimCard(id), stylesApi.cardSettings(id)])
            .then(([c, cs]) => {
                const st = normalizeSettings(c.data, cs.data.settings);
                setCard(c.data); setMeta(cs.data); setS(st); setSaved(st);
                if (fromOrder && cs.data.orders.some(o => o.id === fromOrder)) setOrderId(fromOrder);
                else if (cs.data.orders.length === 1) setOrderId(cs.data.orders[0].id);
            })
            .catch(err => setError(apiError(err, 'Failed to load the trim card.')));
        stylesApi.permissions().then(res => setCanSave(!!res.data.bomEdit)).catch(() => {});
        adminApi.getCompanyProfile().then(res => setCompany(res.data)).catch(() => {});
    }, [id, fromOrder]);

    const lines = useMemo(() => (card ? new Map([...lineKeys(card.fabric), ...lineKeys(card.trims)]) : new Map()), [card]);
    const order = meta?.orders.find(o => o.id === orderId) || null;
    const model = useMemo(() => (card && s ? buildCard(card, s, { order, company }) : null), [card, s, order, company]);
    const dirty = s && saved && JSON.stringify(s) !== JSON.stringify(saved);

    if (!card || !s) return error ? <ErrorBox text={error} /> : <Loading />;

    const set = (patch) => { setNotice(''); setS(prev => ({ ...prev, ...patch })); };
    const setRow = (k, patch) => set({ rows: s.rows.map((r, i) => (i === k ? { ...r, ...patch } : r)) });
    const moveRow = (k, d) => { const rows = [...s.rows]; const j = k + d; if (j < 0 || j >= rows.length) return; [rows[k], rows[j]] = [rows[j], rows[k]]; set({ rows }); };
    const setBox = (k, patch) => set({ bottom: s.bottom.map((b, i) => (i === k ? { ...b, ...patch } : b)) });
    const fabricKeys = lineKeys(card.fabric);

    const changeHeaderFabric = (key) => {
        // The old header fabric becomes an ordinary row again; the new one leaves the rows.
        const rows = s.rows.filter(r => r.key !== key);
        if (s.header_fabric_key && !rows.some(r => r.key === s.header_fabric_key)) rows.unshift({ key: s.header_fabric_key, show: true, as: 'SHADE' });
        set({ header_fabric_key: key, rows });
    };

    const save = async () => {
        setBusy(true); setError('');
        try {
            const res = await stylesApi.saveCardSettings(id, s);
            setSaved(s); setMeta(prev => ({ ...prev, updated_at: res.data.updated_at, updated_by_name: res.data.updated_by_name }));
            setNotice('Saved. Everyone printing this BOM\'s trim card gets these choices.');
        } catch (err) { setError(apiError(err, 'Failed to save.')); } finally { setBusy(false); }
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
                <Link to={fromOrder ? `/v3/sales-orders/${fromOrder}` : `/v3/boms/${id}`} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600" aria-label={fromOrder ? 'Back to the sales order' : 'Back to the BOM'}><ArrowLeft size={18} /></Link>
                <div className="min-w-0">
                    <h1 className="text-xl font-black text-slate-800">Trim card — {card.bom.style_code} · v{card.bom.version_no}</h1>
                    <p className="text-xs text-slate-500 flex items-center gap-2">
                        <BomStatusBadge status={card.bom.status} />
                        {meta.updated_at ? `Choices saved ${new Date(meta.updated_at).toLocaleString('en-IN')}${meta.updated_by_name ? ` by ${meta.updated_by_name}` : ''}` : 'Default choices (not saved yet)'}
                        {dirty && <b className="text-amber-700">· unsaved changes</b>}
                    </p>
                </div>
                <div className="ml-auto flex flex-wrap gap-2">
                    <SecondaryButton onClick={() => set(defaultSettings(card))}><RotateCcw size={14} /> Defaults</SecondaryButton>
                    {canSave && <SecondaryButton onClick={save} disabled={busy || !dirty}><Save size={14} /> Save choices</SecondaryButton>}
                    <SecondaryButton onClick={() => exportTrimCardXlsx(model).catch(err => setError(err.message || 'Failed to make the Excel file.'))} disabled={!model.colours.length}><FileSpreadsheet size={14} /> Excel</SecondaryButton>
                    <PrimaryButton onClick={() => exportTrimCardFactoryPdf(model)} disabled={!model.colours.length}><FileDown size={15} /> Download PDF</PrimaryButton>
                </div>
            </div>
            <ErrorBox text={error} />
            {notice && <p className="text-sm font-semibold text-emerald-700">{notice}</p>}
            {!card.ready && <p className="text-sm font-semibold text-rose-700">{card.problems.length} unresolved item(s) on this BOM — printed in red with "!".</p>}
            {!canSave && <p className="text-xs text-slate-500">Your ticks change this print only; the merchandiser saves the card's choices.</p>}

            <div className="flex flex-col lg:flex-row gap-4 items-start">
                <aside className="w-full lg:w-[340px] shrink-0 bg-white border border-slate-200 rounded-xl p-3 space-y-3 lg:max-h-[calc(100vh-160px)] lg:overflow-y-auto">
                    <Section title="Card">
                        <input id="card-title" className={inputCls} value={s.title} maxLength={40} onChange={e => set({ title: e.target.value })} aria-label="Card title" />
                    </Section>

                    <Section title="Header">
                        <Tick checked={s.header.company} onChange={v => set({ header: { ...s.header, company: v } })}>Company name</Tick>
                        <Tick checked={s.header.buyer} onChange={v => set({ header: { ...s.header, buyer: v } })}>Buyer</Tick>
                        <Tick checked={s.header.style} onChange={v => set({ header: { ...s.header, style: v } })}>Style</Tick>
                        <Tick checked={s.header.so} onChange={v => set({ header: { ...s.header, so: v } })}>S.O. no.</Tick>
                        <Tick checked={s.header.date} onChange={v => set({ header: { ...s.header, date: v } })}>Date</Tick>
                        <Tick checked={s.header.sizes} onChange={v => set({ header: { ...s.header, sizes: v } })}>Sizes</Tick>
                        <select id="card-order" className={`${inputCls} mt-1`} value={orderId} onChange={e => setOrderId(e.target.value)} aria-label="Sales order for this print">
                            <option value="">No sales order (style only)</option>
                            {meta.orders.map(o => <option key={o.id} value={o.id}>{o.order_no}{o.buyer_po_no ? ` · PO ${o.buyer_po_no}` : ''} — {o.customer_name}</option>)}
                        </select>
                        <p className="text-[11px] text-slate-400">The order fills the S.O. no. and buyer. It's picked per print, not saved.</p>
                    </Section>

                    <Section title="Colours">
                        {card.colours.map(c => (
                            <Tick key={c.id} checked={!s.hidden_colours.includes(c.id)}
                                onChange={v => set({ hidden_colours: v ? s.hidden_colours.filter(x => x !== c.id) : [...s.hidden_colours, c.id] })}>
                                {c.name}{c.tone_name && <span className="text-slate-400"> · {c.tone_name}</span>}
                            </Tick>
                        ))}
                    </Section>

                    <Section title="Fabric header">
                        <Tick checked={s.fabric_header} onChange={v => set({ fabric_header: v })}>Fab. Q. No. and Shade rows</Tick>
                        {s.fabric_header && fabricKeys.length > 1 && (
                            <select id="card-head-fabric" className={inputCls} value={s.header_fabric_key || ''} onChange={e => changeHeaderFabric(e.target.value)} aria-label="Fabric for the header rows">
                                {fabricKeys.map(([k, l]) => <option key={k} value={k}>{l.title}</option>)}
                            </select>
                        )}
                        <Tick checked={s.swatch_row} onChange={v => set({ swatch_row: v })}>Blank swatch row (to staple fabric)</Tick>
                        <Tick checked={s.consumption} onChange={v => set({ consumption: v })}>Consumption & wastage under each row name</Tick>
                    </Section>

                    <Section title="Grid rows">
                        {s.rows.map((r, k) => {
                            const l = lines.get(r.key);
                            if (!l) return null;
                            const opts = [...SHOW_AS[l.kind], ...(variesBySize(l) ? [SIZES_AS] : [])];
                            return (
                                <div key={r.key} className={`rounded-lg border px-2 py-1.5 ${r.show ? 'border-slate-200' : 'border-dashed border-slate-200 opacity-60'}`}>
                                    <div className="flex items-center gap-1">
                                        <Tick checked={r.show} onChange={v => setRow(k, { show: v })}>
                                            <span className="font-semibold">{l.title}</span>
                                            <span className="block text-[11px] text-slate-400">{l.kind === 'fabric' ? 'Fabric' : `Issued at ${l.issue_stage_name}`}</span>
                                        </Tick>
                                        <div className="ml-auto flex">
                                            <button type="button" className="p-1 rounded hover:bg-slate-100 disabled:opacity-30" disabled={k === 0} onClick={() => moveRow(k, -1)} aria-label={`Move ${l.title} up`}><ArrowUp size={14} /></button>
                                            <button type="button" className="p-1 rounded hover:bg-slate-100 disabled:opacity-30" disabled={k === s.rows.length - 1} onClick={() => moveRow(k, 1)} aria-label={`Move ${l.title} down`}><ArrowDown size={14} /></button>
                                        </div>
                                    </div>
                                    {r.show && (
                                        <select className={`${inputCls} mt-1 !py-1 text-xs`} value={opts.some(o => o.key === r.as) ? r.as : opts[0].key} onChange={e => setRow(k, { as: e.target.value })} aria-label={`How ${l.title} prints`}>
                                            {opts.map(o => <option key={o.key} value={o.key}>Show as: {o.label}</option>)}
                                        </select>
                                    )}
                                </div>
                            );
                        })}
                    </Section>

                    <Section title="Bottom block" aside={
                        <button type="button" className="text-xs font-bold text-indigo-600 flex items-center gap-1"
                            onClick={() => set({ bottom: [...s.bottom, { key: `custom-${Date.now()}`, label: 'New box', show: true, text: '' }] })}><Plus size={13} /> Add box</button>
                    }>
                        {s.bottom.map((b, k) => {
                            const custom = !BOTTOM_BOXES.some(x => x.key === b.key);
                            return (
                                <div key={b.key} className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={b.show} onChange={e => setBox(k, { show: e.target.checked })} aria-label={`Show ${b.label}`} />
                                        {custom
                                            ? <input className={`${inputCls} !py-1`} value={b.label} maxLength={40} onChange={e => setBox(k, { label: e.target.value })} aria-label="Box name" />
                                            : <span className="text-sm text-slate-700">{b.label}</span>}
                                        {custom && <button type="button" className="p-1 rounded text-slate-400 hover:text-rose-600" onClick={() => set({ bottom: s.bottom.filter((_, i) => i !== k) })} aria-label={`Remove ${b.label}`}><Trash2 size={14} /></button>}
                                    </div>
                                    {b.show && <textarea className={`${inputCls} text-xs`} rows={2} maxLength={400} value={b.text} onChange={e => setBox(k, { text: e.target.value })} aria-label={`${b.label} text`} placeholder="Leave blank to write by hand" />}
                                </div>
                            );
                        })}
                    </Section>

                    <Section title="Footer">
                        <Tick checked={s.footer} onChange={v => set({ footer: v })}>Prepared / Checked / Approved by</Tick>
                    </Section>
                </aside>

                <div className="flex-1 min-w-0 overflow-x-auto bg-slate-100 rounded-xl p-4">
                    {model.colours.length === 0 ? <p className="text-sm text-slate-500">Tick at least one colour.</p> : <CardPreview m={model} />}
                </div>
            </div>
        </div>
    );
}
