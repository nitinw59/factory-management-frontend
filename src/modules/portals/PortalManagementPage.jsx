import React from 'react';
import CrudManager from '../../shared/CrudManager';
import { portalConfig } from '../../config/crudConfigs';

const PortalManagementPage = () => {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Manage Portals</h1>
      <p className="text-gray-600 mb-6">
        Define the specific portals in your factory (e.g., Cutting Portal) and assign them a URL.
      </p>

      <CrudManager config={portalConfig} />
    </div>
  );
};

export default PortalManagementPage;
