import React from 'react';
import CrudManager from '../../shared/CrudManager';
import { productionLineConfig } from '../../config/crudConfigs';

const ProductionLinesPage = () => (
  <div>
    <h1 className="text-3xl font-bold mb-6">Production Lines</h1>
    <CrudManager config={productionLineConfig} />
  </div>
);

export default ProductionLinesPage;
