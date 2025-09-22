import React, { useState, useEffect, useCallback } from 'react';
import { genericApi } from '../api/genericApi';
import CrudForm from './CrudForm';

// --- SHARED ICONS ---
const Spinner = () => <div className="flex justify-center items-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
const EditIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>;
const DeleteIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>;

const Modal = ({ children, onClose, title }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
        <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg">
            <header className="flex justify-between items-center p-4 border-b"><h2 className="text-xl font-semibold">{title}</h2><button onClick={onClose} className="text-2xl">&times;</button></header>
            <main className="p-6">{children}</main>
        </div>
    </div>
);

// --- REUSABLE CRUD MANAGER COMPONENT ---
const CrudManager = ({ config }) => {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingItem, setEditingItem] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [apiError, setApiError] = useState(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const resourceToFetch = config.getAllResource || config.resource;
      const response = await genericApi.getAll(resourceToFetch);
      setItems(response.data || []);
    } catch (error) {
      console.error(`Failed to fetch ${config.title}`, error);
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [config.resource, config.title]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleOpenModal = (item = null) => {
    setApiError(null);
    setEditingItem(item);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
  };

  const handleSave = async (itemData) => {
    setApiError(null);
    try {
      if (itemData.id) {
        await genericApi.update(config.resource, itemData.id, itemData);
      } else {
        await genericApi.create(config.resource, itemData);
      }
      handleCloseModal();
      fetchData();
    } catch (error) {
      console.error(`Failed to save ${config.title}`, error);
      setApiError(error.response?.data?.error || 'An unexpected error occurred.');
    }
  };

  const handleDelete = async (itemId) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      try {
        await genericApi.delete(config.resource, itemId);
        fetchData();
      } catch (error) {
        console.error(`Failed to delete ${config.title}`, error);
        alert(error.response?.data?.error || 'Could not delete item.');
      }
    }
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <header className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-800">{config.title}</h2>
        <button onClick={() => handleOpenModal()} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Add New</button>
      </header>
      
      {isLoading ? <Spinner /> : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white">
            <thead className="bg-gray-50">
              <tr>
                {config.columns.map(col => <th key={col.key} className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{col.label}</th>)}
                <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {items.map(item => (
                <tr key={item.id}>
                  {config.columns.map(col => <td key={col.key} className="py-4 px-4 whitespace-nowrap">{item[col.key]}</td>)}
                  <td className="py-4 px-4 whitespace-nowrap">
                    <div className="flex items-center space-x-4">
                      <button onClick={() => handleOpenModal(item)} className="text-gray-400 hover:text-blue-600"><EditIcon /></button>
                      <button onClick={() => handleDelete(item.id)} className="text-gray-400 hover:text-red-600"><DeleteIcon /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isModalOpen && (
        <Modal title={editingItem ? `Edit ${config.title}` : `Add New ${config.title}`} onClose={handleCloseModal}>
          <CrudForm 
            fields={config.fields}
            initialData={editingItem || {}}
            onSave={handleSave}
            onClose={handleCloseModal}
            apiError={apiError}
          />
        </Modal>
      )}
    </div>
  );
};

export default CrudManager;

