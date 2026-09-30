// --- File: src/shared/Modal.jsx ---
import { createPortal } from 'react-dom';
import { LuX } from 'react-icons/lu';

// fullScreen: covers the whole viewport (like the universal portal's
// inspection screen) instead of a centered card — opt-in, default unchanged.
// hideCloseButton: for content that renders its own close control.
const Modal = ({ title, onClose, children, fullScreen = false, hideCloseButton = false }) => createPortal(
  fullScreen ? (
    <div className="fixed inset-0 bg-white z-[500] flex flex-col">
      {(title || !hideCloseButton) && (
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 pt-3 shrink-0">
          <h2 className="text-2xl font-bold text-gray-800 min-w-0">{title}</h2>
          {!hideCloseButton && (
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 shrink-0"
            >
              <LuX className="text-2xl" />
            </button>
          )}
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
        {children}
      </div>
    </div>
  ) : (
  <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4 z-[500]">
    <div
      className="
        bg-white rounded-xl shadow-2xl relative
        w-full
        max-w-5xl
        max-h-[85vh]
        p-8
        flex flex-col
      "
    >
      {!hideCloseButton && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          <LuX className="text-2xl" />
        </button>
      )}

      <h2 className="text-2xl font-bold text-gray-800 mb-6 shrink-0">
        {title}
      </h2>

      {/* Content decides height until max-h is hit */}
      <div className="overflow-y-auto">
        {children}
      </div>
    </div>
  </div>
  ),
  document.body
);

export default Modal;
