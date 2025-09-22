import React from 'react';
import CrudManager from '../../shared/CrudManager';
import { fabricColorConfig } from '../../config/crudConfigs';

const FabricColorsPage = () => (
  <div>
    <h1 className="text-3xl font-bold mb-6">Fabric Colors</h1>
    <CrudManager config={fabricColorConfig} />
  </div>
);

export default FabricColorsPage;
