import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// --- LAYOUTS & PROTECTORS ---
// --- LAYOUTS & PROTECTORS ---
import MainLayout from './shared/MainLayout';
import AdminPortal from './portals/AdminPortal';
import StoreManagerPortal from './portals/StoreManagerPortal';
import ProductionManagerPortal from './portals/ProductionManagerPortal'; // Import the new portal layout
import ProtectedRoute from './shared/ProtectedRoute'; 
import AdminProtectedRoute from './shared/AdminProtectedRoute';
import StoreManagerProtectedRoute from './shared/StoreManagerProtectedRoute';
import ProductionManagerProtectedRoute from './shared/ProductionManagerProtectedRoute'; // Import the new protector
import InitialRedirect from './shared/InitialRedirect';

// --- PUBLIC PAGES ---
import LoginPage from './login/LoginPage';
import AuthCallbackPage from './login/AuthCallbackPage';
import UnauthorizedPage from './login/UnauthorizedPage';

// --- MODULE PAGES ---
import AdminDashboardPage from './modules/admin/AdminDashboardPage';
import StoreManagerDashboardPage from './modules/store_manager/StoreManagerDashboardPage';
import ProductionPlanningPage from './modules/production/ProductionPlanningPage';

import DashboardPage from './modules/dashboard/DashboardPage';
import UserManagementPage from './modules/users/UserManagementPage';
import SupplierManagementPage from './modules/suppliers/SupplierManagementPage';
import TrimsDashboardPage from './modules/trims/TrimsDashboardPage';
import ProductionLinesPage from './modules/production/ProductionLinesPage';
import FabricColorsPage from './modules/colors/FabricColorsPage';
import FabricTypesPage from './modules/fabric/FabricTypesPage'; 
import TrimItemsPage from './modules/trims/TrimItemsPage';
import TrimItemVariantsPage from './modules/trims/TrimItemVariantsPage';
import ProductManagementPage from './modules/products/ProductManagementPage';
import ProductBrandsPage from './modules/products/ProductBrandsPage';
import ProductTypesPage from './modules/products/ProductTypesPage';
import ProductionLineTypesPage from './modules/production/ProductionLineTypesPage';
import StoreManagerLayout from './portals/StoreManagerPortal';
import ProductionManagerLayout from './portals/ProductionManagerPortal';
function App() {
  return (
    <Routes>
      {/* --- 1. PUBLIC ROUTES --- */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />

      {/* --- 2. PROTECTED ROUTES --- */}
      <Route element={<ProtectedRoute />}>
       <Route path="/" element={<MainLayout />}>
          <Route index element={<InitialRedirect />} />
          
        {/* Admin Portal */}
                  <Route path="/admin" element={<AdminProtectedRoute><AdminPortal /></AdminProtectedRoute>}>
                    <Route index element={<AdminDashboardPage />} />
                    <Route path="dashboard" element={<AdminDashboardPage />} />
                    <Route path="users" element={<UserManagementPage />} />
                    <Route path="suppliers" element={<SupplierManagementPage />} />
                    <Route path="inventory" element={<TrimsDashboardPage />} />
                    <Route path="trim-items" element={<TrimItemsPage />} />
                    <Route path="trim-item-variants" element={<TrimItemVariantsPage />} />
                    <Route path="production-lines" element={<ProductionLinesPage />} />
                    <Route path="production-line-types" element={<ProductionLineTypesPage />} />
                    <Route path="fabric-colors" element={<FabricColorsPage />} />
                    <Route path="fabric-types" element={<FabricTypesPage />} />
                    <Route path="products" element={<ProductManagementPage />} />
                    <Route path="product-brands" element={<ProductBrandsPage />} />
                    <Route path="product-types" element={<ProductTypesPage />} />
                  </Route>

                  {/* Store Manager Portal */}
                  <Route path="/store-manager" element={<StoreManagerProtectedRoute><StoreManagerLayout /></StoreManagerProtectedRoute>}>
                    <Route index element={<StoreManagerDashboardPage />} />
                    <Route path="dashboard" element={<StoreManagerDashboardPage />} />
                  </Route>

                  {/* Production Manager Portal */}
                  <Route path="/production-manager" element={<ProductionManagerProtectedRoute><ProductionManagerLayout /></ProductionManagerProtectedRoute>}>
                    <Route index element={<ProductionPlanningPage />} />
                    <Route path="dashboard" element={<ProductionPlanningPage />} />
                  </Route>
        </Route>
      </Route>

      {/* --- 3. CATCH-ALL REDIRECT --- */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default App;

