import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { cuttingPortalApi } from '../../api/cuttingPortalApi';
import { 
    FiArrowLeft, FiPackage, FiScissors, FiAlertTriangle, 
    FiCheckCircle, FiFileText, FiPrinter, FiShare2, FiDownload, FiClipboard 
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
    const location = useLocation(); 
    const [details, setDetails] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // Logic: Determine back link based on current path
    let backLink = '/cutting-portal/dashboard';
    let backLabel = 'Back to Cutting Queue';

    if (location.pathname.includes('/production-manager')) {
        backLink = '/production-manager/dashboard';
        backLabel = 'Back to Production Dashboard';
    } else if (location.pathname.includes('/initialization-portal')) {
        backLink = '/initialization-portal/dashboard';
        backLabel = 'Back to Initialization Dashboard';
    }

    const fetchDetails = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await cuttingPortalApi.getBatchCuttingDetails(batchId);
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
            
            // Helper to track unique sizes for this roll to avoid double counting parts
            const uniqueCutsForRoll = {};

            (roll.cuts || []).forEach(cut => {
                if (uniqueCutsForRoll[cut.size] === undefined) {
                    const qty = parseInt(cut.quantity_cut || 0);
                    uniqueCutsForRoll[cut.size] = qty;
                }
                allSizesSet.add(cut.size);
            });

            Object.entries(uniqueCutsForRoll).forEach(([size, qty]) => {
                totalPieces += qty;
                sizeTotals[size] = (sizeTotals[size] || 0) + qty;
            });
        });
        
        const totalShortage = (details.shortages || []).reduce((sum, shortage) => {
            return sum + parseFloat(shortage.meter || 0);
        }, 0);

        const avgConsumption = totalPieces > 0 ? (totalMeters - totalShortage) / totalPieces : 0;
        
        const allSizes = Array.from(allSizesSet).sort(sortSizes);

        return { totalMeters, totalPieces, avgConsumption, totalShortage, allSizes, sizeTotals };

    }, [details]);

    // --- Action Handlers ---

    // 1. Generate Lay Sheet (A5, Template Format)
    const handleGenerateLaySheet = () => {
        if (!details) return;

        // A5 Portrait (148mm x 210mm)
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' });
        
        // Header
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0);
        doc.text("MATRIX OVERSEAS", 74, 15, { align: 'center' }); // Centered

        // Batch Info Box
        const ratioString = details.ratios ? details.ratios.map(r => `${r.size}-${r.ratio}`).join(' / ') : '-';
        
        // Attempt to extract PO from batch code if available (e.g. SO-PO-BATCH) or use batch info
        const poText = details.po_code || 'N/A'; // Assuming backend might provide this later, or we leave it blank

        autoTable(doc, {
            startY: 20,
            body: [
                [`PO NUMBER - ${poText}`], 
                [`BATCH NO - ${details.batch_code || batchId}`],
                [`CODE NAME - ${details.product_name}`],
                [`LAYER LENGTH: ${details.length_of_layer_inches || 0} INCHES`],
                [`SIZE RATIO - ${ratioString}`]
            ],
            theme: 'plain',
            styles: { 
                fontSize: 9, 
                cellPadding: 1, 
                lineWidth: 0.1, 
                lineColor: 0,
                textColor: 0,
                fontStyle: 'bold' 
            },
            columnStyles: {
                0: { cellWidth: 90 } 
            }
        });

        // Cutting Lay Details Table Header
        doc.setFontSize(10);
        doc.text("CUTTING LAY DETAILS", 10, doc.lastAutoTable.finalY + 8);

        // Prepare Table Data (Blank columns for manual entry)
        let totalAssigned = 0;
        const tableBody = (details.rolls || []).map(roll => {
            const meter = parseFloat(roll.meter || 0);
            totalAssigned += meter;
            return [
                roll.roll_identifier,
                roll.type_name || '-',
                `${roll.color_name || ''} ${roll.color_number || ''}`,
                meter.toFixed(2),
                "", // No of Lays (Blank)
                "", // Shortages (Blank)
                "", // Consumed fabric (Blank)
                "Mtr"
            ];
        });

        // Footer Row
        tableBody.push([
            "TOTAL", "", "", totalAssigned.toFixed(2), "", "", "", "Mtr"
        ]);

        autoTable(doc, {
            startY: doc.lastAutoTable.finalY + 10,
            head: [["Roll ID", "Fabric", "Color", "Asigned", "Lays", "Shortage", "Cons", "UOM"]],
            body: tableBody,
            theme: 'grid',
            headStyles: { 
                fillColor: 255, 
                textColor: 0, 
                lineWidth: 0.1, 
                lineColor: 0, 
                fontStyle: 'bold',
                fontSize: 7,
                halign: 'center'
            },
            styles: { 
                fontSize: 7, 
                cellPadding: 1.5, 
                textColor: 0, 
                lineWidth: 0.1, 
                lineColor: 0,
                halign: 'center',
                valign: 'middle'
            },
            columnStyles: {
                0: { halign: 'left', cellWidth: 15 },
                1: { halign: 'left', cellWidth: 12 },
                2: { halign: 'left', cellWidth: 20 },
                3: { halign: 'right', fontStyle: 'bold', cellWidth: 15 }, // Assigned
                4: { cellWidth: 12 }, // Lays
                5: { cellWidth: 15 }, // Shortage
                6: { cellWidth: 15 }, // Consumed
                7: { cellWidth: 10 }, // UOM
            },
            didParseCell: (data) => {
                // Bold the footer row
                if (data.row.index === tableBody.length - 1) {
                    data.cell.styles.fontStyle = 'bold';
                }
            }
        });

        // Summary Statistics (Bottom Left)
        let finalY = doc.lastAutoTable.finalY + 10;
        
        // Page break check for A5
        if (finalY > 180) {
            doc.addPage();
            finalY = 20;
        }

        doc.setFontSize(10);
        doc.text("SUMMARY STATISTICS", 10, finalY);

        autoTable(doc, {
            startY: finalY + 2,
            body: [
                ["TOTAL FABRIC ASSIGNED :", totalAssigned.toFixed(2)],
                ["TOTAL FABRIC CONSUMED :", ""],
                ["TOTAL SHORTAGE QTY :", ""],
                ["TOTAL NO OF LAY :", ""],
                ["TOTAL CUT QTY :", ""]
            ],
            theme: 'grid',
            styles: {
                fontSize: 7, // Reduced font size for compactness
                cellPadding: 1, // Reduced padding for compactness
                textColor: 0,
                lineWidth: 0.1,
                lineColor: 0,
                fontStyle: 'bold'
            },
            columnStyles: {
                0: { cellWidth: 40 }, // Reduced width
                1: { cellWidth: 20 }  // Reduced width
            }
        });

        doc.save(`Lay_Sheet_${details.batch_code || batchId}.pdf`);
    };

    // 2. Generate Cut Report (Portrait, All Data)
    const handleGeneratePDF = () => {
        if (!details) return;

        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const marginLeft = 10;
        
        // Report Header
        const now = new Date().toLocaleString();
        doc.setFontSize(8);
        doc.setTextColor(100);
        doc.text(`Generated: ${now}`, 200, 10, { align: 'right' });

        doc.setFontSize(20);
        doc.setTextColor(0);
        doc.setFont("helvetica", "bold");
        doc.text(`Batch: ${details.batch_code || `#${batchId}`}`, marginLeft, 15);

        doc.setFontSize(14);
        doc.text(`${details.product_name}`, marginLeft, 22);

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`Layer Length: ${details.length_of_layer_inches || '0'} in`, marginLeft, 27);

        let finalY = 32;

        const cutLogHead = [
            "Roll ID", "Fabric", "Color", "Mtrs", "Lays",
            ...summaryStats.allSizes.map(getSizeLabel), 
            "Tot"
        ];

        const cutLogBody = (details.rolls || []).map(roll => {
            const rollCutsBySize = (roll.cuts || []).reduce((acc, cut) => {
                if (acc[cut.size] === undefined) acc[cut.size] = parseInt(cut.quantity_cut || 0);
                return acc;
            }, {});
            
            const rollTotalPieces = Object.values(rollCutsBySize).reduce((sum, qty) => sum + qty, 0);

            return [
                roll.roll_identifier,
                roll.type_name || '-',
                `${roll.color_name || ''} ${roll.color_number ? `(${roll.color_number})` : ''}`,
                parseFloat(roll.meter || 0).toFixed(2),
                roll.lays || 0,
                ...summaryStats.allSizes.map(size => rollCutsBySize[size] || 0),
                rollTotalPieces
            ];
        });

        const footerRow = [
            "TOTAL", "", "", 
            summaryStats.totalMeters.toFixed(2),
            "",
            ...summaryStats.allSizes.map(size => summaryStats.sizeTotals[size] || 0),
            summaryStats.totalPieces
        ];

        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text("Cut Log Details", marginLeft, finalY);
        
        autoTable(doc, {
            startY: finalY + 2,
            head: [cutLogHead],
            body: [...cutLogBody, footerRow],
            theme: 'grid', 
            styles: { fontSize: 6, cellPadding: 1, textColor: 0, lineWidth: 0.1, lineColor: 0 },
            headStyles: { fillColor: 255, textColor: 0, fontStyle: 'bold', lineWidth: 0.1, lineColor: 0, halign: 'center' },
            didParseCell: (data) => {
                if (data.row.index === cutLogBody.length) {
                    data.cell.styles.fontStyle = 'bold';
                }
            }
        });

        finalY = doc.lastAutoTable.finalY + 10;

        // Summary
        doc.text("Summary Statistics", marginLeft, finalY);
        const summaryY = finalY + 6;
        const lineHeight = 6;
        const valueX = marginLeft + 60; 

        doc.setFontSize(10);
        const printSummaryLine = (label, value, y) => {
            doc.setFont("helvetica", "normal");
            doc.text(label, marginLeft, y);
            doc.setFont("helvetica", "bold");
            doc.text(value, valueX, y);
        };
        
        printSummaryLine("Total Fabric Assigned:", `${summaryStats.totalMeters.toFixed(2)} m`, summaryY);
        printSummaryLine("Total Pieces Cut:", `${summaryStats.totalPieces}`, summaryY + lineHeight);
        printSummaryLine("Avg. Consumption:", `${summaryStats.avgConsumption.toFixed(3)} m/pc`, summaryY + (lineHeight * 2));
        printSummaryLine("Total Shortage:", `${summaryStats.totalShortage.toFixed(2)} m`, summaryY + (lineHeight * 3));

        doc.save(`Cutting_Report_${details.batch_code || batchId}.pdf`);
    };

    if (isLoading) return <div className="flex justify-center items-center p-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div></div>;
    if (error) return <div className="p-6"><div className="p-4 bg-red-100 text-red-700 rounded-lg">{error}</div></div>;
    if (!details) return <div className="p-6 text-center text-gray-500">No details found for this batch.</div>;

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            <header className="mb-6">
                <div className="flex justify-between items-center mb-4">
                    <Link to={backLink} className="text-sm text-blue-600 hover:underline flex items-center no-print">
                        <FiArrowLeft className="mr-2" /> {backLabel}
                    </Link>
                    
                    <div className="flex gap-2 no-print">
                        {/* New Button for Lay Sheet */}
                        <button onClick={handleGenerateLaySheet} className="flex items-center px-3 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-900 transition-colors shadow-sm">
                            <FiClipboard className="mr-2"/> Lay Sheet (A5)
                        </button>
                        <button onClick={handleGeneratePDF} className="flex items-center px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm">
                            <FiDownload className="mr-2"/> Cut Report
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
                                <th className="py-3 px-4 text-center font-bold text-blue-700 bg-blue-50/50 border-x border-blue-100/50">Lays</th>
                                {summaryStats.allSizes.map(size => (
                                    <th key={size} className="py-3 px-4 text-center font-bold text-indigo-700 bg-indigo-50/50 border-x border-indigo-100/50">{getSizeLabel(size)}</th>
                                ))}
                                <th className="py-3 px-4 text-right">Roll Total Pcs</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 text-sm">
                            {(details.rolls || []).map(roll => {
                                const rollCutsBySize = (roll.cuts || []).reduce((acc, cut) => {
                                    if (acc[cut.size] === undefined) {
                                        acc[cut.size] = parseInt(cut.quantity_cut || 0);
                                    }
                                    return acc;
                                }, {});
                                const rollTotalPieces = Object.values(rollCutsBySize).reduce((sum, qty) => sum + qty, 0);
                                return (
                                    <tr key={roll.id} className="hover:bg-gray-50">
                                        <td className="py-3 px-4 font-medium">{roll.roll_identifier}</td>
                                        <td className="py-3 px-4">{roll.color_name || 'N/A'}({roll.color_number || 'N/A'  })</td>
                                        <td className="py-3 px-4">{roll.type_name || 'N/A'}</td>
                                        <td className="py-3 px-4 text-right">{parseFloat(roll.meter || 0).toFixed(2)}</td>
                                        <td className="py-3 px-4 text-center font-bold text-blue-700 bg-blue-50/20 border-x border-blue-100/30">
                                            {roll.lays || 0}
                                        </td>
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
                        <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                             <tr className="font-bold text-gray-700">
                                 <td colSpan="5" className="py-3 px-4 text-right uppercase text-xs">Total Pieces Cut:</td>
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
        </div>
    );
};

export default BatchCuttingDetailsPage;