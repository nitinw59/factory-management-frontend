import React, { useRef, useState } from 'react';
import { Bug, X, Camera, Loader2, CheckCircle2 } from 'lucide-react';
import { bugReportApi } from '../api/bugReportApi';

const CATEGORIES = [
    { value: 'bug', label: 'Bug' },
    { value: 'ui', label: 'UI' },
    { value: 'performance', label: 'Performance' },
    { value: 'data', label: 'Data' },
    { value: 'feature_request', label: 'Feature Request' },
    { value: 'other', label: 'Other' },
];

const SEVERITIES = ['low', 'medium', 'high', 'critical'];

const MAX_FILES = 5;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

const ReportBugModal = ({ onClose }) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('');
    const [severity, setSeverity] = useState('');
    const [files, setFiles] = useState([]);
    const [fileError, setFileError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDone, setIsDone] = useState(false);
    const fileInputRef = useRef(null);

    const addFiles = (picked) => {
        setFileError('');
        const next = [...files];
        for (const f of picked) {
            if (next.length >= MAX_FILES) {
                setFileError(`Only ${MAX_FILES} screenshots allowed.`);
                break;
            }
            if (!ALLOWED_TYPES.includes(f.type)) {
                setFileError('Only PNG, JPG, or WEBP images are allowed.');
                continue;
            }
            if (f.size > MAX_FILE_BYTES) {
                setFileError('Each screenshot must be 5 MB or smaller.');
                continue;
            }
            next.push(f);
        }
        setFiles(next);
    };

    const removeFile = (i) => setFiles((prev) => prev.filter((_, j) => j !== i));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!title.trim() || !description.trim()) return;
        setIsSubmitting(true);
        try {
            const fd = new FormData();
            fd.append('title', title.trim());
            fd.append('description', description.trim());
            if (category) fd.append('category', category);
            if (severity) fd.append('severity', severity);
            fd.append('page_url', window.location.href);
            files.forEach((f) => fd.append('screenshots', f));

            await bugReportApi.fileReport(fd);
            setIsDone(true);
            setTimeout(onClose, 1500);
        } catch (err) {
            alert(err.response?.data?.message || err.response?.data?.error || 'Failed to file bug report.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isDone) {
        return (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[500] flex justify-center items-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center animate-in zoom-in-95 duration-200">
                    <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                    <p className="font-bold text-gray-800">Report filed. Thanks!</p>
                    <p className="text-sm text-gray-400 mt-1">An admin will review it shortly.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[500] flex justify-center items-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b bg-gray-50 flex justify-between items-center shrink-0">
                    <h3 className="font-bold text-lg text-gray-800 flex items-center">
                        <Bug className="w-5 h-5 text-rose-500 mr-2" /> Report a Bug
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-md transition-colors">
                        <X className="w-5 h-5 text-gray-400 hover:text-gray-600" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Title</label>
                        <input
                            type="text"
                            required
                            placeholder="Short summary of the problem"
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:border-rose-500 text-sm shadow-sm"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Description</label>
                        <textarea
                            required
                            rows="4"
                            placeholder="What happened? Steps to reproduce…"
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:border-rose-500 text-sm shadow-sm resize-none"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Category</label>
                        <div className="flex flex-wrap gap-1.5">
                            {CATEGORIES.map((c) => (
                                <button
                                    key={c.value}
                                    type="button"
                                    onClick={() => setCategory((prev) => (prev === c.value ? '' : c.value))}
                                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors shadow-sm ${
                                        category === c.value
                                            ? 'bg-rose-50 border-rose-400 text-rose-700'
                                            : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                                    }`}
                                >
                                    {c.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Severity</label>
                        <div className="grid grid-cols-4 gap-2">
                            {SEVERITIES.map((s) => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => setSeverity((prev) => (prev === s ? '' : s))}
                                    className={`py-2 text-xs font-bold uppercase rounded-xl border-2 transition-all shadow-sm ${
                                        severity === s
                                            ? 'bg-rose-50 border-rose-500 text-rose-700'
                                            : 'bg-white border-gray-100 text-gray-500 hover:border-gray-300'
                                    }`}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Screenshots (optional, up to {MAX_FILES})</label>
                        {files.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                                {files.map((f, i) => (
                                    <span key={i} className="flex items-center gap-1 text-[11px] bg-rose-50 border border-rose-200 text-rose-700 px-2 py-1 rounded-full">
                                        {f.name}
                                        <button type="button" onClick={() => removeFile(i)} className="ml-0.5 text-rose-400 hover:text-red-600">
                                            <X size={10} />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={files.length >= MAX_FILES}
                            className="flex items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 transition-colors disabled:opacity-40"
                        >
                            <Camera size={15} /> Add Screenshot
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            multiple
                            className="hidden"
                            onChange={(e) => {
                                addFiles(Array.from(e.target.files || []));
                                e.target.value = '';
                            }}
                        />
                        {fileError && <p className="text-xs text-rose-600 mt-1.5">{fileError}</p>}
                    </div>

                    <button
                        type="submit"
                        disabled={isSubmitting || !title.trim() || !description.trim()}
                        className="w-full flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bug className="w-4 h-4" />}
                        {isSubmitting ? 'Submitting…' : 'Submit Report'}
                    </button>
                </form>
            </div>
        </div>
    );
};

const ReportBugButton = ({ className = 'flex items-center text-gray-500 hover:text-rose-600 transition-colors' }) => {
    const [open, setOpen] = useState(false);

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                title="Report a bug"
                className={className}
            >
                <Bug size={19} />
            </button>
            {open && <ReportBugModal onClose={() => setOpen(false)} />}
        </>
    );
};

export default ReportBugButton;
