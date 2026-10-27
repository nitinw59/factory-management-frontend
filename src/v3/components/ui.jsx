// Small shared pieces for Version 3.0 screens.
import { useEffect, useState } from 'react';
import { Search, AlertTriangle, Loader2 } from 'lucide-react';
import { mastersApi } from '../api/mastersApi';
import { useNavigate } from 'react-router-dom';

// A table row that opens its record (16 Oct 2026: "the whole row must open the record" — no arrow column).
// Usage: const rowLink = useRowLink(); <tr {...rowLink(`/v3/…/${id}`)} className="… cursor-pointer hover:bg-slate-50 focus-visible:bg-indigo-50 focus:outline-none">
// Links, buttons and inputs inside the row keep their own action; selecting text doesn't open; Cmd / Ctrl-click
// or middle-click opens a new tab; Enter opens it from the keyboard.
const INNER = 'a, button, input, select, textarea, label, [role="button"]';
export function useRowLink() {
    const navigate = useNavigate();
    return (to) => ({
        role: 'link',
        tabIndex: 0,
        onClick: (e) => {
            if (e.target.closest(INNER) || window.getSelection()?.toString()) return;
            if (e.metaKey || e.ctrlKey) window.open(to, '_blank', 'noopener'); else navigate(to);
        },
        onAuxClick: (e) => { if (e.button === 1 && !e.target.closest(INNER)) window.open(to, '_blank', 'noopener'); },
        onKeyDown: (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) navigate(to); },
    });
}

export const PageHeader = ({ title, subtitle, actions }) => (
    <div className="flex flex-wrap items-start gap-3 mb-5">
        <div className="min-w-0">
            <h1 className="text-2xl font-black text-slate-900">{title}</h1>
            {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
);

export const SearchInput = ({ value, onChange, placeholder = 'Search…' }) => (
    <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className="pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg w-64 focus:outline-none focus:border-indigo-500"
        />
    </div>
);

export const Field = ({ label, hint, children }) => (
    <label className="block">
        <span className="block text-xs font-bold text-slate-600 mb-1">{label}</span>
        {children}
        {hint && <span className="block text-[11px] text-slate-400 mt-1">{hint}</span>}
    </label>
);

export const inputCls = 'w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-500 disabled:bg-slate-100';

export const PrimaryButton = ({ children, busy, ...props }) => (
    <button type="button" {...props}
        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50">
        {busy && <Loader2 size={14} className="animate-spin" />}{children}
    </button>
);

export const SecondaryButton = ({ children, ...props }) => (
    <button type="button" {...props}
        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg disabled:opacity-50">
        {children}
    </button>
);

export const ErrorBox = ({ text }) => text ? (
    <div className="flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
        <AlertTriangle size={15} className="shrink-0 mt-0.5" /> <span>{text}</span>
    </div>
) : null;

export const ActiveBadge = ({ active }) => (
    <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
        {active ? 'Active' : 'Inactive'}
    </span>
);

export const Loading = () => (
    <div className="flex justify-center py-12"><Loader2 className="animate-spin text-indigo-500" /></div>
);

// Quantity with thousands separators and up to 3 decimals.
export const fmtQty = (n) => Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });

// What the signed-in user may edit (trims / colours / fabric / stock).
export function useMastersPermissions() {
    const [perms, setPerms] = useState({ trims: false, trimsAdd: false, trimRequest: false, trimApprove: false, colours: false, fabric: false, stock: false });
    useEffect(() => {
        mastersApi.permissions().then(res => setPerms(res.data)).catch(() => {});
    }, []);
    return perms;
}
