// "Report a problem" (17 Oct 2026; docs/PROBLEM_REPORTS_V3_PLAN.md): a button in the 3.0 top bar on every page.
// A picture of the screen is taken first (before the box opens); then one question — "Can you continue your work?"
// (Blocked · Slowed down · Something is wrong · An idea) — a title and what happened, optional images (attach or
// paste). Page, heading, roles, build, browser, the last failed API calls and browser errors go with it.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LifeBuoy, Ban, Hourglass, AlertTriangle, Lightbulb, ImagePlus, X, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
import Modal from '../../shared/Modal';
import { problemsApi } from '../api/problemsApi';
import { apiError } from '../api/mastersApi';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox } from '../components/ui';
import { captureContext, captureScreen, installCapture } from './capture';

export const IMPACTS = [
    ['BLOCKED', "I'm blocked", "I can't continue my work", Ban, 'border-rose-400 bg-rose-50 text-rose-800'],
    ['SLOWED', 'Slowed down', 'I can work around it, but it costs time', Hourglass, 'border-amber-400 bg-amber-50 text-amber-900'],
    ['WRONG', 'Something is wrong', 'A wrong number, message or screen', AlertTriangle, 'border-sky-400 bg-sky-50 text-sky-900'],
    ['IDEA', 'An idea', 'Something that would make work easier', Lightbulb, 'border-emerald-400 bg-emerald-50 text-emerald-900'],
];
const MAX_FILES = 5;
const okType = (f) => ['image/png', 'image/jpeg', 'image/webp'].includes(f.type) && f.size <= 8 * 1024 * 1024;

export function FileThumbs({ files, onRemove }) {
    const [urls, setUrls] = useState([]);
    useEffect(() => { const u = files.map(f => URL.createObjectURL(f)); setUrls(u); return () => u.forEach(URL.revokeObjectURL); }, [files]);
    if (!files.length) return null;
    return (
        <div className="flex flex-wrap gap-2">
            {files.map((f, i) => (
                <div key={i} className="relative">
                    <img src={urls[i]} alt={f.name} className="h-16 w-24 object-cover rounded border border-slate-200" />
                    {/^screen-capture/.test(f.name) && <span className="absolute left-0 bottom-0 text-[9px] font-bold bg-slate-900/70 text-white px-1 rounded-tr">screen</span>}
                    <button type="button" onClick={() => onRemove(i)} className="absolute -top-1.5 -right-1.5 bg-white rounded-full border border-slate-300 p-0.5" aria-label="Remove image"><X size={11} /></button>
                </div>
            ))}
        </div>
    );
}

// Image picker that also takes pasted images (Ctrl+V / ⌘V while the box is open).
export function useImages() {
    const [files, setFiles] = useState([]);
    const [err, setErr] = useState('');
    const add = (list) => {
        setErr('');
        const picked = [...list].filter(f => f && f.type?.startsWith('image/'));
        const bad = picked.filter(f => !okType(f));
        if (bad.length) setErr('Images only (PNG, JPG, WEBP), up to 8 MB each.');
        setFiles(prev => [...prev, ...picked.filter(okType)].slice(0, MAX_FILES));
    };
    useEffect(() => {
        const onPaste = (e) => { const items = [...(e.clipboardData?.files || [])]; if (items.length) add(items); };
        window.addEventListener('paste', onPaste);
        return () => window.removeEventListener('paste', onPaste);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return { files, setFiles, add, err, remove: (i) => setFiles(files.filter((_, j) => j !== i)) };
}

function ReportBox({ onClose, screen }) {
    const [impact, setImpact] = useState(null);
    const [title, setTitle] = useState('');
    const [text, setText] = useState('');
    const imgs = useImages();
    const [ctx] = useState(() => captureContext());
    const [showCtx, setShowCtx] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [done, setDone] = useState(null);
    const fileRef = useRef(null);
    const { setFiles } = imgs;
    useEffect(() => { if (screen) setFiles([screen]); }, [screen, setFiles]);
    const idea = impact === 'IDEA';

    const submit = async () => {
        setBusy(true); setError('');
        try {
            const res = await problemsApi.create({ kind: idea ? 'IDEA' : 'PROBLEM', impact: idea ? undefined : impact, title: title.trim(), description: text.trim(), ...ctx }, imgs.files);
            setDone(res.data);
        } catch (err) { setError(apiError(err, 'Could not send the report.')); }
        finally { setBusy(false); }
    };

    if (done) {
        return (
            <Modal title="Thank you" onClose={onClose}>
                <div className="w-[min(420px,85vw)] text-center space-y-3 py-2">
                    <CheckCircle2 size={36} className="mx-auto text-emerald-500" />
                    <p className="font-bold text-slate-800">{done.kind === 'IDEA' ? 'Idea' : 'Problem'} #{done.id} sent to the factory admin.</p>
                    <p className="text-sm text-slate-600">You'll see answers under <b>My work → Answers to your reports</b>.</p>
                    <div className="flex justify-center gap-2"><Link to={`/v3/problems/${done.id}`} onClick={onClose} className="text-sm font-bold text-indigo-700 underline">Open #{done.id}</Link></div>
                </div>
            </Modal>
        );
    }
    return (
        <Modal title="Report a problem" onClose={onClose}>
            <div className="w-[min(560px,90vw)] space-y-3">
                <p className="text-sm font-bold text-slate-700">Can you continue your work?</p>
                <div className="grid grid-cols-2 gap-2">
                    {IMPACTS.map(([k, label, hint, Icon, cls]) => (
                        <button key={k} type="button" onClick={() => setImpact(k)} aria-pressed={impact === k}
                            className={`text-left rounded-xl border-2 px-3 py-2 transition ${impact === k ? cls : 'border-slate-200 hover:border-slate-300 text-slate-700'}`}>
                            <span className="flex items-center gap-1.5 font-bold text-sm"><Icon size={15} /> {label}</span>
                            <span className="block text-[11px] opacity-80">{hint}</span>
                        </button>
                    ))}
                </div>
                {impact && <>
                    <Field label={idea ? 'Your idea in a few words *' : 'What went wrong, in a few words *'}><input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} maxLength={200} autoFocus placeholder={idea ? 'e.g. Show the supplier\'s last rate on the PO line' : 'e.g. Save on the PO gives an error'} /></Field>
                    <Field label={idea ? 'How would it help? *' : 'What were you doing, and what happened? *'}>
                        <textarea className={`${inputCls} min-h-[90px]`} value={text} onChange={e => setText(e.target.value)} maxLength={5000} placeholder={idea ? '' : 'Steps, what you expected, what you saw'} />
                    </Field>
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <SecondaryButton onClick={() => fileRef.current?.click()} disabled={imgs.files.length >= MAX_FILES}><ImagePlus size={14} /> Add image</SecondaryButton>
                            <span className="text-xs text-slate-500">or paste one (Ctrl+V). {screen ? 'A picture of the screen is attached — remove it if it shows something private.' : ''}</span>
                            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={e => { imgs.add(e.target.files); e.target.value = ''; }} />
                        </div>
                        <FileThumbs files={imgs.files} onRemove={imgs.remove} />
                        {imgs.err && <p className="text-xs text-rose-700">{imgs.err}</p>}
                    </div>
                    <button type="button" onClick={() => setShowCtx(!showCtx)} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
                        {showCtx ? <ChevronDown size={12} /> : <ChevronRight size={12} />} What else is sent
                    </button>
                    {showCtx && (
                        <ul className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 space-y-0.5">
                            <li>Page: <b>{ctx.page_heading || '—'}</b> · {ctx.page_path}</li>
                            <li>Your roles, app build {ctx.app_build}, browser, screen {ctx.context.viewport}</li>
                            <li>{ctx.context.api_errors.length} recent failed request(s){ctx.context.api_errors.length ? `: last "${ctx.context.api_errors[ctx.context.api_errors.length - 1].message || ctx.context.api_errors[ctx.context.api_errors.length - 1].status}"` : ''} · {ctx.context.console_errors.length} browser error(s)</li>
                        </ul>
                    )}
                </>}
                <ErrorBox text={error} />
                <div className="flex justify-end gap-2">
                    <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
                    <PrimaryButton busy={busy} disabled={busy || !impact || !title.trim() || !text.trim()} onClick={submit}>Send</PrimaryButton>
                </div>
            </div>
        </Modal>
    );
}

export default function ReportProblemButton() {
    const [open, setOpen] = useState(false);
    const [screen, setScreen] = useState(null);
    const [taking, setTaking] = useState(false);
    useEffect(() => { installCapture(); }, []);
    const start = async () => {
        setTaking(true);
        const shot = await captureScreen();   // before the box covers the page
        setScreen(shot); setTaking(false); setOpen(true);
    };
    return (
        <>
            <button type="button" onClick={start} disabled={taking} title="Report a problem or an idea"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 border border-slate-200 hover:border-amber-300 hover:text-amber-700 px-2.5 py-1.5 rounded-lg disabled:opacity-60">
                <LifeBuoy size={13} /> <span className="hidden sm:inline">{taking ? 'One moment…' : 'Report a problem'}</span>
            </button>
            {open && <ReportBox screen={screen} onClose={() => { setOpen(false); setScreen(null); }} />}
        </>
    );
}
