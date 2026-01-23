import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { cuttingPortalApi } from '../../api/cuttingPortalApi';
import { 
    FiArrowLeft, FiPackage, FiScissors, FiAlertTriangle, 
    FiCheckCircle, FiFileText, FiPrinter, FiShare2, FiDownload 
} from 'react-icons/fi';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const Spinner = () => <div className="flex justify-center items-center p-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div></div>;

// Standard size sequence for sorting
const SIZE_ORDER = [
    'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL', '5XL', '6XL', 
    '24', '26', '28', '30', '32', '34', '36', '38', '40', '42', '44', '46', '48', '50'
];

const SIZE_LABELS = {
    'S': 'S(28)',
    'M': 'M(30)',
    'L': 'L(32)',
    'XL': 'XL(34)',
    'XXL': 'XXL(36)',
    '3XL': '3XL(38)',
    '4XL': '4XL(40)',
    '5XL': '5XL(42)',
    '6XL': '6XL(44)'
};

const getSizeLabel = (size) => SIZE_LABELS[size] || size;

const sortSizes = (a, b) => {
    // Exact match in predefined list
    const indexA = SIZE_ORDER.indexOf(a);
    const indexB = SIZE_ORDER.indexOf(b);

    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;

    // Try parsing as simple numbers if not in list
    const numA = parseFloat(a);
    const numB = parseFloat(b);
    if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
    }

    // Fallback to alphabetical
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
};

const BatchCuttingDetailsPage = () => {
    const { batchId } = useParams();
    const [details, setDetails] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchDetails = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await cuttingPortalApi.getBatchCuttingDetails(batchId);
            console.log("Fetched Batch Details:", response.data);
            setDetails(response.data);
        } catch (err) {
            console.error("Failed to fetch batch details:", err);
            setError("Could not load batch cutting details.");
        } finally {
            setIsLoading(false);
        }
    }, [batchId]);

    useEffect(() => {
        fetchDetails();
    }, [fetchDetails]);

    // --- Calculations using useMemo ---
    const summaryStats = useMemo(() => {
        if (!details) return { totalMeters: 0, totalPieces: 0, avgConsumption: 0, totalShortage: 0, allSizes: [] };

        let totalMeters = 0;
        let totalPieces = 0;
        const sizeTotals = {};
        const allSizesSet = new Set();

        (details.rolls || []).forEach(roll => {
            totalMeters += parseFloat(roll.meter || 0);
            (roll.cuts || []).forEach(cut => {
                const qty = parseInt(cut.quantity_cut || 0);
                totalPieces += qty;
                sizeTotals[cut.size] = (sizeTotals[cut.size] || 0) + qty;
                allSizesSet.add(cut.size);
            });
        });
        
        const totalShortage = (details.shortages || []).reduce((sum, shortage) => {
            return sum + parseFloat(shortage.meter || 0);
        }, 0);

        const avgConsumption = totalPieces > 0 ? (totalMeters - totalShortage) / totalPieces : 0;
        
        // Updated sorting logic here
        const allSizes = Array.from(allSizesSet).sort(sortSizes);

        return { totalMeters, totalPieces, avgConsumption, totalShortage, allSizes, sizeTotals };

    }, [details]);

    // --- Action Handlers ---
    const handleGeneratePDF = () => {
        if (!details) return;

        // 1. Landscape Orientation
        const doc = new jsPDF({ orientation: 'landscape' });

        // 2. Report Header & Prominent Batch Info
        const pageWidth = doc.internal.pageSize.getWidth();
        const now = new Date().toLocaleString();

        doc.setFontSize(10);
        doc.setTextColor(0);
        doc.text(`Generated: ${now}`, pageWidth - 14, 15, { align: 'right' });

        // Batch Code - Larger and Bold
        doc.setFontSize(30);
        doc.setTextColor(0);
        doc.setFont("helvetica", "bold");
        doc.text(`Batch: ${details.batch_code || `#${batchId}`}`, 14, 25);

        // Product Name - Medium and Bold
        doc.setFontSize(18);
        doc.setTextColor(0);
        doc.text(`${details.product_name}`, 14, 35);

        // Other Details - Normal
        doc.setFontSize(14);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(0);
        doc.text(`Layer Length: ${details.length_of_layer_inches || '0'} in`, 14, 42);

        let finalY = 50;

        // 3. Detailed Cut Log Table (Moved before Summary)
        const cutLogHead = [
            "Roll ID", 
            "Fabric Type",
            "Color", 
            "Meters", 
            ...summaryStats.allSizes.map(getSizeLabel), // Using mapped size labels
            "Total Pcs"
        ];

        const cutLogBody = (details.rolls || []).map(roll => {
            const rollCutsBySize = (roll.cuts || []).reduce((acc, cut) => {
                acc[cut.size] = (acc[cut.size] || 0) + parseInt(cut.quantity_cut || 0);
                return acc;
            }, {});
            const rollTotalPieces = Object.values(rollCutsBySize).reduce((sum, qty) => sum + qty, 0);

            return [
                roll.roll_identifier,
                roll.type_name || '-',
                `${roll.color_name || ''} ${roll.color_number ? `(${roll.color_number})` : ''}`,
                parseFloat(roll.meter || 0).toFixed(2),
                ...summaryStats.allSizes.map(size => rollCutsBySize[size] || 0),
                rollTotalPieces
            ];
        });

        // Footer Row for Cut Log
        const footerRow = [
            "TOTAL", 
            "", 
            "", 
            summaryStats.totalMeters.toFixed(2),
            ...summaryStats.allSizes.map(size => summaryStats.sizeTotals[size] || 0),
            summaryStats.totalPieces
        ];

        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.setFont("helvetica", "bold");
        doc.text("Cut Log Details", 14, finalY);
        
        autoTable(doc, {
            startY: finalY + 5,
            head: [cutLogHead],
            body: [...cutLogBody, footerRow],
            theme: 'grid', // Use grid theme for simple borders
            styles: { 
                fontSize: 10, 
                cellPadding: 3, 
                textColor: 0, // Black text
                lineWidth: 0.1, // Thin borders
                lineColor: 0 // Black borders
            },
            headStyles: { 
                fillColor: 255, // White background
                textColor: 0, // Black text
                fontStyle: 'bold',
                lineWidth: 0.1,
                lineColor: 0
            },
            footStyles: {
                fillColor: 255,
                textColor: 0,
                fontStyle: 'bold',
                lineWidth: 0.1,
                lineColor: 0
            },
            didParseCell: (data) => {
                // Bold the footer row text
                if (data.row.index === cutLogBody.length) {
                    data.cell.styles.fontStyle = 'bold';
                }
            }
        });

        finalY = doc.lastAutoTable.finalY + 15;

        // 4. Shortages Table (if exists)
        if (details.shortages && details.shortages.length > 0) {
             // Page break check
             if (finalY > doc.internal.pageSize.getHeight() - 40) {
                doc.addPage();
                finalY = 20;
            }

            doc.setFontSize(14);
            doc.text("Reported Shortages", 14, finalY);
            
            const shortageBody = details.shortages.map(s => [
                s.roll_identifier,
                parseFloat(s.meter).toFixed(2),
                s.status,
                s.claimed_by_user_name || 'N/A',
                new Date(s.claimed_at).toLocaleDateString()
            ]);

            autoTable(doc, {
                startY: finalY + 5,
                head: [["Roll ID", "Meters Claimed", "Status", "Claimed By", "Date"]],
                body: shortageBody,
                theme: 'grid',
                styles: { textColor: 0, lineColor: 0, lineWidth: 0.1 },
                headStyles: { fillColor: 255, textColor: 0, lineColor: 0, lineWidth: 0.1 }
            });
            
            finalY = doc.lastAutoTable.finalY + 15;
        }

        // 5. Summary Statistics (Row wise at the bottom, 4 plain text lines)
        // Page break check
        if (finalY > doc.internal.pageSize.getHeight() - 45) {
            doc.addPage();
            finalY = 20;
        }

        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.setFont("helvetica", "bold");
        doc.text("Summary Statistics", 14, finalY);
        
        const startY = finalY + 8;
        const lineHeight = 7;
        const labelX = 14;
        const valueOffset = 60; // Offset for value column to align properly

        // Helper to print Label (normal) and Value (bold)
        const printSummaryLine = (label, value, y) => {
            doc.setFont("helvetica", "normal");
            doc.text(label, labelX, y);
            doc.setFont("helvetica", "bold");
            doc.text(value, labelX + valueOffset, y);
        };
        
        doc.setFontSize(12);
        printSummaryLine("Total Fabric Assigned:", `${summaryStats.totalMeters.toFixed(2)} m`, startY);
        printSummaryLine("Total Pieces Cut:", `${summaryStats.totalPieces}`, startY + lineHeight);
        printSummaryLine("Avg. Consumption:", `${summaryStats.avgConsumption.toFixed(3)} m/pc`, startY + (lineHeight * 2));
        printSummaryLine("Total Shortage:", `${summaryStats.totalShortage.toFixed(2)} m`, startY + (lineHeight * 3));

        // Save PDF
        doc.save(`Cutting_Report_${details.batch_code || batchId}.pdf`);
    };

    const handleShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: `Cutting Report: ${details.batch_code}`,
                    text: `Cutting details for ${details.product_name}. Total Pieces: ${summaryStats.totalPieces}`,
                    url: window.location.href,
                });
            } catch (err) {
                console.error('Share failed', err);
            }
        } else {
            alert("Sharing is not supported on this browser/device.");
        }
    };

    if (isLoading) return <Spinner />;
    if (error) return <div className="p-6"><div className="p-4 bg-red-100 text-red-700 rounded-lg">{error}</div></div>;
    if (!details) return <div className="p-6 text-center text-gray-500">No details found for this batch.</div>;

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            {/* Print Styles */}
            <style>
                {`
                    @media print {
                        .no-print { display: none !important; }
                        .print-p-0 { padding: 0 !important; }
                        .print-bg-white { background-color: white !important; }
                        body { background-color: white; -webkit-print-color-adjust: exact; }
                    }
                `}
            </style>

            <header className="mb-6">
                <div className="flex justify-between items-center mb-4">
                    <Link to="/cutting-portal/dashboard" className="text-sm text-blue-600 hover:underline flex items-center no-print">
                        <FiArrowLeft className="mr-2" /> Back to Cutting Queue
                    </Link>
                    
                    <div className="flex gap-2 no-print">
                         <button 
                            onClick={handleShare}
                            className="flex items-center px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                        >
                            <FiShare2 className="mr-2"/> Share
                        </button>
                        <button 
                            onClick={handleGeneratePDF}
                            className="flex items-center px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm"
                        >
                            <FiDownload className="mr-2"/> Download PDF
                        </button>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 print-bg-white">
                    <div className="flex justify-between items-start">
                        <div>
                            <h6 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                                Cutting Details
                            </h6>
                            <h1 className="text-2xl font-bold text-gray-900 leading-none mb-1">
                                Batch <span className="font-mono text-indigo-600">{details.batch_code || `#${batchId}`}</span>
                            </h1>
                            <h3 className="text-sm font-medium text-gray-500">
                                {details.product_name}
                            </h3>
                        </div>

                        <div className="text-right pl-4 border-l border-gray-100">
                            <span className="block text-xs text-gray-400 font-medium uppercase">Fabric Layer</span>
                            <div className="flex items-baseline justify-end gap-1">
                                <span className="text-3xl font-bold text-gray-800">
                                    {details.length_of_layer_inches || '0'}
                                </span>
                                <span className="text-sm text-gray-500 font-medium">in</span>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Summary Header */}
            <section className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-lg shadow-sm border text-center print-bg-white">
                    <h2 className="text-xs text-gray-500 uppercase font-semibold">Total Fabric Assigned</h2>
                    <p className="text-2xl font-bold text-blue-600">{summaryStats.totalMeters.toFixed(2)} m</p>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm border text-center print-bg-white">
                    <h2 className="text-xs text-gray-500 uppercase font-semibold">Total Pieces Cut</h2>
                    <p className="text-2xl font-bold text-green-600">{summaryStats.totalPieces}</p>
                </div>
                 <div className="bg-white p-4 rounded-lg shadow-sm border text-center print-bg-white">
                    <h2 className="text-xs text-gray-500 uppercase font-semibold">Avg. Consumption</h2>
                    <p className="text-2xl font-bold text-purple-600">{summaryStats.avgConsumption > 0 ? `${summaryStats.avgConsumption.toFixed(3)} m/pc` : 'N/A'}</p>
                 </div>
                 <div className="bg-white p-4 rounded-lg shadow-sm border text-center print-bg-white">
                    <h2 className="text-xs text-gray-500 uppercase font-semibold">Total Shortage</h2>
                    <p className={`text-2xl font-bold ${summaryStats.totalShortage > 0 ? 'text-red-600' : 'text-gray-700'}`}>{summaryStats.totalShortage.toFixed(2)} m</p>
                 </div>
            </section>

            {/* Detailed Table */}
            <section className="bg-white rounded-lg shadow-sm border overflow-hidden print-bg-white">
                <div className="p-4 border-b">
                    <h3 className="text-xl font-semibold text-gray-800 flex items-center"><FiFileText className="mr-3 text-gray-400"/>Cut Log Details</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full">
                        <thead className="bg-gray-100 text-xs text-gray-600 uppercase tracking-wider">
                            <tr>
                                <th className="py-3 px-4 text-left">Roll ID</th>
                                <th className="py-3 px-4 text-left">Color</th>
                                <th className="py-3 px-4 text-left">Type</th>
                                <th className="py-3 px-4 text-right">Meters</th>
                                {/* Dynamically create size columns in SORTED order with Formatted Label */}
                                {summaryStats.allSizes.map(size => (
                                    <th key={size} className="py-3 px-4 text-center font-bold text-indigo-700 bg-indigo-50/50 border-x border-indigo-100/50">{getSizeLabel(size)}</th>
                                ))}
                                <th className="py-3 px-4 text-right">Roll Total Pcs</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 text-sm">
                            {(details.rolls || []).map(roll => {
                                const rollCutsBySize = (roll.cuts || []).reduce((acc, cut) => {
                                    acc[cut.size] = (acc[cut.size] || 0) + parseInt(cut.quantity_cut || 0);
                                    return acc;
                                }, {});
                                const rollTotalPieces = Object.values(rollCutsBySize).reduce((sum, qty) => sum + qty, 0);
                                return (
                                    <tr key={roll.id} className="hover:bg-gray-50">
                                        <td className="py-3 px-4 font-medium">{roll.roll_identifier}</td>
                                        <td className="py-3 px-4">{roll.color_name || 'N/A'}({roll.color_number || 'N/A'  })</td>
                                        <td className="py-3 px-4">{roll.type_name || 'N/A'}</td>
                                        <td className="py-3 px-4 text-right">{parseFloat(roll.meter || 0).toFixed(2)}</td>
                                        {summaryStats.allSizes.map(size => (
                                            <td key={size} className="py-3 px-4 text-center text-gray-700 border-x border-gray-100/50">
                                                {rollCutsBySize[size] || <span className="text-gray-300">-</span>}
                                            </td>
                                        ))}
                                        <td className="py-3 px-4 text-right font-semibold bg-gray-50/50">{rollTotalPieces}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        {/* Footer Row for Totals */}
                        <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                             <tr className="font-bold text-gray-700">
                                 <td colSpan="4" className="py-3 px-4 text-right uppercase text-xs">Total Pieces Cut:</td>
                                 {summaryStats.allSizes.map(size => (
                                     <td key={size} className="py-3 px-4 text-center text-indigo-700 border-x border-gray-300/30">
                                         {summaryStats.sizeTotals[size] || 0}
                                     </td>
                                 ))}
                                 <td className="py-3 px-4 text-right text-blue-700 bg-blue-50">{summaryStats.totalPieces}</td>
                             </tr>
                        </tfoot>
                    </table>
                </div>
            </section>

             {/* Shortage Section */}
             {(details.shortages && details.shortages.length > 0) && (
                <section className="mt-6 bg-white rounded-lg shadow-sm border print-bg-white">
                    <div className="p-4 border-b">
                        <h3 className="text-xl font-semibold text-red-700 flex items-center"><FiAlertTriangle className="mr-3"/>Reported Shortages</h3>
                    </div>
                     <div className="overflow-x-auto">
                         <table className="min-w-full">
                             <thead className="bg-gray-100 text-xs text-gray-600 uppercase tracking-wider">
                                 <tr>
                                     <th className="py-3 px-4 text-left">Roll ID</th>
                                     <th className="py-3 px-4 text-right">Meters Claimed</th>
                                     <th className="py-3 px-4 text-center">Status</th>
                                     <th className="py-3 px-4 text-left">Claimed By</th>
                                     <th className="py-3 px-4 text-left">Claimed At</th>
                                 </tr>
                             </thead>
                             <tbody className="divide-y divide-gray-200 text-sm">
                                 {details.shortages.map(shortage => (
                                    <tr key={shortage.id}>
                                         <td className="py-3 px-4">{shortage.roll_identifier}</td>
                                         <td className="py-3 px-4 text-right font-medium text-red-600">{parseFloat(shortage.meter).toFixed(2)}</td>
                                         <td className="py-3 px-4 text-center capitalize">{shortage.status}</td>
                                         <td className="py-3 px-4">{shortage.claimed_by_user_name || 'N/A'}</td>
                                         <td className="py-3 px-4">{new Date(shortage.claimed_at).toLocaleString()}</td>
                                    </tr>
                                 ))}
                             </tbody>
                         </table>
                     </div>
                 </section>
             )}

        </div>
    );
};

export default BatchCuttingDetailsPage;