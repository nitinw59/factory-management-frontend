// Shared bits for the 3.0 store (spares and general items): units, labels,
// money, permissions hook, issue slip PDF and Excel exports.
import { useEffect, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { storeApi } from '../api/storeApi';

export const UNITS = ['pcs', 'set', 'pair', 'box', 'pkt', 'roll', 'm', 'kg', 'g', 'l', 'ml'];
export const WHOLE_UNITS = ['pcs', 'set', 'pair', 'box', 'pkt', 'roll'];
export const GROUP_LABEL = { SPARE: 'Spare', GENERAL: 'General' };
export const TARGET_LABEL = { PERSON: 'Person', MACHINE: 'Machine', DEPARTMENT: 'Department' };
export const LEDGER_LABEL = { OPENING: 'Opening', GRN: 'Goods receipt', ISSUE: 'Issue', RETURN: 'Return', ADJUSTMENT: 'Adjustment' };
export const inr = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmt = (v, uom) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: WHOLE_UNITS.includes(uom) ? 0 : 3 });

export function useStorePermissions() {
    const [perms, setPerms] = useState({ items: false, stock: false, requisition: false, view: false });
    useEffect(() => { storeApi.permissions().then(res => setPerms(res.data)).catch(() => {}); }, []);
    return perms;
}

const safe = (s) => String(s || '').replace(/[^A-Za-z0-9-]+/g, '-');

// Issue slip PDF: letterhead, slip header, lines with qty / cost / value, signatures.
export function exportIssueSlipPdf(slip, company) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    let y = 14;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
    doc.text(company?.trade_name || company?.legal_name || 'Store issue slip', 14, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    const addr = [company?.address_line1, company?.address_line2, [company?.city, company?.state].filter(Boolean).join(', ')].filter(Boolean).join(', ');
    if (addr) { y += 5; doc.text(addr, 14, y, { maxWidth: 182 }); }
    y += 8; doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text(`STORE ISSUE SLIP  ${slip.issue_no}`, 14, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    y += 6; doc.text(`Date: ${slip.issue_date}`, 14, y); doc.text(`Issued by: ${slip.issued_by_name || '—'}`, 110, y);
    y += 5; doc.text(`Issued to (${TARGET_LABEL[slip.target_type]}): ${slip.target_name}`, 14, y);
    if (slip.department_name) { y += 5; doc.text(`Department: ${slip.department_name}`, 14, y); }
    if (slip.purpose) { y += 5; doc.text(`Purpose: ${slip.purpose}`, 14, y); }
    if (slip.recover_from_salary) { y += 5; doc.setFont('helvetica', 'bold'); doc.text('To be recovered from salary', 14, y); doc.setFont('helvetica', 'normal'); }
    autoTable(doc, {
        startY: y + 4,
        head: [['#', 'Item', 'Qty', 'Unit', 'Returned', 'Rate (Rs)', 'Value (Rs)']],
        body: slip.lines.map(l => [l.line_no, l.label, fmt(l.qty, l.uom), l.uom, l.returned_qty ? fmt(l.returned_qty, l.uom) : '', inr(l.unit_cost), inr(l.value)]),
        foot: [['', 'Total', '', '', slip.returned_value ? `-${inr(slip.returned_value)}` : '', '', inr(slip.net_value)]],
        styles: { fontSize: 8 }, headStyles: { fillColor: [79, 70, 229] }, footStyles: { fillColor: [241, 245, 249], textColor: 20 },
        columnStyles: { 2: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
    });
    const end = doc.lastAutoTable.finalY + 22;
    doc.text('Issued by', 14, end); doc.text('Received by', 90, end); doc.text('Approved by', 160, end);
    doc.save(`${safe(slip.issue_no)}.pdf`);
}

// Issue register (one row per slip line) for a date range.
export function exportIssueRegister(rows, from, to) {
    const data = rows.map(r => ({
        Date: r.issue_date, Slip: r.issue_no, 'Issued to': r.target_name, Type: TARGET_LABEL[r.target_type], Department: r.department_name || '',
        Purpose: r.purpose || '', 'Recover from salary': r.recover_from_salary ? 'Yes' : '', Group: GROUP_LABEL[r.item_group], Category: r.category_name,
        Make: r.make || '', Code: r.code, Item: r.name, Qty: r.qty, Returned: r.returned_qty, Unit: r.uom, 'Rate (Rs)': r.unit_cost,
        'Value (Rs)': r.value, 'Net value (Rs)': Math.round((r.qty - r.returned_qty) * r.unit_cost * 100) / 100,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Issues');
    XLSX.writeFile(wb, `store-issues-${from || 'start'}-to-${to || 'today'}.xlsx`);
}

// Store stock with value.
export function exportStock(items, today) {
    const data = items.map(i => ({
        Group: i.group_label, Category: i.category_name, Make: i.make || '', Code: i.code, Item: i.name, Unit: i.usage_uom, Location: i.location || '',
        'On hand': i.on_hand, 'Avg cost (Rs)': i.avg_cost, 'Value (Rs)': i.stock_value, 'Min stock': i.min_stock, 'Below min': i.below_min ? 'Yes' : '', Active: i.is_active ? 'Yes' : 'No',
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Store stock');
    XLSX.writeFile(wb, `store-stock-${today}.xlsx`);
}
