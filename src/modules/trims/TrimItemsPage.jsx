import React, { useState, useEffect, useCallback } from 'react';
import { trimsApi } from '../../api/trimsApi';
import { LuPlus, LuPen, LuTrash2, LuX } from 'react-icons/lu';
import { Loader2 } from 'lucide-react';

const UOM_OPTIONS = ['pieces', 'meters', 'spools', 'packets'];

const EMPTY_FORM = {
  name: '',
  brand: '',
  description: '',
  item_code: '',
  unit_of_measure: '',
  is_color_agnostic: false,
};

function deriveItemCode(name, brand) {
  return [brand, name].filter(Boolean).join(' ').trim().toUpperCase().replace(/\s+/g, '-');
}

function deriveDescription(name, brand) {
  if (name && brand) return `${name} by ${brand}`;
  return name || '';
}

const Spinner = () => (
  <div className="flex justify-center items-center p-8">
    <Loader2 className="animate-spin h-8 w-8 text-blue-600" />
  </div>
);

// --- MODAL ---
const ItemModal = ({ item, onClose, onSaved }) => {
  const isEditing = !!item?.id;

  const [form, setForm] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [apiError, setApiError] = useState(null);

  useEffect(() => {
    if (item?.id) {
      setForm({
        name: item.name || '',
        brand: item.brand || '',
        description: item.description || '',
        item_code: item.item_code || '',
        unit_of_measure: item.unit_of_measure || '',
        is_color_agnostic: !!item.is_color_agnostic,
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [item]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === 'checkbox' ? checked : value;

    setForm(prev => ({ ...prev, [name]: newValue }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError(null);
    setIsSaving(true);
    try {
      if (isEditing) {
        await trimsApi.updateItem(item.id, form);
      } else {
        await trimsApi.createItem(form);
      }
      onSaved();
      onClose();
    } catch (err) {
      setApiError(err.response?.data?.error || 'An unexpected error occurred.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex justify-between items-center px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-800">
            {isEditing ? 'Edit Trim Item' : 'Add New Trim Item'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <LuX size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {apiError && (
            <div className="p-3 bg-red-50 text-red-700 rounded-md text-sm">{apiError}</div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Item Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Metal Button"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Brand <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="brand"
                value={form.brand}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. YKK"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-sm font-medium text-gray-700">Item Code / SKU</label>
              <button
                type="button"
                onClick={() => setForm(prev => ({
                  ...prev,
                  item_code: deriveItemCode(prev.name, prev.brand),
                  description: deriveDescription(prev.name, prev.brand),
                }))}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                Auto-calculate from Name &amp; Brand
              </button>
            </div>
            <input
              type="text"
              name="item_code"
              value={form.item_code}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. YKK-METAL-BUTTON"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="e.g. Metal Button by YKK"
            />
          </div>

          <div className="grid grid-cols-2 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Unit of Measure <span className="text-red-500">*</span>
              </label>
              <select
                name="unit_of_measure"
                value={form.unit_of_measure}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select unit</option>
                {UOM_OPTIONS.map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 pb-2">
              <input
                type="checkbox"
                id="is_color_agnostic"
                name="is_color_agnostic"
                checked={form.is_color_agnostic}
                onChange={handleChange}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="is_color_agnostic" className="text-sm font-medium text-gray-700">
                Common Across All Colors?
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2"
            >
              {isSaving && <Loader2 className="animate-spin h-4 w-4" />}
              {isEditing ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- MAIN PAGE ---
const TrimItemsPage = () => {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modalItem, setModalItem] = useState(undefined); // undefined = closed, null = new, obj = edit

  const fetchItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await trimsApi.getItems();
      setItems(res.data || []);
    } catch (err) {
      console.error('Failed to fetch trim items', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this trim item?')) return;
    try {
      await trimsApi.deleteItem(id);
      fetchItems();
    } catch (err) {
      alert(err.response?.data?.error || 'Could not delete item.');
    }
  };

  return (
    <div className="bg-white rounded-xl shadow p-6">
      <div className="flex justify-between items-center mb-5">
        <h2 className="text-xl font-bold text-gray-800">Trim Items (Catalog)</h2>
        <button
          onClick={() => setModalItem(null)}
          className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
        >
          <LuPlus size={16} /> Add New
        </button>
      </div>

      {isLoading ? <Spinner /> : (
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                {['Name', 'Brand', 'Code / SKU', 'Unit', 'Color Agnostic', 'Actions'].map(h => (
                  <th key={h} className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-400 text-sm">No trim items yet.</td>
                </tr>
              )}
              {items.map(item => (
                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                  <td className="py-3 px-4 text-sm font-medium text-gray-900">{item.name}</td>
                  <td className="py-3 px-4 text-sm text-gray-600">{item.brand}</td>
                  <td className="py-3 px-4 text-sm font-mono text-gray-700">{item.item_code || '—'}</td>
                  <td className="py-3 px-4 text-sm text-gray-600">{item.unit_of_measure}</td>
                  <td className="py-3 px-4 text-sm text-gray-600">
                    {item.is_color_agnostic
                      ? <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">Yes</span>
                      : <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs">No</span>}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <button onClick={() => setModalItem(item)} className="text-gray-400 hover:text-blue-600">
                        <LuPen size={16} />
                      </button>
                      <button onClick={() => handleDelete(item.id)} className="text-gray-400 hover:text-red-600">
                        <LuTrash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalItem !== undefined && (
        <ItemModal
          item={modalItem}
          onClose={() => setModalItem(undefined)}
          onSaved={fetchItems}
        />
      )}
    </div>
  );
};

export default TrimItemsPage;
