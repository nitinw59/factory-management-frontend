import React from 'react';
import CrudManager from '../../shared/CrudManager';
import { workstationConfig } from '../../config/crudConfigs';

const WorkstationsPage = () => {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Manage Workstations</h1>
      <p className="text-gray-600 mb-6">
        Define the specific, physical workstations in your factory (e.g., Cutting Table 1) and assign them a type and an operator.
      </p>
      
      <CrudManager config={workstationConfig} />
    </div>
  );
};

export default WorkstationsPage;
