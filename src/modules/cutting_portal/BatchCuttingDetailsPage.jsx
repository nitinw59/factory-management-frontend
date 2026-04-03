import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { cuttingPortalApi } from '../../api/cuttingPortalApi';
import { 
    FiArrowLeft, FiPackage, FiScissors, FiAlertTriangle, 
    FiCheckCircle, FiFileText, FiPrinter, FiShare2, FiDownload, 
    FiClipboard, FiLayers, FiLoader, 
    FiChevronDown, FiChevronRight, FiBox, FiHash, FiTag // 🆕 New Icons
} from 'react-icons/fi';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const Spinner = () => (
    <div className="flex justify-center items-center p-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
    </div>
);

// Standard size sequence for sorting
const SIZE_ORDER = [
    'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL', '5XL', '6XL', 
    '24', '26', '28', '30', '32', '34', '36', '38', '40', '42', '44', '46', '48', '50'
];

const SIZE_LABELS = {
    'S': 'S(28)', 'M': 'M(30)', 'L': 'L(32)', 'XL': 'XL(34)', 'XXL': 'XXL(36)',
    '3XL': '3XL(38)', '4XL': '4XL(40)', '5XL': '5XL(42)', '6XL': '6XL(44)'
};

const getSizeLabel = (size) => SIZE_LABELS[size] || size;

const sortSizes = (a, b) => {
    const indexA = SIZE_ORDER.indexOf(a);
    const indexB = SIZE_ORDER.indexOf(b);
    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
};




// ==============================================================================
// 🆕 NEW COMPONENT: Expandable Bundle Card
// ==============================================================================
const BundleCard = ({ bundle }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div className="border border-slate-200 rounded-lg shadow-sm bg-white overflow-hidden transition-all duration-200">
            {/* Header (Clickable) */}
            <div 
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center justify-between p-3 cursor-pointer hover:bg-slate-50 select-none"
            >
                <div className="flex items-center gap-4">
                    <div className="bg-indigo-50 text-indigo-600 p-2 rounded-md">
                        <FiBox size={18} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-700">{bundle.part_name}</span>
                            <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2 py-0.5 rounded border border-slate-200">
                                Size: {bundle.size}
                            </span>
                        </div>
                        <span className="text-xs text-slate-400 font-mono mt-0.5 block">{bundle.bundle_code}</span>
                    </div>
                </div>
                
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <span className="block text-xs text-slate-500 uppercase font-semibold">Quantity</span>
                        <span className="font-bold text-slate-800">{bundle.total_pieces} pcs</span>
                    </div>
                    <div className="text-slate-400">
                        {isExpanded ? <FiChevronDown size={20} /> : <FiChevronRight size={20} />}
                    </div>
                </div>
            </div>

            {/* Expanded Body (Exploded Pieces) */}
            {isExpanded && (
                <div className="p-4 bg-slate-50/50 border-t border-slate-100 animate-in slide-in-from-top-2">
                    <h4 className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center">
                        <FiHash className="mr-1.5" /> Serialized Contents (Ply Sequence)
                    </h4>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                        {bundle.pieces?.map(piece => (
                            <div key={piece.piece_id} className="bg-white border border-slate-200 p-2 rounded-md shadow-sm flex flex-col items-center justify-center relative group">
                                <span className="absolute top-1 right-1">
                                    <FiTag size={10} className="text-slate-300 group-hover:text-indigo-400 transition-colors" />
                                </span>
                                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Ply Seq</span>
                                <span className="text-lg font-black text-indigo-600 leading-none my-1">#{piece.piece_sequence}</span>
                                <span className="text-[9px] text-slate-400 font-mono bg-slate-50 px-1 py-0.5 rounded w-full text-center truncate" title={piece.uid}>
                                    {piece.uid}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};


const BatchCuttingDetailsPage = () => {
    const { batchId } = useParams();
    const location = useLocation(); 
    const [details, setDetails] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);
    const [error, setError] = useState(null);

    const isProductionManager = location.pathname.includes('/production-manager');
    const isInitPortal = location.pathname.includes('/initialization-portal');
    
    let backLink = '/cutting-portal/dashboard';
    let backLabel = 'Back to Cutting Queue';
    
    if (isProductionManager) {
        backLink = '/production-manager/dashboard';
        backLabel = 'Back to Production Dashboard';
    } else if (isInitPortal) {
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

    useEffect(() => { fetchDetails(); }, [fetchDetails]);

    // --- Calculations ---
    const summaryStats = useMemo(() => {
        if (!details) return { totalMeters: 0, totalPieces: 0, avgConsumption: 0, totalShortage: 0, totalEndBits: 0, allSizes: [], sizeTotals: {} };

        let totalMeters = 0;
        let totalPieces = 0;
        let totalEndBits = 0; // NEW: Track End Bits globally
        const sizeTotals = {};
        const allSizesSet = new Set();

        (details.rolls || []).forEach(roll => {
            totalMeters += parseFloat(roll.meter || 0);
            totalEndBits += parseFloat(roll.end_bits || 0); // NEW: Sum up End Bits
            
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
        
        const totalShortage = (details.rolls || []).reduce((sum, r) => sum + parseFloat(r.shortage_meters || 0), 0);
        // Valid Consumption = Total Fabric Assigned - Shortage - EndBits
        const avgConsumption = totalPieces > 0 ? (totalMeters - totalShortage - totalEndBits) / totalPieces : 0;
        const allSizes = Array.from(allSizesSet).sort(sortSizes);

        return { totalMeters, totalPieces, avgConsumption, totalShortage, totalEndBits, allSizes, sizeTotals };
    }, [details]);



    // 🆕 Group Bundles by Roll ID for the UI
    const bundlesByRoll = useMemo(() => {
        if (!details?.bundles) return {};
        return details.bundles.reduce((acc, bundle) => {
            if (!acc[bundle.fabric_roll_id]) acc[bundle.fabric_roll_id] = [];
            acc[bundle.fabric_roll_id].push(bundle);
            return acc;
        }, {});
    }, [details]);
    // --- REPORT GENERATORS ---

    const handleGenerateNumberingPDF = async () => {
        if (!details) return;
        setIsGeneratingReport(true);

        try {
            const res = await cuttingPortalApi.getBatchNumberingDetails(batchId);
            const numberingDetails = res.data;
            const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            
            const now = new Date().toLocaleString();
            doc.setFontSize(8); doc.setTextColor(100);
            doc.text(`Generated: ${now}`, 280, 10, { align: 'right' });
            
            doc.setFontSize(18); doc.setTextColor(0); doc.setFont("helvetica", "bold");
            doc.text(`Numbering & QC Report: Batch ${numberingDetails.batch_code || batchId}`, 14, 15);
            
            doc.setFontSize(12); doc.setFont("helvetica", "normal");
            doc.text(`Product: ${numberingDetails.product_name}`, 14, 22);

            let finalY = 30;
            const head = ["Roll ID", "Type", ...summaryStats.allSizes.map(getSizeLabel), "Total OK"];
            
            let grandTotalOk = 0;
            let totalRejected = 0;
            let totalAltered = 0;
            const defectsBody = [];

            const validatedBody = (numberingDetails.rolls || []).map(roll => {
                const statsBySize = {};
                let rollGoodTotal = 0;
                
                (roll.numbering_details || []).forEach(stat => {
                    const qty = parseInt(stat.quantity || 0);
                    if (!statsBySize[stat.size]) statsBySize[stat.size] = 0;
                    
                    if (stat.qc_status === 'APPROVED' || stat.qc_status === 'REPAIRED') {
                        statsBySize[stat.size] += qty;
                        rollGoodTotal += qty;
                    }
                });

                grandTotalOk += rollGoodTotal;

                return [
                    roll.roll_identifier,
                    roll.type_name,
                    ...summaryStats.allSizes.map(size => statsBySize[size] || 0),
                    rollGoodTotal
                ];
            });

            summaryStats.allSizes.forEach(size => {
                let sizeRej = 0;
                let sizeAlt = 0;
                
                (numberingDetails.rolls || []).forEach(roll => {
                    (roll.numbering_details || []).forEach(stat => {
                        if (stat.size === size) {
                            if (stat.qc_status === 'REJECT') sizeRej += parseInt(stat.quantity);
                            if (stat.qc_status === 'ALTER') sizeAlt += parseInt(stat.quantity);
                        }
                    });
                });
                
                if (sizeRej > 0 || sizeAlt > 0) {
                    defectsBody.push([getSizeLabel(size), sizeAlt, sizeRej]);
                    totalAltered += sizeAlt;
                    totalRejected += sizeRej;
                }
            });

            doc.setFontSize(12); doc.setFont("helvetica", "bold");
            doc.text("Validated Garments (Approved + Repaired)", 14, finalY);
            
            autoTable(doc, {
                startY: finalY + 2,
                head: [head],
                body: validatedBody,
                theme: 'grid',
                styles: { fontSize: 8, cellPadding: 1, textColor: 0, lineWidth: 0.1, lineColor: 0 },
                headStyles: { fillColor: [46, 204, 113], textColor: 255, fontStyle: 'bold' }, 
                columnStyles: { 0: { fontStyle: 'bold' } }
            });
            
            finalY = doc.lastAutoTable.finalY + 15;

            doc.setFillColor(245, 245, 245);
            doc.rect(14, finalY, 120, 25, 'F');
            
            doc.setFontSize(10); doc.setTextColor(0);
            doc.text(`Total Garments OK: ${grandTotalOk}`, 18, finalY + 8);
            
            doc.setTextColor(200, 100, 0); 
            doc.text(`Pending Alteration: ${totalAltered}`, 18, finalY + 14);
            
            doc.setTextColor(200, 0, 0); 
            doc.text(`Total Rejected: ${totalRejected}`, 18, finalY + 20);
            
            if (defectsBody.length > 0) {
                autoTable(doc, {
                    startY: finalY + 30,
                    head: [["Size", "Pending Alteration", "Rejected"]],
                    body: defectsBody,
                    theme: 'grid',
                    styles: { fontSize: 9 },
                    tableWidth: 120,
                    headStyles: { fillColor: [231, 76, 60], textColor: 255 }
                });
            }

            doc.save(`Numbering_Report_${numberingDetails.batch_code || batchId}.pdf`);

        } catch (err) {
            console.error(err);
            alert("Failed to generate Numbering Report.");
        } finally {
            setIsGeneratingReport(false);
        }
    };

    const handleGenerateLaySheet = () => {
        if (!details) return;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' });
        const pageWidth = doc.internal.pageSize.width; 
        const pageHeight = doc.internal.pageSize.height; 

        doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.setTextColor(0);
        doc.text("MATRIX OVERSEAS", pageWidth / 2, 15, { align: 'center' });

        const ratioString = details.ratios ? details.ratios.map(r => `${r.size}-${r.ratio}`).join(' / ') : '-';

        autoTable(doc, {
            startY: 20,
            body: [
                [`ID - ${details.id || batchId}`],
                [`BATCH NO - ${details.batch_code || batchId}`],
                [`CODE NAME - ${details.product_name}`], 
                [`LAYER LENGTH: ${details.length_of_layer_inches || 0} INCHES`],
                [`SIZE RATIO - ${ratioString}`]
            ],
            theme: 'plain',
            styles: { fontSize: 9, cellPadding: 1, lineWidth: 0.1, lineColor: 0, textColor: 0, fontStyle: 'bold' },
            columnStyles: { 0: { cellWidth: 90 } }
        });

        doc.setFontSize(10); doc.text("CUTTING LAY DETAILS", 10, doc.lastAutoTable.finalY + 8);

        let totalAssigned = 0;
        let totalShortage = 0;
        let totalEndBits = 0;

        const tableBody = (details.rolls || []).map(roll => {
            const meter = parseFloat(roll.meter || 0);
            const shortage = parseFloat(roll.shortage_meters || 0);
            const endBits = parseFloat(roll.end_bits || 0);
            
            totalAssigned += meter;
            totalShortage += shortage;
            totalEndBits += endBits;

            return [
                roll.id%100, 
                roll.type_name || '-', 
                `${roll.color_name || ''} ${roll.color_number || ''}`,
                meter.toFixed(2), 
                roll.lays || "", 
                shortage > 0 ? shortage.toFixed(2) : "", 
                endBits > 0 ? endBits.toFixed(2) : "", // NEW: End Bits Column
                "", "Mtr"
            ];
        });
        
        // Push footer total row
        tableBody.push([
            "TOTAL", "", "", 
            totalAssigned.toFixed(2), "", 
            totalShortage > 0 ? totalShortage.toFixed(2) : "", 
            totalEndBits > 0 ? totalEndBits.toFixed(2) : "", 
            "", "Mtr"
        ]);

        autoTable(doc, {
            startY: doc.lastAutoTable.finalY + 4,
            head: [["Roll ID", "Fabric", "Color", "Asigned", "Lays", "Short", "EndBit", "Cons", "UOM"]],
            body: tableBody,
            theme: 'grid',
            headStyles: { fillColor: 255, textColor: 0, lineWidth: 0.1, lineColor: 0, fontStyle: 'bold', fontSize: 7, halign: 'center' },
            styles: { fontSize: 7, cellPadding: 1.5, textColor: 0, lineWidth: 0.1, lineColor: 0, halign: 'center', valign: 'middle' },
            columnStyles: { 0: { halign: 'left', cellWidth: 12 }, 1: { halign: 'left', cellWidth: 12 }, 2: { halign: 'left', cellWidth: 20 }, 3: { halign: 'right', fontStyle: 'bold', cellWidth: 15 }, 4: { cellWidth: 10 }, 5: { cellWidth: 12 }, 6: { cellWidth: 12 }, 7: { cellWidth: 12 }, 8: { cellWidth: 10 } },
            didParseCell: (data) => { if (data.row.index === tableBody.length - 1) data.cell.styles.fontStyle = 'bold'; }
        });

        let finalY = doc.lastAutoTable.finalY + 10;
        if (finalY > 170) { doc.addPage(); finalY = 20; }

        doc.setFontSize(10); doc.text("SUMMARY STATISTICS", 10, finalY);
        autoTable(doc, {
            startY: finalY + 2,
            body: [
                ["TOTAL FABRIC ASSIGNED :", totalAssigned.toFixed(2)], 
                ["TOTAL FABRIC CONSUMED :", ""],
                ["TOTAL SHORTAGE QTY :", totalShortage > 0 ? totalShortage.toFixed(2) : ""], 
                ["TOTAL END BITS :", totalEndBits > 0 ? totalEndBits.toFixed(2) : ""], // NEW: End Bits Summary
                ["TOTAL NO OF LAY :", ""], 
                ["TOTAL CUT QTY :", ""]
            ],
            theme: 'grid',
            styles: { fontSize: 7, cellPadding: 1, textColor: 0, lineWidth: 0.1, lineColor: 0, fontStyle: 'bold' },
            columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 20 } }
        });

        let sigY = doc.lastAutoTable.finalY + 25; 
        if (sigY > pageHeight - 15) { doc.addPage(); sigY = 25; }

        doc.setFontSize(9); doc.setFont("helvetica", "bold");
        doc.text("Prepared By ___________________", pageWidth - 10, sigY-50,  { align: 'right' });
        doc.text("Authorised By ___________________", pageWidth - 10, sigY-25, { align: 'right' });

        doc.save(`Lay_Sheet_${details.batch_code || batchId}.pdf`);
    };

    const handleGenerateCutReport = () => {
        if (!details) return;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const marginLeft = 10;
        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;
        
        doc.setFontSize(8); doc.setTextColor(100); doc.text(`Generated: ${new Date().toLocaleString()}`, 200, 10, { align: 'right' });
        doc.setFontSize(20); doc.setTextColor(0); doc.setFont("helvetica", "bold"); doc.text(`Batch: ${details.batch_code || `#${batchId}`}`, marginLeft, 15);
        doc.setFontSize(20); doc.setTextColor(0); doc.setFont("helvetica", "bold"); doc.text(`Batch: ${details.id || `#${batchId}`}`, marginLeft+150, 18);
        doc.setFontSize(14); doc.text(`${details.product_name}`, marginLeft, 22);
        doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.text(`Layer Length: ${details.length_of_layer_inches || '0'} in`, marginLeft, 27);

        let finalY = 32;
        // NEW: Added Shortage and EndBits to Cut Report Header
        const cutLogHead = ["Roll ID", "Fabric", "Color", "Mtrs", "Short", "EndBit", "Lays", ...summaryStats.allSizes.map(getSizeLabel), "Tot"];
        
        const cutLogBody = (details.rolls || []).map(roll => {
            const rollCutsBySize = (roll.cuts || []).reduce((acc, cut) => {
                if (acc[cut.size] === undefined) acc[cut.size] = parseInt(cut.quantity_cut || 0);
                return acc;
            }, {});
            const rollTotalPieces = Object.values(rollCutsBySize).reduce((sum, qty) => sum + qty, 0);
            return [
                roll.roll_identifier, roll.type_name || '-', `${roll.color_name || ''} ${roll.color_number ? `(${roll.color_number})` : ''}`,
                parseFloat(roll.meter || 0).toFixed(2), 
                parseFloat(roll.shortage_meters || 0).toFixed(2), // NEW
                parseFloat(roll.end_bits || 0).toFixed(2),        // NEW
                roll.lays || 0,
                ...summaryStats.allSizes.map(size => rollCutsBySize[size] || 0), rollTotalPieces
            ];
        });

        const footerRow = [
            "TOTAL", "", "", 
            summaryStats.totalMeters.toFixed(2), 
            summaryStats.totalShortage.toFixed(2), // NEW
            summaryStats.totalEndBits.toFixed(2),  // NEW
            "", 
            ...summaryStats.allSizes.map(size => (details.rolls || []).reduce((sum, roll) => {
                 const cut = (roll.cuts || []).find(c => c.size === size);
                 return sum + (cut ? parseInt(cut.quantity_cut) : 0);
            }, 0)), 
            summaryStats.totalPieces
        ];

        doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.text("Cut Log Details", marginLeft, finalY);
        autoTable(doc, {
            startY: finalY + 2, head: [cutLogHead], body: [...cutLogBody, footerRow],
            theme: 'grid', styles: { fontSize: 6, cellPadding: 1, textColor: 0, lineWidth: 0.1, lineColor: 0 },
            headStyles: { fillColor: 255, textColor: 0, fontStyle: 'bold', lineWidth: 0.1, lineColor: 0, halign: 'center' },
            didParseCell: (data) => { if (data.row.index === cutLogBody.length) data.cell.styles.fontStyle = 'bold'; }
        });

        finalY = doc.lastAutoTable.finalY + 10;
        doc.text("Summary Statistics", marginLeft, finalY);
        const summaryY = finalY + 6; const lineHeight = 6; const valueX = marginLeft + 60;
        
        doc.setFontSize(10);
        const printLine = (label, value, y) => { doc.setFont("helvetica", "normal"); doc.text(label, marginLeft, y); doc.setFont("helvetica", "bold"); doc.text(value, valueX, y); };
        
        printLine("Total Fabric Assigned:", `${summaryStats.totalMeters.toFixed(2)} m`, summaryY);
        printLine("Total Pieces Cut:", `${summaryStats.totalPieces}`, summaryY + lineHeight);
        printLine("Avg. Consumption:", `${summaryStats.avgConsumption.toFixed(3)} m/pc`, summaryY + (lineHeight * 2));
        printLine("Total Shortage:", `${summaryStats.totalShortage.toFixed(2)} m`, summaryY + (lineHeight * 3));
        printLine("Total End Bits:", `${summaryStats.totalEndBits.toFixed(2)} m`, summaryY + (lineHeight * 4)); // NEW

        let sigY = summaryY + (lineHeight * 4) + 30; 
        if (sigY > pageHeight - 20) { doc.addPage(); sigY = 30; }

        doc.setFontSize(10); doc.setFont("helvetica", "bold");
        doc.text("Prepared By ___________________", pageWidth - marginLeft, sigY-50, { align: 'right' });
        doc.text("Authorised By ___________________", pageWidth - marginLeft, sigY-30, { align: 'right' });

        doc.save(`Cutting_Report_${details.batch_code || batchId}.pdf`);
    };

    if (isLoading) return <div className="flex justify-center items-center p-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div></div>;
    if (error) return <div className="p-6"><div className="p-4 bg-red-100 text-red-700 rounded-lg">{error}</div></div>;
    if (!details) return <div className="p-6 text-center text-gray-500">No details found for this batch.</div>;

    return (
        <div className="p-4 md:p-6 bg-gray-50 min-h-screen">
            <header className="mb-6">
                <div className="flex justify-between items-center mb-4">
                    <Link to={backLink} className="text-sm text-blue-600 hover:underline flex items-center no-print">
                        <FiArrowLeft className="mr-2" /> {backLabel}
                    </Link>
                    
                    <div className="flex gap-2 no-print">
                        <button onClick={handleGenerateLaySheet} className="flex items-center px-3 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-900 transition-colors shadow-sm">
                            <FiClipboard className="mr-2"/> Lay Sheet (A5)
                        </button>
                        <button onClick={handleGenerateCutReport} className="flex items-center px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm">
                            <FiDownload className="mr-2"/> Cut Report
                        </button>
                        <button 
                            onClick={handleGenerateNumberingPDF} 
                            disabled={isGeneratingReport}
                            className="flex items-center px-3 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {isGeneratingReport ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div> : <FiLayers className="mr-2"/>}
                            Numbering Report
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

            {/* Summary Header - Expanded to 5 columns for End Bits */}
            <section className="mb-6 grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="bg-white p-4 rounded-lg shadow-sm border text-center print-bg-white">
                    <h2 className="text-xs text-gray-500 uppercase font-semibold">Fabric Assigned</h2>
                    <p className="text-2xl font-bold text-blue-600">{summaryStats.totalMeters.toFixed(2)} m</p>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm border text-center print-bg-white">
                    <h2 className="text-xs text-gray-500 uppercase font-semibold">Total Pieces</h2>
                    <p className="text-2xl font-bold text-green-600">{summaryStats.totalPieces}</p>
                </div>
                 <div className="bg-white p-4 rounded-lg shadow-sm border text-center print-bg-white">
                    <h2 className="text-xs text-gray-500 uppercase font-semibold">Avg. Cons.</h2>
                    <p className="text-2xl font-bold text-indigo-600">{summaryStats.avgConsumption > 0 ? `${summaryStats.avgConsumption.toFixed(3)}` : 'N/A'}</p>
                 </div>
                 <div className="bg-white p-4 rounded-lg shadow-sm border text-center print-bg-white">
                    <h2 className="text-xs text-gray-500 uppercase font-semibold">Total Shortage</h2>
                    <p className={`text-2xl font-bold ${summaryStats.totalShortage > 0 ? 'text-red-500' : 'text-gray-700'}`}>{summaryStats.totalShortage.toFixed(2)} m</p>
                 </div>
                 {/* NEW: End Bits Summary Card */}
                 <div className="bg-white p-4 rounded-lg shadow-sm border text-center print-bg-white">
                    <h2 className="text-xs text-gray-500 uppercase font-semibold">End Bits</h2>
                    <p className={`text-2xl font-bold ${summaryStats.totalEndBits > 0 ? 'text-purple-500' : 'text-gray-700'}`}>{summaryStats.totalEndBits.toFixed(2)} m</p>
                 </div>
            </section>

            {/* Interlining Requirements Section */}
            {details.interlining_requirements && details.interlining_requirements.length > 0 && (
                <section className="bg-white rounded-lg shadow-sm border overflow-hidden print-bg-white mb-6">
                    <div className="p-4 border-b bg-amber-50/50 flex justify-between items-center">
                        <h3 className="text-lg font-semibold text-amber-900 flex items-center">
                            <FiLayers className="mr-3 text-amber-600"/> Interlining Requirements
                        </h3>
                        {details.interlining_type && (
                            <span className="text-xs font-bold bg-white text-amber-700 border border-amber-200 px-3 py-1 rounded-full shadow-sm">
                                {details.interlining_type} ({details.consumption_per_piece}m/pc)
                            </span>
                        )}
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full">
                            <thead className="bg-amber-50/30 text-xs text-amber-800 uppercase tracking-wider">
                                <tr>
                                    <th className="py-3 px-4 text-left">Interlining Color</th>
                                    <th className="py-3 px-4 text-right">Required (Meters)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-amber-100 text-sm">
                                {details.interlining_requirements.map((req, idx) => (
                                    <tr key={idx} className="hover:bg-amber-50/20">
                                        <td className="py-3 px-4 font-medium text-gray-800">
                                            {req.color_name || 'Generic'} {req.color_number ? `(${req.color_number})` : ''}
                                        </td>
                                        <td className="py-3 px-4 text-right font-mono font-bold text-amber-700">
                                            {parseFloat(req.required_meters).toFixed(2)} m
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

             {/* Detailed Cut Log Table */}
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
                                <th className="py-3 px-4 text-right border-l border-gray-200">Meters</th>
                                {/* NEW: Added Shortage and End Bits visually to the UI Table */}
                                <th className="py-3 px-4 text-right text-red-600">Shortage</th>
                                <th className="py-3 px-4 text-right text-purple-600">End Bits</th>
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
                                        <td className="py-3 px-4">{roll.color_name || 'N/A'}({roll.color_number || 'N/A'})</td>
                                        <td className="py-3 px-4">{roll.type_name || 'N/A'}</td>
                                        <td className="py-3 px-4 text-right border-l border-gray-200 font-medium">{parseFloat(roll.meter || 0).toFixed(2)}</td>
                                        {/* Display Shortage & EndBits */}
                                        <td className="py-3 px-4 text-right text-red-600">{roll.shortage_meters > 0 ? parseFloat(roll.shortage_meters).toFixed(2) : '-'}</td>
                                        <td className="py-3 px-4 text-right text-purple-600">{roll.end_bits > 0 ? parseFloat(roll.end_bits).toFixed(2) : '-'}</td>
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
                                 <td colSpan="3" className="py-3 px-4 text-right uppercase text-xs">Total:</td>
                                 <td className="py-3 px-4 text-right text-gray-900 border-l border-gray-300">{summaryStats.totalMeters.toFixed(2)}</td>
                                 <td className="py-3 px-4 text-right text-red-600">{summaryStats.totalShortage.toFixed(2)}</td>
                                 <td className="py-3 px-4 text-right text-purple-600">{summaryStats.totalEndBits.toFixed(2)}</td>
                                 <td className="py-3 px-4 bg-gray-200 border-x border-gray-300/30"></td>
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



                                    {details.bundles && details.bundles.length > 0 && (
                <section className="bg-white rounded-lg shadow-sm border overflow-hidden mt-6 print:hidden">
                    <div className="p-4 border-b bg-slate-800 text-white flex justify-between items-center">
                        <div>
                            <h3 className="text-lg font-semibold flex items-center">
                                <FiPackage className="mr-3 text-indigo-400"/> Physical Bundles & Serialization
                            </h3>
                            <p className="text-xs text-slate-300 mt-1 ml-8">Click a bundle to explode and view individual ply sequences.</p>
                        </div>
                        <span className="bg-slate-700 px-3 py-1 rounded-full text-xs font-bold text-slate-200">
                            {details.bundles.length} Bundles Generated
                        </span>
                    </div>
                    
                    <div className="p-4 bg-slate-50 space-y-6">
                        {Object.entries(bundlesByRoll).map(([rollId, rollBundles]) => {
                            // Find roll info for header
                            const rollInfo = details.rolls?.find(r => r.id.toString() === rollId);
                            const rollName = rollInfo ? rollInfo.roll_identifier : `Roll #${rollId}`;
                            
                            return (
                                <div key={rollId} className="space-y-3">
                                    <h4 className="font-bold text-slate-600 flex items-center border-b border-slate-200 pb-2">
                                        <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded text-xs mr-2 border border-slate-300">
                                            Roll Source
                                        </span>
                                        {rollName}
                                    </h4>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {rollBundles.map(bundle => (
                                            <BundleCard key={bundle.id} bundle={bundle} />
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

        </div>
    );
};

export default BatchCuttingDetailsPage;