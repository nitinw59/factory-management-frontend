// Version 3.0 menu: every page once, with the access key the backend's /api/v3/me
// answers for (controllers/v3/access.js pageRoles). The layout shows only the
// pages the user may open; the home page shows them as tiles; the page guard
// maps any /v3 address (detail pages too) to its key by the longest prefix.
import { Home, Radar, Building2, Ruler, Network, MonitorSmartphone, Bug, Landmark, Palette, SlidersHorizontal, Tags, Package, ClipboardList, Layers, Shirt, Route, ClipboardCheck, FileText, Calculator, Settings2, Boxes, ShoppingCart, FileCheck, Gauge, Warehouse, CalendarDays, Truck, ShoppingBag, PackageCheck, PackageOpen, BadgeCheck, Wrench, PackageMinus, ListRestart, ClipboardPlus, PackageX, Receipt, BarChart3, Forklift, Scissors, ScanLine, RotateCcw, Container, UserCog } from 'lucide-react';

export const NAV = [
    { to: '/v3', label: 'Home', icon: Home, end: true, key: 'home' },
    { section: 'Orders' },
    { to: '/v3/tracker', label: 'Order tracker', icon: Radar, key: 'tracker.orders', text: 'Every order from BOM to production, worst first' },
    { section: 'Masters' },
    { to: '/v3/masters/garment-colours', label: 'Garment colours', icon: Palette, key: 'masters.colours', text: 'Buyer-facing colour names on orders and BOMs' },
    { to: '/v3/masters/trim-settings', label: 'Trim settings (tones)', icon: SlidersHorizontal, key: 'masters.trimSettings', text: 'Tone groups and each colour\'s tone' },
    { to: '/v3/masters/trim-types', label: 'Trim types', icon: Tags, key: 'masters.trimTypes', text: 'Thread, button, zipper … and their fields' },
    { to: '/v3/masters/trim-items', label: 'Trim items & stock', icon: Package, key: 'masters.trimItems', text: 'Vendor items, units and stock' },
    { to: '/v3/masters/opening-stock', label: 'Opening stock', icon: ClipboardList, key: 'masters.openingStock', text: 'Physical count of trims, once per item' },
    { to: '/v3/masters/fabric-items', label: 'Fabric items', icon: Layers, key: 'masters.fabricItems', text: 'Mill + article + shade' },
    { to: '/v3/masters/fabric-stock', label: 'Fabric stock', icon: Warehouse, key: 'masters.fabricStock', text: 'Rolls with dye lot and width' },
    { section: 'Styles' },
    { to: '/v3/styles', label: 'Styles', icon: Shirt, key: 'styles.styles', text: 'Sizes, parts, route and BOMs per style' },
    { to: '/v3/stage-types', label: 'Stage types', icon: Route, key: 'styles.stageTypes', text: 'Production stages for style routes' },
    { to: '/v3/boms', label: 'BOMs', icon: ClipboardList, key: 'styles.boms', text: 'Every BOM by status — drafts first' },
    { to: '/v3/bom-approvals', label: 'BOM approvals', icon: ClipboardCheck, key: 'styles.bomApprovals', text: 'BOMs waiting for approval' },
    { section: 'Sales' },
    { to: '/v3/sales-orders', label: 'Sales orders', icon: FileText, key: 'sales.orders', text: 'Orders with colour × size quantities' },
    { to: '/v3/sales-order-approvals', label: 'Order approvals', icon: ClipboardCheck, key: 'sales.approvals', text: 'Orders waiting for approval' },
    { section: 'Planning' },
    { to: '/v3/planning', label: 'Material requirements', icon: Calculator, end: true, key: 'planning.requirements', text: 'What each order needs' },
    { to: '/v3/planning/readiness', label: 'Material readiness', icon: Gauge, key: 'planning.readiness', text: 'Ready / short per order, cutting gate' },
    { to: '/v3/planning/milestones', label: 'Order milestones', icon: CalendarDays, key: 'planning.milestones', text: 'Planned vs actual dates' },
    { to: '/v3/planning/position', label: 'Material position', icon: Boxes, key: 'planning.position', text: 'Stock, allocated and on order per item' },
    { to: '/v3/planning/buy-list', label: 'Buy list', icon: ShoppingCart, key: 'planning.buyList', text: 'What to buy across orders' },
    { to: '/v3/planning/purchase-requisitions', label: 'Purchase requisitions', icon: FileCheck, key: 'planning.requisitions', text: 'Requests to purchasing' },
    { to: '/v3/planning/purchase-requisitions?status=SUBMITTED', label: 'Requisition approvals', icon: ClipboardCheck, key: 'planning.requisitionApprovals', text: 'Requisitions waiting for approval' },
    { to: '/v3/planning/settings', label: 'Planning settings', icon: Settings2, key: 'planning.settings', text: 'Cut allowance and lead times' },
    { section: 'Purchasing' },
    { to: '/v3/purchasing/orders', label: 'Purchase orders', icon: ShoppingBag, key: 'purchasing.orders', text: 'POs to suppliers' },
    { to: '/v3/purchasing/receive', label: 'Receive goods (GRN)', icon: PackageOpen, key: 'purchasing.receive', text: 'Goods in against a PO' },
    { to: '/v3/purchasing/grns', label: 'Goods receipts', icon: PackageCheck, key: 'purchasing.grns', text: 'GRNs and their status' },
    { to: '/v3/purchasing/grns?status=PENDING_APPROVAL', label: 'GRN approvals', icon: BadgeCheck, key: 'purchasing.grnApprovals', text: 'Receipts over tolerance' },
    { to: '/v3/purchasing/return-notes', label: 'Returns to supplier', icon: PackageX, key: 'purchasing.returns', text: 'Rejected goods going back' },
    { to: '/v3/purchasing/invoices', label: 'Supplier invoices', icon: Receipt, key: 'purchasing.invoices', text: 'Three-way match' },
    { to: '/v3/purchasing/suppliers', label: 'Suppliers', icon: Truck, key: 'purchasing.suppliers', text: 'Supplier master' },
    { to: '/v3/purchasing/reports', label: 'Purchasing reports', icon: BarChart3, key: 'purchasing.reports', text: 'Open, overdue, prices, suppliers' },
    { section: 'Production' },
    { to: '/v3/cutting', label: 'Cutting', icon: Scissors, key: 'production.cutting', text: 'Cut batches, lays and pieces' },
    { to: '/v3/production/loading', label: 'Line loading', icon: Container, key: 'production.loading', text: 'Load sizes onto lines' },
    { to: '/v3/production/check', label: 'Numbering / stage check', icon: ScanLine, key: 'production.check', text: 'Check pieces, bundles and garments' },
    { to: '/v3/production/recuts', label: 'Re-cuts', icon: RotateCcw, key: 'production.recuts', text: 'Replacements for rejected pieces' },
    { section: 'Production store' },
    { to: '/v3/material-issue', label: 'Material issue', icon: Forklift, key: 'issue.materialIssue', text: 'Fabric and trims to production' },
    { section: 'Store (spares & general)' },
    { to: '/v3/store/items', label: 'Store items & stock', icon: Wrench, key: 'store.items', text: 'Spares and general items' },
    { to: '/v3/store/issues', label: 'Issue slips', icon: PackageMinus, key: 'store.issues', text: 'Store issues and returns' },
    { to: '/v3/store/reorder', label: 'Reorder list', icon: ListRestart, key: 'store.reorder', text: 'Items below reorder level' },
    { to: '/v3/store/requisitions', label: 'Store requisitions', icon: ClipboardPlus, key: 'store.requisitions', text: 'Requests to purchasing' },
    { to: '/v3/store/opening-stock', label: 'Store opening stock', icon: ClipboardList, key: 'store.openingStock', text: 'Physical count, once per item' },
    { section: 'Admin' },
    { to: '/v3/admin/access', label: 'Users & access', icon: UserCog, key: 'admin.access', text: 'Add / edit users (shared with 2.0) and extra 3.0 roles' },
    { to: '/v3/admin/customers', label: 'Customers', icon: Building2, key: 'admin.customers', text: 'Customer master, shared with 2.0' },
    { to: '/v3/admin/sizes', label: 'Sizes', icon: Ruler, key: 'admin.sizes', text: 'Sizes master, shared with 2.0' },
    { to: '/v3/admin/lines', label: 'Lines & line types', icon: Network, key: 'admin.lines', text: 'Production lines, their workstations, line types — shared with 2.0' },
    { to: '/v3/admin/workstations', label: 'Workstations', icon: MonitorSmartphone, key: 'admin.workstations', text: 'Workstations, operators, approval rights — shared with 2.0' },
    { to: '/v3/admin/defect-codes', label: 'Defect codes', icon: Bug, key: 'admin.defects', text: 'Defect codes and codes per line type — shared with 2.0' },
    { to: '/v3/admin/company-profile', label: 'Company profile', icon: Landmark, key: 'admin.company', text: 'Legal details, bank, logos — shared with 2.0' },
];

// Detail pages whose address doesn't start with their menu page's address.
const EXTRA = [
    { to: '/v3/planning/orders', key: 'planning.requirements' },
];

const pathOf = (to) => to.split('?')[0];
const ROUTES = [...NAV.filter(n => !n.section && n.key !== 'home' && !n.to.includes('?')), ...EXTRA];

// The access key of a /v3 address (null = open to every 3.0 user, e.g. home).
export function keyForPath(pathname) {
    let best = null;
    for (const r of ROUTES) {
        const p = pathOf(r.to);
        if ((pathname === p || pathname.startsWith(p + '/')) && (!best || p.length > pathOf(best.to).length)) best = r;
    }
    return best ? best.key : null;
}

// Menu for the user: allowed pages, sections without pages dropped.
export function visibleNav(menu) {
    const out = [];
    let section = null;
    for (const n of NAV) {
        if (n.section) { section = n; continue; }
        if (!menu?.[n.key]) continue;
        if (section) { out.push(section); section = null; }
        out.push(n);
    }
    return out;
}
