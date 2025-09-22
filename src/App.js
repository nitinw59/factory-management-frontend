import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// --- LAYOUTS & COMPONENTS ---
import FactoryLayout from './shared/FactoryLayout';
import LoginPage from './login/LoginPage';
import AuthCallbackPage from './login/AuthCallbackPage';
import UnauthorizedPage from './login/UnauthorizedPage';
import InitialRedirect from './shared/InitialRedirect';
import ProtectedRoute from './shared/ProtectedRoute'; 
import StoreManagerProtectedRoute from './shared/StoreManagerProtectedRoute';



// --- MODULE PAGES ---
import DashboardPage from './modules/dashboard/DashboardPage';
import UserManagementPage from './modules/users/UserManagementPage';
import SupplierManagementPage from './modules/suppliers/SupplierManagementPage';
import TrimsDashboardPage from './modules/trims/TrimsDashboardPage';
import ProductionLinesPage from './modules/production/ProductionLinesPage';
import FabricColorsPage from './modules/colors/FabricColorsPage';
import TrimItemsPage from './modules/trims/TrimItemsPage';
import TrimItemVariantsPage from './modules/trims/TrimItemVariantsPage';
import ProductManagementPage from './modules/products/ProductManagementPage';
import ProductBrandsPage from './modules/products/ProductBrandsPage';
import ProductTypesPage from './modules/products/ProductTypesPage';
import ProductionLineTypesPage from './modules/production/ProductionLineTypesPage';

function App() {
  return (
    <Routes>
      {/* --- 1. PUBLIC ROUTES --- */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />

      {/* --- 2. PROTECTED ROUTES --- */}
      <Route element={<ProtectedRoute />}>
        {/* The root path is now ONLY for the initial, role-based redirect */}
        <Route path="/" element={<InitialRedirect />} />
        
        {/* All admin pages are now explicitly under the /admin path */}
        <Route path="/admin" element={<FactoryLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="users" element={<UserManagementPage />} />
          <Route path="suppliers" element={<SupplierManagementPage />} />
          <Route path="inventory" element={<TrimsDashboardPage />} />
          <Route path="trim-items" element={<TrimItemsPage />} />
          <Route path="trim-item-variants" element={<TrimItemVariantsPage />} />
          <Route path="production-lines" element={<ProductionLinesPage />} />
          <Route path="production-line-types" element={<ProductionLineTypesPage />} />
          <Route path="fabric-colors" element={<FabricColorsPage />} />
          <Route path="products" element={<ProductManagementPage />} />
          <Route path="product-brands" element={<ProductBrandsPage />} />
          <Route path="product-types" element={<ProductTypesPage />} />
        </Route>
      </Route>

      {/* --- 3. CATCH-ALL REDIRECT --- */}
      {/* Any unknown path will redirect to the root, which then handles the role-based redirect. */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default App;

