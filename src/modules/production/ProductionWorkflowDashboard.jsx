import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    Search, Filter, Plus, Box, FileText, ShoppingCart, 
    Scissors, ChevronRight, ChevronDown, Clock, AlertCircle, 
    Loader2, X, Truck, Layers, Package, Printer, LayoutList, ChevronUp, Edit3, Trash2, DollarSign, Palette
} from 'lucide-react';
import { productionManagerApi } from '../../api/productionManagerApi';
import { accountingApi } from '../../api/accountingApi'; 
import { storeManagerApi } from '../../api/storeManagerApi'; 
import Modal from '../../shared/Modal';
import { useAuth } from '../../context/AuthContext';
import jsPDF from 'jspdf'; 
import autoTable from 'jspdf-autotable'; 

const Spinner = () => <div className="flex justify-center p-8"><Loader2 className="animate-spin h-8 w-8 text-blue-600" /></div>;

// --- CONSTANTS & STYLES ---
const NODE_WIDTH = 260;
const NODE_HEIGHT = 150; 
const GAP_X = 80;
const GAP_Y = 20;

// --- STATUS BADGE COMPONENT ---
const StatusBadge = ({ status }) => {
    const colors = {
        'CONFIRMED': 'bg-blue-100 text-blue-700 border-blue-200',
        'RECEIVED': 'bg-green-100 text-green-700 border-green-200',
        'COMPLETED': 'bg-emerald-100 text-emerald-700 border-emerald-200',
        'IN_PROGRESS': 'bg-indigo-100 text-indigo-700 border-indigo-200',
        'ISSUED': 'bg-amber-100 text-amber-700 border-amber-200',
        'DRAFT': 'bg-gray-100 text-gray-600 border-gray-200',
        'PENDING': 'bg-yellow-50 text-yellow-700 border-yellow-200'
    };
    return (
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${colors[status] || 'bg-gray-100 text-gray-500'}`}>
            {status ? status.replace('_', ' ') : 'N/A'}
        </span>
    );
};

// --- CONNECTORS ---
const Connector = ({ start, end }) => {
    const p1 = { x: start.x, y: start.y };
    const p2 = { x: end.x, y: end.y };
    const dist = Math.abs(p2.x - p1.x);
    const controlPointOffset = dist * 0.5;
    const c1 = { x: p1.x + controlPointOffset, y: p1.y };
    const c2 = { x: p2.x - controlPointOffset, y: p2.y };
    const path = `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;
    return <path d={path} fill="none" stroke="#cbd5e1" strokeWidth="2" />;
};

// --- NODE COMPONENTS ---
const SalesOrderNode = ({ data, x, y, onDetails, onAddPO }) => (
    <div 
        className="absolute bg-white rounded-xl shadow-sm border border-l-4 border-l-blue-500 border-slate-200 p-3 hover:shadow-md transition-all cursor-pointer group"
        style={{ width: NODE_WIDTH, height: NODE_HEIGHT, left: x, top: y }}
        onClick={(e) => { e.stopPropagation(); onDetails(data.id); }} 
    >
        <div className="flex justify-between items-start mb-2">
            <div className="flex items-center gap-2">
                <div className="p-1 bg-blue-50 rounded-lg">
                    <FileText className="text-blue-600" size={14} />
                </div>
                <span className="font-bold text-slate-700 text-sm">{data.order_number}</span>
            </div>
            <StatusBadge status={data.status} />
        </div>
        <p className="text-xs text-slate-800 font-semibold truncate" title={data.customer_name}>{data.customer_name}</p>
        <p className="text-[10px] text-slate-400 mt-1">Date: {new Date(data.order_date).toLocaleDateString()}</p>
        
        <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
            <button 
                onClick={(e) => { e.stopPropagation(); onAddPO(data.id); }} 
                className="flex items-center gap-1 text-[10px] bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 font-medium shadow-sm transition-colors"
            >
                <Plus size={10} /> Add PO
            </button>
        </div>
    </div>
);

const PurchaseOrderNode = ({ data, x, y, onDetails, onCreateBatch, onDeletePO }) => {
    const { user } = useAuth();
    const ordered = parseFloat(data.total_ordered_qty || 0);
    const received = parseFloat(data.total_received_qty || 0);
    const percent = ordered > 0 ? Math.min(100, Math.round((received / ordered) * 100)) : 0;
    
    const canPlanBatch = user && ['factory_admin', 'cutting_manager', 'production_manager'].includes(user.role);
    const canDeletePO = user && ['production_manager', 'factory_admin'].includes(user.role);
    
    let progressColor = 'bg-amber-500';
    if (percent >= 100) progressColor = 'bg-green-500';
    else if (percent > 0) progressColor = 'bg-blue-500';

    return (
        <div 
            className="absolute bg-white rounded-xl shadow-sm border border-l-4 border-l-amber-500 border-slate-200 p-3 hover:shadow-md transition-all cursor-pointer group"
            style={{ width: NODE_WIDTH, height: NODE_HEIGHT, left: x, top: y }}
            onClick={(e) => { e.stopPropagation(); onDetails(data.id); }} 
        >
            <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                    <div className="p-1 bg-amber-50 rounded-lg">
                        <ShoppingCart className="text-amber-600" size={14} />
                    </div>
                    <span className="font-bold text-slate-700 text-sm">{data.po_code || data.po_number}</span>
                </div>
                <StatusBadge status={data.status} />
            </div>
            <p className="text-xs text-slate-800 font-medium truncate">{data.supplier_name}</p>
            <p className="text-[10px] text-slate-500 mt-0.5 truncate">Delivery: {data.expected_delivery_date ? new Date(data.expected_delivery_date).toLocaleDateString() : 'N/A'}</p>

            <div className="mt-3">
                <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                    <span>Recv: {received} / {ordered}</span>
                    <span className="font-bold">{percent}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${progressColor}`} style={{ width: `${percent}%` }}></div>
                </div>
            </div>

            <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                {canDeletePO && (
                    <button 
                        onClick={(e) => { 
                            e.stopPropagation(); 
                            if(window.confirm(`Delete Purchase Order ${data.po_code}?`)) {
                                onDeletePO(data.id);
                            }
                        }}
                        className="p-1.5 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                        title="Delete Purchase Order"
                    >
                        <Trash2 size={12} />
                    </button>
                )}
                {canPlanBatch && (
                    <button 
                        onClick={(e) => { e.stopPropagation(); onCreateBatch(data.id); }}
                        className="flex items-center gap-1 text-[10px] bg-amber-600 text-white px-2 py-1 rounded hover:bg-amber-700 font-medium shadow-sm transition-colors"
                    >
                        <Plus size={10} /> Plan Batch
                    </button>
                )}
            </div>
        </div>
    );
};

const BatchNode = ({ data, x, y, onViewDetails, onEditBatch, onDeleteBatch }) => {
    const { user } = useAuth();
    const canManage = user && ['production_manager', 'factory_admin'].includes(user.role);

    return (
        <div 
            className="absolute bg-white rounded-xl shadow-sm border border-l-4 border-l-emerald-500 border-slate-200 p-3 hover:shadow-md transition-all cursor-default"
            style={{ width: NODE_WIDTH, height: NODE_HEIGHT, left: x, top: y }}
        >
            <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                    <div className="p-1 bg-emerald-50 rounded-lg">
                        <Scissors className="text-emerald-600" size={14} />
                    </div>
                    <span className="font-bold text-slate-700 text-sm">{data.batch_code}</span>
                </div>
                <StatusBadge status={data.overall_status || 'PENDING'} />
            </div>
            
            <div className="mt-2">
                <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                    <span className="truncate max-w-[150px]">{data.product_name}</span>
                    <span>{data.overall_status === 'COMPLETED' ? '100%' : 'In Progress'}</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full ${data.overall_status === 'COMPLETED' ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: data.overall_status === 'COMPLETED' ? '100%' : '40%' }}></div>
                </div>
            </div>

            <div className="mt-3 flex justify-end gap-1.5">
                 {canManage && (
                    <button 
                        onClick={(e) => { 
                            e.stopPropagation(); 
                            if(window.confirm(`Are you sure you want to delete Batch ${data.batch_code}? This will revert assigned rolls to stock.`)) {
                                onDeleteBatch(data.id);
                            }
                        }}
                        className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Delete Batch"
                    >
                        <Trash2 size={12} />
                    </button>
                )}
                
                {canManage && (
                    <button 
                        onClick={(e) => { e.stopPropagation(); onEditBatch(data.id); }}
                        className="text-[10px] bg-slate-50 text-slate-600 hover:text-amber-600 hover:bg-amber-50 px-2 py-1 rounded border border-slate-200 flex items-center font-medium transition-colors"
                        title="Edit Batch"
                    >
                        <Edit3 size={10} className="mr-1" /> Edit
                    </button>
                )}
                
                <button 
                    onClick={(e) => { e.stopPropagation(); onViewDetails(data.id); }}
                    className="text-[10px] bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-2 py-1 rounded border border-indigo-100 flex items-center font-medium transition-colors"
                >
                    Details <ChevronRight size={10} className="ml-0.5" />
                </button>
            </div>
        </div>
    );
};

// --- GRAPH COMPONENT FOR SINGLE SALES ORDER ---
const WorkflowGraph = ({ so, onAddPO, onDetails, onPODetails, onCreateBatch, onViewBatchDetails, onEditBatch, onDeleteBatch, onDeletePO }) => {
    // Calculate Layout just for this SO tree
    const { nodes, connectors, height } = useMemo(() => {
        const nodesList = [];
        const connList = [];
        const startX = 20;
        let currentY = 20;
        
        const soX = startX;
        const poX = soX + NODE_WIDTH + GAP_X;
        const batchX = poX + NODE_WIDTH + GAP_X;

        const purchaseOrders = so.purchase_orders || [];
        
        let soCenterY = currentY;

        if (purchaseOrders.length === 0) {
            nodesList.push({ type: 'SALES_ORDER', data: so, x: soX, y: currentY });
            return { nodes: nodesList, connectors: connList, height: NODE_HEIGHT + 40 };
        }

        const poYPositions = [];

        purchaseOrders.forEach(po => {
            const batches = po.production_batches || [];
            let poY = currentY;
            
            if (batches.length > 0) {
                const batchYPositions = [];
                batches.forEach(batch => {
                    nodesList.push({ type: 'BATCH', data: batch, x: batchX, y: currentY });
                    batchYPositions.push(currentY);
                    currentY += NODE_HEIGHT + GAP_Y;
                });
                poY = (batchYPositions[0] + batchYPositions[batchYPositions.length - 1]) / 2;
                
                batchYPositions.forEach(bY => {
                    connList.push({
                        start: { x: poX + NODE_WIDTH, y: poY + (NODE_HEIGHT / 2) },
                        end: { x: batchX, y: bY + (NODE_HEIGHT / 2) }
                    });
                });
            } else {
                currentY += NODE_HEIGHT + GAP_Y;
            }

            nodesList.push({ type: 'PURCHASE_ORDER', data: po, x: poX, y: poY });
            poYPositions.push(poY);
        });

        const firstPOY = poYPositions[0];
        const lastPOY = poYPositions[poYPositions.length - 1];
        soCenterY = (firstPOY + lastPOY) / 2;

        nodesList.push({ type: 'SALES_ORDER', data: so, x: soX, y: soCenterY });

        poYPositions.forEach(pY => {
            connList.push({
                start: { x: soX + NODE_WIDTH, y: soCenterY + (NODE_HEIGHT / 2) },
                end: { x: poX, y: pY + (NODE_HEIGHT / 2) }
            });
        });

        return { nodes: nodesList, connectors: connList, height: currentY + 20 };

    }, [so]);

    return (
        <div style={{ position: 'relative', height: height, minWidth: '900px' }} className="bg-slate-50/50 rounded-lg border border-slate-100">
            <svg className="absolute top-0 left-0 w-full h-full pointer-events-none" style={{zIndex: 0}}>
                <defs>
                    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                        <polygon points="0 0, 10 3.5, 0 7" fill="#cbd5e1" />
                    </marker>
                </defs>
                {connectors.map((conn, i) => (
                    <Connector key={i} start={conn.start} end={conn.end} />
                ))}
            </svg>
            {nodes.map((node, i) => {
                if (node.type === 'SALES_ORDER') return <SalesOrderNode key={i} {...node} onDetails={onDetails} onAddPO={onAddPO} />;
                if (node.type === 'PURCHASE_ORDER') return <PurchaseOrderNode key={i} {...node} onDetails={onPODetails} onCreateBatch={onCreateBatch} onDeletePO={onDeletePO} />; 
                if (node.type === 'BATCH') return <BatchNode key={i} {...node} onViewDetails={onViewBatchDetails} onEditBatch={onEditBatch} onDeleteBatch={onDeleteBatch} />;
                return null;
            })}
        </div>
    );
};

// --- TABLE ROW COMPONENT ---
const SalesOrderTableRow = ({ so, onAddPO, onDetails, onPODetails, onCreateBatch, onViewBatchDetails, onEditBatch, onDeleteBatch, onDeletePO }) => {
    const [expanded, setExpanded] = useState(false);
    
    const poCount = so.purchase_orders?.length || 0;
    const batchCount = so.purchase_orders?.reduce((acc, po) => acc + (po.production_batches?.length || 0), 0) || 0;

    return (
        <React.Fragment>
            <tr 
                onClick={() => setExpanded(!expanded)}
                className={`border-b border-slate-100 transition-colors cursor-pointer group ${expanded ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}
            >
                <td className="px-6 py-4 w-12 text-center">
                     {expanded ? <ChevronUp size={16} className="text-blue-600"/> : <ChevronDown size={16} className="text-slate-400 group-hover:text-slate-600"/>}
                </td>
                <td className="px-6 py-4">
                    <div className="font-bold text-slate-800 text-sm"> <h3 className="font-bold text-lg text-slate-800 flex items-center">
                                                            <FileText size={18} className="mr-2 text-blue-600"/> 
                                                            {so.order_number}
                                                            {so.buyer_po_number && (
                                                                <span className="ml-3 px-2 py-0.5 bg-slate-200 text-slate-700 text-[10px] rounded-md border border-slate-300 font-bold uppercase tracking-wider shadow-sm">
                                                                    Ref: {so.buyer_po_number}
                                                                </span>
                                                            )}
                                                        </h3></div>
                    <div className="text-xs text-slate-500">{new Date(so.order_date).toLocaleDateString()}</div>
                </td>
                <td className="px-6 py-4 text-sm text-slate-700 font-medium">
                    {so.customer_name}
                </td>
                <td className="px-6 py-4">
                    <StatusBadge status={so.status} />
                </td>
                <td className="px-6 py-4 text-xs text-slate-500">
                    <div className="flex gap-3">
                        <span className="flex items-center"><ShoppingCart size={12} className="mr-1"/> {poCount} POs</span>
                        <span className="flex items-center"><Scissors size={12} className="mr-1"/> {batchCount} Batches</span>
                    </div>
                </td>
                <td className="px-6 py-4 text-right">
                    <button 
                        onClick={(e) => { e.stopPropagation(); onAddPO(so.id); }}
                        className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-md transition-colors"
                        title="Quick Add PO"
                    >
                        <Plus size={16}/>
                    </button>
                </td>
            </tr>
            
            {expanded && (
                <tr>
                    <td colSpan="6" className="p-4 bg-slate-50 border-b border-slate-200 shadow-inner">
                        <div className="overflow-x-auto">
                            <WorkflowGraph 
                                so={so} 
                                onAddPO={onAddPO} 
                                onDetails={onDetails}
                                onPODetails={onPODetails} 
                                onCreateBatch={onCreateBatch}
                                onViewBatchDetails={onViewBatchDetails}
                                onEditBatch={onEditBatch}
                                onDeleteBatch={onDeleteBatch}
                                onDeletePO={onDeletePO}
                            />
                        </div>
                    </td>
                </tr>
            )}
        </React.Fragment>
    );
};


// --- MODALS FOR DETAILED VIEW ---

const SalesOrderDetailsModal = ({ orderId, onClose }) => {
    const [order, setOrder] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => { 
        accountingApi.getSalesOrderDetails(orderId)
            .then(res => setOrder(res.data))
            .catch(console.error)
            .finally(() => setIsLoading(false)); 
    }, [orderId]);

    if (isLoading) return <Modal title="Loading Sales Order..." onClose={onClose}><Spinner/></Modal>;
    if (!order) return null;

    return (
        <Modal title={`Sales Order: ${order.order_number}`} onClose={onClose} size="max-w-4xl">
             <div className="space-y-6">
                
                {/* Header Information Grid */}
                <div className="bg-blue-50/50 p-5 rounded-xl border border-blue-100 grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
                    <div>
                        <span className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Customer</span>
                        <p className="font-semibold text-gray-800 text-base">{order.customer_name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{order.customer_email || 'No email provided'}</p>
                    </div>
                    <div>
                        <span className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Order Refs</span>
                        <p className="text-gray-700 flex items-center">
                            <span className="text-gray-400 text-xs mr-2">Buyer PO:</span> 
                            <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                                {order.buyer_po_number || 'N/A'}
                            </span>
                        </p>
                        <p className="text-gray-700 mt-1.5 flex items-center">
                            <span className="text-gray-400 text-xs mr-2">Status:</span> 
                            <StatusBadge status={order.status} />
                        </p>
                    </div>
                    <div>
                        <span className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Key Dates</span>
                        <p className="text-gray-700"><span className="text-gray-400 text-xs mr-1">Ordered:</span> {new Date(order.order_date).toLocaleDateString()}</p>
                        <p className="text-gray-700 mt-1"><span className="text-gray-400 text-xs mr-1">Delivery:</span> {order.delivery_date ? new Date(order.delivery_date).toLocaleDateString() : 'TBD'}</p>
                    </div>
                    <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100 text-center flex flex-col justify-center">
                        <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Total Amount</span>
                        <p className="font-extrabold text-emerald-600 text-xl flex items-center justify-center">
                            <DollarSign size={20} className="mr-0.5"/> {order.total_amount || '0.00'}
                        </p>
                    </div>
                </div>

                {/* Notes Section (if any) */}
                {order.notes && (
                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <span className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Order Notes</span>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{order.notes}</p>
                    </div>
                )}

                {/* Detailed Products Table */}
                <div>
                    <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center">
                        <Box size={20} className="mr-2 text-indigo-500"/> Order Items & Configuration
                    </h3>
                    <div className="overflow-x-auto border border-gray-200 rounded-xl shadow-sm">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-100 text-gray-600 border-b border-gray-200">
                                <tr>
                                    <th className="px-4 py-3 font-semibold uppercase text-xs tracking-wider w-1/4">Product Style</th>
                                    <th className="px-4 py-3 font-semibold uppercase text-xs tracking-wider w-1/6">Fabric Required</th>
                                    <th className="px-4 py-3 font-semibold uppercase text-xs tracking-wider w-1/4">Size Breakdown</th>
                                    <th className="px-4 py-3 font-semibold uppercase text-xs tracking-wider">Color Details & Qty</th>
                                    <th className="px-4 py-3 font-semibold uppercase text-xs tracking-wider text-right w-24">Item Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 bg-white">
                                {order.products.map((prod, idx) => {
                                    const totalQty = prod.colors ? prod.colors.reduce((sum, c) => sum + parseInt(c.quantity || 0), 0) : 0;
                                    return (
                                        <tr key={idx} className="hover:bg-gray-50/50 align-top transition-colors">
                                            <td className="px-4 py-4">
                                                <p className="font-bold text-gray-900">{prod.product_name}</p>
                                            </td>
                                            <td className="px-4 py-4 text-gray-600 font-medium">{prod.fabric_type}</td>
                                            <td className="px-4 py-4">
                                                <div className="flex flex-wrap gap-1.5">
                                                    {prod.size_breakdown && Object.entries(prod.size_breakdown).map(([size, ratio]) => (
                                                        <span key={size} className="flex flex-col items-center bg-indigo-50 border border-indigo-100 rounded-md min-w-[2.5rem] overflow-hidden shadow-sm">
                                                            <span className="w-full text-center bg-indigo-100 text-indigo-800 text-[9px] font-bold uppercase py-0.5">{size}</span>
                                                            <span className="text-indigo-900 font-extrabold text-xs py-1">{ratio}</span>
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-4 py-4">
                                                <div className="flex flex-col gap-2">
                                                    {prod.colors && prod.colors.length > 0 ? prod.colors.map((c, i) => (
                                                        <div key={i} className="flex justify-between items-center bg-white border border-gray-200 px-3 py-1.5 rounded-lg shadow-sm">
                                                            <span className="text-gray-700 font-medium flex items-center text-xs">
                                                                <Palette size={14} className="text-gray-400 mr-2"/>
                                                                {c.color_name} <span className="text-gray-400 font-normal ml-1">({c.color_number})</span>
                                                            </span>
                                                            <div className="flex items-center gap-3">
                                                                <span className="text-xs text-gray-500">${c.unit_price} /ea</span>
                                                                <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-xs">{c.quantity} pcs</span>
                                                            </div>
                                                        </div>
                                                    )) : <span className="text-xs text-gray-400 italic">No colors defined</span>}
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 text-right">
                                                <span className="font-extrabold text-gray-800 text-lg">{totalQty}</span>
                                                <span className="block text-[10px] text-gray-500 uppercase mt-0.5">Pieces</span>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {order.products.length === 0 && (
                                    <tr><td colSpan="5" className="px-4 py-8 text-center text-gray-500 italic">No products configured for this order.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            <div className="flex justify-end pt-5 border-t border-gray-100 mt-6">
                <button onClick={onClose} className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg font-bold transition-colors">Close</button>
            </div>
        </Modal>
    );
};

const PurchaseOrderDetailsModal = ({ poId, onClose }) => {
    const [po, setPo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [rolls, setRolls] = useState([]);
    
    useEffect(() => { 
        accountingApi.getPurchaseOrderDetails(poId)
            .then(res => setPo(res.data))
            .catch(console.error)
            .finally(() => setLoading(false)); 
    }, [poId]);

    useEffect(() => { 
        if (poId) {
            storeManagerApi.getFabricRollsByPO(poId)
                .then(res => setRolls(res.data))
                .catch(console.error); 
        }
    }, [poId]);

    if (loading) return <Modal title="Loading PO..." onClose={onClose}><Spinner/></Modal>;
    if (!po) return null;
    
    const handlePrintPO = () => {
        const doc = new jsPDF();
        doc.setFontSize(18);
        doc.text(`Purchase Order: ${po.po_code}`, 14, 20);
        doc.setFontSize(12);
        doc.text(`Supplier: ${po.supplier_name}`, 14, 30);
        
        autoTable(doc, { 
            startY: 40, 
            head: [['Fabric', 'Color', 'Qty', 'Unit', 'Price', 'Total']], 
            body: po.items.map(i => [
                i.fabric_type, 
                `${i.fabric_color} (${i.color_number || ''})`, 
                i.quantity, 
                i.uom, 
                `$${i.unit_price}`, 
                `$${i.total_price}`
            ]),
            theme: 'grid',
            headStyles: { fillColor: [63, 81, 181] }
        });
        doc.save(`PO_${po.po_code}.pdf`);
    };

    return (
        <Modal title={`Purchase Order: ${po.po_code || po.po_number}`} onClose={onClose} size="max-w-4xl">
             <div className="space-y-6">
                
                {/* Header Actions & Info */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-amber-50 p-5 rounded-xl border border-amber-100">
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-white rounded-lg shadow-sm text-amber-600">
                            <Truck size={24}/>
                        </div>
                        <div>
                            <p className="text-xs text-amber-700 font-bold uppercase tracking-wider mb-1">Supplier Info</p>
                            <p className="font-extrabold text-gray-900 text-lg">{po.supplier_name}</p>
                            <p className="text-sm text-gray-600">{po.supplier_email || 'No Email'} • {po.supplier_phone || 'No Phone'}</p>
                            <p className="text-xs text-gray-500 mt-1">{po.supplier_address}</p>
                        </div>
                    </div>
                    <div className="text-left md:text-right w-full md:w-auto bg-white p-4 rounded-lg shadow-sm border border-amber-100 flex flex-col justify-center">
                        <div className="flex justify-between md:justify-end items-center mb-2">
                            <span className="text-xs text-gray-500 font-bold uppercase mr-3">Status:</span>
                            <StatusBadge status={po.status} />
                        </div>
                        <p className="text-sm text-gray-700 font-medium">
                            <span className="text-gray-400 text-xs mr-1">Delivery:</span> 
                            {po.expected_delivery_date ? new Date(po.expected_delivery_date).toLocaleDateString() : 'N/A'}
                        </p>
                        <button 
                            onClick={handlePrintPO} 
                            className="mt-3 w-full flex items-center justify-center text-sm bg-indigo-600 text-white font-bold px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                        >
                            <Printer size={16} className="mr-2"/> Download PO PDF
                        </button>
                    </div>
                </div>

                {/* Items Table */}
                <div>
                    <h4 className="text-lg font-bold text-gray-800 mb-3 flex items-center">
                        <ShoppingCart size={20} className="mr-2 text-indigo-500"/> Order Requirements
                    </h4>
                    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-100 text-gray-600 border-b border-gray-200">
                                <tr>
                                    <th className="px-4 py-3 font-semibold uppercase text-xs tracking-wider">Fabric Type</th>
                                    <th className="px-4 py-3 font-semibold uppercase text-xs tracking-wider">Color Details</th>
                                    <th className="px-4 py-3 font-semibold uppercase text-xs tracking-wider text-right">Quantity</th>
                                    <th className="px-4 py-3 font-semibold uppercase text-xs tracking-wider text-right">Unit Price</th>
                                    <th className="px-4 py-3 font-semibold uppercase text-xs tracking-wider text-right bg-gray-50">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 bg-white">
                                {po.items.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-4 py-3 font-bold text-gray-800">{item.fabric_type}</td>
                                        <td className="px-4 py-3">
                                            <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-50 border border-slate-200 text-slate-700 font-medium text-xs">
                                                {item.fabric_color} <span className="text-slate-400 font-normal ml-1">({item.color_number})</span>
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <span className="font-extrabold text-blue-700 text-base">{item.quantity}</span> 
                                            <span className="text-xs text-gray-500 ml-1">{item.uom}</span>
                                        </td>
                                        <td className="px-4 py-3 text-right text-gray-600 font-medium">${item.unit_price}</td>
                                        <td className="px-4 py-3 text-right font-bold text-emerald-700 bg-emerald-50/30">${item.total_price}</td>
                                    </tr>
                                ))}
                                {po.items.length === 0 && (
                                    <tr><td colSpan="5" className="px-4 py-8 text-center text-gray-500 italic">No items listed for this Purchase Order.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Received Rolls Summary */}
                <div>
                    <h4 className="text-lg font-bold text-gray-800 mb-3 flex items-center">
                        <Layers size={20} className="mr-2 text-indigo-500"/> Received Rolls Log
                    </h4>
                    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                        {rolls.length === 0 ? (
                            <div className="text-center py-6">
                                <Package className="mx-auto h-8 w-8 text-gray-300 mb-2"/>
                                <p className="italic text-sm text-gray-500">No rolls have been received against this PO yet.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-60 overflow-y-auto pr-2">
                                {rolls.map(r => (
                                    <div key={r.id} className="flex justify-between items-center p-3 border border-gray-100 rounded-lg bg-gray-50 hover:border-blue-200 hover:bg-blue-50/50 transition-colors">
                                        <div>
                                            <span className="font-mono font-bold text-indigo-700 text-sm block">R-{r.id}</span>
                                            <span className="text-xs text-gray-600 truncate block max-w-[120px]" title={r.fabric_type}>{r.fabric_type}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="font-extrabold text-gray-800 block">{r.meter}<span className="text-xs text-gray-400 font-normal ml-0.5">m</span></span>
                                            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm ${r.status === 'IN_STOCK' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                                {r.status === 'IN_STOCK' ? 'Stock' : 'Prod'}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
             </div>
             
             <div className="flex justify-end pt-5 border-t border-gray-100 mt-6">
                <button onClick={onClose} className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg font-bold transition-colors">Close Viewer</button>
            </div>
        </Modal>
    );
};

// --- REFACTORED CREATE PO MODAL (Grouped UI) ---
const CreatePOModal = ({ salesOrderId, onClose, onSave }) => {
    const [supplierId, setSupplierId] = useState('');
    const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
    
    // New Grouped State Structure
    const [fabricGroups, setFabricGroups] = useState([
        {
            fabric_type_id: '',
            unit_price: '',
            colors: [{ fabric_color_id: '', quantity: '' }]
        }
    ]);
    
    const [suppliers, setSuppliers] = useState([]);
    const [fabricTypes, setFabricTypes] = useState([]);
    const [fabricColors, setFabricColors] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadOptions = async () => {
            try {
                const [intakeData, typesRes, colorsRes] = await Promise.all([
                    storeManagerApi.getFabricIntakeFormData(),
                    productionManagerApi.getFabricTypes(),
                    productionManagerApi.getFabricColors()
                ]);
                setSuppliers(intakeData.data.suppliers || []);
                setFabricTypes(typesRes.data || []);
                setFabricColors(colorsRes.data || []);
            } catch (error) {
                console.error("Failed to load PO form options", error);
            } finally {
                setIsLoading(false);
            }
        };
        loadOptions();
    }, []);

    // Handlers for Fabric Groups
    const addFabricGroup = () => {
        setFabricGroups([...fabricGroups, { fabric_type_id: '', unit_price: '', colors: [{ fabric_color_id: '', quantity: '' }] }]);
    };

    const removeFabricGroup = (index) => {
        if (fabricGroups.length > 1) {
            setFabricGroups(fabricGroups.filter((_, i) => i !== index));
        }
    };

    const updateFabricGroup = (index, field, value) => {
        const newGroups = [...fabricGroups];
        newGroups[index][field] = value;
        setFabricGroups(newGroups);
    };

    // Handlers for Colors within a Group
    const addColorToGroup = (groupIndex) => {
        const newGroups = [...fabricGroups];
        newGroups[groupIndex].colors.push({ fabric_color_id: '', quantity: '' });
        setFabricGroups(newGroups);
    };

    const removeColorFromGroup = (groupIndex, colorIndex) => {
        const newGroups = [...fabricGroups];
        if (newGroups[groupIndex].colors.length > 1) {
            newGroups[groupIndex].colors = newGroups[groupIndex].colors.filter((_, i) => i !== colorIndex);
            setFabricGroups(newGroups);
        }
    };

    const updateColorInGroup = (groupIndex, colorIndex, field, value) => {
        const newGroups = [...fabricGroups];
        newGroups[groupIndex].colors[colorIndex][field] = value;
        setFabricGroups(newGroups);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        
        if (!supplierId) return alert("Please select a supplier.");
        
        // Flatten the grouped structure into the flat array expected by the backend
        const formattedItems = [];
        
        fabricGroups.forEach(group => {
            if (!group.fabric_type_id) return; // Skip empty groups
            
            group.colors.forEach(color => {
                if (color.fabric_color_id && color.quantity) {
                    formattedItems.push({
                        fabric_type_id: parseInt(group.fabric_type_id, 10),
                        fabric_color_id: parseInt(color.fabric_color_id, 10),
                        quantity: parseFloat(color.quantity),
                        uom: 'meter', // Hardcoded context
                        unit_price: group.unit_price ? parseFloat(group.unit_price) : 0
                    });
                }
            });
        });

        if (formattedItems.length === 0) {
            return alert("Please ensure you have selected at least one Fabric Type, Color, and Quantity.");
        }

        onSave({
            sales_order_id: salesOrderId,
            supplier_id: parseInt(supplierId, 10),
            expected_delivery_date: expectedDeliveryDate || null,
            items: formattedItems
        });
    };

    if (isLoading) return <Modal title="Loading..." onClose={onClose}><Spinner/></Modal>;

    return (
        <Modal title="Create Detailed Purchase Order" onClose={onClose} size="max-w-4xl">
            <form onSubmit={handleSubmit} className="space-y-6">
                
                {/* Basic Info Section */}
                <div className="bg-gray-50 p-5 rounded-xl border border-gray-200 grid grid-cols-1 sm:grid-cols-2 gap-5 shadow-sm">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Supplier *</label>
                        <select 
                            className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white" 
                            value={supplierId} 
                            onChange={e => setSupplierId(e.target.value)} 
                            required
                        >
                            <option value="">Select a Supplier</option>
                            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Expected Delivery (Optional)</label>
                        <input 
                            type="date" 
                            className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white"
                            value={expectedDeliveryDate}
                            onChange={e => setExpectedDeliveryDate(e.target.value)}
                        />
                    </div>
                </div>

                {/* Fabric Groups Section */}
                <div className="max-h-[60vh] overflow-y-auto pr-2 space-y-6 pb-4">
                    {fabricGroups.map((group, groupIdx) => (
                        <div key={groupIdx} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm relative">
                            {/* Group Header (Fabric Type & Price) */}
                            <div className="bg-slate-50 p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-end gap-4">
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-indigo-600 uppercase tracking-wider mb-1.5">Fabric Type *</label>
                                    <select 
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium"
                                        value={group.fabric_type_id}
                                        onChange={e => updateFabricGroup(groupIdx, 'fabric_type_id', e.target.value)}
                                        required
                                    >
                                        <option value="">Select Fabric Type</option>
                                        {fabricTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                    </select>
                                </div>
                                <div className="w-full md:w-48">
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Unit Price (₹/m)</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-2.5 text-slate-400 text-sm">$</span>
                                        <input 
                                            type="number" 
                                            min="0" 
                                            step="0.01"
                                            placeholder="0.00"
                                            className="w-full p-2.5 pl-7 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                            value={group.unit_price}
                                            onChange={e => updateFabricGroup(groupIdx, 'unit_price', e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="md:self-center pt-2 md:pt-0">
                                    {fabricGroups.length > 1 && (
                                        <button 
                                            type="button" 
                                            onClick={() => removeFabricGroup(groupIdx)}
                                            className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-lg transition-colors flex items-center text-sm font-bold"
                                            title="Remove Fabric Block"
                                        >
                                            <Trash2 size={16} className="md:mr-0 mr-2" /> <span className="md:hidden">Remove Block</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Colors inside this Fabric Group */}
                            <div className="p-4 bg-white">
                                <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center">
                                    <Palette size={14} className="mr-2"/> Colors & Quantities
                                </h5>
                                <div className="space-y-3">
                                    {group.colors.map((color, colorIdx) => (
                                        <div key={colorIdx} className="flex flex-wrap md:flex-nowrap items-center gap-3">
                                            <div className="flex-1 min-w-[200px]">
                                                <select 
                                                    className="w-full p-2 border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                                    value={color.fabric_color_id}
                                                    onChange={e => updateColorInGroup(groupIdx, colorIdx, 'fabric_color_id', e.target.value)}
                                                    required
                                                >
                                                    <option value="" disabled>Select Color</option>
                                                    {fabricColors.map(c => <option key={c.id} value={c.id}>{c.color_number} - {c.name}</option>)}
                                                </select>
                                            </div>
                                            <div className="w-full md:w-40 relative">
                                                <span className="absolute right-3 top-2 text-slate-400 text-sm">m</span>
                                                <input 
                                                    type="number" 
                                                    min="0.1" 
                                                    step="0.1"
                                                    placeholder="Qty"
                                                    className="w-full p-2 pr-8 border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                                    value={color.quantity}
                                                    onChange={e => updateColorInGroup(groupIdx, colorIdx, 'quantity', e.target.value)}
                                                    required
                                                />
                                            </div>
                                            <div className="w-8 flex justify-center">
                                                {group.colors.length > 1 && (
                                                    <button 
                                                        type="button" 
                                                        onClick={() => removeColorFromGroup(groupIdx, colorIdx)}
                                                        className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-md transition-colors"
                                                        title="Remove Color"
                                                    >
                                                        <X size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <button 
                                    type="button" 
                                    onClick={() => addColorToGroup(groupIdx)}
                                    className="mt-3 text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center hover:bg-indigo-50 px-2 py-1 rounded transition-colors"
                                >
                                    <Plus size={14} className="mr-1" /> Add Color Variant
                                </button>
                            </div>
                        </div>
                    ))}

                    <div className="pt-2">
                        <button 
                            type="button" 
                            onClick={addFabricGroup}
                            className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-bold hover:bg-slate-50 hover:text-slate-700 transition-colors flex items-center justify-center"
                        >
                            <Layers size={18} className="mr-2" /> Add Another Fabric Type
                        </button>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="flex justify-end pt-4 border-t border-gray-100 gap-3">
                    <button 
                        type="button" 
                        onClick={onClose} 
                        className="px-5 py-2.5 text-sm font-bold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        type="submit" 
                        className="px-6 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-md shadow-blue-600/20 transition-all flex items-center"
                    >
                        <ShoppingCart size={16} className="mr-2"/> Create Purchase Order
                    </button>
                </div>
            </form>
        </Modal>
    );
};

// --- MAIN DASHBOARD ---
const ProductionWorkflowDashboard = () => {
    const navigate = useNavigate();
    const [data, setData] = useState([]);
    const [filteredData, setFilteredData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState('ALL');
    const [searchText, setSearchText] = useState(''); 

    // Modal States
    const [selectedSOId, setSelectedSOId] = useState(null); 
    const [poModalSOId, setPoModalSOId] = useState(null);  
    const [selectedPOId, setSelectedPOId] = useState(null); 

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await productionManagerApi.getWorkflowData(); 
            const sorted = res.data.sort((a, b) => new Date(b.order_date) - new Date(a.order_date)); 
            setData(sorted);
            setFilteredData(sorted);
        } catch (err) {
            console.error("Failed to fetch workflow data", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    // Filter Logic
    useEffect(() => {
        let result = data;
        if (filterStatus !== 'ALL') {
            result = result.filter(so => so.status === filterStatus);
        }
        if (searchText) {
            const lowerText = searchText.toLowerCase();
            result = result.filter(so => 
                so.order_number.toLowerCase().includes(lowerText) ||
                so.customer_name.toLowerCase().includes(lowerText)
            );
        }
        setFilteredData(result);
    }, [data, filterStatus, searchText]);

    // Action Handlers
    const handleAddPO = (salesOrderId) => setPoModalSOId(salesOrderId);
    const handleViewPODetails = (poId) => setSelectedPOId(poId); 
    
    const handleCreatePOSubmit = async (formData) => {
        try {
            await accountingApi.createPurchaseOrder(formData);
            setPoModalSOId(null);
            fetchData();
        } catch (err) { alert("Failed to create Purchase Order."); }
    };

    const handleCreateBatch = (purchaseOrderId) => {
         navigate(`/production-manager/batches/new?poId=${purchaseOrderId}`);
    };
    
    const handleEditBatch = (batchId) => {
        navigate(`/production-manager/batches/edit/${batchId}`);
    };

    const handleViewBatchDetails = (batchId) => {
        navigate(`/production-manager/batch-details/${batchId}`);
    };

    const handleDeleteBatch = async (batchId) => {
        try {
            if (productionManagerApi.deleteBatch) {
                await productionManagerApi.deleteBatch(batchId);
            } else {
                const token = localStorage.getItem('factory_token');
                await fetch(`http://localhost:5000/api/production-manager/batches/${batchId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
            }
            fetchData(); 
        } catch (err) {
            alert("Failed to delete batch. It may have progressed too far.");
            console.error(err);
        }
    };

    const handleDeletePO = async (poId) => {
        try {
            if (accountingApi.deletePurchaseOrder) {
                await accountingApi.deletePurchaseOrder(poId);
            } else {
                const token = localStorage.getItem('factory_token');
                const res = await fetch(`http://localhost:5000/api/accounts/purchase-orders/${poId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!res.ok) {
                    const errorData = await res.json();
                    throw new Error(errorData.error || "Failed to delete PO");
                }
            }
            fetchData();
        } catch (err) {
            alert(err.message || "Failed to delete Purchase Order.");
            console.error(err);
        }
    };

    return (
        <div className="flex h-screen bg-slate-50 font-inter overflow-hidden">
            {/* Sidebar / Filter Panel */}
            <div className="w-72 bg-white border-r border-slate-200 p-6 flex flex-col z-10 shadow-sm shrink-0 h-full overflow-y-auto">
                <h2 className="text-xl font-extrabold text-slate-800 mb-6 flex items-center">
                    <LayoutList className="mr-2 text-indigo-600" size={24}/> Workflow View
                </h2>
                
                <div className="space-y-6">
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Search Order</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 text-slate-400 w-4 h-4" />
                            <input 
                                type="text"
                                placeholder="SO Number or Customer..."
                                value={searchText}
                                onChange={(e) => setSearchText(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 block">Order Status</label>
                        <div className="space-y-1">
                            {['ALL', 'DRAFT', 'CONFIRMED', 'IN_PRODUCTION'].map(f => (
                                <button 
                                    key={f} 
                                    onClick={() => setFilterStatus(f)}
                                    className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${filterStatus === f ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'text-slate-600 hover:bg-slate-50 border border-transparent'}`}
                                >
                                    {f === 'ALL' ? 'All Orders' : f.replace('_', ' ')}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Table Area */}
            <div className="flex-1 overflow-auto p-8">
                {loading ? <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600 w-10 h-10"/></div> : (
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <table className="min-w-full text-left border-collapse">
                            <thead className="bg-slate-50 text-slate-500 font-semibold text-xs uppercase tracking-wider border-b border-slate-200 sticky top-0 z-10">
                                <tr>
                                    <th className="px-6 py-4 w-12"></th>
                                    <th className="px-6 py-4">Sales Order</th>
                                    <th className="px-6 py-4">Customer</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4">Metrics</th>
                                    <th className="px-6 py-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {filteredData.length > 0 ? (
                                    filteredData.map(so => (
                                        <SalesOrderTableRow 
                                            key={so.id} 
                                            so={so} 
                                            onAddPO={handleAddPO}
                                            onDetails={setSelectedSOId}
                                            onPODetails={handleViewPODetails}
                                            onCreateBatch={handleCreateBatch}
                                            onViewBatchDetails={handleViewBatchDetails}
                                            onEditBatch={handleEditBatch}
                                            onDeleteBatch={handleDeleteBatch}
                                            onDeletePO={handleDeletePO}
                                        />
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="6" className="px-6 py-12 text-center text-slate-400 italic">
                                            No sales orders found matching your criteria.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modals */}
            {selectedSOId && <SalesOrderDetailsModal orderId={selectedSOId} onClose={() => setSelectedSOId(null)} />}
            {selectedPOId && <PurchaseOrderDetailsModal poId={selectedPOId} onClose={() => setSelectedPOId(null)} />}
            {poModalSOId && <CreatePOModal salesOrderId={poModalSOId} onClose={() => setPoModalSOId(null)} onSave={handleCreatePOSubmit} />}
        </div>
    );
};

export default ProductionWorkflowDashboard;