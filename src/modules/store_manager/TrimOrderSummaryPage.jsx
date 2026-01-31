import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
    ArrowLeft, Package, Calendar, User, Layers, 
    Clock, CheckCircle, AlertCircle, Box, Download 
} from 'lucide-react';
import { storeManagerApi } from '../../api/storeManagerApi'; 
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- UTILS ---
const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', 
        hour: 'numeric', minute: 'numeric', hour12: true
    });
};

const TrimOrderSummaryPage = () => {
    const params = useParams();
    const orderId = params.orderId || '1001'; 
    
    // Fixed: Call useNavigate unconditionally
    const navigateHook = useNavigate();
    const navigate = navigateHook || ((path) => console.log(`Maps to: ${path}`));
    
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchSummary = async () => {
            setLoading(true);
            try {
                let res;
                res = await storeManagerApi.getTrimOrderSummary(orderId); 
                
                setData(res.data);
            } catch (err) {
                setError(err.message || "Failed to load order summary");
            } finally {
                setLoading(false);
            }
        };
        fetchSummary();
    }, [orderId]);

    const handleDownloadPDF = () => {
        if (!data) return;
        const { order, consumption_report } = data;
        const doc = new jsPDF();

        // 1. Header
        doc.setFontSize(18);
        doc.setTextColor(0, 0, 0);
        doc.text(`Inventory Consumption Report - Order #${order.id}`, 14, 20);

        doc.setFontSize(10);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 26);
        doc.text(`Batch: ${order.batch_code} | Product: ${order.product_name}`, 14, 32);

        // 2. Consumption Report Table
        const consumptionRows = consumption_report.map(report => [
            `${report.item_name}\n${report.brand}`,
            report.color_name,
            report.total_consumed
        ]);

        autoTable(doc, {
            startY: 40,
            head: [['Item / Brand', 'Color', 'Total Consumed']],
            body: consumptionRows,
            theme: 'grid',
            headStyles: { fillColor: [240, 240, 240], textColor: 0, lineWidth: 0.1, lineColor: 0 },
            styles: { textColor: 0, lineWidth: 0.1, lineColor: 0 },
            columnStyles: {
                2: { halign: 'right', fontStyle: 'bold' }
            }
        });

        doc.save(`Trim_Consumption_Report_${order.id}.pdf`);
    };

    if (loading) return <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
    if (error) return <div className="p-6 text-red-600 bg-red-50 rounded-lg">{error}</div>;
    if (!data) return null;

    const { order, items, consumption_report } = data;

    const getStatusBadge = (status) => {
        const styles = {
            PENDING: "bg-yellow-100 text-yellow-800 border-yellow-200",
            PARTIAL: "bg-blue-100 text-blue-800 border-blue-200",
            COMPLETED: "bg-green-100 text-green-800 border-green-200",
        };
        return (
            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${styles[status] || "bg-gray-100"}`}>
                {status}
            </span>
        );
    };

    return (
        <div className="p-6 max-w-5xl mx-auto bg-gray-50 min-h-screen font-inter">
            <div className="flex justify-between items-center mb-6">
                <button onClick={() => navigate(-1)} className="flex items-center text-gray-600 hover:text-gray-900">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back to Orders
                </button>
                <button 
                    onClick={handleDownloadPDF} 
                    className="flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 text-sm font-medium transition-colors"
                >
                    <Download className="w-4 h-4 mr-2" /> Download PDF Report
                </button>
            </div>

            {/* Order Header */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
                <div className="flex flex-col md:flex-row justify-between md:items-start gap-4">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h1 className="text-2xl font-bold text-gray-900">Trim Order #{order.id}</h1>
                            {getStatusBadge(order.status)}
                        </div>
                        <p className="text-gray-500 text-sm flex items-center">
                            <Calendar className="w-3 h-3 mr-1" /> Created {formatDate(order.created_at)}
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-sm font-medium text-gray-500 uppercase">Production Batch</p>
                        <p className="text-lg font-bold text-blue-600">{order.batch_code}</p>
                        <p className="text-sm text-gray-600">{order.product_name}</p>
                    </div>
                </div>
            </div>

            {/* Inventory Consumption Report */}
            <div className="mb-8">
                <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                    <Box className="w-5 h-5 mr-2 text-purple-600"/> 
                    Inventory Consumption Report
                    <span className="ml-2 text-xs font-normal text-gray-500 bg-gray-100 px-2 py-1 rounded-full">What was actually used</span>
                </h2>
                <div className="grid grid-cols-1 gap-4">
                    {consumption_report.map((report, idx) => (
                        <div key={idx} className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between shadow-sm">
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <h3 className="font-bold text-gray-900">{report.item_name}</h3>
                                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{report.brand}</span>
                                </div>
                                <p className="text-sm text-gray-600 mt-1">Variant Color: <span className="font-semibold">{report.color_name}</span></p>
                                <div className="mt-2 text-xs text-gray-500">
                                    <span className="font-medium">Used for:</span>
                                    <ul className="ml-4 list-disc mt-1 space-y-1">
                                        {report.usage_breakdown.map((usage, i) => (
                                            <li key={i}>
                                                {usage.order_item_name} ({usage.order_item_color}) - 
                                                <span className="font-mono font-bold ml-1">{usage.quantity} units</span>
                                                {usage.is_substitution && (
                                                    <span className="ml-2 text-[10px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200">SUBSTITUTE</span>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                            <div className="mt-4 md:mt-0 md:text-right pl-0 md:pl-6 border-l-0 md:border-l border-gray-100">
                                <p className="text-xs text-gray-500 uppercase tracking-wider font-bold">Total Consumed</p>
                                <p className="text-2xl font-bold text-purple-700">{report.total_consumed}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <hr className="border-gray-200 my-8" />

            {/* Detailed Request Tracking */}
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                <Layers className="w-5 h-5 mr-2 text-blue-600"/> 
                Request Details
                <span className="ml-2 text-xs font-normal text-gray-500 bg-gray-100 px-2 py-1 rounded-full">Did we fulfill the requirement?</span>
            </h2>
            <div className="space-y-4">
                {items.map((item) => {
                    const percent = Math.min(100, Math.round((item.quantity_fulfilled / item.quantity_required) * 100));
                    
                    return (
                        <div key={item.order_item_id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            {/* Item Header */}
                            <div className="p-5 border-b border-gray-100 bg-gray-50/50">
                                <div className="flex justify-between items-start">
                                    <div className="flex gap-4">
                                        <div className="w-12 h-12 bg-white border border-gray-200 rounded-lg flex items-center justify-center">
                                            <Package className="w-6 h-6 text-gray-400" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-gray-900">{item.item_name}</h3>
                                            <p className="text-sm text-gray-500">
                                                {item.brand} • <span className="font-medium text-gray-700">{item.color_name}</span> {item.color_number && `(${item.color_number})`}
                                            </p>
                                            <div className="mt-1 text-xs text-gray-400">Requested Variant ID: {item.requested_variant_id}</div>
                                        </div>
                                    </div>
                                    
                                    <div className="text-right min-w-[120px]">
                                        <div className="text-sm font-medium text-gray-500 mb-1">Fulfillment Progress</div>
                                        <div className="flex items-end justify-end gap-1 mb-1">
                                            <span className={`text-xl font-bold ${item.is_fulfilled ? 'text-green-600' : 'text-gray-800'}`}>
                                                {item.quantity_fulfilled}
                                            </span>
                                            <span className="text-sm text-gray-400 mb-1">/ {item.quantity_required}</span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-2">
                                            <div 
                                                className={`h-2 rounded-full ${item.is_fulfilled ? 'bg-green-500' : 'bg-blue-500'}`} 
                                                style={{ width: `${percent}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Detailed Log Table showing ACTUAL items used */}
                            {item.logs.length > 0 ? (
                                <div className="p-4 bg-white">
                                    <h4 className="text-xs font-bold text-gray-400 uppercase mb-3 flex items-center">
                                        <Clock className="w-3 h-3 mr-1" /> Fulfillment History
                                    </h4>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-gray-50 text-gray-500">
                                                <tr>
                                                    <th className="px-4 py-2 font-medium rounded-l-md">Date & Time</th>
                                                    <th className="px-4 py-2 font-medium">Item Used</th>
                                                    <th className="px-4 py-2 font-medium">Issued By</th>
                                                    <th className="px-4 py-2 font-medium text-right rounded-r-md">Qty</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {item.logs.map((log) => {
                                                    const isSubstitute = log.fulfilled_with_variant_id !== item.requested_variant_id;
                                                    return (
                                                        <tr key={log.id} className="hover:bg-gray-50">
                                                            <td className="px-4 py-2 text-gray-600">
                                                                {formatDate(log.fulfilled_at)}
                                                            </td>
                                                            <td className="px-4 py-2">
                                                                <div className="font-medium text-gray-900">{log.used_item_name}</div>
                                                                <div className="text-xs text-gray-500">{log.used_color_name} ({log.used_item_brand})</div>
                                                                {isSubstitute && (
                                                                    <span className="inline-flex items-center mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800">
                                                                        <AlertCircle className="w-3 h-3 mr-1" /> Substituted
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-2 text-gray-600">
                                                                {log.fulfilled_by}
                                                            </td>
                                                            <td className="px-4 py-2 text-right font-mono font-bold text-blue-600">
                                                                +{log.quantity_fulfilled}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-4 bg-gray-50 text-center text-sm text-gray-400 italic border-t border-gray-100">
                                    No fulfillment records yet.
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default TrimOrderSummaryPage;