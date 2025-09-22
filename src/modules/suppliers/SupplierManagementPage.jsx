import React from 'react';
import CrudManager from '../../shared/CrudManager';
import { supplierConfig } from '../../config/crudConfigs';

const SupplierManagementPage = () => (
  <div>
    <h1 className="text-3xl font-bold mb-6">Supplier Management</h1>
    <CrudManager config={supplierConfig} />
  </div>
);

export default SupplierManagementPage;
