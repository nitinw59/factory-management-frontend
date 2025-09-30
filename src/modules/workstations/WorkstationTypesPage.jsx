import React from 'react';
import CrudManager from '../../shared/CrudManager';
import { workstationTypeConfig } from '../../config/crudConfigs';

const WorkstationTypesPage = () => {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Manage Workstation Types</h1>
      <p className="text-gray-600 mb-6">
        Define the broad categories of work that can be performed in your factory, such as 'Cutting', 'Sewing', or 'Bundle Checking'.
      </p>
      
      <CrudManager config={workstationTypeConfig} />
    </div>
  );
};

export default WorkstationTypesPage;
