// Admin → Settings (15 Oct 2026): everything that is not the company's identity, one section per owner —
// company addresses / contacts / export, documents, year (read-only), purchasing, planning, working calendar,
// production & quality, stores, alerts, approvals (read-only matrix), change log. Identity (legal name, GSTIN,
// bank, logos) stays on Company profile; the TV kiosk and label printers stay in 2.0. ?section= opens a section.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Building2, FileText, CalendarDays, ShoppingCart, Calculator, Factory, Warehouse, Bell, ShieldCheck, History, Globe2, Clock, ExternalLink, Plus, Pencil, Trash2, Send, Play } from 'lucide-react';
import { settingsApi } from '../api/settingsApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';

const SECTIONS = [
    { key: 'company', label: 'Company', icon: Building2, text: 'Works / warehouse addresses, contacts' },
    { key: 'export', label: 'Export', icon: Globe2, text: 'Export bank, LUT, RCMC, currencies' },
    { key: 'documents', label: 'Documents', icon: FileText, text: 'Numbering, default terms, signatory' },
    { key: 'year', label: 'Year & time', icon: Clock, text: 'Financial year, time zone' },
    { key: 'purchasing', label: 'Purchasing', icon: ShoppingCart, text: 'Tolerances, payment terms, approval limit' },
    { key: 'planning', label: 'Planning', icon: Calculator, text: 'Cut allowance, lead days, cutting gate' },
    { key: 'calendar', label: 'Working calendar', icon: CalendarDays, text: 'Weekly off days, holidays' },
    { key: 'production', label: 'Production & quality', icon: Factory, text: 'Rework limits, WIP, targets, AQL' },
    { key: 'stores', label: 'Stores', icon: Warehouse, text: 'Label check, locations' },
    { key: 'alerts', label: 'Alerts', icon: Bell, text: 'Email alerts and recipients' },
    { key: 'approvals', label: 'Approvals', icon: ShieldCheck, text: 'Who approves what' },
    { key: 'log', label: 'Change log', icon: History, text: 'Every settings change' },
];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function Card({ title, hint, children, actions }) {
    return (
        <section className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
            <div className="flex items-start gap-3 mb-3">
                <div className="flex-1 min-w-0"><h2 className="font-bold text-slate-800">{title}</h2>{hint && <p className="text-xs text-slate-500 mt-0.5">{hint}</p>}</div>
                {actions}
            </div>
            {children}
        </section>
    );
}
const Check = ({ checked, onChange, children }) => (
    <label className="inline-flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} /> {children}</label>
);
// A section's form: local copy of the server values, Save sends them, the answer is the new full settings.
function useForm(initial) {
    const [f, setF] = useState(initial);
    useEffect(() => { setF(initial); }, [initial]);
    return [f, (patch) => setF(prev => ({ ...prev, ...patch }))];
}

export default function SettingsPage() {
    const [params, setParams] = useSearchParams();
    const section = SECTIONS.some(s => s.key === params.get('section')) ? params.get('section') : 'company';
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => { settingsApi.get().then(res => setData(res.data)).catch(err => setError(apiError(err, 'Failed to load settings.'))); }, []);
    const save = useCallback(async (fn, done = 'Saved.') => {
        setBusy(true); setError(''); setMsg('');
        try {
            const res = await fn();
            if (res?.data?.purchasing) setData(res.data); else settingsApi.get().then(r => setData(r.data)).catch(() => {});   // test mail / daily run: refresh the log
            setMsg(done); return true;
        }
        catch (err) { setError(apiError(err, 'Failed to save.')); return false; } finally { setBusy(false); }
    }, []);
    const props = { data, save, busy };

    return (
        <div>
            <PageHeader title="Settings" subtitle="Everything except the company's identity, by owner. Identity (legal name, GSTIN, bank, logos, signature, seal) is on Company profile. Every change is logged." />
            <div className="flex flex-col md:flex-row gap-4">
                <nav className="md:w-56 shrink-0 flex md:flex-col gap-1 overflow-x-auto">
                    {SECTIONS.map(s => (
                        <button key={s.key} type="button" onClick={() => { setParams({ section: s.key }); setMsg(''); setError(''); }}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left whitespace-nowrap ${section === s.key ? 'bg-indigo-600 text-white font-bold' : 'text-slate-700 hover:bg-slate-100'}`}>
                            <s.icon size={15} /> {s.label}
                        </button>
                    ))}
                    <div className="hidden md:block mt-3 pt-3 border-t border-slate-200 text-xs text-slate-500 space-y-1.5">
                        <Link to="/v3/admin/company-profile" className="flex items-center gap-1 text-indigo-700 hover:underline">Company profile (identity) →</Link>
                        <a href="/admin/company-profile" className="flex items-center gap-1 text-indigo-700 hover:underline"><ExternalLink size={11} /> Floor displays (2.0)</a>
                        <a href="/admin/label-printers" className="flex items-center gap-1 text-indigo-700 hover:underline"><ExternalLink size={11} /> Label printers (2.0)</a>
                    </div>
                </nav>
                <div className="flex-1 min-w-0">
                    {msg && <p className="mb-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{msg}</p>}
                    <ErrorBox text={error} />
                    {!data ? <Loading /> : (
                        <>
                            {section === 'company' && <CompanySection {...props} />}
                            {section === 'export' && <ExportSection {...props} />}
                            {section === 'documents' && <DocumentsSection {...props} />}
                            {section === 'year' && <YearSection {...props} />}
                            {section === 'purchasing' && <PurchasingSection {...props} />}
                            {section === 'planning' && <PlanningSection {...props} />}
                            {section === 'calendar' && <CalendarSection {...props} />}
                            {section === 'production' && <ProductionSection {...props} />}
                            {section === 'stores' && <StoresSection {...props} />}
                            {section === 'alerts' && <AlertsSection {...props} />}
                            {section === 'approvals' && <ApprovalsSection {...props} />}
                            {section === 'log' && <LogSection {...props} />}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Company: addresses + contacts ────────────────────────────────────────
const BLANK_ADDR = { kind: 'WORKS', name: '', address_line1: '', address_line2: '', city: '', state_code: '', pin_code: '', gstin: '', is_default_delivery: false, is_active: true };
const BLANK_CONTACT = { department: 'PURCHASE', name: '', designation: '', phone: '', email: '', sort_order: 0, is_active: true };
function CompanySection({ data, save, busy }) {
    const [addr, setAddr] = useState(null);
    const [contact, setContact] = useState(null);
    return (
        <>
            <Card title="Works, warehouse & office addresses" hint="The registered address is on Company profile. Mark one address as the default delivery address for purchase orders. A unit with its own GSTIN is billed on its GSTIN (GST worked out from that state)."
                actions={<SecondaryButton onClick={() => setAddr({ ...BLANK_ADDR })}><Plus size={14} /> Add address</SecondaryButton>}>
                {data.addresses.length === 0 ? <p className="text-sm text-slate-500">No addresses yet — POs print only the registered address.</p> : (
                    <div className="divide-y divide-slate-100">
                        {data.addresses.map(a => (
                            <div key={a.id} className={`flex flex-wrap items-start gap-2 py-2 ${a.is_active ? '' : 'opacity-50'}`}>
                                <div className="flex-1 min-w-[220px] text-sm">
                                    <b>{a.name}</b> <span className="text-xs text-slate-500">{a.kind.toLowerCase()}{a.is_default_delivery ? ' · default delivery' : ''}{a.is_active ? '' : ' · inactive'}</span>
                                    <p className="text-xs text-slate-600">{[a.address_line1, a.address_line2, a.city, a.state, a.pin_code].filter(Boolean).join(', ')}{a.gstin ? ` · GSTIN ${a.gstin}` : ''}</p>
                                </div>
                                <button type="button" onClick={() => setAddr({ ...BLANK_ADDR, ...a, gstin: a.gstin || '', state_code: a.state_code || '' })} className="p-1.5 rounded text-slate-500 hover:bg-slate-100" aria-label={`Edit ${a.name}`}><Pencil size={14} /></button>
                            </div>
                        ))}
                    </div>
                )}
                {addr && (
                    <div className="mt-3 border-t border-slate-200 pt-3 grid sm:grid-cols-2 gap-3">
                        <Field label="Name *"><input className={inputCls} value={addr.name} onChange={e => setAddr({ ...addr, name: e.target.value })} placeholder="Unit 2 – Ambernath" /></Field>
                        <Field label="Kind"><select className={inputCls} value={addr.kind} onChange={e => setAddr({ ...addr, kind: e.target.value })}>{['WORKS', 'WAREHOUSE', 'OFFICE', 'OTHER'].map(k => <option key={k} value={k}>{k.toLowerCase()}</option>)}</select></Field>
                        <Field label="Address line 1"><input className={inputCls} value={addr.address_line1 || ''} onChange={e => setAddr({ ...addr, address_line1: e.target.value })} /></Field>
                        <Field label="Address line 2"><input className={inputCls} value={addr.address_line2 || ''} onChange={e => setAddr({ ...addr, address_line2: e.target.value })} /></Field>
                        <Field label="City"><input className={inputCls} value={addr.city || ''} onChange={e => setAddr({ ...addr, city: e.target.value })} /></Field>
                        <Field label="PIN"><input className={inputCls} value={addr.pin_code || ''} maxLength={6} onChange={e => setAddr({ ...addr, pin_code: e.target.value })} /></Field>
                        <Field label="GSTIN of this unit" hint="Only if the unit is registered separately (another state)."><input className={`${inputCls} font-mono`} value={addr.gstin} maxLength={15} onChange={e => setAddr({ ...addr, gstin: e.target.value.toUpperCase() })} /></Field>
                        <Field label="State" hint={addr.gstin ? 'Taken from the GSTIN.' : ''}>
                            <select className={inputCls} value={addr.gstin?.length >= 2 ? addr.gstin.slice(0, 2) : addr.state_code} disabled={addr.gstin?.length >= 2} onChange={e => setAddr({ ...addr, state_code: e.target.value })}>
                                <option value="">—</option>{Object.entries(data.states).map(([code, name]) => <option key={code} value={code}>{name} ({code})</option>)}
                            </select>
                        </Field>
                        <div className="sm:col-span-2 flex flex-wrap gap-4">
                            <Check checked={addr.is_default_delivery} onChange={v => setAddr({ ...addr, is_default_delivery: v })}>Default delivery address for POs</Check>
                            <Check checked={addr.is_active} onChange={v => setAddr({ ...addr, is_active: v })}>Active</Check>
                        </div>
                        <div className="sm:col-span-2 flex justify-end gap-2">
                            <SecondaryButton onClick={() => setAddr(null)}>Cancel</SecondaryButton>
                            <PrimaryButton busy={busy} disabled={busy || !addr.name.trim()} onClick={async () => { if (await save(() => settingsApi.saveAddress(addr.id, { ...addr, gstin: addr.gstin || null, state_code: addr.state_code || null }), 'Address saved.')) setAddr(null); }}>Save address</PrimaryButton>
                        </div>
                    </div>
                )}
            </Card>
            <Card title="Contacts by department" hint="The first active Purchase contact prints on purchase orders. Used later for invoices (Accounts) and buyers (Merchandising)."
                actions={<SecondaryButton onClick={() => setContact({ ...BLANK_CONTACT })}><Plus size={14} /> Add contact</SecondaryButton>}>
                {data.contacts.length === 0 ? <p className="text-sm text-slate-500">No contacts yet.</p> : (
                    <div className="divide-y divide-slate-100">
                        {data.contacts.map(c => (
                            <div key={c.id} className={`flex flex-wrap items-center gap-2 py-2 text-sm ${c.is_active ? '' : 'opacity-50'}`}>
                                <span className="text-[11px] font-black uppercase tracking-wide text-slate-500 w-28">{c.department.toLowerCase()}</span>
                                <b>{c.name}</b><span className="text-xs text-slate-500">{[c.designation, c.phone, c.email].filter(Boolean).join(' · ')}</span>
                                <button type="button" onClick={() => setContact({ ...BLANK_CONTACT, ...c })} className="ml-auto p-1.5 rounded text-slate-500 hover:bg-slate-100" aria-label={`Edit ${c.name}`}><Pencil size={14} /></button>
                            </div>
                        ))}
                    </div>
                )}
                {contact && (
                    <div className="mt-3 border-t border-slate-200 pt-3 grid sm:grid-cols-3 gap-3">
                        <Field label="Department"><select className={inputCls} value={contact.department} onChange={e => setContact({ ...contact, department: e.target.value })}>{data.departments.map(d => <option key={d} value={d}>{d.toLowerCase()}</option>)}</select></Field>
                        <Field label="Name *"><input className={inputCls} value={contact.name} onChange={e => setContact({ ...contact, name: e.target.value })} /></Field>
                        <Field label="Designation"><input className={inputCls} value={contact.designation || ''} onChange={e => setContact({ ...contact, designation: e.target.value })} /></Field>
                        <Field label="Phone"><input className={inputCls} value={contact.phone || ''} onChange={e => setContact({ ...contact, phone: e.target.value })} /></Field>
                        <Field label="Email"><input className={inputCls} type="email" value={contact.email || ''} onChange={e => setContact({ ...contact, email: e.target.value })} /></Field>
                        <Field label="Order"><input className={inputCls} type="number" min="0" value={contact.sort_order} onChange={e => setContact({ ...contact, sort_order: e.target.value })} /></Field>
                        <div className="sm:col-span-3 flex items-center gap-2">
                            <Check checked={contact.is_active} onChange={v => setContact({ ...contact, is_active: v })}>Active</Check>
                            <span className="ml-auto flex gap-2">
                                <SecondaryButton onClick={() => setContact(null)}>Cancel</SecondaryButton>
                                <PrimaryButton busy={busy} disabled={busy || !contact.name.trim()} onClick={async () => { if (await save(() => settingsApi.saveContact(contact.id, contact), 'Contact saved.')) setContact(null); }}>Save contact</PrimaryButton>
                            </span>
                        </div>
                    </div>
                )}
            </Card>
        </>
    );
}

// ── Export ─────────────────────────────────────────────────────────────
function ExportSection({ data, save, busy }) {
    const [f, set] = useForm(data.export);
    const today = new Date().toISOString().slice(0, 10);
    const soon = (d) => d && d <= new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    return (
        <Card title="Export" hint="For FOB / export orders: the bank buyers pay into (AD code for shipping bills, SWIFT for remittances), LUT (export without paying IGST, renewed every financial year) and RCMC (AEPC). IEC is on Company profile. A card on My work warns 30 days before LUT / RCMC expiry.">
            <div className="grid sm:grid-cols-3 gap-3">
                <Field label="Bank"><input className={inputCls} value={f.bank_name || ''} onChange={e => set({ bank_name: e.target.value })} /></Field>
                <Field label="Branch"><input className={inputCls} value={f.bank_branch || ''} onChange={e => set({ bank_branch: e.target.value })} /></Field>
                <Field label="Account holder"><input className={inputCls} value={f.account_holder || ''} onChange={e => set({ account_holder: e.target.value })} /></Field>
                <Field label="Account no."><input className={`${inputCls} font-mono`} value={f.account_no || ''} onChange={e => set({ account_no: e.target.value })} /></Field>
                <Field label="SWIFT"><input className={`${inputCls} font-mono`} value={f.swift_code || ''} maxLength={11} onChange={e => set({ swift_code: e.target.value.toUpperCase() })} /></Field>
                <Field label="AD code"><input className={`${inputCls} font-mono`} value={f.ad_code || ''} onChange={e => set({ ad_code: e.target.value })} /></Field>
                <Field label="IBAN (if any)"><input className={`${inputCls} font-mono`} value={f.iban || ''} onChange={e => set({ iban: e.target.value })} /></Field>
                <div className="sm:col-span-2"><Field label="Bank address"><input className={inputCls} value={f.bank_address || ''} onChange={e => set({ bank_address: e.target.value })} /></Field></div>
                <Field label="LUT valid from"><input className={inputCls} type="date" value={f.lut_valid_from || ''} onChange={e => set({ lut_valid_from: e.target.value })} /></Field>
                <Field label="LUT valid to" hint={f.lut_valid_to && f.lut_valid_to < today ? 'Expired' : soon(f.lut_valid_to) ? 'Expires within 30 days' : ''}><input className={inputCls} type="date" value={f.lut_valid_to || ''} onChange={e => set({ lut_valid_to: e.target.value })} /></Field>
                <div />
                <Field label="RCMC no."><input className={inputCls} value={f.rcmc_number || ''} onChange={e => set({ rcmc_number: e.target.value })} /></Field>
                <Field label="RCMC valid to" hint={f.rcmc_valid_to && f.rcmc_valid_to < today ? 'Expired' : soon(f.rcmc_valid_to) ? 'Expires within 30 days' : ''}><input className={inputCls} type="date" value={f.rcmc_valid_to || ''} onChange={e => set({ rcmc_valid_to: e.target.value })} /></Field>
                <Field label="Export currencies">
                    <div className="flex flex-wrap gap-2 pt-1">{data.currencies.map(c => (
                        <Check key={c} checked={(f.export_currencies || []).includes(c)} onChange={v => set({ export_currencies: v ? [...(f.export_currencies || []), c] : (f.export_currencies || []).filter(x => x !== c) })}>{c}</Check>
                    ))}</div>
                </Field>
            </div>
            <div className="mt-3 flex justify-end"><PrimaryButton busy={busy} disabled={busy} onClick={() => save(() => settingsApi.saveExport(f), 'Export details saved.')}>Save</PrimaryButton></div>
        </Card>
    );
}

// ── Documents ────────────────────────────────────────────────────────────
function DocumentsSection({ data, save, busy }) {
    const [doc, setDoc] = useState('PO');
    const cur = data.documents.find(d => d.doc_type === doc);
    const [f, set] = useForm(cur);
    return (
        <Card title="Documents" hint="Per document: the number prefix (numbers are <prefix>/<financial year>/<0001…>, restarting every April), default terms, who signs, and what prints. A new prefix applies from the next number.">
            <div className="flex flex-wrap gap-1 mb-3">{data.documents.map(d => (
                <button key={d.doc_type} type="button" onClick={() => setDoc(d.doc_type)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${doc === d.doc_type ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600'}`}>{d.label}</button>
            ))}</div>
            <div className="grid sm:grid-cols-3 gap-3">
                <Field label="Number prefix" hint={`Next: ${f.prefix || '?'}/2026-27/…`}><input className={`${inputCls} font-mono`} value={f.prefix || ''} maxLength={12} onChange={e => set({ prefix: e.target.value.toUpperCase() })} /></Field>
                <Field label="Signatory"><input className={inputCls} value={f.signatory_name || ''} onChange={e => set({ signatory_name: e.target.value })} /></Field>
                <Field label="Designation"><input className={inputCls} value={f.signatory_designation || ''} onChange={e => set({ signatory_designation: e.target.value })} /></Field>
                <Field label="Logo on the printout"><select className={inputCls} value={f.logo} onChange={e => set({ logo: e.target.value })}><option value="PRIMARY">Primary logo</option><option value="BRAND">Brand logo</option><option value="NONE">No logo</option></select></Field>
                <div className="sm:col-span-2 flex flex-wrap gap-4 items-end pb-2">
                    <Check checked={f.show_signature} onChange={v => set({ show_signature: v })}>Print the signature</Check>
                    <Check checked={f.show_seal} onChange={v => set({ show_seal: v })}>Print the company seal</Check>
                    <span className="text-xs text-slate-500">(images from Company profile)</span>
                </div>
                <div className="sm:col-span-3"><Field label="Default terms" hint={doc === 'PO' ? 'Filled in on every new PO (can be changed per PO): packing, inspection, delivery address, penalties, payment.' : 'Printed on this document where it has terms.'}>
                    <textarea className={`${inputCls} min-h-[110px]`} value={f.default_terms || ''} onChange={e => set({ default_terms: e.target.value })} />
                </Field></div>
            </div>
            <div className="mt-3 flex justify-end"><PrimaryButton busy={busy} disabled={busy} onClick={() => save(() => settingsApi.saveDocument(doc, f), `${cur.label} settings saved.`)}>Save {cur.label.toLowerCase()}</PrimaryButton></div>
        </Card>
    );
}

function YearSection({ data }) {
    return (
        <Card title="Year & time" hint="Fixed for an Indian factory — GST, TDS and the books follow them.">
            <dl className="grid sm:grid-cols-3 gap-3 text-sm">
                <div><dt className="text-xs font-bold text-slate-500">Financial year</dt><dd className="font-semibold">{data.year.financial_year}</dd></div>
                <div><dt className="text-xs font-bold text-slate-500">Time zone</dt><dd className="font-semibold">{data.year.time_zone}</dd></div>
                <div><dt className="text-xs font-bold text-slate-500">Base currency</dt><dd className="font-semibold">{data.year.base_currency} (export currencies under Export)</dd></div>
            </dl>
        </Card>
    );
}

function PurchasingSection({ data, save, busy }) {
    const [f, set] = useForm(data.purchasing);
    return (
        <Card title="Purchasing" hint="2.0 had one three-way match % on its company profile; 3.0 keeps receipt and invoice tolerance apart.">
            <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Over-receipt tolerance %" hint="More than ordered beyond this needs approval (goods receipt)."><input className={inputCls} type="number" min="0" max="100" step="any" value={f.over_receipt_tolerance_pct ?? ''} onChange={e => set({ over_receipt_tolerance_pct: e.target.value })} /></Field>
                <Field label="Invoice match tolerance %" hint="Supplier invoice vs PO / GRN beyond this needs an override."><input className={inputCls} type="number" min="0" max="100" step="any" value={f.invoice_match_tolerance_pct ?? ''} onChange={e => set({ invoice_match_tolerance_pct: e.target.value })} /></Field>
                <Field label="Default payment terms (days)" hint="For new suppliers when none is entered (empty = 30)."><input className={inputCls} type="number" min="0" max="365" value={f.default_payment_terms_days ?? ''} onChange={e => set({ default_payment_terms_days: e.target.value })} /></Field>
                <Field label="PO approval limit ₹" hint="Every purchase order is checked on its total (incl. GST): up to this the purchase manager issues it (auto-approved); above it the factory admin approves first. 0 = every PO needs approval."><input className={inputCls} type="number" min="0" step="any" value={f.po_approval_limit ?? 0} onChange={e => set({ po_approval_limit: e.target.value })} /></Field>
            </div>
            <div className="mt-3 flex justify-end"><PrimaryButton busy={busy} disabled={busy} onClick={() => save(() => settingsApi.savePurchasing(f), 'Purchasing settings saved.')}>Save</PrimaryButton></div>
        </Card>
    );
}

function PlanningSection({ data, save, busy }) {
    const [f, set] = useForm(data.planning);
    return (
        <Card title="Planning" hint="Lead days count working days (Working calendar).">
            <div className="grid sm:grid-cols-3 gap-3">
                <Field label="Default cut allowance %" hint="New order lines; each line can differ."><input className={inputCls} type="number" min="0" max="50" step="any" value={f.default_cut_allowance_pct ?? ''} onChange={e => set({ default_cut_allowance_pct: e.target.value })} /></Field>
                <Field label="Fabric lead days" hint="Fabric needed this many working days before ship."><input className={inputCls} type="number" min="0" max="365" value={f.fabric_lead_days ?? ''} onChange={e => set({ fabric_lead_days: e.target.value })} /></Field>
                <Field label="Trim lead days"><input className={inputCls} type="number" min="0" max="365" value={f.trim_lead_days ?? ''} onChange={e => set({ trim_lead_days: e.target.value })} /></Field>
                <div className="sm:col-span-3"><Field label="Cutting gate" hint="What must be allocated before an order can be cut. The merchandiser can still release an order with a reason.">
                    <div className="flex flex-col gap-1.5 pt-1">
                        <label className="text-sm"><input type="radio" checked={f.cutting_gate_mode === 'ALL'} onChange={() => set({ cutting_gate_mode: 'ALL' })} /> All fabric and trims</label>
                        <label className="text-sm"><input type="radio" checked={f.cutting_gate_mode === 'FABRIC'} onChange={() => set({ cutting_gate_mode: 'FABRIC' })} /> Fabric only — trims are needed at the lines (trim kits)</label>
                    </div>
                </Field></div>
            </div>
            <div className="mt-3 flex justify-end"><PrimaryButton busy={busy} disabled={busy} onClick={() => save(() => settingsApi.savePlanning(f), 'Planning settings saved.')}>Save</PrimaryButton></div>
        </Card>
    );
}

function CalendarSection({ data, save, busy }) {
    const [off, setOff] = useState(data.calendar.weekly_off);
    useEffect(() => { setOff(data.calendar.weekly_off); }, [data.calendar.weekly_off]);
    const [h, setH] = useState({ date: '', name: '' });
    return (
        <>
            <Card title="Weekly off days" hint="Material needed-by dates and order milestones count back in working days, skipping these and the holidays. None ticked = every day counts.">
                <div className="flex flex-wrap gap-3">{DAYS.map((d, i) => <Check key={d} checked={off.includes(i)} onChange={v => setOff(v ? [...off, i] : off.filter(x => x !== i))}>{d}</Check>)}</div>
                <div className="mt-3 flex justify-end"><PrimaryButton busy={busy} disabled={busy} onClick={() => save(() => settingsApi.saveCalendar(off), 'Weekly off days saved.')}>Save</PrimaryButton></div>
            </Card>
            <Card title="Holidays">
                <div className="flex flex-wrap items-end gap-2 mb-3">
                    <Field label="Date"><input className={inputCls} type="date" value={h.date} onChange={e => setH({ ...h, date: e.target.value })} /></Field>
                    <Field label="Name"><input className={inputCls} value={h.name} onChange={e => setH({ ...h, name: e.target.value })} placeholder="Diwali" /></Field>
                    <PrimaryButton busy={busy} disabled={busy || !h.date || !h.name.trim()} onClick={async () => { if (await save(() => settingsApi.addHoliday(h.date, h.name), 'Holiday added.')) setH({ date: '', name: '' }); }}><Plus size={14} /> Add</PrimaryButton>
                </div>
                {data.calendar.holidays.length === 0 ? <p className="text-sm text-slate-500">No holidays.</p> : (
                    <div className="divide-y divide-slate-100">{data.calendar.holidays.map(x => (
                        <div key={x.date} className="flex items-center gap-3 py-1.5 text-sm">
                            <span className="font-mono w-28">{x.date.split('-').reverse().join('-')}</span><span className="flex-1">{x.name}</span>
                            <button type="button" onClick={() => { if (window.confirm(`Remove ${x.name}?`)) save(() => settingsApi.removeHoliday(x.date), 'Holiday removed.'); }} className="p-1 rounded text-rose-500 hover:bg-rose-50" aria-label={`Remove ${x.name}`}><Trash2 size={14} /></button>
                        </div>
                    ))}</div>
                )}
            </Card>
        </>
    );
}

function ProductionSection({ data, save, busy }) {
    const [f, set] = useForm(data.production);
    const n = (k, label, hint, extra = {}) => <Field label={label} hint={hint}><input className={inputCls} type="number" min="0" step="any" value={f[k] ?? ''} onChange={e => set({ [k]: e.target.value })} {...extra} /></Field>;
    return (
        <Card title="Production & quality" hint="Output time slots are not used in 3.0 (decided). Thresholds apply per station (line × stage).">
            <div className="grid sm:grid-cols-3 gap-3">
                {n('rework_warning_threshold', 'Rework warning', 'Pieces / garments waiting for rework at a station: warning from here.')}
                {n('rework_block_threshold', 'Rework block', 'From here no new "approved" checks at that station until rework is repaired. Empty = never block.')}
                {n('default_wip_limit', 'Default WIP limit (batches)', 'For lines without their own WIP limit. Empty = no limit.')}
                {n('efficiency_target_pct', 'Efficiency target %', 'Earned minutes (SAM × pieces) ÷ available minutes; for the efficiency reports.')}
                {n('dhu_target_pct', 'DHU target %', 'Defects per hundred units; for the quality reports.')}
                <Field label="AQL level (final inspection)"><select className={inputCls} value={f.aql_level || ''} onChange={e => set({ aql_level: e.target.value })}><option value="">—</option>{['0.65', '1.0', '1.5', '2.5', '4.0', '6.5'].map(a => <option key={a} value={a}>{a}</option>)}</select></Field>
                {n('ship_tolerance_pct', 'Ship tolerance %', 'Dispatch: shipping more than ordered + this % per colour × size needs a reason. An order can have its own.', { max: 50 })}
            </div>
            <div className="mt-3 flex justify-end"><PrimaryButton busy={busy} disabled={busy} onClick={() => save(() => settingsApi.saveProduction(f), 'Production settings saved.')}>Save</PrimaryButton></div>
        </Card>
    );
}

function StoresSection({ data, save, busy }) {
    const [mode, setMode] = useState(data.store.grn_label_check);
    useEffect(() => { setMode(data.store.grn_label_check); }, [data.store.grn_label_check]);
    const [loc, setLoc] = useState(null);
    return (
        <>
            <Card title="Goods receipt label check">
                <div className="flex flex-col gap-1.5 text-sm">
                    <label><input type="radio" checked={mode === 'COPY'} onChange={() => setMode('COPY')} /> <b>Copy</b> — the receiver sees the PO's code and can copy it (quick)</label>
                    <label><input type="radio" checked={mode === 'BLIND'} onChange={() => setMode('BLIND')} /> <b>Blind</b> — the receiver types the code from the supplier's label without seeing the PO's (catches wrong items)</label>
                </div>
                <div className="mt-3 flex justify-end"><PrimaryButton busy={busy} disabled={busy || mode === data.store.grn_label_check} onClick={() => save(() => settingsApi.saveStore({ grn_label_check: mode }), 'Label check saved.')}>Save</PrimaryButton></div>
            </Card>
            <Card title="Store locations / bins" hint="Offered when receiving rolls and setting item locations (still free text — a new place can be typed)."
                actions={<SecondaryButton onClick={() => setLoc({ code: '', name: '', area: 'ALL', is_active: true })}><Plus size={14} /> Add location</SecondaryButton>}>
                {loc && (
                    <div className="mb-3 flex flex-wrap items-end gap-2">
                        <Field label="Code *"><input className={`${inputCls} font-mono w-32`} value={loc.code} onChange={e => setLoc({ ...loc, code: e.target.value.toUpperCase() })} placeholder="R1-B3" /></Field>
                        <Field label="Name"><input className={inputCls} value={loc.name || ''} onChange={e => setLoc({ ...loc, name: e.target.value })} placeholder="Rack 1 bin 3" /></Field>
                        <Field label="For"><select className={inputCls} value={loc.area} onChange={e => setLoc({ ...loc, area: e.target.value })}><option value="ALL">All stores</option><option value="FABRIC">Fabric</option><option value="TRIM">Trims</option><option value="STORE">Spares / general</option></select></Field>
                        <Check checked={loc.is_active} onChange={v => setLoc({ ...loc, is_active: v })}>Active</Check>
                        <SecondaryButton onClick={() => setLoc(null)}>Cancel</SecondaryButton>
                        <PrimaryButton busy={busy} disabled={busy || !loc.code.trim()} onClick={async () => { if (await save(() => settingsApi.saveLocation(loc.id, loc), 'Location saved.')) setLoc(null); }}>Save</PrimaryButton>
                    </div>
                )}
                {data.locations.length === 0 ? <p className="text-sm text-slate-500">No locations yet.</p> : (
                    <div className="flex flex-wrap gap-2">{data.locations.map(l => (
                        <button key={l.id} type="button" onClick={() => setLoc({ ...l })} className={`px-2.5 py-1 rounded-lg border text-xs ${l.is_active ? 'border-slate-200' : 'border-slate-100 opacity-50'}`}>
                            <b className="font-mono">{l.code}</b>{l.name ? ` · ${l.name}` : ''} <span className="text-slate-400">{l.area.toLowerCase()}</span>
                        </button>
                    ))}</div>
                )}
            </Card>
        </>
    );
}

function AlertsSection({ data, save, busy }) {
    const keys = Object.keys(data.alerts.catalog);
    const init = useMemo(() => ({
        email_enabled: data.alerts.email_enabled, enabled: data.alerts.enabled_alerts || [],
        recipients: Object.fromEntries(keys.map(k => [k, (data.alerts.recipients?.[k] || []).join(', ')])),
    }), [data.alerts]); // eslint-disable-line react-hooks/exhaustive-deps
    const [f, set] = useForm(init);
    const [testTo, setTestTo] = useState('');
    return (
        <>
            {!data.alerts.mail_ready && (
                <p className="mb-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    The mail server is not set on the backend yet — alerts are saved but can't be sent. Add <span className="font-mono">SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM</span> to the backend's environment (Render → Environment), then use "Send test email". The password is never stored in the app.
                </p>
            )}
            <Card title="Email alerts" hint="In-app alerts (My work, Approvals) work without this. Email reaches people who aren't logged in.">
                <Check checked={f.email_enabled} onChange={v => set({ email_enabled: v })}>Send email alerts</Check>
                <div className="mt-3 divide-y divide-slate-100">
                    {keys.map(k => (
                        <div key={k} className="py-2 grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-2 items-start">
                            <div>
                                <Check checked={f.enabled.includes(k)} onChange={v => set({ enabled: v ? [...f.enabled, k] : f.enabled.filter(x => x !== k) })}><b>{data.alerts.catalog[k].label}</b></Check>
                                <p className="text-xs text-slate-500 ml-6">{data.alerts.catalog[k].when}</p>
                            </div>
                            <input className={inputCls} value={f.recipients[k]} onChange={e => set({ recipients: { ...f.recipients, [k]: e.target.value } })} placeholder="emails, comma separated" aria-label={`Recipients: ${data.alerts.catalog[k].label}`} />
                        </div>
                    ))}
                </div>
                <div className="mt-3 flex justify-end">
                    <PrimaryButton busy={busy} disabled={busy} onClick={() => save(() => settingsApi.saveAlerts({ email_enabled: f.email_enabled, enabled_alerts: f.enabled, recipients: f.recipients }), 'Alerts saved.')}>Save</PrimaryButton>
                </div>
            </Card>
            <Card title="Test & run" hint={`Daily alerts run once a day after 09:00 (India time)${data.alerts.last_daily_run ? ` — last ${data.alerts.last_daily_run}` : ''}.`}>
                <div className="flex flex-wrap items-end gap-2">
                    <Field label="Send a test email to"><input className={inputCls} value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="you@company.com" /></Field>
                    <SecondaryButton disabled={busy || !testTo.trim()} onClick={() => save(() => settingsApi.testAlert(testTo), `Test email sent to ${testTo}.`)}><Send size={14} /> Send test email</SecondaryButton>
                    <SecondaryButton disabled={busy} onClick={() => save(() => settingsApi.runDaily(), 'Daily alerts run (sent to whoever is set).')}><Play size={14} /> Run daily alerts now</SecondaryButton>
                </div>
                {data.alerts.log.length > 0 && (
                    <div className="mt-3 text-xs divide-y divide-slate-100">{data.alerts.log.map(l => (
                        <div key={l.id} className="py-1 flex flex-wrap gap-x-2">
                            <span className="text-slate-400">{new Date(l.created_at).toLocaleString()}</span>
                            <b className={l.status === 'SENT' ? 'text-emerald-700' : 'text-rose-700'}>{l.status}</b>
                            <span>{l.subject}</span><span className="text-slate-500">→ {l.recipients.join(', ')}</span>{l.error && <span className="text-rose-700">{l.error}</span>}
                        </div>
                    ))}</div>
                )}
            </Card>
        </>
    );
}

function ApprovalsSection({ data }) {
    return (
        <Card title="Who approves what" hint="Read-only for now — the role lists live in the app. The PO approval limit (₹) is under Purchasing. Extra roles per user: Users & access.">
            <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">{data.approvals.map(a => (
                    <tr key={a.what}><td className="py-2 pr-3 font-semibold text-slate-800 align-top">{a.what}{a.note && <span className="block text-xs font-normal text-slate-500">{a.note}</span>}</td><td className="py-2 text-slate-700 align-top">{a.who.join(', ')}</td></tr>
                ))}</tbody>
            </table>
        </Card>
    );
}

function LogSection({ data }) {
    return (
        <Card title="Change log" hint="The last 60 settings changes.">
            {data.log.length === 0 ? <p className="text-sm text-slate-500">No changes yet.</p> : (
                <div className="divide-y divide-slate-100 text-sm">{data.log.map(g => (
                    <div key={g.id} className="py-1.5">
                        <span className="text-xs text-slate-400 mr-2">{new Date(g.created_at).toLocaleString()}</span><b>{g.area}</b>{g.user_name && <span className="text-slate-600"> · {g.user_name}</span>}
                        {Array.isArray(g.summary) && g.summary.length > 0 && <ul className="ml-6 list-disc text-xs text-slate-600">{g.summary.map((x, i) => <li key={i}>{x}</li>)}</ul>}
                    </div>
                ))}</div>
            )}
        </Card>
    );
}
