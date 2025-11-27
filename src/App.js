import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// --- LAYOUTS & PROTECTORS ---
import AdminLayout from './shared/AdminLayout';
import StoreManagerLayout from './shared/StoreManagerLayout';
import ProductionManagerLayout from './shared/ProductionManagerLayout';
import ProtectedRoute from './shared/ProtectedRoute'; 
import AdminProtectedRoute from './shared/AdminProtectedRoute';
import StoreManagerProtectedRoute from './shared/StoreManagerProtectedRoute';
import ProductionManagerProtectedRoute from './shared/ProductionManagerProtectedRoute';
import InitialRedirect from './shared/InitialRedirect';
import WorkstationsPage from './modules/workstations/WorkstationsPage';
import WorkstationTypesPage from './modules/workstations/WorkstationTypesPage';
import PiecePartsPage from './modules/products/PiecePartsPage';
import CuttingPortalLayout from './shared/CuttingPortalLayout'; // New
import CuttingOperatorProtectedRoute from './shared/CuttingOperatorProtectedRoute'; // New
import PortalManagementPage from './modules/portals/PortalManagementPage'; // New
import LineLoaderProtectedRoute from './shared/LineLoaderProtectedRoute'; // New
import LineLoaderDashboardPage from './modules/line_loader/LineLoaderDashboardPage'; // New
import LineLoaderLayout from './shared/LineLoaderLayout'; // New  
import CheckingPortalLayout from './shared/CheckingPortalLayout';
import CheckingUserProtectedRoute from './shared/CheckingUserProtectedRoute';
import NumberingPortalLayout from './shared/NumberingPortalLayout';
import NumberingUserProtectedRoute from './shared/NumberingUserProtectedRoute';
import InitializationPortalLayout from './shared/InitialisationPortalLayout'; 
import InitializationPortalProtectedRoute from './shared/InitialisationPortalProtectedRoute';
import PreparationManagerProtectedRoute from './shared/PreperationManagerProtectedRoute';
import PreparationUnloadProtectedRoute from './shared/PreparationUnloadProtectedRoute';
import SewingPartProtectedRoute from './shared/SewingPartProtectedRoute'; 
import SewingManagerLayout from './shared/SewingPartLayout';
import SewingManagerProtectedRoute from './shared/SewingManagerProtectedRoute'; 
import AssemblyLayout from './shared/AssemblyLayout';
import AssemblyProtectedRoute from './shared/AssemblyProtectedRoute'; 


// --- PUBLIC PAGES ---
import LoginPage from './login/LoginPage';
import AuthCallbackPage from './login/AuthCallbackPage';
import UnauthorizedPage from './login/UnauthorizedPage';

// --- MODULE PAGES ---
import AdminDashboardPage from './modules/admin/AdminDashboardPage';
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
import StoreManagerDashboardPage from './modules/store_manager/StoreManagerDashboardPage';
import ProductionPlanningPage from './modules/production/ProductionPlanningPage';
import CuttingDashboardPage from './modules/cutting_portal/CuttingDashboardPage'; // New
import FactoryLayoutPlannerPage from './modules/production/FactoryLayoutPlannerPage';
import TrimIntakeForm from './modules/store_manager/TrimIntakeForm'; 
import TrimManagementPage from './modules/store_manager/TrimManagementPage';
import TrimOrdersPage from './modules/store_manager/TrimOrdersPage';
import TrimOrderDetailPage from './modules/store_manager/TrimOrderDetailPage';
import ValidationUserProtectedRoute from './shared/ValidationUserProtectedRoute';
import ValidationPortalLayout from './shared/ValidationPortalLayout';
import ValidationDashboardPage from './modules/validation_portal/ValidationDashboardPage';
import CheckingWorkstationDashboardPage from './modules/checking_portal/CheckingWorkstationDashboardPage';
import NumberingWorkstationDashboardPage from './modules/numbering_portal/NumberingWorkstationDashboardPage';
import InitializationDashboardPortalPage from './modules/initialisation_portal/InitializationDashboardPortalPage';
import AlterPiecesDashboardPage from './modules/initialisation_portal/AlterPiecesDashboardPage';
import NumberingBatchDetailsPage from './modules/numbering_portal/NumberingBatchDetailsPage';
import PreparationManagerDashboardPage from './modules/preparation_portal/PreparationManagerDashboardPage';
import BatchCuttingDetailsPage from './modules/cutting_portal/BatchCuttingDetailsPage';
import CreateProductionBatchForm from './modules/production/CreateProductionBatchForm'; // Assuming this exists for creating new batches
import WorkstationManagement from './modules/workstations/WorkstationManagement'; 
import PreparationManagerLayout from './shared/PreperationManagerLayout';
import PreparationUnloadDashboardPage from './modules/preparation_portal/PreparationUnloadDashboard';
import PreparationUnloadLayout from './shared/PreparationUnloadLayout'; 
import AssetManagementPage from './modules/asset/AssetManagementPage';
import SewingPartLayout from './shared/SewingPartLayout';
import SewingPartDashboardPage from './modules/sewing_portal/SewingPartDashboardPage';
import SewingManagerDashboardPage from './modules/sewing_portal/SewingManagerDashboardPage'; 
import AssemblyDashboardPage from './modules/sewing_portal/AssemblyDashboardPage';
import TrimOrderSummaryPage from './modules/store_manager/TrimOrderSummaryPage';
import NumberingCheckerSummaryPage from './modules/numbering_portal/NumberingCheckerSummaryPage';

function App() {
  return (
    <Routes>
      {/* --- 1. PUBLIC ROUTES --- */}
      <Route path="/" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />

      {/* --- 2. PROTECTED ROUTES --- */}
      <Route element={<ProtectedRoute />}>
        {/* The root path is the main entry point that redirects based on role */}
        <Route path="/init" element={<InitialRedirect />} />
        
        {/* Admin Portal */}
        <Route path="/admin" element={<AdminProtectedRoute><AdminLayout /></AdminProtectedRoute>}>
          {/* <Route index element={<AdminDashboardPage />} /> */}
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
          <Route path ="asset-management" element={<AssetManagementPage />} />  

          
         
          <Route path="workstation-management" element={<WorkstationManagement />} />
          
          <Route path="portal-management" element={<PortalManagementPage />} />
          <Route path="trim-management" element={<TrimManagementPage />} />
      </Route>

              {/* Store Manager Portal */}
        <Route path="/store-manager" element={<StoreManagerProtectedRoute><StoreManagerLayout /></StoreManagerProtectedRoute>}>
          <Route index element={<StoreManagerDashboardPage />} />
          <Route path="fabric-stock" element={<StoreManagerDashboardPage />} />
          <Route path="trim-management" element={<TrimManagementPage />} />
          
          {/* Corrected Routes for Trim Orders */}
          {/* This route displays the list of all orders */}
          <Route path="trim-orders" element={<TrimOrdersPage />} />
          
          {/* This route displays the details of a single, specific order */}
          <Route path="trim-orders/:orderId" element={<TrimOrderDetailPage />} />
          
          <Route path="record-trim-purchase" element={<TrimIntakeForm />} />
          <Route path="trim-orders/:orderId/summary" element={<TrimOrderSummaryPage />} /> 
        </Route>

        {/* Production Manager Portal */}
        <Route path="/production-manager" element={<ProductionManagerProtectedRoute><ProductionManagerLayout /></ProductionManagerProtectedRoute>}>
          <Route index element={<ProductionPlanningPage />} />
          <Route path="dashboard" element={<ProductionPlanningPage />} />
          <Route path="production-lines" element={<ProductionLinesPage />} />
          <Route path="factory-layout-planner" element={<FactoryLayoutPlannerPage />} />
          <Route path="production-line-types" element={<ProductionLineTypesPage />} />
          <Route path="workstation-management" element={<WorkstationManagement />} />
          <Route path="products" element={<ProductManagementPage />} />
          <Route path="product-brands" element={<ProductBrandsPage />} />
          <Route path="product-types" element={<ProductTypesPage />} />
          <Route path="product-piece-parts" element={<PiecePartsPage />} />
          <Route path="batches/new" element={<CreateProductionBatchForm />} />
          <Route path="batches/edit/:batchId" element={<CreateProductionBatchForm />} />
        </Route>
      </Route>

      <Route path="/cutting-portal" element={<CuttingOperatorProtectedRoute><CuttingPortalLayout /></CuttingOperatorProtectedRoute>}>
          <Route index element={<CuttingDashboardPage />} />
          <Route path="dashboard" element={<CuttingDashboardPage />} />
          <Route path="batch-details/:batchId" element={<BatchCuttingDetailsPage />} />
          {/* Add this new route */}
          {/* <Route path="cut/:batchId/:rollId" element={<CuttingFormPage />} /> */}
          {/* ... other cutting portal routes ... */}
      </Route>
      

      {/* Line Loader Portal */}
      <Route path="/line-loader" element={<LineLoaderProtectedRoute><LineLoaderLayout /></LineLoaderProtectedRoute>}>
          <Route index element={<LineLoaderDashboardPage />} />
          <Route path="dashboard" element={<LineLoaderDashboardPage />} />
          {/* Add more line loader specific routes here later */}
      </Route>    


      <Route path="/validation-portal" element={<ValidationUserProtectedRoute><ValidationPortalLayout /></ValidationUserProtectedRoute>}>
          <Route index element={<ValidationDashboardPage />} />
          <Route path="dashboard" element={<ValidationDashboardPage />} />
      </Route>

      <Route path="/checking-portal" element={<CheckingUserProtectedRoute><CheckingPortalLayout /></CheckingUserProtectedRoute>}>
          <Route index element={<CheckingWorkstationDashboardPage />} />
          <Route path="dashboard" element={<CheckingWorkstationDashboardPage />} />
          <Route path="batch-details/:batchId" element={<BatchCuttingDetailsPage />} />
      </Route>
      
      <Route path="/numbering-portal" element={<NumberingUserProtectedRoute><NumberingPortalLayout /></NumberingUserProtectedRoute>}>
          <Route index element={<NumberingWorkstationDashboardPage />} />
          <Route path="dashboard" element={<NumberingWorkstationDashboardPage />} />
          <Route path="summary" element={<NumberingBatchDetailsPage />} />
          <Route path="checker-summary" element={<NumberingCheckerSummaryPage />} />
      </Route>


      <Route path="/initialization-portal" element={<InitializationPortalProtectedRoute><InitializationPortalLayout /></InitializationPortalProtectedRoute>}>
          <Route index element={<InitializationDashboardPortalPage />} />
          <Route path="dashboard" element={<InitializationDashboardPortalPage />} />
          <Route path="alter-pieces" element={<AlterPiecesDashboardPage />} />  
          <Route path="summary" element={<NumberingBatchDetailsPage />} />
      </Route>

      <Route path="/preparation-unload-portal" element={<PreparationUnloadProtectedRoute><PreparationUnloadLayout /></PreparationUnloadProtectedRoute>}>
          <Route index element={<PreparationUnloadDashboardPage />} />
          <Route path="dashboard" element={<PreparationUnloadDashboardPage />} />
          {/* Add more preparation portal specific routes here later */}
      </Route>

      <Route path="/preparation-manager" element={<PreparationManagerProtectedRoute><PreparationManagerLayout /></PreparationManagerProtectedRoute>}>
          <Route index element={<PreparationManagerDashboardPage />} />
          <Route path="dashboard" element={<PreparationManagerDashboardPage />} />
          {/* Add more preparation manager specific routes here later */}
      </Route>

      <Route path="/sewing-part-operator" element={<SewingPartProtectedRoute><SewingPartLayout /></SewingPartProtectedRoute>}>
          <Route index element={<SewingPartDashboardPage />} />
          <Route path="dashboard" element={<SewingPartDashboardPage />} />
          {/* Add more sewing part operator specific routes here later */}
      </Route>

      <Route path="/sewing-manager" element={<SewingManagerProtectedRoute><SewingManagerLayout /></SewingManagerProtectedRoute>}>
          <Route index element={<SewingManagerDashboardPage />} />
          <Route path="dashboard" element={<SewingManagerDashboardPage />} />
          {/* Add more sewing manager specific routes here later */}
      </Route>  

      <Route path="/assembly-portal" element={<AssemblyProtectedRoute><AssemblyLayout /></AssemblyProtectedRoute>}>
          <Route index element={<AssemblyDashboardPage />} />
          <Route path="dashboard" element={<AssemblyDashboardPage />} />
          {/* Add more assembly operator specific routes here later */}
      </Route>  

      {/* --- 3. CATCH-ALL REDIRECT --- */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default App;

