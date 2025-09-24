import React from 'react';
import CrudManager from '../../shared/CrudManager';
import { fabricTypeConfig } from '../../config/crudConfigs';

const FabricTypesPage = () => (
  <div>
    <h1 className="text-3xl font-bold mb-6">Fabric Types</h1>
    <CrudManager config={fabricTypeConfig} />
  </div>
);

export default FabricTypesPage;
