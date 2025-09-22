import React from 'react';
import CrudManager from '../../shared/CrudManager'; // Reusing your powerful component
import { factoryUserConfig } from '../../config/crudConfigs';

const UserManagementPage = () => {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-4">Factory User Management</h1>
      <p className="text-gray-600 mb-6">
        Create and manage user accounts for the Factory Management application.
      </p>
      
      {/* The CrudManager does all the heavy lifting! */}
      <CrudManager config={factoryUserConfig} />
    </div>
  );
};

export default UserManagementPage;
