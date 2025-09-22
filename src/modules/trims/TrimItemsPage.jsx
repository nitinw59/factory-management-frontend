import React from 'react';
import CrudManager from '../../shared/CrudManager';
import { trimItemConfig } from '../../config/crudConfigs';

const TrimItemsPage = () => (
  <div>
    <h1 className="text-3xl font-bold mb-6">Trim Items (Catalog)</h1>
    <CrudManager config={trimItemConfig} />
  </div>
);

export default TrimItemsPage;
