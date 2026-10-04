import { Link } from 'react-router-dom';
import { Palette, SlidersHorizontal, Tags, Package, ClipboardList, Layers } from 'lucide-react';
import { PageHeader, useMastersPermissions } from '../components/ui';

const TILES = [
    { to: 'masters/garment-colours', title: 'Garment colours', text: 'Buyer-facing colour names used on orders and BOMs.', icon: Palette, area: 'colours' },
    { to: 'masters/trim-settings', title: 'Trim settings (tones)', text: 'Tone groups (Dark / Light …) and each colour\'s tone.', icon: SlidersHorizontal, area: 'colours' },
    { to: 'masters/trim-types', title: 'Trim types', text: 'Thread, button, zipper … and their specification fields.', icon: Tags, area: 'trims' },
    { to: 'masters/trim-items', title: 'Trim items & stock', text: 'One item per vendor item (brand + code), units and stock.', icon: Package, area: 'trims' },
    { to: 'masters/opening-stock', title: 'Opening stock', text: 'Enter the physical count once per item.', icon: ClipboardList, area: 'stock' },
    { to: 'masters/fabric-items', title: 'Fabric items', text: 'Mill + article + shade, with composition, GSM and width.', icon: Layers, area: 'fabric' },
];

export default function V3HomePage() {
    const perms = useMastersPermissions();
    return (
        <div>
            <PageHeader title="Version 3.0" subtitle="Masters are the first part of 3.0. Orders, BOM and planning follow, portal by portal." />
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {TILES.map(t => (
                    <Link key={t.to} to={t.to} className="bg-white border border-slate-200 hover:border-indigo-400 rounded-xl p-4 flex gap-3 transition">
                        <span className="w-10 h-10 shrink-0 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center"><t.icon size={18} /></span>
                        <span className="min-w-0">
                            <span className="block font-bold text-slate-800">{t.title}</span>
                            <span className="block text-sm text-slate-500">{t.text}</span>
                            <span className={`inline-block mt-1.5 text-[11px] font-bold px-2 py-0.5 rounded ${perms[t.area] ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                {perms[t.area] ? 'You can edit' : 'View only'}
                            </span>
                        </span>
                    </Link>
                ))}
            </div>
        </div>
    );
}
