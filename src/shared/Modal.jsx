
// --- File: src/shared/Modal.jsx ---
// A reusable modal component.
import React from 'react';
import { LuX } from 'react-icons/lu';

const Modal = ({ title, onClose, children }) => (
  <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4 z-50">
    <div className="bg-white rounded-xl shadow-2xl p-8 relative max-w-lg w-full">
      <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
        <LuX className="text-2xl" />
      </button>
      <h2 className="text-2xl font-bold text-gray-800 mb-6">{title}</h2>
      {children}
    </div>
  </div>
);

export default Modal;