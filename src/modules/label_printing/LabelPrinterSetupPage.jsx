// Admin: print agents (one per BarTender PC) and the label printers on them.
// An agent's token is shown once, when created or renewed — it goes into the
// agent's config.json on the BarTender PC.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FiPrinter, FiServer, FiPlus, FiCopy, FiKey, FiEdit2, FiX, FiAlertTriangle, FiLoader } from 'react-icons/fi';
import { labelPrintingApi } from '../../api/labelPrintingApi';
import { PrinterStatus, apiError, formatWhen } from './labelShared';

const EMPTY_PRINTER = { name: '', agent_id: '', windows_printer_name: '', btw_path: '', data_source_name: 'BARCODES', location: '', is_default: false, is_active: true };

const Field = ({ label, hint, children }) => (
    <label className="block">
        <span className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">{label}</span>
        {children}
        {hint && <span className="block text-[11px] text-gray-400 mt-0.5">{hint}</span>}
    </label>
);
const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300';

// A list reported by the agent's PC, with "Other — type it" for anything not in it.
const PickOrType = ({ options, value, onChange, placeholder, mono }) => {
    const known = options.some(o => o.value === value);
    const [manual, setManual] = useState(options.length === 0 || (!!value && !known));
    // Switch to the list once the PC's list arrives (unless something else was typed).
    useEffect(() => {
        if (options.length > 0 && (!value || known)) setManual(false);
        if (options.length === 0) setManual(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [options.length]);
    if (manual) {
        return (
            <div className="flex gap-2">
                <input className={`${inputCls} ${mono ? 'font-mono' : ''}`} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
                {options.length > 0 && <button type="button" onClick={() => setManual(false)} className="px-2 text-xs text-indigo-600 hover:underline whitespace-nowrap">Pick from list</button>}
            </div>
        );
    }
    return (
        <select className={`${inputCls} ${mono ? 'font-mono' : ''}`} value={known ? value : ''}
            onChange={e => { if (e.target.value === '__other__') { setManual(true); } else onChange(e.target.value); }}>
            <option value="">Select…</option>
            {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            <option value="__other__">Other — type it…</option>
        </select>
    );
};

const TokenBox = ({ token, agentName, onClose }) => {
    const serverUrl = (process.env.REACT_APP_API_URL || `http://${window.location.hostname}:5002`).replace(/\/api\/?$/, '');
    const config = JSON.stringify({ serverUrl, agentToken: token.token, bartenderUrl: 'http://localhost:5159', bartenderAuth: 'windows' }, null, 2);
    const copy = (t) => navigator.clipboard?.writeText(t);
    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg border border-gray-200">
                <div className="flex items-center justify-between p-5 border-b border-gray-100">
                    <h2 className="text-base font-bold text-gray-900 flex items-center gap-2"><FiKey className="text-indigo-600" /> Token for “{agentName}”</h2>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><FiX /></button>
                </div>
                <div className="p-5 space-y-3 text-sm">
                    <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex gap-2"><FiAlertTriangle className="shrink-0 mt-0.5" /> Shown only now. Copy it into <b>config.json</b> of the print agent on the BarTender PC. If it is lost, issue a new one.</p>
                    <div className="flex gap-2">
                        <code className="flex-1 bg-gray-100 rounded px-2 py-1.5 font-mono text-xs break-all">{token.token}</code>
                        <button onClick={() => copy(token.token)} className="px-2 rounded border border-gray-300 hover:bg-gray-50" title="Copy"><FiCopy /></button>
                    </div>
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-xs font-bold text-gray-500 uppercase">config.json</span>
                            <button onClick={() => copy(config)} className="text-xs text-indigo-600 hover:underline flex items-center gap-1"><FiCopy size={11} /> Copy</button>
                        </div>
                        <pre className="bg-slate-900 text-slate-100 rounded-lg p-3 text-xs overflow-x-auto">{config}</pre>
                        <p className="text-[11px] text-gray-500 mt-1">Check serverUrl is the backend address the BarTender PC can reach.</p>
                    </div>
                </div>
                <div className="px-5 pb-5"><button onClick={onClose} className="w-full px-4 py-2.5 text-sm font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-lg">Done</button></div>
            </div>
        </div>
    );
};

const LabelPrinterSetupPage = () => {
    const [agents, setAgents] = useState([]);
    const [printers, setPrinters] = useState([]);
    const [error, setError] = useState(null);
    const [newAgentName, setNewAgentName] = useState('');
    // Agent actions report here, next to the button — the page-level error is
    // cleared by the 15-second refresh and sits off-screen at the top.
    const [agentError, setAgentError] = useState(null);
    const [adding, setAdding] = useState(false);
    const agentInputRef = useRef(null);
    const [token, setToken] = useState(null);         // { token, name }
    const [form, setForm] = useState(null);           // printer being added / edited
    const [formError, setFormError] = useState(null);
    const [saving, setSaving] = useState(false);
    const [refreshing, setRefreshing] = useState({});   // agentId → true while waiting for the PC's new list

    const load = useCallback(async () => {
        try {
            const [a, p] = await Promise.all([labelPrintingApi.listAgents(), labelPrintingApi.listAllPrinters()]);
            setAgents(a.data); setPrinters(p.data); setError(null);
        } catch (err) { setError(apiError(err, 'Could not load label printing setup.')); }
    }, []);
    useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

    const addAgent = async () => {
        if (!newAgentName.trim()) {
            setAgentError('Type a name for the agent first, e.g. "Cutting BarTender PC".');
            agentInputRef.current?.focus();
            return;
        }
        setAdding(true); setAgentError(null);
        try {
            const r = await labelPrintingApi.createAgent(newAgentName.trim());
            setToken({ token: r.data.token, name: r.data.name }); setNewAgentName(''); load();
        } catch (err) {
            setAgentError(err.response?.status === 404
                ? 'The server does not have label printing yet — deploy the latest backend.'
                : apiError(err, 'Could not add the agent.'));
        } finally { setAdding(false); }
    };
    const renewToken = async (agent) => {
        if (!window.confirm(`Issue a new token for "${agent.name}"? The old token stops working immediately — update config.json on the BarTender PC.`)) return;
        try {
            const r = await labelPrintingApi.newAgentToken(agent.id);
            setToken({ token: r.data.token, name: agent.name });
        } catch (err) { setAgentError(apiError(err, 'Could not issue a new token.')); }
    };
    const toggleAgent = async (agent) => {
        try { await labelPrintingApi.updateAgent(agent.id, { is_active: !agent.is_active }); load(); }
        catch (err) { setAgentError(apiError(err, 'Could not update the agent.')); }
    };

    // The agent picks the request up on its next heartbeat (~30s) and reports
    // its printers and .btw files; follow it for up to 90s.
    const refreshInventory = async (agent) => {
        setAgentError(null);
        try {
            const { data: req } = await labelPrintingApi.refreshAgentInventory(agent.id);
            setRefreshing(r => ({ ...r, [agent.id]: true }));
            const asked = new Date(req.inventory_requested_at).getTime();
            for (let i = 0; i < 30; i++) {
                await new Promise(r => setTimeout(r, 3000));
                const { data } = await labelPrintingApi.listAgents();
                setAgents(data);
                const a = data.find(x => String(x.id) === String(agent.id));
                if (a?.inventory_at && new Date(a.inventory_at).getTime() >= asked) break;
                if (i === 29) setAgentError(`"${agent.name}" did not report back within 90 seconds. Is the agent running on the BarTender PC?`);
            }
        } catch (err) {
            setAgentError(apiError(err, 'Could not ask the agent for its printers.'));
        } finally {
            setRefreshing(r => ({ ...r, [agent.id]: false }));
        }
    };

    const savePrinter = async () => {
        setSaving(true); setFormError(null);
        try {
            const payload = { ...form, agent_id: Number(form.agent_id) };
            if (form.id) await labelPrintingApi.updatePrinter(form.id, payload);
            else await labelPrintingApi.createPrinter(payload);
            setForm(null); load();
        } catch (err) { setFormError(apiError(err, 'Could not save the printer.')); }
        finally { setSaving(false); }
    };

    const formAgent = form ? agents.find(a => String(a.id) === String(form.agent_id)) : null;
    const printerOptions = (formAgent?.reported_printers || []).map(p => ({
        value: p.name, label: `${p.name}${p.is_default ? ' (Windows default)' : ''}${p.port ? ` · ${p.port}` : ''}`,
    }));
    const fileOptions = (formAgent?.reported_label_files || []).map(f => ({
        value: f.path, label: `${f.path}${f.modified ? ` · ${String(f.modified).slice(0, 10)}` : ''}`,
    }));

    return (
        <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><FiPrinter className="text-indigo-600" /> Label Printers</h1>
                <p className="text-sm text-gray-500">Garment labels print through BarTender. A small print agent on the BarTender PC collects jobs from here and prints them.</p>
            </div>
            {error && <div className="px-3 py-2 rounded-lg text-sm border bg-red-50 border-red-200 text-red-700">{error}</div>}

            <section className="bg-white rounded-lg border shadow-sm">
                <div className="p-4 border-b flex flex-wrap justify-between items-center gap-3">
                    <h2 className="font-semibold text-gray-800 flex items-center gap-2"><FiServer className="text-gray-400" /> Print agents (BarTender PCs)</h2>
                    <div className="flex gap-2">
                        <input ref={agentInputRef} value={newAgentName} onChange={e => { setNewAgentName(e.target.value); setAgentError(null); }} onKeyDown={e => { if (e.key === 'Enter') addAgent(); }}
                            placeholder="Agent name, e.g. Cutting BarTender PC" className={`${inputCls} w-72`} />
                        <button onClick={addAgent} disabled={adding} className="px-3 py-2 text-sm font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-1 whitespace-nowrap disabled:opacity-50">
                            {adding ? <FiLoader className="animate-spin" /> : <FiPlus />} Add agent
                        </button>
                    </div>
                </div>
                {agentError && <div className="px-4 py-2 text-sm bg-red-50 border-b border-red-100 text-red-700 flex items-center gap-2"><FiAlertTriangle className="shrink-0" /> {agentError}</div>}
                <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase"><tr>
                        <th className="py-2 px-3 text-left">Agent</th><th className="py-2 px-3 text-left">Status</th><th className="py-2 px-3 text-left">PC</th>
                        <th className="py-2 px-3 text-left">BarTender</th><th className="py-2 px-3" />
                    </tr></thead>
                    <tbody className="divide-y divide-gray-100">
                        {agents.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-gray-400">No agents yet. Add one, then install the agent on the BarTender PC with its token.</td></tr>}
                        {agents.map(a => (
                            <tr key={a.id} className={a.is_active ? '' : 'opacity-50'}>
                                <td className="py-2 px-3 font-semibold">{a.name}</td>
                                <td className="py-2 px-3">
                                    {!a.is_active ? <span className="text-gray-500">Disabled</span>
                                        : a.online ? <span className="text-emerald-700 font-medium">● Online</span>
                                            : <span className="text-amber-700 font-medium">● Offline{a.last_seen_at ? ` (last seen ${formatWhen(a.last_seen_at)})` : ' (never connected)'}</span>}
                                </td>
                                <td className="py-2 px-3 text-gray-600">
                                    {a.machine_name || '—'}{a.agent_version ? ` · v${a.agent_version}` : ''}
                                    <div className="text-xs text-gray-400">
                                        {refreshing[a.id] ? 'asking the PC for its printers…'
                                            : a.inventory_at ? `${a.reported_printers.length} printer(s) · ${a.reported_label_files.length} .btw file(s) · listed ${formatWhen(a.inventory_at)}`
                                                : 'printers not reported yet'}
                                    </div>
                                </td>
                                <td className="py-2 px-3 text-xs">{a.bartender_ok == null ? '—' : a.bartender_ok ? <span className="text-emerald-700">OK</span> : <span className="text-red-700">{a.bartender_message}</span>}</td>
                                <td className="py-2 px-3 text-right whitespace-nowrap">
                                    <button onClick={() => refreshInventory(a)} disabled={!!refreshing[a.id] || !a.is_active} className="px-2 py-0.5 text-xs rounded border border-gray-300 hover:bg-gray-100 mr-1.5 disabled:opacity-50">{refreshing[a.id] ? 'Refreshing…' : 'Refresh list'}</button>
                                    <button onClick={() => renewToken(a)} className="px-2 py-0.5 text-xs rounded border border-gray-300 hover:bg-gray-100 mr-1.5">New token</button>
                                    <button onClick={() => toggleAgent(a)} className="px-2 py-0.5 text-xs rounded border border-gray-300 hover:bg-gray-100">{a.is_active ? 'Disable' : 'Enable'}</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>

            <section className="bg-white rounded-lg border shadow-sm">
                <div className="p-4 border-b flex justify-between items-center">
                    <h2 className="font-semibold text-gray-800 flex items-center gap-2"><FiPrinter className="text-gray-400" /> Printers</h2>
                    <button onClick={() => { setForm({ ...EMPTY_PRINTER, agent_id: agents[0]?.id || '' }); setFormError(null); }} disabled={agents.length === 0}
                        className="px-3 py-2 text-sm font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-1 disabled:opacity-50"><FiPlus /> Add printer</button>
                </div>
                <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase"><tr>
                        <th className="py-2 px-3 text-left">Printer</th><th className="py-2 px-3 text-left">Windows printer</th><th className="py-2 px-3 text-left">Label file / data source</th>
                        <th className="py-2 px-3 text-left">Agent</th><th className="py-2 px-3 text-left">Status</th><th className="py-2 px-3" />
                    </tr></thead>
                    <tbody className="divide-y divide-gray-100">
                        {printers.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-gray-400">No printers yet.</td></tr>}
                        {printers.map(p => (
                            <tr key={p.id} className={p.is_active ? '' : 'opacity-50'}>
                                <td className="py-2 px-3 font-semibold">{p.name}{p.is_default && <span className="ml-1.5 text-[10px] font-bold uppercase bg-indigo-50 text-indigo-700 border border-indigo-200 rounded px-1">default</span>}{p.location && <div className="text-xs font-normal text-gray-500">{p.location}</div>}</td>
                                <td className="py-2 px-3">{p.windows_printer_name}</td>
                                <td className="py-2 px-3 text-xs font-mono break-all">{p.btw_path}<div className="text-gray-500">{p.data_source_name}</div></td>
                                <td className="py-2 px-3">{p.agent_name}</td>
                                <td className="py-2 px-3">{p.is_active ? <PrinterStatus printer={p} /> : 'Inactive'}</td>
                                <td className="py-2 px-3 text-right"><button onClick={() => { setForm({ ...p }); setFormError(null); }} className="p-1.5 rounded hover:bg-gray-100" title="Edit"><FiEdit2 size={14} /></button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>

            {form && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg border border-gray-200">
                        <div className="flex items-center justify-between p-5 border-b border-gray-100">
                            <h2 className="text-base font-bold text-gray-900">{form.id ? 'Edit printer' : 'Add printer'}</h2>
                            <button onClick={() => setForm(null)} className="p-1.5 rounded-lg hover:bg-gray-100"><FiX /></button>
                        </div>
                        <div className="p-5 grid grid-cols-1 gap-3">
                            <Field label="Name" hint="What users pick when printing. Add one entry per label design, e.g. “Citizen – Washcare 30x60”.">
                                <input className={inputCls} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Citizen – Washcare matrix" />
                            </Field>
                            <Field label="Print agent">
                                <select className={inputCls} value={form.agent_id} onChange={e => setForm({ ...form, agent_id: e.target.value })}>
                                    {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                            </Field>
                            {formAgent && (
                                <div className="text-xs text-gray-500 flex items-center justify-between gap-2 -mt-1">
                                    <span>
                                        {refreshing[formAgent.id] ? 'Asking the BarTender PC for its printers and label files…'
                                            : formAgent.inventory_at ? `Lists from ${formAgent.machine_name || 'the PC'}, ${formatWhen(formAgent.inventory_at)}.`
                                                : 'This agent has not reported its printers yet — install and start it on the BarTender PC, then Refresh.'}
                                    </span>
                                    <button type="button" onClick={() => refreshInventory(formAgent)} disabled={!!refreshing[formAgent.id]}
                                        className="text-indigo-600 hover:underline whitespace-nowrap disabled:opacity-50 flex items-center gap-1">
                                        {refreshing[formAgent.id] && <FiLoader className="animate-spin" size={11} />} Refresh list
                                    </button>
                                </div>
                            )}
                            <Field label="Windows printer" hint="Printers installed on the BarTender PC.">
                                <PickOrType options={printerOptions} value={form.windows_printer_name} placeholder='Exactly as Windows shows it, e.g. "Citizen CL-S631"'
                                    onChange={v => setForm(f => ({ ...f, windows_printer_name: v, name: f.name || v }))} />
                            </Field>
                            <Field label="Label file (.btw)" hint="Found in C:\Labels, Desktop and Documents on the BarTender PC. Keep the label in C:\Labels.">
                                <PickOrType options={fileOptions} value={form.btw_path} mono placeholder="C:\Labels\garment.btw"
                                    onChange={v => setForm(f => ({ ...f, btw_path: v }))} />
                            </Field>
                            <Field label="Label's database connection name" hint="BarTender Designer → Database Connection Setup."><input className={inputCls} value={form.data_source_name} onChange={e => setForm({ ...form, data_source_name: e.target.value })} /></Field>
                            <Field label="Location (optional)"><input className={inputCls} value={form.location || ''} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Cutting table 1" /></Field>
                            <div className="flex gap-5 text-sm">
                                <label className="flex items-center gap-2"><input type="checkbox" checked={!!form.is_default} onChange={e => setForm({ ...form, is_default: e.target.checked })} /> Default printer</label>
                                <label className="flex items-center gap-2"><input type="checkbox" checked={form.is_active !== false} onChange={e => setForm({ ...form, is_active: e.target.checked })} /> Active</label>
                            </div>
                            {formError && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100">{formError}</p>}
                        </div>
                        <div className="flex gap-3 px-5 pb-5">
                            <button onClick={() => setForm(null)} className="flex-1 px-4 py-2.5 text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">Cancel</button>
                            <button onClick={savePrinter} disabled={saving} className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50">Save</button>
                        </div>
                    </div>
                </div>
            )}
            {token && <TokenBox token={token} agentName={token.name} onClose={() => setToken(null)} />}
        </div>
    );
};

export default LabelPrinterSetupPage;
