// Shared brand block — small MATRIX logo + wordmark + portal subtitle.
export default function MatrixBrand({ portal, className = '', wordmarkClassName = 'text-gray-800' }) {
    return (
        <div className={`flex items-center gap-2.5 ${className}`}>
            <img src="/matrix_logo.png" alt="MATRIX" className="h-8 w-auto" />
            <div className="flex flex-col leading-tight">
                <span className={`text-base font-black tracking-[0.2em] ${wordmarkClassName}`}>MATRIX</span>
                {portal && (
                    <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">{portal}</span>
                )}
            </div>
        </div>
    );
}
