// Downloading a signed handover as an issue-slip PDF.
// The history register and the loader's on-device pickup list both offer the same
// download, so the handover → issue-slip mapping lives here rather than in either page.

import { trimKitsApi } from '../../api/trimKitsApi';
import { adminApi } from '../../api/adminApi';
import { kitBatchLabel } from './kitStatusConfig';
import { downloadIssueSlipPdf } from '../store_manager/issueSlipPdfGenerator';

// Company profile for the slip header — cached once a real profile is fetched.
// A failed/empty fetch is NOT cached, so a later download retries (the endpoint may be
// briefly unreachable or gated); the PDF only falls back to generic branding if every try fails.
let _companyProfile = null;
export const getCompanyProfileOnce = async () => {
    if (_companyProfile) return _companyProfile;
    try {
        const r = await adminApi.getCompanyProfile();
        if (r.data && Object.keys(r.data).length) _companyProfile = r.data;
        return r.data ?? null;
    } catch {
        return null;
    }
};

// getKitHistoryDetail payload → the shape generateIssueSlipPdf expects.
export const issueFromHandover = (data) => ({
    id: data.issue_id,
    issue_number: data.issue_number,
    created_at: data.created_at,
    batch_label: kitBatchLabel(data),
    issued_to_name: data.issued_to_name,
    issued_to_department: data.delivery_line_name ? `Production line: ${data.delivery_line_name}` : undefined,
    issued_by_name: data.issued_by_name,
    total_value: data.total_value,
    lines: (data.lines || []).map(l => ({
        item_kind: 'trim',
        item_name: l.item_name,
        item_code: l.item_code,
        variant_color_name: l.color_name,
        variant_color_number: l.color_number,
        variant_size: l.variant_size,
        qty: l.qty,
        unit_cost: l.unit_cost,
        line_value: l.line_value,
    })),
});

export const downloadHandover = async (data) =>
    downloadIssueSlipPdf({ company: await getCompanyProfileOnce(), issue: issueFromHandover(data) });

export const downloadHandoverById = async (issueId) => {
    const r = await trimKitsApi.getKitHistoryDetail(issueId);
    return downloadHandover(r.data);
};

// On-device pickup entries written before issue_id was recorded only carry the slip
// number, so fall back to finding the issue on that order's handover register.
export const resolveIssueId = async (entry) => {
    if (entry?.issue_id != null) return entry.issue_id;
    if (!entry?.orderId || !entry?.issue_number) return null;
    const r = await trimKitsApi.getKitHistory({ order_id: entry.orderId });
    return (r.data || []).find(row => row.issue_number === entry.issue_number)?.issue_id ?? null;
};
