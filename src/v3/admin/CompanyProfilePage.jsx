// Admin: company profile — 2.0's company_profile (one row), used on 2.0 invoices and 3.0 PO / GRN
// printouts. Managed from 3.0 under the decided shared-masters exception (V3_ROLE_NAVIGATION_PLAN.md
// section 9) through 2.0's own handler (same fields, legal name required, images up to 5 MB).
// Every change logged in 3.0. Kiosk scoreboard settings stay on 2.0's profile page.
import { useCallback, useEffect, useState } from 'react';
import { Trash2, Upload } from 'lucide-react';
import { adminApi } from '../api/adminApi';
import { apiError } from '../api/mastersApi';
import { IMAGE_BASE_URL } from '../../utils/api';
import { PageHeader, Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import SharedLog from './SharedLog';

const GROUPS = [
    ['Company', [['legal_name', 'Legal name *'], ['trade_name', 'Trade name'], ['gstin', 'GSTIN'], ['pan', 'PAN'], ['cin', 'CIN'], ['iec_code', 'IEC code'], ['lut_number', 'LUT number'], ['udyam_number', 'Udyam number']]],
    ['Address & contact', [['address_line1', 'Address line 1'], ['address_line2', 'Address line 2'], ['city', 'City'], ['state', 'State'], ['state_code', 'State code'], ['pin_code', 'PIN code'], ['country', 'Country'], ['phone', 'Phone'], ['email', 'Email'], ['website', 'Website']]],
    ['Bank', [['bank_name', 'Bank name'], ['bank_branch', 'Branch'], ['bank_account_no', 'Account no.'], ['bank_ifsc', 'IFSC'], ['bank_account_holder', 'Account holder'], ['upi_id', 'UPI id']]],
    ['Invoices & signatory', [['invoice_prefix', 'Invoice prefix'], ['place_of_supply_state', 'Place of supply (state)'], ['place_of_supply_state_code', 'Place of supply (code)'], ['authorized_signatory_name', 'Authorised signatory'], ['authorized_signatory_designation', 'Designation']]],
];
const IMAGES = [['logo', 'logo_url', 'Primary logo'], ['brand_logo', 'brand_logo_url', 'Brand logo'], ['signature', 'signature_url', 'Authorised signature'], ['seal', 'seal_url', 'Company seal']];
const imgSrc = (path) => (path ? `${IMAGE_BASE_URL.replace(/\/uploads$/, '')}${path.startsWith('/') ? '' : '/'}${path}` : null);

export default function CompanyProfilePage() {
    const [p, setP] = useState(null);
    const [form, setForm] = useState({});
    const [files, setFiles] = useState({});
    const [error, setError] = useState('');
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);
    const [tick, setTick] = useState(0);
    const load = useCallback(() => {
        adminApi.companyProfile().then(res => {
            const d = res.data || {};
            const keys = [...GROUPS.flatMap(([, f]) => f.map(([k]) => k)), 'terms_and_conditions'];
            setP(d); setForm(Object.fromEntries(keys.map(k => [k, d[k] ?? ''])));
        })
            .catch(err => setError(apiError(err, 'Failed to load the company profile.')));
        setTick(t => t + 1);
    }, []);
    useEffect(() => { load(); }, [load]);
    if (!p) return error ? <ErrorBox text={error} /> : <Loading />;

    const save = async () => {
        setBusy(true); setError(''); setMsg('');
        try {
            const fd = new FormData();
            for (const [k, v] of Object.entries(form)) fd.append(k, v ?? '');
            for (const [k, f] of Object.entries(files)) if (f) fd.append(k, f);
            await adminApi.saveCompanyProfile(fd);
            setFiles({}); setMsg('Company profile saved.'); load();
        } catch (err) { setError(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    const removeImage = async (kind, label) => {
        if (!window.confirm(`Remove the ${label.toLowerCase()}?`)) return;
        setError('');
        try { await adminApi.deleteCompanyImage(kind); setMsg(`${label} removed.`); load(); } catch (err) { setError(apiError(err, 'Failed.')); }
    };

    return (
        <div>
            <PageHeader title="Company profile" subtitle="Shared with 2.0 — used on invoices, POs and other printouts. Saved through 2.0's own rules; every change logged in 3.0."
                actions={<PrimaryButton busy={busy} disabled={busy || !String(form.legal_name || '').trim()} onClick={save}>Save</PrimaryButton>} />
            <ErrorBox text={error} />
            {msg && <p className="mb-3 text-sm text-emerald-700">{msg}</p>}
            {GROUPS.map(([title, fields]) => (
                <section key={title} className="bg-white border border-slate-200 rounded-xl p-4 mb-3">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">{title}</p>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{fields.map(([k, l]) => (
                        <Field key={k} label={l}><input className={inputCls} value={form[k] ?? ''} onChange={e => setForm({ ...form, [k]: e.target.value })} /></Field>
                    ))}</div>
                </section>
            ))}
            <section className="bg-white border border-slate-200 rounded-xl p-4 mb-3">
                <Field label="Terms and conditions"><textarea className={inputCls} rows={4} value={form.terms_and_conditions ?? ''} onChange={e => setForm({ ...form, terms_and_conditions: e.target.value })} /></Field>
            </section>
            <section className="bg-white border border-slate-200 rounded-xl p-4 mb-3">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Images (JPG, PNG or WEBP, up to 5 MB; saved with the profile)</p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{IMAGES.map(([kind, col, label]) => (
                    <div key={kind}>
                        <p className="text-sm font-semibold mb-1">{label}</p>
                        <div className="h-24 border border-dashed border-slate-300 rounded-lg flex items-center justify-center bg-slate-50 mb-1">
                            {files[kind] ? <span className="text-xs text-indigo-700">{files[kind].name} (on save)</span> : p[col] ? <img src={imgSrc(p[col])} alt={label} className="max-h-20 max-w-full object-contain" /> : <span className="text-xs text-slate-400">none</span>}
                        </div>
                        <div className="flex gap-2">
                            <label className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 cursor-pointer"><Upload size={12} /> Choose<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => setFiles({ ...files, [kind]: e.target.files?.[0] || null })} /></label>
                            {p[col] && !files[kind] && <button type="button" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-rose-600" onClick={() => removeImage(kind, label)}><Trash2 size={12} /> Remove</button>}
                        </div>
                    </div>
                ))}</div>
            </section>
            <SecondaryButton onClick={load}>Reload</SecondaryButton>
            <SharedLog entity="COMPANY_PROFILE" refresh={tick} />
        </div>
    );
}
