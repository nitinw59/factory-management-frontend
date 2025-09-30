import React, { useState, useEffect, useCallback } from 'react';
import Modal from './Modal';
import { genericApi } from '../api/genericApi';
import CrudForm from './CrudForm';
import { LuPlus, LuPen, LuTrash2 } from 'react-icons/lu';

// --- SHARED COMPONENTS ---
const Spinner = () => <div className="flex justify-center items-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;

// --- REUSABLE CRUD MANAGER COMPONENT ---
const CrudManager = ({ config, onRowSelect, selectedRowId, resourceFilter }) => {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingItem, setEditingItem] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [apiError, setApiError] = useState(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      let resourceToFetch = config.getAllResource || config.resource;
      // If a filter is provided, append it to the resource path.
      // This is crucial for fetching variants for a specific trim item.
      if (resourceFilter && Object.values(resourceFilter)[0]) {
        resourceToFetch = `${resourceToFetch}/${Object.values(resourceFilter)[0]}`;
      }
      const response = await genericApi.getAll(resourceToFetch);
      setItems(response.data || []);
    } catch (error) {
      console.error(`Failed to fetch ${config.title}`, error);
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [config.resource, config.getAllResource, config.title, resourceFilter]);

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
      const resourceToSave = config.resource;
      if (itemData.id) {
        await genericApi.update(resourceToSave, itemData.id, itemData);
      } else {
        // When creating, include the filter key if it exists (e.g., trim_item_id)
        const dataToCreate = resourceFilter ? { ...itemData, ...resourceFilter } : itemData;
        await genericApi.create(resourceToSave, dataToCreate);
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
  
  // --- ADDED FOR ROW SELECTION ---
  const handleRowClick = (item) => {
    if (onRowSelect) {
      onRowSelect(item);
    }
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <header className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-800">{config.title}</h2>
        <button onClick={() => handleOpenModal()} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center">
            <LuPlus size={16} className="mr-1"/> Add New
        </button>
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
                <tr 
                    key={item.id}
                    // --- ADDED ONCLICK AND DYNAMIC STYLING ---
                    onClick={() => handleRowClick(item)}
                    className={`cursor-pointer transition-colors duration-150 ${selectedRowId === item.id ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-50'}`}
                >
                  {config.columns.map(col => <td key={col.key} className="py-4 px-4 whitespace-nowrap">{item[col.key]}</td>)}
                  <td className="py-4 px-4 whitespace-nowrap">
                    <div className="flex items-center space-x-4">
                      {/* Added stopPropagation to prevent row click from firing when an action button is clicked */}
                      <button onClick={(e) => { e.stopPropagation(); handleOpenModal(item); }} className="text-gray-400 hover:text-blue-600"><LuPen size={16}/></button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }} className="text-gray-400 hover:text-red-600"><LuTrash2 size={16}/></button>
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

