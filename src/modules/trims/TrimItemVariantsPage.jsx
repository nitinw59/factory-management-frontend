import React from 'react';
import CrudManager from '../../shared/CrudManager';
import { trimItemVariantConfig } from '../../config/crudConfigs';

const TrimItemVariantsPage = () => (
  <div>
    <h1 className="text-3xl font-bold mb-6">Trim Item Variants (Stock)</h1>
    <CrudManager config={trimItemVariantConfig} />
  </div>
);

export default TrimItemVariantsPage;
