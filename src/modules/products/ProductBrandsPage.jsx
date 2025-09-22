import React from 'react';
import CrudManager from '../../shared/CrudManager';
import { productBrandConfig } from '../../config/crudConfigs';

const ProductBrandsPage = () => (
  <div>
    <h1 className="text-3xl font-bold mb-6">Manage Product Brands</h1>
    <CrudManager config={productBrandConfig} />
  </div>
);

export default ProductBrandsPage;
