// src/modules/production/ProductionWorkflowDashboard.jsx
import React, { useState, useEffect, useMemo } from 'react';
import {
    Search, Plus, Box, FileText, ShoppingCart,
    Scissors, ChevronDown, Loader2, X,
    LayoutList, ChevronUp, DollarSign, Palette,
    Package, Truck, Layers, Trash2, Printer, Warehouse
} from 'lucide-react';
import { productionManagerApi } from '../../api/productionManagerApi';
import { accountingApi } from '../../api/accountingApi';
import { storeManagerApi } from '../../api/storeManagerApi';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import FabricIntakeForm from '../accounts/purchase/FabricIntakeForm';
import BatchDrilldownModal from './BatchDrilldownModal';
import BatchDispatchModal from '../depatch_portal/BatchDispatchModal';

// ─── SHARED UI ────────────────────────────────────────────────────────────────

const Modal = ({ title, onClose, size = 'max-w-2xl', children }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
        <div className={`bg-white rounded-2xl shadow-2xl w-full ${size} max-h-[90vh] flex flex-col`}>
            <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50 rounded-t-2xl">
                <h3 className="font-bold text-lg text-slate-800">{title}</h3>
                <button onClick={onClose} className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors">
                    <X size={20} />
                </button>
            </div>
            <div className="overflow-y-auto p-6">{children}</div>
        </div>
    </div>
);

const Spinner = () => (
    <div className="flex justify-center p-8">
        <Loader2 className="animate-spin h-8 w-8 text-blue-600" />
    </div>
);

const StatusBadge = ({ status }) => {
    const colors = {
        CONFIRMED:   'bg-blue-100 text-blue-700 border-blue-200',
        RECEIVED:    'bg-green-100 text-green-700 border-green-200',
        COMPLETED:   'bg-emerald-100 text-emerald-700 border-emerald-200',
        IN_PROGRESS: 'bg-indigo-100 text-indigo-700 border-indigo-200',
        ISSUED:      'bg-amber-100 text-amber-700 border-amber-200',
        DRAFT:       'bg-gray-100 text-gray-600 border-gray-200',
        PENDING:     'bg-yellow-50 text-yellow-700 border-yellow-200',
        PREPARED:    'bg-orange-100 text-orange-700 border-orange-200',
        SHIPPED:     'bg-purple-100 text-purple-700 border-purple-200',
        DISPATCHED:  'bg-purple-100 text-purple-700 border-purple-200',
        NOT_STARTED: 'bg-gray-100 text-gray-400 border-gray-200',
        READY:       'bg-teal-100 text-teal-700 border-teal-200',
    };
    return (
        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${colors[status] || 'bg-gray-100 text-gray-500 border-gray-200'}`}>
            {status ? status.replace(/_/g, ' ') : 'N/A'}
        </span>
    );
};

const Connector = ({ start, end }) => {
    const cp = Math.abs(end.x - start.x) * 0.5;
    const d  = `M ${start.x} ${start.y} C ${start.x + cp} ${start.y}, ${end.x - cp} ${end.y}, ${end.x} ${end.y}`;
    return <path d={d} fill="none" stroke="#cbd5e1" strokeWidth="1.5" />;
};

// ─── GRAPH CONSTANTS ──────────────────────────────────────────────────────────

const NODE_W_SO       = 155;
const NODE_W_PO       = 145;
const NODE_W_BATCH    = 215;
const NODE_W_DISPATCH_WIDE = 295;
const NODE_H_SO            = 160;
const NODE_H_PO            = 120;
const NODE_H_BATCH         = 160;
const NODE_H_DISPATCH      = 170;
const GAP_X           = 48;
const GAP_Y           = 10;
const PO_GAP_Y        = 18;
const MARGIN          = 20;

// ─── STAGE CHIP ───────────────────────────────────────────────────────────────

const STAGE_STYLE = {
    COMPLETED:   'bg-emerald-50 text-emerald-700 border-emerald-200',
    IN_PROGRESS: 'bg-indigo-50  text-indigo-700  border-indigo-200',
    NOT_STARTED: 'bg-gray-50    text-gray-400    border-gray-200',
};

const StagePipelineChip = ({ stage, onClick }) => {
    const style = STAGE_STYLE[stage.status] || STAGE_STYLE.NOT_STARTED;
    const short = (stage.line_type_name || '???').substring(0, 3).toUpperCase();
    const rs    = stage.roll_summary;
    const tip   = `${stage.line_type_name} — ${stage.status}${rs ? ` (${rs.completed}/${rs.total_on_line} rolls)` : ''}`;
    return (
        <button
            onClick={(e) => { e.stopPropagation(); onClick(stage); }}
            title={tip}
            className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[9px] font-bold hover:opacity-75 transition-opacity ${style}`}
        >
            {stage.status === 'IN_PROGRESS' && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse shrink-0" />}
            {stage.status === 'COMPLETED'   && <span className="leading-none">✓</span>}
            {short}
        </button>
    );
};

// ─── NODE COMPONENTS ──────────────────────────────────────────────────────────

const SalesOrderNode = ({ data, x, y, poCount, onAddPO, onEditSO }) => (
    <div
        className="absolute bg-white rounded-lg shadow-sm border border-l-4 border-l-blue-500 border-slate-200 p-2.5 flex flex-col"
        style={{ width: NODE_W_SO, height: NODE_H_SO, left: x, top: y }}
    >
        <div className="flex items-center gap-1.5 mb-1.5">
            <FileText size={11} className="text-blue-500 shrink-0" />
            <span className="font-bold text-slate-700 text-xs font-mono truncate">{data.order_number}</span>
        </div>
        <StatusBadge status={data.so_status} />
        <p className="text-[10px] text-slate-700 font-semibold truncate mt-1.5" title={data.customer_name}>{data.customer_name}</p>
        {data.buyer_po_number && (
            <p className="text-[9px] text-slate-400 mt-0.5 truncate">PO: {data.buyer_po_number}</p>
        )}
        <p className="text-[9px] text-slate-400 mt-auto mb-1.5 pt-1.5 border-t border-slate-100">
            {poCount} purchase order{poCount !== 1 ? 's' : ''}
        </p>
        {onAddPO && (
            <button
                onClick={(e) => { e.stopPropagation(); onAddPO(); }}
                className="flex items-center justify-center gap-1 w-full py-1 px-2 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors mb-1"
            >
                <Plus size={10} /> Add PO
            </button>
        )}
        {onEditSO && (
            <button
                onClick={(e) => { e.stopPropagation(); onEditSO(data.sales_order_id); }}
                className="flex items-center justify-center gap-1 w-full py-1 px-2 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
            >
                <FileText size={10} /> Edit SO
            </button>
        )}
    </div>
);

const PONode = ({ data, x, y, onCreateBatch, onViewDetails, onInward }) => (
    <div
        className="absolute bg-white rounded-lg shadow-sm border border-l-4 border-l-amber-500 border-slate-200 p-2.5 flex flex-col"
        style={{ width: NODE_W_PO, height: NODE_H_PO, left: x, top: y }}
    >
        <div
            className="flex items-center gap-1.5 mb-1.5 cursor-pointer hover:opacity-70"
            onClick={(e) => { e.stopPropagation(); onViewDetails && onViewDetails(data.po_id); }}
            title="View PO details"
        >
            <Package size={11} className="text-amber-500 shrink-0" />
            <span className="font-mono font-bold text-slate-800 text-xs truncate">{data.po_code}</span>
        </div>
        <StatusBadge status={data.po_status} />
        <p className="text-[10px] text-slate-500 truncate mt-1.5 mb-auto" title={data.supplier_name}>{data.supplier_name}</p>
        {data.expected_delivery_date && (
            <p className="text-[9px] text-slate-400 mt-0.5">Del: {new Date(data.expected_delivery_date).toLocaleDateString()}</p>
        )}
        {onInward && (
            <button
                onClick={(e) => { e.stopPropagation(); onInward(data); }}
                className="mt-1.5 flex items-center justify-center gap-1 w-full py-1 px-2 rounded text-[10px] font-bold bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 transition-colors"
            >
                <Warehouse size={10} /> Inward
            </button>
        )}
        {onCreateBatch && (
            <button
                onClick={(e) => { e.stopPropagation(); onCreateBatch(data); }}
                className="mt-1.5 flex items-center justify-center gap-1 w-full py-1 px-2 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
            >
                <Plus size={10} /> Create Batch
            </button>
        )}
    </div>
);

const BatchNode = ({ data, x, y, onStageClick, onDrilldown }) => {
    const done  = data.stage_progress?.completed || 0;
    const total = data.stage_progress?.total     || 0;
    const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
    return (
        <div
            className="absolute bg-white rounded-lg shadow-sm border border-l-4 border-l-emerald-500 border-slate-200 p-2.5 flex flex-col"
            style={{ width: NODE_W_BATCH, height: NODE_H_BATCH, left: x, top: y }}
        >
            <div className="flex justify-between items-start mb-1.5">
                <button
                    onClick={(e) => { e.stopPropagation(); onDrilldown && onDrilldown(data.batch_id, data.batch_code); }}
                    className="font-mono font-bold text-emerald-700 text-xs hover:underline truncate text-left"
                    title="Open batch details"
                >
                      {/* {data.batch_code} || */}
                   {data.batch_id ? `BATCH #${data.batch_id}` : '—'}
                </button>
                <StatusBadge status={data.overall_status || 'PENDING'} />
            </div>
            <p className="text-[10px] text-slate-600 font-semibold truncate mb-2" title={data.product_name}>{data.product_name || '—'}</p>
            <div className="flex flex-wrap gap-1 mb-auto">
                {(data.stage_pipeline || []).map(stage => (
                    <StagePipelineChip
                        key={stage.flow_id}
                        stage={stage}
                        onClick={(s) => onStageClick(s, data.batch_id)}
                    />
                ))}
            </div>
            <div className="mt-2">
                <div className="flex justify-between text-[9px] text-slate-400 mb-0.5">
                    <span>{done}/{total} stages</span>
                    <span>{pct}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
                    <div className="bg-indigo-500 h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
            </div>
            <div className="flex justify-between text-[9px] text-slate-400 mt-1.5 pt-1.5 border-t border-slate-100">
                <span>{data.total_rolls} rolls</span>
                <span>{data.total_primary_pieces || 0} pcs</span>
            </div>
        </div>
    );
};

const DispatchNode = ({ x, y, batches, onDispatch }) => {
    const [expanded, setExpanded] = useState(false);

    const hasBatches = batches.length > 0;
    const allDone    = hasBatches && batches.every(b => b.overall_status === 'COMPLETED');
    const anyActive  = batches.some(b => ['IN_PROGRESS', 'COMPLETED'].includes(b.overall_status));
    const borderCls  = allDone ? 'border-l-teal-500' : anyActive ? 'border-l-indigo-400' : hasBatches ? 'border-l-blue-400' : 'border-l-slate-200';
    const truckCls   = allDone ? 'text-teal-500' : anyActive ? 'text-indigo-400' : hasBatches ? 'text-blue-400' : 'text-slate-300';

    const visibleBatches = expanded ? batches : batches.slice(0, 4);
    const width  = expanded ? NODE_W_DISPATCH_WIDE + 80 : NODE_W_DISPATCH_WIDE;

    return (
        <div
            className={`absolute bg-white rounded-lg shadow-md border border-l-4 ${borderCls} border-slate-200 flex flex-col transition-all duration-200 z-10`}
            style={{
                width,
                minHeight: NODE_H_DISPATCH,
                height: expanded ? 'auto' : NODE_H_DISPATCH,
                left: x,
                top: y,
            }}
        >
            {/* Header — click to expand/collapse */}
            <button
                onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
                className="flex items-center justify-between px-2.5 pt-2.5 pb-1.5 w-full text-left hover:bg-slate-50/70 rounded-t-lg transition-colors shrink-0"
            >
                <div className="flex items-center gap-1.5">
                    <Truck size={12} className={truckCls} />
                    <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Dispatch</span>
                    {hasBatches && (
                        <span className="text-[9px] font-black bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full border border-slate-200">
                            {batches.length}
                        </span>
                    )}
                </div>
                {hasBatches && (
                    expanded
                        ? <ChevronUp size={11} className="text-slate-400 shrink-0" />
                        : <ChevronDown size={11} className="text-slate-400 shrink-0" />
                )}
            </button>

            {/* Batch list */}
            {!hasBatches ? (
                <p className="text-[9px] text-slate-400 italic flex-1 flex items-center justify-center">No batches yet</p>
            ) : (
                <div className={`px-2 space-y-1 ${expanded ? 'pb-2' : 'flex-1 min-h-0 overflow-y-auto'}`}>
                    {visibleBatches.map(b => {
                        const stDone  = b.stage_progress?.completed || 0;
                        const stTotal = b.stage_progress?.total     || 1;
                        const pct     = Math.round((stDone / stTotal) * 100);
                        return (
                            <button
                                key={b.batch_id}
                                onClick={(e) => { e.stopPropagation(); onDispatch && onDispatch(b.batch_id, b.batch_code); }}
                                className={`w-full text-left rounded px-1.5 py-1.5 border transition-colors ${onDispatch ? 'hover:bg-indigo-50 hover:border-indigo-200 cursor-pointer' : 'cursor-default'} border-slate-100 bg-slate-50`}
                            >
                                <div className="flex items-center justify-between mb-0.5">
                                    <span className="font-mono text-[9px] font-bold text-slate-700 truncate">BATCH #{b.batch_id}</span>
                                    <span className="font-mono text-[9px] font-bold text-slate-700 truncate">{b.batch_code}</span>
                                    <StatusBadge status={b.overall_status || 'PENDING'} />
                                </div>
                                {expanded && b.product_name && (
                                    <p className="text-[9px] text-slate-500 truncate mb-1">{b.product_name}</p>
                                )}
                                <div className="w-full bg-slate-200 rounded-full h-0.5 overflow-hidden">
                                    <div className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-500' : 'bg-indigo-400'}`} style={{ width: `${pct}%` }} />
                                </div>
                                {expanded && (
                                    <div className="flex justify-between mt-1 text-[8px] text-slate-400">
                                        <span>{stDone}/{stTotal} stages</span>
                                        <span>{b.total_rolls || 0} rolls · {b.total_primary_pieces || 0} pcs</span>
                                    </div>
                                )}
                            </button>
                        );
                    })}
                    {!expanded && batches.length > 4 && (
                        <button
                            onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
                            className="text-[9px] text-indigo-500 font-bold text-center w-full pt-0.5 hover:underline"
                        >
                            +{batches.length - 4} more — expand
                        </button>
                    )}
                </div>
            )}

            {/* Footer action */}
            {hasBatches && onDispatch && (
                <div className="px-2 pb-2 pt-1 shrink-0">
                    <button
                        onClick={(e) => { e.stopPropagation(); onDispatch(batches[0].batch_id, batches[0].batch_code); }}
                        className="flex items-center justify-center gap-1 w-full py-1 px-2 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors"
                    >
                        <Truck size={9} /> Dispatch
                    </button>
                </div>
            )}
        </div>
    );
};

const AddPOPlaceholder = ({ x, y, onAddPO }) => (
    <div
        className="absolute rounded-lg border-2 border-dashed border-amber-200 bg-amber-50/40 p-2.5 flex flex-col items-center justify-center gap-2"
        style={{ width: NODE_W_PO, height: NODE_H_PO, left: x, top: y }}
    >
        <Package size={18} className="text-amber-300" />
        <p className="text-[10px] text-amber-400 italic">No POs yet</p>
        {onAddPO && (
            <button
                onClick={(e) => { e.stopPropagation(); onAddPO(); }}
                className="flex items-center gap-1 py-1 px-2 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
            >
                <Plus size={10} /> Add PO
            </button>
        )}
    </div>
);

// ─── WORKFLOW GRAPH ───────────────────────────────────────────────────────────

const WorkflowGraph = ({ so, onStageClick, onAddPO, onCreateBatch, onViewPODetails, onInward, onEditSO, onDrilldown, onDispatch }) => {
    const { nodes, connectors, height, totalWidth } = useMemo(() => {
        const nodesList  = [];
        const connList   = [];
        const hasSO      = !!so.sales_order_id;
        const pos        = so.purchase_orders || [];
        const allBatches = [];

        const soX       = MARGIN;
        const poX       = hasSO ? soX + NODE_W_SO + GAP_X : soX;
        const batchX    = poX + NODE_W_PO + GAP_X;
        const dispatchX = batchX + NODE_W_BATCH + GAP_X;

        // No POs
        if (pos.length === 0) {
            if (hasSO) nodesList.push({ type: 'SO', data: so, x: soX, y: MARGIN });
            nodesList.push({ type: 'ADD_PO', x: poX, y: MARGIN });
            nodesList.push({ type: 'DISPATCH', x: dispatchX, y: MARGIN, batches: [] });
            if (hasSO) connList.push({ start: { x: soX + NODE_W_SO, y: MARGIN + NODE_H_SO / 2 }, end: { x: poX, y: MARGIN + NODE_H_PO / 2 } });
            return { nodes: nodesList, connectors: connList, height: MARGIN + NODE_H_PO + MARGIN, totalWidth: dispatchX + NODE_W_DISPATCH_WIDE + MARGIN };
        }

        // Compute layout for each PO and its batches
        let currentY = MARGIN;
        const poLayouts = [];

        pos.forEach(po => {
            const batches = po.batches || [];
            if (batches.length === 0) {
                poLayouts.push({ po, poY: currentY, batchYs: [], groupMid: currentY + NODE_H_PO / 2 });
                currentY += NODE_H_PO + PO_GAP_Y;
            } else {
                const batchYs = batches.map((_, bi) => currentY + bi * (NODE_H_BATCH + GAP_Y));
                const groupBottom = batchYs[batchYs.length - 1] + NODE_H_BATCH;
                const groupMid    = (currentY + groupBottom) / 2;
                const poY         = Math.max(currentY, groupMid - NODE_H_PO / 2);
                poLayouts.push({ po, poY, batchYs, groupMid });
                currentY = groupBottom + PO_GAP_Y;
            }
        });

        const contentEnd = currentY - PO_GAP_Y;
        const contentMid = (MARGIN + contentEnd) / 2;

        // SO node
        if (hasSO) {
            const soY = Math.max(MARGIN, contentMid - NODE_H_SO / 2);
            nodesList.push({ type: 'SO', data: so, x: soX, y: soY });
        }

        // Dispatch node
        const dispatchY = Math.max(MARGIN, contentMid - NODE_H_DISPATCH / 2);

        // PO + Batch nodes + connectors
        poLayouts.forEach(({ po, poY, batchYs, groupMid }) => {
            nodesList.push({ type: 'PO', data: po, x: poX, y: poY });

            if (hasSO) {
                connList.push({
                    start: { x: soX + NODE_W_SO, y: contentMid },
                    end:   { x: poX,             y: poY + NODE_H_PO / 2 },
                });
            }

            batchYs.forEach((bY, bi) => {
                const batch = po.batches[bi];
                nodesList.push({ type: 'BATCH', data: batch, x: batchX, y: bY });
                allBatches.push(batch);

                connList.push({
                    start: { x: poX + NODE_W_PO,      y: groupMid },
                    end:   { x: batchX,               y: bY + NODE_H_BATCH / 2 },
                });
                connList.push({
                    start: { x: batchX + NODE_W_BATCH, y: bY + NODE_H_BATCH / 2 },
                    end:   { x: dispatchX,             y: dispatchY + NODE_H_DISPATCH / 2 },
                });
            });
        });

        nodesList.push({ type: 'DISPATCH', x: dispatchX, y: dispatchY, batches: allBatches });

        return {
            nodes: nodesList, connectors: connList,
            height: contentEnd + MARGIN,
            totalWidth: dispatchX + NODE_W_DISPATCH_WIDE + MARGIN,
        };
    }, [so]);

    return (
        <div style={{ position: 'relative', height, minWidth: totalWidth }} className="bg-slate-50/50 rounded-lg border border-slate-100">
            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
                {connectors.map((c, i) => <Connector key={i} start={c.start} end={c.end} />)}
            </svg>
            {nodes.map((node, i) => {
                if (node.type === 'SO')       return <SalesOrderNode key={i} {...node} poCount={so.purchase_orders?.length || 0} onAddPO={onAddPO} onEditSO={onEditSO} />;
                if (node.type === 'PO')       return <PONode         key={i} {...node} onCreateBatch={onCreateBatch} onViewDetails={onViewPODetails} onInward={onInward} />;
                if (node.type === 'BATCH')    return <BatchNode      key={i} {...node} onStageClick={onStageClick} onDrilldown={onDrilldown} />;
                if (node.type === 'DISPATCH') return <DispatchNode   key={i} {...node} onDispatch={onDispatch} />;
                if (node.type === 'ADD_PO')   return <AddPOPlaceholder key={i} {...node} onAddPO={onAddPO} />;
                return null;
            })}
        </div>
    );
};

// ─── TABLE ROW ────────────────────────────────────────────────────────────────

const SalesOrderTableRow = ({ so, onSODetails, onStageClick, onAddPO, onCreateBatch, onViewPODetails, onInward, onEditSO, onDrilldown, onDispatch }) => {
    const [expanded, setExpanded] = useState(false);

    const pos         = so.purchase_orders || [];
    const allBatches  = pos.flatMap(po => po.batches || []);
    const poCount     = pos.length;
    const batchCount  = allBatches.length;
    const stagesDone  = allBatches.reduce((s, b) => s + (b.stage_progress?.completed || 0), 0);
    const stagesTotal = allBatches.reduce((s, b) => s + (b.stage_progress?.total     || 0), 0);

    return (
        <React.Fragment>
            <tr
                onClick={() => setExpanded(e => !e)}
                className={`border-b border-slate-100 cursor-pointer group transition-colors ${expanded ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}
            >
                <td className="px-6 py-4 w-12 text-center">
                    {expanded
                        ? <ChevronUp size={16} className="text-blue-600" />
                        : <ChevronDown size={16} className="text-slate-400 group-hover:text-slate-600" />
                    }
                </td>
                <td className="px-6 py-4">
                    <div className="font-bold text-slate-800 text-sm">{so.order_number || <span className="italic text-slate-400">No SO</span>}</div>
                    {so.buyer_po_number && <div className="text-xs text-slate-500 mt-0.5">PO: {so.buyer_po_number}</div>}
                </td>
                <td className="px-6 py-4 text-sm text-slate-700 font-medium">
                    {so.customer_name || <span className="text-slate-400 italic">—</span>}
                </td>
                <td className="px-6 py-4"><StatusBadge status={so.so_status} /></td>
                <td className="px-6 py-4 text-xs text-slate-500">
                    <div className="flex gap-3 items-center flex-wrap">
                        <span className="flex items-center"><Package size={12} className="mr-1" />{poCount} PO{poCount !== 1 ? 's' : ''}</span>
                        <span className="flex items-center"><Scissors size={12} className="mr-1" />{batchCount} batch{batchCount !== 1 ? 'es' : ''}</span>
                        {stagesTotal > 0 && (
                            <span className="text-emerald-600 font-semibold">✓ {stagesDone}/{stagesTotal} stages</span>
                        )}
                    </div>
                </td>
                <td className="px-6 py-4 text-right">
                    {so.sales_order_id && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onSODetails(so.sales_order_id); }}
                            className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-md transition-colors"
                            title="View Sales Order Details"
                        >
                            <FileText size={16} />
                        </button>
                    )}
                </td>
            </tr>
            {expanded && (
                <tr>
                    <td colSpan="6" className="p-4 bg-slate-50 border-b border-slate-200">
                        <div className="overflow-x-auto">
                            <WorkflowGraph
                                so={so}
                                onStageClick={onStageClick}
                                onAddPO={onAddPO ? () => onAddPO(so.sales_order_id) : null}
                                onCreateBatch={onCreateBatch}
                                onViewPODetails={onViewPODetails}
                                onInward={onInward}
                                onEditSO={onEditSO}
                                onDrilldown={onDrilldown}
                                onDispatch={onDispatch}
                            />
                        </div>
                    </td>
                </tr>
            )}
        </React.Fragment>
    );
};

// ─── SALES ORDER DETAILS MODAL ────────────────────────────────────────────────

const SalesOrderDetailsModal = ({ orderId, onClose }) => {
    const [order, setOrder]     = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        accountingApi.getSalesOrderDetails(orderId)
            .then(res => setOrder(res.data))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [orderId]);

    if (loading) return <Modal title="Loading…" onClose={onClose}><Spinner /></Modal>;
    if (!order)  return null;

    return (
        <Modal title={`Sales Order: ${order.order_number}`} onClose={onClose} size="max-w-4xl">
            <div className="space-y-6">
                <div className="bg-blue-50/50 p-5 rounded-xl border border-blue-100 grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
                    <div>
                        <span className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Customer</span>
                        <p className="font-semibold text-gray-800 text-base">{order.customer_name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{order.customer_email || 'No email'}</p>
                    </div>
                    <div>
                        <span className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Order Refs</span>
                        <p className="text-gray-700 flex items-center">
                            <span className="text-gray-400 text-xs mr-2">Buyer PO:</span>
                            <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">{order.buyer_po_number || 'N/A'}</span>
                        </p>
                        <p className="text-gray-700 mt-1.5 flex items-center gap-2">
                            <span className="text-gray-400 text-xs">Status:</span>
                            <StatusBadge status={order.status} />
                        </p>
                    </div>
                    <div>
                        <span className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Key Dates</span>
                        <p className="text-gray-700"><span className="text-gray-400 text-xs mr-1">Ordered:</span>{order.order_date ? new Date(order.order_date).toLocaleDateString() : 'N/A'}</p>
                        <p className="text-gray-700 mt-1"><span className="text-gray-400 text-xs mr-1">Delivery:</span>{order.delivery_date ? new Date(order.delivery_date).toLocaleDateString() : 'TBD'}</p>
                    </div>
                    <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100 text-center flex flex-col justify-center">
                        <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Total Amount</span>
                        <p className="font-extrabold text-emerald-600 text-xl flex items-center justify-center">
                            <DollarSign size={20} className="mr-0.5" />{order.total_amount || '0.00'}
                        </p>
                    </div>
                </div>

                {order.notes && (
                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <span className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Notes</span>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{order.notes}</p>
                    </div>
                )}

                <div>
                    <h3 className="text-base font-bold text-gray-800 mb-3 flex items-center">
                        <Box size={18} className="mr-2 text-indigo-500" /> Order Items
                    </h3>
                    <div className="overflow-x-auto border border-gray-200 rounded-xl shadow-sm">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-100 text-gray-600 border-b border-gray-200">
                                <tr>
                                    <th className="px-4 py-3 font-semibold uppercase text-xs tracking-wider">Product</th>
                                    <th className="px-4 py-3 font-semibold uppercase text-xs tracking-wider">Fabric</th>
                                    <th className="px-4 py-3 font-semibold uppercase text-xs tracking-wider">Sizes</th>
                                    <th className="px-4 py-3 font-semibold uppercase text-xs tracking-wider">Colors & Qty</th>
                                    <th className="px-4 py-3 font-semibold uppercase text-xs tracking-wider text-right w-20">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 bg-white">
                                {(order.products || []).map((prod, idx) => {
                                    const total = prod.colors?.reduce((s, c) => s + parseInt(c.quantity || 0), 0) || 0;
                                    return (
                                        <tr key={idx} className="align-top hover:bg-gray-50/50">
                                            <td className="px-4 py-4 font-bold text-gray-900">{prod.product_name}</td>
                                            <td className="px-4 py-4 text-gray-600">{prod.fabric_type}</td>
                                            <td className="px-4 py-4">
                                                <div className="flex flex-wrap gap-1.5">
                                                    {prod.size_breakdown && Object.entries(prod.size_breakdown).map(([sz, r]) => (
                                                        <span key={sz} className="flex flex-col items-center bg-indigo-50 border border-indigo-100 rounded-md min-w-[2.5rem] overflow-hidden">
                                                            <span className="w-full text-center bg-indigo-100 text-indigo-800 text-[9px] font-bold uppercase py-0.5">{sz}</span>
                                                            <span className="text-indigo-900 font-extrabold text-xs py-1">{r}</span>
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-4 py-4">
                                                <div className="flex flex-col gap-2">
                                                    {prod.colors?.map((c, ci) => (
                                                        <div key={ci} className="flex justify-between items-center bg-white border border-gray-200 px-3 py-1.5 rounded-lg shadow-sm">
                                                            <span className="text-gray-700 font-medium flex items-center text-xs">
                                                                <Palette size={12} className="text-gray-400 mr-1.5" />
                                                                {c.color_name} <span className="text-gray-400 ml-1">({c.color_number})</span>
                                                            </span>
                                                            <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-xs">{c.quantity} pcs</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 text-right font-extrabold text-gray-800 text-lg">{total}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            <div className="flex justify-end pt-5 border-t border-gray-100 mt-6">
                <button onClick={onClose} className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg font-bold">Close</button>
            </div>
        </Modal>
    );
};

// ─── PURCHASE ORDER DETAILS MODAL ─────────────────────────────────────────────

const PurchaseOrderDetailsModal = ({ poId, onClose }) => {
    const [po, setPo]       = useState(null);
    const [loading, setLoading] = useState(true);
    const [rolls, setRolls] = useState([]);

    useEffect(() => {
        accountingApi.getPurchaseOrderDetails(poId)
            .then(res => setPo(res.data))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [poId]);

    useEffect(() => {
        if (poId) storeManagerApi.getFabricRollsByPO(poId).then(res => setRolls(res.data)).catch(console.error);
    }, [poId]);

    if (loading) return <Modal title="Loading PO…" onClose={onClose}><Spinner /></Modal>;
    if (!po)     return null;

    const handlePrintPO = () => {
        const doc = new jsPDF();
        const pw  = doc.internal.pageSize.width;
        doc.setFontSize(22); doc.setFont('helvetica', 'bold');
        doc.text('MATRIX OVERSEAS', pw / 2, 20, { align: 'center' });
        doc.setFontSize(10); doc.setFont('helvetica', 'normal');
        doc.text(['PLOT NO. 24,26,27, K T STEEL PLOT PREMISSES,', 'R K CNG PUMP, WIMCO NAKA, AMBERNATH 421505.', 'Phone: +918591383476'], pw / 2, 28, { align: 'center', lineHeightFactor: 1.5 });
        doc.setDrawColor(200, 200, 200); doc.line(14, 45, pw - 14, 45);
        doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.text('PURCHASE ORDER', 14, 55);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold'); doc.text('PO Number:', 14, 65); doc.setFont('helvetica', 'normal'); doc.text(`${po.po_code || po.po_number}`, 40, 65);
        doc.setFont('helvetica', 'bold'); doc.text('Supplier:', 120, 55); doc.setFont('helvetica', 'normal'); doc.text(`${po.supplier_name}`, 120, 62);
        autoTable(doc, {
            startY: 90,
            head: [['Fabric Type', 'Color', 'Qty', 'UOM', 'Unit Price', 'Total']],
            body: (po.items || []).map(i => [i.fabric_type, `${i.fabric_color} (${i.color_number || ''})`, i.quantity, i.uom, `₹${i.unit_price}`, `₹${i.total_price}`]),
            theme: 'grid',
            headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255] },
            styles: { fontSize: 9, cellPadding: 3 },
            foot: [[{ content: 'Grand Total', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold' } }, { content: `₹${(po.items || []).reduce((s, i) => s + parseFloat(i.total_price || 0), 0).toFixed(2)}`, styles: { fontStyle: 'bold' } }]]
        });
        doc.save(`PO_${po.po_code}.pdf`);
    };

    return (
        <Modal title={`Purchase Order: ${po.po_code || po.po_number}`} onClose={onClose} size="max-w-4xl">
            <div className="space-y-5">
                <div className="flex flex-col md:flex-row justify-between gap-4 bg-amber-50 p-5 rounded-xl border border-amber-100">
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-white rounded-lg text-amber-600"><Truck size={22} /></div>
                        <div>
                            <p className="text-xs text-amber-700 font-bold uppercase tracking-wider mb-1">Supplier</p>
                            <p className="font-extrabold text-gray-900 text-lg">{po.supplier_name}</p>
                            <p className="text-sm text-gray-600">{po.supplier_email || '—'} • {po.supplier_phone || '—'}</p>
                        </div>
                    </div>
                    <div className="bg-white p-4 rounded-lg border border-amber-100 flex flex-col justify-center gap-2">
                        <div className="flex items-center gap-2"><span className="text-xs text-gray-500 font-bold uppercase">Status:</span><StatusBadge status={po.status} /></div>
                        <p className="text-sm text-gray-600"><span className="text-gray-400 text-xs mr-1">Delivery:</span>{po.expected_delivery_date ? new Date(po.expected_delivery_date).toLocaleDateString() : 'N/A'}</p>
                        <button onClick={handlePrintPO} className="flex items-center justify-center gap-2 text-sm bg-indigo-600 text-white font-bold px-4 py-2 rounded-lg hover:bg-indigo-700">
                            <Printer size={14} /> Download PDF
                        </button>
                    </div>
                </div>

                <div>
                    <h4 className="text-sm font-bold text-gray-800 mb-3 flex items-center"><ShoppingCart size={16} className="mr-2 text-indigo-500" />Ordered Items</h4>
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-100 text-gray-600 border-b border-gray-200">
                                <tr>
                                    <th className="px-4 py-3 font-semibold uppercase text-xs tracking-wider">Fabric</th>
                                    <th className="px-4 py-3 font-semibold uppercase text-xs tracking-wider">Color</th>
                                    <th className="px-4 py-3 font-semibold uppercase text-xs tracking-wider text-right">Qty</th>
                                    <th className="px-4 py-3 font-semibold uppercase text-xs tracking-wider text-right">Unit Price</th>
                                    <th className="px-4 py-3 font-semibold uppercase text-xs tracking-wider text-right">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 bg-white">
                                {(po.items || []).map((item, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50/50">
                                        <td className="px-4 py-3 font-bold text-gray-800">{item.fabric_type}</td>
                                        <td className="px-4 py-3 text-gray-600 text-xs">{item.fabric_color} ({item.color_number})</td>
                                        <td className="px-4 py-3 text-right font-extrabold text-blue-700">{item.quantity} <span className="text-xs text-gray-400">{item.uom}</span></td>
                                        <td className="px-4 py-3 text-right text-gray-600">₹{item.unit_price}</td>
                                        <td className="px-4 py-3 text-right font-bold text-emerald-700">₹{item.total_price}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div>
                    <h4 className="text-sm font-bold text-gray-800 mb-3 flex items-center"><Layers size={16} className="mr-2 text-indigo-500" />Received Rolls</h4>
                    {rolls.length === 0 ? (
                        <div className="text-center py-6 border-2 border-dashed border-gray-100 rounded-xl">
                            <Package className="mx-auto h-7 w-7 text-gray-300 mb-2" />
                            <p className="text-sm text-gray-400 italic">No rolls received yet.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-52 overflow-y-auto">
                            {rolls.map(r => (
                                <div key={r.id} className="flex justify-between items-center p-2.5 border border-gray-100 rounded-lg bg-gray-50">
                                    <div>
                                        <span className="font-mono font-bold text-indigo-700 text-xs block">R-{r.id}</span>
                                        <span className="text-xs text-gray-500 truncate block max-w-[100px]">{r.fabric_type}</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="font-bold text-gray-800 text-xs block">{r.meter}m</span>
                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${r.status === 'IN_STOCK' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {r.status === 'IN_STOCK' ? 'Stock' : 'Prod'}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            <div className="flex justify-end pt-5 border-t border-gray-100 mt-6">
                <button onClick={onClose} className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg font-bold">Close</button>
            </div>
        </Modal>
    );
};

// ─── CREATE PO MODAL ──────────────────────────────────────────────────────────

const CreatePOModal = ({ salesOrderId, onClose, onSave }) => {
    const [activeTab, setActiveTab] = useState('form');
    const [soDetails, setSoDetails] = useState(null);
    const [isLoadingDetails, setIsLoadingDetails] = useState(false);
    const [supplierId, setSupplierId] = useState('');
    const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
    const [fabricGroups, setFabricGroups] = useState([
        { fabric_type_id: '', uom: 'meter', unit_price: '', colors: [{ fabric_color_id: '', quantity: '' }] }
    ]);
    const [suppliers, setSuppliers] = useState([]);
    const [fabricTypes, setFabricTypes] = useState([]);
    const [fabricColors, setFabricColors] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            storeManagerApi.getFabricIntakeFormData(),
            productionManagerApi.getFabricTypes(),
            productionManagerApi.getFabricColors(),
        ]).then(([intake, types, colors]) => {
            setSuppliers(intake.data.suppliers || []);
            setFabricTypes(types.data || []);
            setFabricColors(colors.data || []);
        }).catch(console.error).finally(() => setIsLoading(false));
    }, []);

    useEffect(() => {
        if (!salesOrderId) return;
        setIsLoadingDetails(true);
        accountingApi.getSalesOrderDetails(salesOrderId)
            .then(res => setSoDetails(res.data))
            .catch(console.error)
            .finally(() => setIsLoadingDetails(false));
    }, [salesOrderId]);

    const addFabricGroup    = () => setFabricGroups(g => [...g, { fabric_type_id: '', uom: 'meter', unit_price: '', colors: [{ fabric_color_id: '', quantity: '' }] }]);
    const removeFabricGroup = (i) => fabricGroups.length > 1 && setFabricGroups(g => g.filter((_, idx) => idx !== i));
    const updateFabricGroup = (i, f, v) => setFabricGroups(g => { const n = [...g]; n[i][f] = v; return n; });
    const addColor          = (gi) => setFabricGroups(g => { const n = [...g]; n[gi].colors.push({ fabric_color_id: '', quantity: '' }); return n; });
    const removeColor       = (gi, ci) => setFabricGroups(g => { const n = [...g]; if (n[gi].colors.length > 1) n[gi].colors = n[gi].colors.filter((_, i) => i !== ci); return n; });
    const updateColor       = (gi, ci, f, v) => setFabricGroups(g => { const n = [...g]; n[gi].colors[ci][f] = v; return n; });

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!supplierId) return alert('Please select a supplier.');
        const items = [];
        fabricGroups.forEach(group => {
            if (!group.fabric_type_id) return;
            group.colors.forEach(c => {
                if (c.fabric_color_id && c.quantity) {
                    items.push({ fabric_type_id: parseInt(group.fabric_type_id), fabric_color_id: parseInt(c.fabric_color_id), quantity: parseFloat(c.quantity), uom: group.uom, unit_price: group.unit_price ? parseFloat(group.unit_price) : 0 });
                }
            });
        });
        if (!items.length) return alert('Add at least one fabric type with color and quantity.');
        onSave({ sales_order_id: salesOrderId, supplier_id: parseInt(supplierId), expected_delivery_date: expectedDeliveryDate || null, items });
    };

    if (isLoading) return <Modal title="Loading…" onClose={onClose}><Spinner /></Modal>;

    return (
        <Modal title="Create Purchase Order" onClose={onClose} size="max-w-5xl">
            <div className="flex border-b border-gray-200 mb-6">
                {[{ key: 'form', label: 'Order Form' }, { key: 'details', label: `Sales Order Ref${soDetails?.order_number ? ` (${soDetails.order_number})` : ''}` }].map(tab => (
                    <button key={tab.key}
                        className={`py-3 px-6 font-bold text-sm border-b-2 transition-colors ${activeTab === tab.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                        onClick={() => setActiveTab(tab.key)}
                    >{tab.label}</button>
                ))}
            </div>

            {activeTab === 'form' && (
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="bg-gray-50 p-5 rounded-xl border border-gray-200 grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Supplier *</label>
                            <select className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white" value={supplierId} onChange={e => setSupplierId(e.target.value)} required>
                                <option value="">Select a Supplier</option>
                                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Expected Delivery</label>
                            <input type="date" className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white" value={expectedDeliveryDate} onChange={e => setExpectedDeliveryDate(e.target.value)} />
                        </div>
                    </div>

                    <div className="max-h-[50vh] overflow-y-auto pr-2 space-y-5 pb-2">
                        {fabricGroups.map((group, gi) => (
                            <div key={gi} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                <div className="bg-slate-50 p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-end gap-4">
                                    <div className="flex-1">
                                        <label className="block text-xs font-bold text-indigo-600 uppercase tracking-wider mb-1.5">Fabric Type *</label>
                                        <select className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" value={group.fabric_type_id} onChange={e => updateFabricGroup(gi, 'fabric_type_id', e.target.value)} required>
                                            <option value="">Select Fabric Type</option>
                                            {fabricTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="w-32">
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">UOM</label>
                                        <select className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" value={group.uom} onChange={e => updateFabricGroup(gi, 'uom', e.target.value)}>
                                            <option value="meter">Meter</option><option value="kg">Kg</option><option value="yard">Yard</option><option value="pcs">Pcs</option>
                                        </select>
                                    </div>
                                    <div className="w-40">
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Unit Price (₹)</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-2.5 text-slate-400 text-sm">₹</span>
                                            <input type="number" min="0" step="0.01" placeholder="0.00" className="w-full p-2.5 pl-7 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" value={group.unit_price} onChange={e => updateFabricGroup(gi, 'unit_price', e.target.value)} />
                                        </div>
                                    </div>
                                    {fabricGroups.length > 1 && (
                                        <button type="button" onClick={() => removeFabricGroup(gi)} className="text-red-400 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition-colors"><Trash2 size={16} /></button>
                                    )}
                                </div>
                                <div className="p-4">
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center"><Palette size={12} className="mr-2" />Colors & Quantities</p>
                                    <div className="space-y-2.5">
                                        {group.colors.map((color, ci) => (
                                            <div key={ci} className="flex items-center gap-3">
                                                <div className="flex-1">
                                                    <select className="w-full p-2 border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={color.fabric_color_id} onChange={e => updateColor(gi, ci, 'fabric_color_id', e.target.value)} required>
                                                        <option value="" disabled>Select Color</option>
                                                        {fabricColors.map(c => <option key={c.id} value={c.id}>{c.color_number} – {c.name}</option>)}
                                                    </select>
                                                </div>
                                                <div className="w-44 relative">
                                                    <span className="absolute right-3 top-2 text-slate-400 text-xs font-medium">{group.uom}</span>
                                                    <input type="number" min="0.1" step="0.1" placeholder="Qty" className="w-full p-2 pr-12 border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={color.quantity} onChange={e => updateColor(gi, ci, 'quantity', e.target.value)} required />
                                                </div>
                                                {group.colors.length > 1 && (
                                                    <button type="button" onClick={() => removeColor(gi, ci)} className="text-slate-400 hover:text-red-500 p-1.5 rounded hover:bg-red-50"><X size={14} /></button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    <button type="button" onClick={() => addColor(gi)} className="mt-3 text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 hover:bg-indigo-50 px-2 py-1 rounded">
                                        <Plus size={12} /> Add Color
                                    </button>
                                </div>
                            </div>
                        ))}
                        <button type="button" onClick={addFabricGroup} className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-bold hover:bg-slate-50 flex items-center justify-center gap-2">
                            <Layers size={16} /> Add Fabric Type
                        </button>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                        <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
                        <button type="submit" className="px-6 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center gap-2">
                            <ShoppingCart size={15} /> Create Purchase Order
                        </button>
                    </div>
                </form>
            )}

            {activeTab === 'details' && (
                <div className="max-h-[60vh] overflow-y-auto pr-2">
                    {isLoadingDetails ? <div className="flex justify-center p-12"><Loader2 className="animate-spin text-indigo-600" /></div>
                    : !soDetails ? <div className="text-center p-12 text-gray-500 italic border-2 border-dashed rounded-xl">Failed to load SO details.</div>
                    : (
                        <div className="space-y-4">
                            <div className="bg-slate-50 p-4 border border-slate-200 rounded-xl grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div><span className="block text-xs font-bold text-gray-400 uppercase mb-1">Customer</span><p className="font-semibold">{soDetails.customer_name}</p></div>
                                <div><span className="block text-xs font-bold text-gray-400 uppercase mb-1">Buyer PO</span><p className="font-bold text-indigo-700">{soDetails.buyer_po_number || 'N/A'}</p></div>
                                <div><span className="block text-xs font-bold text-gray-400 uppercase mb-1">Date</span><p>{new Date(soDetails.order_date).toLocaleDateString()}</p></div>
                                <div><span className="block text-xs font-bold text-gray-400 uppercase mb-1">Total Pcs</span><p className="font-bold text-emerald-700">{soDetails.total_quantity || 0}</p></div>
                            </div>
                            {soDetails.products?.map((prod, idx) => (
                                <div key={idx} className="border border-gray-200 rounded-lg overflow-hidden">
                                    <div className="bg-gray-100 px-4 py-2 flex justify-between items-center border-b">
                                        <span className="font-bold text-gray-800">{prod.product_name}</span>
                                        <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded border border-indigo-200">{prod.fabric_type}</span>
                                    </div>
                                    <div className="p-4 grid grid-cols-2 gap-4 bg-white text-xs">
                                        <div>
                                            <p className="font-bold text-gray-400 uppercase mb-2">Sizes</p>
                                            <div className="flex flex-wrap gap-1">
                                                {prod.size_breakdown && Object.entries(prod.size_breakdown).map(([sz, r]) => (
                                                    <span key={sz} className="bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded flex flex-col items-center min-w-[2rem]">
                                                        <span className="font-bold opacity-60 text-[8px]">{sz}</span>
                                                        <span className="font-extrabold">{r}</span>
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <p className="font-bold text-gray-400 uppercase mb-2">Colors</p>
                                            {prod.colors?.map((c, ci) => (
                                                <div key={ci} className="flex justify-between bg-slate-50 px-2 py-1 rounded border border-slate-100 mb-1">
                                                    <span className="font-medium">{c.color_name} ({c.color_number})</span>
                                                    <span className="font-bold text-indigo-600">{c.quantity} pcs</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </Modal>
    );
};

// ─── BATCH STAGE DRILLDOWN MODAL ──────────────────────────────────────────────

const BatchStageDrilldownModal = ({ batchId, flowId, stageName, onClose }) => {
    const [stageData, setStageData] = useState(null);
    const [loading, setLoading]     = useState(true);
    const [error, setError]         = useState(null);
    const [openRolls, setOpenRolls] = useState(new Set());

    useEffect(() => {
        productionManagerApi.getBatchDrilldown(batchId, flowId)
            .then(res => {
                const stages = res.data?.stages || [];
                setStageData(stages.find(s => s.flow_id === flowId) || stages[0] || null);
            })
            
            .catch(err => setError(err?.response?.data?.error || err.message || 'Failed to load'))
            .finally(() => setLoading(false));
    }, [batchId, flowId]);

    const toggleRoll = (id) => setOpenRolls(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
    const title = `${stageName} — Batch #${batchId}`;

    if (loading) return <Modal title={title} onClose={onClose}><Spinner /></Modal>;
    if (error || !stageData) return <Modal title={title} onClose={onClose}><p className="text-red-500 text-sm p-4">{error || 'No data.'}</p></Modal>;
    console.log('Stage Data:', stageData);
    const mode = stageData.processing_mode;
    const totals = { APPROVED: 0, NEEDS_REWORK: 0, REPAIRED:0, REJECTED: 0, OTHER: 0 };
    (stageData.rolls || []).forEach(roll => {
        const items = mode === 'PIECE'
            ? (roll.parts || []).flatMap(p => (p.sizes || []).flatMap(sz => sz.pieces || []))
            : (roll.garments || []);
        items.forEach(item => {
            const k = ['APPROVED', 'NEEDS_REWORK', 'REJECTED','REPAIRED'].includes(item.status) ? item.status : 'OTHER';
            totals[k]++;
        });
    });

    return (
        <Modal title={title} onClose={onClose} size="max-w-3xl">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5 p-4 bg-slate-50 rounded-xl border border-slate-200">
                {[
                    { label: 'Line',      val: stageData.line_name || '—' },
                    { label: 'Mode',      val: mode },
                    { label: 'Status',    val: <StatusBadge status={stageData.stage_status} /> },
                    { label: 'Completed', val: stageData.completed_at ? new Date(stageData.completed_at).toLocaleDateString() : '—' },
                ].map(({ label, val }) => (
                    <div key={label}>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">{label}</span>
                        {typeof val === 'string' ? <p className="font-semibold text-slate-700 text-xs">{val}</p> : val}
                    </div>
                ))}
            </div>
            <div className="grid grid-cols-4 gap-2 mb-5">
                {[
                    { key: 'APPROVED',     label: 'Approved', color: 'bg-emerald-50 text-emerald-700' },
                    { key: 'NEEDS_REWORK', label: 'Rework',   color: 'bg-amber-50   text-amber-700'   },
                    { key: 'REPAIRED',     label: 'Repaired', color: 'bg-emerald-50 text-emerald-700' },
                    { key: 'REJECTED',     label: 'Rejected', color: 'bg-red-50     text-red-600'     },
                    { key: 'OTHER',        label: 'Other',    color: 'bg-slate-50   text-slate-500'   },
                ].map(({ key, label, color }) => (
                    <div key={key} className={`${color} rounded-xl p-3 text-center border border-black/5`}>
                        <div className="text-xl font-black">{totals[key]}</div>
                        <div className="text-[9px] font-bold uppercase tracking-wider opacity-70 mt-0.5">{label}</div>
                    </div>
                ))}
            </div>
            <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
                {(stageData.rolls || []).map(roll => {
                    const isOpen = openRolls.has(roll.roll_id);
                    return (
                        <div key={roll.roll_id} className="border border-slate-200 rounded-lg overflow-hidden">
                            <button onClick={() => toggleRoll(roll.roll_id)} className="w-full flex justify-between items-center px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors">
                                <span className="font-mono font-bold text-slate-700 text-sm">Roll #{roll.roll_id}</span>
                                {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                            {isOpen && (
                                <div className="p-3 bg-white">
                                    {mode === 'PIECE' ? (
                                        <div className="space-y-3">
                                            {(roll.parts || []).map((part, pi) => (
                                                <div key={pi}>
                                                    <p className="text-[10px] font-bold text-slate-500 mb-1.5">{part.part_name} <span className="font-normal text-slate-400">({part.part_type})</span></p>
                                                    {(part.sizes || []).map((sz, si) => (
                                                        <div key={si} className="mb-2">
                                                            <p className="text-[9px] font-bold text-slate-400 mb-1">Size {sz.size}</p>
                                                            <div className="flex flex-wrap gap-1">
                                                                {(sz.pieces || []).map(piece => {
                                                                    const pc = piece.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' : piece.status === 'NEEDS_REWORK' ? 'bg-amber-100 text-amber-700' : piece.status === 'REJECTED' ? 'bg-red-100 text-red-600' : piece.status === 'REPAIRED' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'; return <span key={piece.piece_id} title={`#${piece.piece_id} · ${piece.status}`} className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${pc}`}>{piece.piece_sequence}</span>;
                                                                })}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {Object.entries((roll.garments || []).reduce((acc, g) => { (acc[g.size] = acc[g.size] || []).push(g); return acc; }, {})).map(([size, garments]) => (
                                                <div key={size}>
                                                    <p className="text-[9px] font-bold text-slate-400 mb-1">Size {size}</p>
                                                    <div className="flex flex-wrap gap-1">
                                                        {garments.map(g => {
                                                            const gc = g.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' : g.status === 'NEEDS_REWORK' ? 'bg-amber-100 text-amber-700' : g.status === 'ASSEMBLED' ? 'bg-blue-100 text-blue-700' : g.status === 'REJECTED' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500';
                                                            return <span key={g.garment_id} title={`${g.garment_uid} · ${g.status}`} className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${gc}`}>{g.garment_uid.split('-').pop()}</span>;
                                                        })}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            <div className="flex justify-end pt-4 border-t border-slate-100 mt-4">
                <button onClick={onClose} className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-sm">Close</button>
            </div>
        </Modal>
    );
};

// ─── MAIN DASHBOARD ───────────────────────────────────────────────────────────

const ProductionWorkflowDashboard = () => {
    const { user }  = useAuth();
    const navigate  = useNavigate();
    const location  = useLocation();

    const [data, setData]                       = useState([]);
    const [filteredData, setFilteredData]       = useState([]);
    const [loading, setLoading]                 = useState(true);
    const [filterStatus, setFilterStatus]       = useState('ALL');
    const [searchText, setSearchText]           = useState('');
    const [selectedSOId, setSelectedSOId]       = useState(null);
    const [selectedPOId, setSelectedPOId]       = useState(null);
    const [poModalSOId, setPoModalSOId]         = useState(null);
    const [drilldownTarget, setDrilldownTarget] = useState(null);
    const [batchDrilldown, setBatchDrilldown]   = useState(null);
    const [dispatchBatch, setDispatchBatch]     = useState(null);
    const [inwardPO, setInwardPO]               = useState(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res    = await productionManagerApi.getWorkflowData();
            console.log('Fetched workflow data:', res.data);    
            const rows   = res.data || [];
            const sorted = [...rows].sort((a, b) => {
                if (a.sales_order_id && !b.sales_order_id) return -1;
                if (!a.sales_order_id && b.sales_order_id) return 1;
                return new Date(b.order_date || 0) - new Date(a.order_date || 0);
            });
            setData(sorted);
            setFilteredData(sorted);
        } catch (err) {
            console.error('Failed to fetch workflow data', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    useEffect(() => {
        let result = data;
        if (filterStatus !== 'ALL') result = result.filter(so => so.so_status === filterStatus);
        if (searchText) {
            const lower = searchText.toLowerCase();
            result = result.filter(so =>
                (so.order_number    || '').toLowerCase().includes(lower) ||
                (so.customer_name   || '').toLowerCase().includes(lower) ||
                (so.buyer_po_number || '').toLowerCase().includes(lower) ||
                so.purchase_orders?.some(po =>
                    (po.po_code || '').toLowerCase().includes(lower) ||
                    po.batches?.some(b => (b.batch_code || '').toLowerCase().includes(lower))
                )
            );
        }
        setFilteredData(result);
    }, [data, filterStatus, searchText]);

    const basePath = location.pathname.startsWith('/initialization-portal') ? '/initialization-portal' : '/production-manager';

    const handleStageClick   = (stage, batchId) => setDrilldownTarget({ batchId, flowId: stage.flow_id, stageName: stage.line_type_name });
    const handleAddPO        = (soId) => setPoModalSOId(soId);
    const handleEditSO       = (soId) => navigate(`/accounts/sales/${soId}/edit`);
    const handleBatchDrilldown = (batchId, batchCode) => setBatchDrilldown({ batchId, batchCode });
    const handleDispatch       = (batchId, batchCode) => setDispatchBatch({ batchId, batchCode });
    const handleCreateBatch = (poData) => {
        const poId       = typeof poData === 'object' ? poData?.po_id       : poData;
        const supplierId = typeof poData === 'object' ? poData?.supplier_id : null;
        const params     = [poId && `poId=${poId}`, supplierId && `supplierId=${supplierId}`].filter(Boolean).join('&');
        navigate(`${basePath}/batches/new${params ? `?${params}` : ''}`);
    };
    const handleCreatePOSave = async (formData) => {
        try {
            await accountingApi.createPurchaseOrder(formData);
            setPoModalSOId(null);
            fetchData();
        } catch { alert('Failed to create Purchase Order.'); }
    };

    const canManage     = user && ['accountant', 'sales_manager', 'admin', 'factory_admin'].includes(user.role);
    const canProduction = user && ['cutting_manager', 'production_manager', 'admin', 'factory_admin'].includes(user.role);
    const canInward     = user?.role === 'accountant';

    const handleInward = (po) => setInwardPO({ ...po, id: po.po_id });

    return (
        <div className="flex h-screen bg-slate-50 overflow-hidden">
            {/* ── Sidebar ── */}
            <div className="w-64 bg-white border-r border-slate-200 p-6 flex flex-col shrink-0 h-full overflow-y-auto print:hidden">
                <h2 className="text-xl font-extrabold text-slate-800 mb-6 flex items-center">
                    <LayoutList className="mr-2 text-indigo-600" size={22} /> Workflow
                </h2>

                {canManage && (
                    <button
                        onClick={() => navigate('/accounts/sales/new')}
                        className="w-full mb-3 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm px-4 py-3 rounded-xl shadow-sm transition-all active:scale-95"
                    >
                        <Plus size={16} /> Create Sales Order
                    </button>
                )}
                {canProduction && (
                    <button
                        onClick={() => handleCreateBatch(null)}
                        className="w-full mb-6 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-4 py-3 rounded-xl shadow-sm transition-all active:scale-95"
                    >
                        <Plus size={16} /> Create Batch
                    </button>
                )}

                <div className="space-y-6">
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Search</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 text-slate-400 w-4 h-4" />
                            <input
                                type="text"
                                placeholder="SO, PO, Customer, Batch…"
                                value={searchText}
                                onChange={e => setSearchText(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 block">Order Status</label>
                        <div className="space-y-1">
                            {['ALL', 'DRAFT', 'PENDING', 'IN_PROGRESS', 'COMPLETED'].map(f => (
                                <button
                                    key={f}
                                    onClick={() => setFilterStatus(f)}
                                    className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${filterStatus === f ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'text-slate-600 hover:bg-slate-50 border border-transparent'}`}
                                >
                                    {f === 'ALL' ? 'All Orders' : f.replace(/_/g, ' ')}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Main ── */}
            <div className="flex-1 overflow-auto p-8 print:p-0">
                {loading ? (
                    <div className="h-full flex items-center justify-center">
                        <Loader2 className="animate-spin text-indigo-600 w-10 h-10" />
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <table className="min-w-full text-left border-collapse">
                            <thead className="bg-slate-50 text-slate-500 font-semibold text-xs uppercase tracking-wider border-b border-slate-200 sticky top-0 z-10">
                                <tr>
                                    <th className="px-6 py-4 w-12"></th>
                                    <th className="px-6 py-4">Sales Order</th>
                                    <th className="px-6 py-4">Customer</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4">Metrics</th>
                                    <th className="px-6 py-4 text-right">Details</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {filteredData.length > 0 ? filteredData.map((so, idx) => (
                                    <SalesOrderTableRow
                                        key={so.sales_order_id ?? `unlinked-${idx}`}
                                        so={so}
                                        onSODetails={setSelectedSOId}
                                        onStageClick={handleStageClick}
                                        onAddPO={canManage ? handleAddPO : null}
                                        onCreateBatch={canProduction ? handleCreateBatch : null}
                                        onViewPODetails={setSelectedPOId}
                                        onInward={canInward ? handleInward : null}
                                        onEditSO={canManage ? handleEditSO : null}
                                        onDrilldown={handleBatchDrilldown}
                                        onDispatch={canInward ? handleDispatch : null}
                                    />
                                )) : (
                                    <tr>
                                        <td colSpan="6" className="px-6 py-16 text-center text-slate-400 italic">
                                            No orders found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {selectedSOId    && <SalesOrderDetailsModal   orderId={selectedSOId}                    onClose={() => setSelectedSOId(null)}    />}
            {selectedPOId    && <PurchaseOrderDetailsModal poId={selectedPOId}                      onClose={() => setSelectedPOId(null)}    />}
            {poModalSOId     && <CreatePOModal             salesOrderId={poModalSOId}               onClose={() => setPoModalSOId(null)}     onSave={handleCreatePOSave} />}
            {drilldownTarget && <BatchStageDrilldownModal  batchId={drilldownTarget.batchId}        flowId={drilldownTarget.flowId}         stageName={drilldownTarget.stageName} onClose={() => setDrilldownTarget(null)} />}
            {batchDrilldown  && <BatchDrilldownModal       batchId={batchDrilldown.batchId}         batchCode={batchDrilldown.batchCode}    onClose={() => setBatchDrilldown(null)} />}
            {dispatchBatch   && <BatchDispatchModal        batchId={dispatchBatch.batchId}          batchCode={dispatchBatch.batchCode}     onClose={() => setDispatchBatch(null)} />}
            {inwardPO && (
                <Modal title={`Goods Inward — ${inwardPO.po_code}`} onClose={() => setInwardPO(null)} size="max-w-4xl">
                    <FabricIntakeForm
                        purchaseOrder={inwardPO}
                        onClose={() => setInwardPO(null)}
                        onSave={async (payload) => {
                            await storeManagerApi.createFabricIntake(payload);
                            setInwardPO(null);
                            fetchData();
                        }}
                    />
                </Modal>
            )}
        </div>
    );
};

export default ProductionWorkflowDashboard;
