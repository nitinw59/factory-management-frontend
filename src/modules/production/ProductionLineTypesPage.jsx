import React from 'react';
import CrudManager from '../../shared/CrudManager';
import { productionLineTypeConfig } from '../../config/crudConfigs';

const ProductionLineTypesPage = () => {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Manage Production Line Types</h1>
      <p className="text-gray-600 mb-6">
        Define the broad categories of work that can be performed in your factory, such as 'Cutting', 'Sewing', or 'Finishing'.
      </p>

      <CrudManager config={productionLineTypeConfig} />
    </div>
  );
};

export default ProductionLineTypesPage;
