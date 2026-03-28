import React, { useState, useCallback } from 'react';
import { UploadCloud, Users, Clock, CheckCircle, AlertCircle, Loader2, FileText, FileSpreadsheet } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { hrApi } from '../../api/hrApi';

const FileUploader = ({ title, description, icon: Icon, apiMethod, accept, colorClass }) => {
    const [isUploading, setIsUploading] = useState(false);
    const [result, setResult] = useState(null);

    const onDrop = useCallback(async (acceptedFiles, fileRejections) => {
        // 1. Immediately catch files that fail the 'accept' criteria (MIME types)
        if (fileRejections.length > 0) {
            setResult({ 
                type: 'error', 
                msg: 'Invalid file format. Please ensure you are uploading a .csv or .xlsx file.' 
            });
            return;
        }

        const file = acceptedFiles[0];
        if (!file) return;

        // 2. Hard extension check as a fallback (Windows sometimes messes up MIME types)
        const fileName = file.name.toLowerCase();
        if (!fileName.endsWith('.csv') && !fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
            setResult({ 
                type: 'error', 
                msg: 'Only .csv, .xls, and .xlsx files are allowed.' 
            });
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        setIsUploading(true);
        setResult(null);

        try {
            // 3. Call the hrApi method passed in via props
            const response = await apiMethod(formData);
            
            setResult({ type: 'success', msg: response.data.message || 'File processed successfully.' });
        } catch (error) {
            setResult({ 
                type: 'error', 
                msg: error.response?.data?.error || error.message || "Upload failed. Please check the file format." 
            });
        } finally {
            setIsUploading(false);
        }
    }, [apiMethod]);

    const { getRootProps, getInputProps, isDragActive, acceptedFiles } = useDropzone({ 
        onDrop, 
        accept, 
        maxFiles: 1,
        multiple: false // Strictly enforce one file at a time
    });

    // Helper to determine which icon to show for the uploaded file
    const getFileExtension = (filename) => {
        if (!filename) return '';
        return filename.split('.').pop().toLowerCase();
    };

    const fileExt = getFileExtension(acceptedFiles[0]?.name);

    return (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col h-full">
            <div className="mb-4">
                <h3 className={`text-lg font-extrabold flex items-center gap-2 ${colorClass}`}>
                    <Icon size={24} /> {title}
                </h3>
                <p className="text-sm text-slate-500 mt-1">{description}</p>
            </div>
            
            <div 
                {...getRootProps()} 
                className={`flex-1 border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all duration-200 ${
                    isDragActive ? 'border-blue-500 bg-blue-50 scale-[1.02]' : 'border-slate-300 hover:bg-slate-50 hover:border-slate-400'
                }`}
            >
                <input {...getInputProps()} />
                
                {isUploading ? (
                    <div className="flex flex-col items-center justify-center text-blue-600">
                        <Loader2 className="w-10 h-10 animate-spin mb-3" />
                        <p className="font-bold">Processing File...</p>
                        <p className="text-xs mt-1 text-slate-500 text-center">This may take a moment for large datasets.</p>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center text-slate-500 text-center">
                        <UploadCloud className={`w-12 h-12 mb-3 transition-colors ${isDragActive ? 'text-blue-500' : 'text-slate-400'}`} />
                        <p className="font-bold text-slate-700">Drag & Drop File Here</p>
                        <p className="text-sm mt-1 mb-3">Supports .CSV and .XLSX</p>
                        
                        {/* Render the selected file pill if successful/pending */}
                        {acceptedFiles[0] && result?.type !== 'error' && (
                            <div className="bg-white border border-slate-200 px-3 py-1.5 rounded-lg flex items-center text-xs text-slate-700 shadow-sm mt-2">
                                {fileExt === 'csv' ? (
                                    <FileText size={14} className="mr-2 text-blue-500" />
                                ) : (
                                    <FileSpreadsheet size={14} className="mr-2 text-emerald-500" />
                                )}
                                <span className="truncate max-w-[200px] font-medium">{acceptedFiles[0].name}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Response Message Toast */}
            {result && (
                <div className={`mt-4 p-4 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2 ${
                    result.type === 'success' 
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                        : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}>
                    {result.type === 'success' 
                        ? <CheckCircle className="shrink-0 mt-0.5" size={18} /> 
                        : <AlertCircle className="shrink-0 mt-0.5" size={18} />
                    }
                    <div>
                        <p className="font-bold">
                            {result.type === 'success' ? 'Upload Successful' : 'Upload Failed'}
                        </p>
                        <p className="text-sm mt-0.5 leading-relaxed">{result.msg}</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default function HRDataImportPage() {
    // Official MIME types for strict validation
    const acceptedFileTypes = { 
        'text/csv': ['.csv'],
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
        'application/vnd.ms-excel': ['.xls']
    };

    return (
        <div className="p-6 sm:p-8 max-w-7xl mx-auto min-h-screen bg-slate-50">
            <div className="mb-8">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 tracking-tight">HR Data Imports</h1>
                <p className="text-slate-500 mt-1 text-sm sm:text-base">
                    Synchronize third-party biometric and employee master data with EnterpriseOS.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
                <FileUploader 
                    title="1. Sync Employee Master" 
                    description="Upload the latest employee list to update salaries, departments, and active statuses."
                    icon={Users} 
                    apiMethod={hrApi.importEmployees} // <-- Directly passing the API function
                    accept={acceptedFileTypes} 
                    colorClass="text-indigo-700"
                />

                <FileUploader 
                    title="2. Sync Biometric Punch Logs" 
                    description="Upload the daily or monthly cross-tab punch report to calculate attendance and payroll."
                    icon={Clock} 
                    apiMethod={hrApi.importAttendance} // <-- Directly passing the API function
                    accept={acceptedFileTypes} 
                    colorClass="text-emerald-700"
                />
            </div>
        </div>
    );
}