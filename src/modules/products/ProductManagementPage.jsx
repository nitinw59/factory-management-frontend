import React, { useState, useEffect, useCallback } from 'react';
import { productApi } from '../../api/productApi';
import ProductForm from './ProductForm'; // Corrected: default import
import Modal from '../../shared/Modal'; // Corrected: default import
import { LuChevronDown, LuChevronUp, LuTally5, LuTrash2 } from 'react-icons/lu';

// --- SHARED COMPONENTS ---
const Spinner = () => <div className="flex justify-center items-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;

// --- SUB-COMPONENTS for the expandable table ---
const MaterialsSubTable = ({ materials }) => (
  <div className="p-4 bg-gray-50">
    <h4 className="font-semibold text-sm text-gray-700 mb-2">Materials Required for 1 Piece:</h4>
    <table className="min-w-full text-sm">
      <thead className="bg-gray-200">
        <tr>
          <th className="py-1 px-3 text-left">Item Name</th>
          <th className="py-1 px-3 text-left">Quantity</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200">
        {(materials || []).map((material, index) => (
          <tr key={index}>
            <td className="py-1 px-3">{material.item_name}</td>
            <td className="py-1 px-3">{material.quantity}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const ProductRow = ({ product, onEdit, onDelete }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <>
      <tr className="hover:bg-gray-50">
        <td className="py-3 px-4">{product.name}</td>
        <td className="py-3 px-4">{product.sku}</td>
        <td className="py-3 px-4">{product.brand_name}</td>
        <td className="py-3 px-4">{product.type_name}</td>
        <td className="py-3 px-4">
           <div className="flex items-center space-x-4">
            <button onClick={() => setIsExpanded(!isExpanded)} className="text-blue-600 flex items-center text-sm">{isExpanded ? <LuChevronUp/> : <LuChevronDown/>} Materials</button>
            <button onClick={() => onEdit(product)} className="text-gray-400 hover:text-blue-600"><LuTally5 /></button>
            <button onClick={() => onDelete(product.id)} className="text-gray-400 hover:text-red-600"><LuTrash2 /></button>
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan="5" className="p-0">
            <MaterialsSubTable materials={product.materials} />
          </td>
        </tr>
      )}
    </>
  );
};

// --- MAIN PAGE CONTAINER ---
const ProductManagementPage = () => {
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingProduct, setEditingProduct] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await productApi.getAll();
      setProducts(response.data || []);
      console.log("Fetched products:", response.data);
    } catch (error) {
      console.error("Failed to fetch products", error);
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);
  
  const handleOpenModal = (product = null) => {
    console.log("Opening modal for product:", product);
    setEditingProduct(product);
    setIsModalOpen(true);
  };

  const handleSave = async (productData) => {
    try {
      if (productData.id) {
        await productApi.update(productData.id, productData);
      } else {
        await productApi.create(productData);
      }
      setIsModalOpen(false);
      fetchProducts();
    } catch (error) {
      console.error("Failed to save product", error);
      alert("Could not save product.");
    }
  };
  
  const handleDelete = async (productId) => {
      if(window.confirm('Are you sure?')){
          await productApi.delete(productId);
          fetchProducts();
      }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Product Management</h1>
        <button onClick={() => handleOpenModal()} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Add New Product</button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {isLoading ? <Spinner /> : (
          <table className="min-w-full bg-white">
            <thead className="bg-gray-50">
              <tr>
                <th className="py-3 px-4 text-left text-xs font-medium uppercase">Product Name</th>
                <th className="py-3 px-4 text-left text-xs font-medium uppercase">SKU</th>
                <th className="py-3 px-4 text-left text-xs font-medium uppercase">Brand</th>
                <th className="py-3 px-4 text-left text-xs font-medium uppercase">Type</th>
                <th className="py-3 px-4 text-left text-xs font-medium uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {products.map(product => <ProductRow key={product.id} product={product} onEdit={handleOpenModal} onDelete={handleDelete} />)}
            </tbody>
          </table>
        )}
      </div>

      {isModalOpen && (
        <Modal title={editingProduct ? "Edit Product" : "Create New Product"} onClose={() => setIsModalOpen(false)}>
          <ProductForm initialData={editingProduct} onSave={handleSave} onClose={() => setIsModalOpen(false)} />
        </Modal>
      )}
    </div>
  );
};

export default ProductManagementPage;

