import React from 'react';
import CrudManager from '../../shared/CrudManager';
import { productTypeConfig } from '../../config/crudConfigs';

const ProductTypesPage = () => (
  <div>
    <h1 className="text-3xl font-bold mb-6">Manage Product Types</h1>
    <CrudManager config={productTypeConfig} />
  </div>
);

export default ProductTypesPage;
