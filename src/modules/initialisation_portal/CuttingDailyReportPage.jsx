import React, { useState, useEffect, useMemo } from 'react';
import { initializationPortalApi } from '../../api/initializationPortalApi';
import { Loader2, Download, Search, Calendar, FileText } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const CuttingDailyReportPage = () => {
    const [data, setData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // Default to today's date for both start and end
    const today = new Date().toISOString().split('T')[0];
    const [startDate, setStartDate] = useState(today);
    const [endDate, setEndDate] = useState(today);

    const fetchData = async (e) => {
        if (e) e.preventDefault(); // Prevent form submission refresh
        setIsLoading(true);
        try {
            const res = await initializationPortalApi.getDailyReport(startDate, endDate);
            setData(res.data); 
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    // Load initial data on mount
    useEffect(() => { fetchData(); }, []);

    // --- Totals Calculation ---
    const totals = useMemo(() => {
        return data.reduce((acc, row) => {
            acc.cut_qty += parseFloat(row.cut_qty || 0);
            acc.load_qty += parseFloat(row.load_qty || 0);
            acc.cut_wip += (parseFloat(row.cut_qty || 0) - parseFloat(row.load_qty || 0));
            acc.assigned_fabric += parseFloat(row.assigned_fabric || 0);
            acc.consumed_fabric += parseFloat(row.consumed_fabric || 0); 
            acc.rejection += parseFloat(row.rejection || 0);
            
            const rowStock = parseFloat(row.assigned_fabric || 0) - parseFloat(row.consumed_fabric || 0) - parseFloat(row.rejection || 0);
            acc.fab_stock += rowStock;
            return acc;
        }, { 
            cut_qty: 0, load_qty: 0, cut_wip: 0, 
            assigned_fabric: 0, consumed_fabric: 0, rejection: 0, fab_stock: 0 
        });
    }, [data]);

    const avgPerPc = totals.cut_qty > 0 ? (totals.consumed_fabric / totals.cut_qty).toFixed(2) : 0;

    // --- PDF Generator ---
    const handleDownloadPDF = () => {
        if (!data || data.length === 0) {
            alert("No data available to export for the selected date range.");
            return;
        }

        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' }); // A3 for wide table
        
        doc.setFontSize(18);
        doc.text("CUTTING MANAGER DAILY REPORT", 14, 15);
        doc.setFontSize(10);
        doc.text(`Date Range: ${startDate} to ${endDate}`, 14, 22);
        doc.text(`Generated On: ${new Date().toLocaleString()}`, 14, 27);

        const tableColumn = [
            "PO No", "Batch", "Len", "Sizes", "Style", 
            "Cut Date", "Cut Qty", "Load Qty", "Line", "Cut WIP", "Stage",
            "Assigned Fab", "Cons. Fab", "Rej", "Fab Stock", "Avg/Pc"
        ];

        const tableRows = data.map(row => {
            const wip = row.cut_qty - row.load_qty;
            const fabStock = row.assigned_fabric - row.consumed_fabric - row.rejection;
            const avg = row.cut_qty > 0 ? (row.consumed_fabric / row.cut_qty).toFixed(2) : "0";
            
            // Determine Stage based on status
            let stage = "PLANNING";
            if (row.cut_qty > 0) stage = "IN CUTTING";
            if (row.load_qty > 0) stage = "LOADING";
            if (row.batch_status === 'COMPLETED') stage = "COMPLETED";

            return [
                row.po_code || '-',
                row.batch_code || `#${row.batch_id}`,
                row.length_of_layer_inches || '-',
                row.sizes || '-',
                row.style_name,
                row.cut_date ? new Date(row.cut_date).toLocaleDateString() : '-',
                row.cut_qty,
                row.load_qty,
                row.line_name || '-',
                wip,
                stage,
                parseFloat(row.assigned_fabric).toFixed(2),
                parseFloat(row.consumed_fabric).toFixed(2),
                parseFloat(row.rejection).toFixed(2),
                fabStock.toFixed(2),
                avg
            ];
        });

        // Summary Row
        const summaryRow = [
            "TOTAL", "", "", "", "", "",
            totals.cut_qty, totals.load_qty, "", totals.cut_wip, "",
            totals.assigned_fabric.toFixed(2), totals.consumed_fabric.toFixed(2), 
            totals.rejection.toFixed(2), totals.fab_stock.toFixed(2), avgPerPc
        ];

        autoTable(doc, {
            head: [tableColumn],
            body: [...tableRows, summaryRow],
            startY: 32,
            styles: { fontSize: 8, cellPadding: 2, valign: 'middle', halign: 'center', lineColor: 200, lineWidth: 0.1 },
            headStyles: { fillColor: [50, 50, 50], textColor: 255, fontStyle: 'bold' },
            columnStyles: {
                3: { cellWidth: 40 }, // Sizes column wider
                4: { cellWidth: 30 }  // Style column wider
            },
            didParseCell: (data) => {
                // Style Summary Row
                if (data.row.index === tableRows.length) {
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.fillColor = [255, 255, 0]; // Yellow
                    data.cell.styles.textColor = [0, 0, 0];
                }
            }
        });

        doc.save(`Cutting_Status_Report_${startDate}_to_${endDate}.pdf`);
    };

    return (
        <div className="p-6 bg-gray-100 min-h-screen font-inter">
            <header className="mb-6 bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800 flex items-center">
                            <FileText className="mr-2 text-blue-600"/> Cutting Status Report
                        </h1>
                        <p className="text-sm text-gray-500 mt-1">Overview of cutting production and fabric utilization by date.</p>
                    </div>
                    
                    {/* Date Range Filter Form */}
                    <form onSubmit={fetchData} className="flex flex-wrap items-end gap-3 bg-gray-50 p-3 rounded-lg border border-gray-100">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Start Date</label>
                            <div className="relative">
                                <Calendar className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
                                <input 
                                    type="date" 
                                    value={startDate} 
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none w-40"
                                    required
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">End Date</label>
                            <div className="relative">
                                <Calendar className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
                                <input 
                                    type="date" 
                                    value={endDate} 
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none w-40"
                                    required
                                />
                            </div>
                        </div>
                        <button type="submit" disabled={isLoading} className="flex items-center px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-70">
                            {isLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2"/> : <Search className="w-5 h-5 mr-2" />}
                            Generate
                        </button>
                        <button type="button" onClick={handleDownloadPDF} disabled={isLoading || data.length === 0} className="flex items-center px-4 py-2 bg-gray-800 text-white font-semibold rounded-md hover:bg-gray-900 shadow-sm transition-colors disabled:opacity-70">
                            <Download className="mr-2 h-4 w-4"/> Export PDF
                        </button>
                    </form>
                </div>
            </header>

            {isLoading ? <div className="flex justify-center p-12"><Loader2 className="animate-spin h-10 w-10 text-blue-600"/></div> : (
                <div className="bg-white border border-gray-300 rounded-lg overflow-hidden shadow-sm">
                    {data.length === 0 ? (
                        <div className="text-center p-12 text-gray-500 italic">No cutting records found in the selected date range.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left whitespace-nowrap">
                                <thead className="bg-gray-800 text-white uppercase tracking-wider">
                                    <tr>
                                        {/* Main Headers */}
                                        <th colSpan={11} className="py-2 px-3 text-center border-r border-gray-600 bg-gray-900">Cutting Status</th>
                                        <th colSpan={5} className="py-2 px-3 text-center bg-blue-900">Fabric Status</th>
                                    </tr>
                                    <tr className="text-[10px]">
                                        <th className="py-3 px-2">PO Number</th>
                                        <th className="py-3 px-2">Batch ID</th>
                                        <th className="py-3 px-2">Len</th>
                                        <th className="py-3 px-2">Sizes</th>
                                        <th className="py-3 px-2">Style</th>
                                        <th className="py-3 px-2 text-right">Cut Date</th>
                                        <th className="py-3 px-2 text-right">Cut Qty</th>
                                        <th className="py-3 px-2 text-right">Load Qty</th>
                                        <th className="py-3 px-2">Line</th>
                                        <th className="py-3 px-2 text-right">WIP</th>
                                        <th className="py-3 px-2 border-r border-gray-600">Stage</th>
                                        
                                        <th className="py-3 px-2 text-right">Assigned</th>
                                        <th className="py-3 px-2 text-right">Consumed</th>
                                        <th className="py-3 px-2 text-right">Rej.</th>
                                        <th className="py-3 px-2 text-right">Stock</th>
                                        <th className="py-3 px-2 text-right">Avg/Pc</th>
                                    </tr>
                                </thead>
                                
                                {/* Summary Row (Sticky Top) */}
                                <tbody className="bg-yellow-100 font-bold border-b-2 border-gray-300 text-gray-900">
                                    <tr>
                                        <td colSpan={6} className="py-2 px-2 text-right uppercase">Date Range Total:</td>
                                        <td className="py-2 px-2 text-right text-blue-700">{totals.cut_qty}</td>
                                        <td className="py-2 px-2 text-right text-green-700">{totals.load_qty}</td>
                                        <td className="py-2 px-2"></td>
                                        <td className="py-2 px-2 text-right text-red-600">{totals.cut_wip}</td>
                                        <td className="py-2 px-2 border-r border-gray-300"></td>
                                        <td className="py-2 px-2 text-right">{totals.assigned_fabric.toFixed(2)}</td>
                                        <td className="py-2 px-2 text-right">{totals.consumed_fabric.toFixed(2)}</td>
                                        <td className="py-2 px-2 text-right text-red-600">{totals.rejection.toFixed(2)}</td>
                                        <td className="py-2 px-2 text-right">{totals.fab_stock.toFixed(2)}</td>
                                        <td className="py-2 px-2 text-right">{avgPerPc}</td>
                                    </tr>
                                </tbody>

                                <tbody className="divide-y divide-gray-200">
                                    {data.map((row, idx) => {
                                        const wip = parseFloat(row.cut_qty) - parseFloat(row.load_qty);
                                        const fabStock = parseFloat(row.assigned_fabric) - parseFloat(row.consumed_fabric) - parseFloat(row.rejection);
                                        const avg = row.cut_qty > 0 ? (row.consumed_fabric / row.cut_qty).toFixed(2) : "-";
                                        
                                        let stage = "PLANNING";
                                        let stageColor = "text-gray-400";
                                        if(row.cut_qty > 0) { stage = "IN CUTTING"; stageColor = "text-blue-600"; }
                                        if(row.load_qty > 0) { stage = "LOADING"; stageColor = "text-purple-600"; }
                                        if(row.batch_status === 'COMPLETED') { stage = "DONE"; stageColor = "text-green-600 font-bold"; }

                                        return (
                                            <tr key={idx} className="hover:bg-blue-50 transition-colors">
                                                <td className="py-2 px-2 font-medium">{row.po_code || '-'}</td>
                                                <td className="py-2 px-2 font-mono text-blue-700 font-bold">{row.batch_code || `#${row.batch_id}`}</td>
                                                <td className="py-2 px-2">{row.length_of_layer_inches || '-'}</td>
                                                <td className="py-2 px-2 text-[10px] max-w-[150px] truncate" title={row.sizes}>{row.sizes}</td>
                                                <td className="py-2 px-2 font-medium truncate max-w-[120px]" title={row.style_name}>{row.style_name}</td>
                                                <td className="py-2 px-2 text-right text-gray-500">{row.cut_date ? new Date(row.cut_date).toLocaleDateString(undefined, {month:'short', day:'numeric'}) : '-'}</td>
                                                <td className="py-2 px-2 text-right font-bold text-blue-700">{row.cut_qty}</td>
                                                <td className="py-2 px-2 text-right text-green-700 font-medium">{row.load_qty}</td>
                                                <td className="py-2 px-2 text-[10px]">{row.line_name || '-'}</td>
                                                <td className={`py-2 px-2 text-right font-bold ${wip > 0 ? 'text-amber-600' : 'text-gray-300'}`}>{wip}</td>
                                                <td className={`py-2 px-2 border-r border-gray-200 text-[10px] uppercase ${stageColor}`}>{stage}</td>
                                                
                                                <td className="py-2 px-2 text-right">{parseFloat(row.assigned_fabric).toFixed(2)}</td>
                                                <td className="py-2 px-2 text-right">{parseFloat(row.consumed_fabric).toFixed(2)}</td>
                                                <td className="py-2 px-2 text-right text-red-500">{parseFloat(row.rejection) > 0 ? parseFloat(row.rejection).toFixed(2) : '-'}</td>
                                                <td className={`py-2 px-2 text-right font-bold ${fabStock < 0 ? 'text-red-600' : 'text-green-600'}`}>{fabStock.toFixed(2)}</td>
                                                <td className="py-2 px-2 text-right font-mono">{avg}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default CuttingDailyReportPage;