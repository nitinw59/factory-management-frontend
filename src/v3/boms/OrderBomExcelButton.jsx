// Order BOM downloads (15–16 Oct 2026): Excel or PDF, each Detailed or Summary.
import { FileDown } from 'lucide-react';
import BomExcelChoice from './BomExcelChoice';
import { downloadOrderBomV2 } from './bomV2';

export default function OrderBomExcelButton({ planningApi, orderId, onError, disabled, label = 'Order BOM Excel' }) {
    return <BomExcelChoice disabled={disabled} label={label} title="Order BOM as Excel: detailed or summary"
        onPick={(summary) => downloadOrderBomV2(planningApi, orderId, 'xlsx', { summary }).catch(err => onError?.(err))} />;
}

export function OrderBomPdfButton({ planningApi, orderId, onError, disabled, label = 'Order BOM PDF' }) {
    return <BomExcelChoice disabled={disabled} label={label} icon={FileDown} title="Order BOM as PDF: detailed or summary"
        onPick={(summary) => downloadOrderBomV2(planningApi, orderId, 'pdf', { summary }).catch(err => onError?.(err))} />;
}
