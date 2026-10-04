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
import RedirectWithParams from './shared/RedirectWithParams';
import TrimKitLinkResolver from './shared/TrimKitLinkResolver';
import CuttingPortalLayout from './shared/CuttingPortalLayout'; // New
import CuttingOperatorProtectedRoute from './shared/CuttingOperatorProtectedRoute'; // New
import LineLoaderProtectedRoute from './shared/LineLoaderProtectedRoute'; // New
import LineLoaderLayout from './shared/LineLoaderLayout'; // New  
import CheckingPortalLayout from './shared/CheckingPortalLayout';
import CheckingUserProtectedRoute from './shared/CheckingUserProtectedRoute';
import UniversalCheckerLayout from './shared/UniversalCheckerLayout';

import InitializationPortalLayout from './shared/InitialisationPortalLayout'; 
import InitializationPortalProtectedRoute from './shared/InitialisationPortalProtectedRoute';
import PreparationManagerProtectedRoute from './shared/PreperationManagerProtectedRoute';
import PreparationUnloadProtectedRoute from './shared/PreparationUnloadProtectedRoute';
import SewingPartProtectedRoute from './shared/SewingPartProtectedRoute'; 
import SewingManagerLayout from './shared/SewingManagerLayout';
import SewingManagerProtectedRoute from './shared/SewingManagerProtectedRoute'; 
import GarmentLayout from './shared/GarmentLayout';
import AssemblyProtectedRoute from './shared/AssemblyProtectedRoute'; 
import AccountsLayout from './shared/AccountsLayout';
import SalesAccessProtectedRoute from './shared/SalesAccessProtectedRoute'; // <--- NEW IMPORT


// --- PUBLIC PAGES ---
import LoginPage from './login/LoginPage';
import AuthCallbackPage from './login/AuthCallbackPage';
import UnauthorizedPage from './login/UnauthorizedPage';

// --- MODULE PAGES ---
import ValidationUserProtectedRoute from './shared/ValidationUserProtectedRoute';
import ValidationPortalLayout from './shared/ValidationPortalLayout';
import PreparationManagerLayout from './shared/PreperationManagerLayout';
import PreparationUnloadLayout from './shared/PreparationUnloadLayout'; 
import SewingPartLayout from './shared/SewingPartLayout';
// import AssemblyDashboardPage from './modules/sewing_portal/AssemblyDashboardPage';
//import SalesOrderListPage from './modules/accounts/sales/SalesOrderListPage';

import MechanicsLayout from './shared/MechanicsLayout';
import MechanicsProtectedRoute from './shared/MechanicsProtectedRoute';



import FabricStoreLayout from './shared/FabricStoreLayout';
import FabricStoreProtectedRoute from './shared/FabricStoreProtectedRoute';

import DispatchLayout from './shared/DispatchLayout';
import DispatchProtectedRoute from './shared/DispatchProtectedRoute';


import MerchandiserProtectedRoute from './shared/MerchandiserProtectedRoute';
import MerchandiserLayout from './shared/MerchandiserLayout';

import PurchaseDepartmentProtectedRoute from './shared/PurchaseDepartmentProtectedRoute';
import PurchaseDepartmentLayout from './shared/PurchaseDepartmentLayout';




import HRLayout from './shared/HRLayout'; // Create a layout similar to AdminLayout with a sidebar
import HRProtectedRoute from './shared/HRProtectedRoute'; // Restrict to 'hr_manager', 'factory_admin'


//  ... line manager imports ...


import ReceiverProtectedRoute from './shared/ReceiverProtectedRoute';
import ReceiverLayout from './shared/ReceiverLayout';







// Trim Loss (lost trim) exception
import TrimLossProtectedRoute from './shared/TrimLossProtectedRoute';
import TrimLossLayout from './shared/TrimLossLayout';

// QA Portal (QC analytics + Final QC pre-dispatch inspection)
import QaPortalProtectedRoute from './shared/QaPortalProtectedRoute';
import QaPortalLayout from './shared/QaPortalLayout';
import { OfflineBanner } from './shared/NetworkStatus';
import lazyPage, { registerPrefetchGroups } from './shared/lazyPage';

// ─── Pages load on demand (see shared/lazyPage.jsx) ───────────────────────────

const KitPickupQueuePage = lazyPage(() => import('./modules/trim_kits/KitPickupQueuePage'));
const KitOrderPage = lazyPage(() => import('./modules/trim_kits/KitOrderPage'));
const KitHistoryPage = lazyPage(() => import('./modules/trim_kits/KitHistoryPage'));
const WorkstationsPage = lazyPage(() => import('./modules/workstations/WorkstationsPage'));
const WorkstationTypesPage = lazyPage(() => import('./modules/workstations/WorkstationTypesPage'));
const PiecePartsPage = lazyPage(() => import('./modules/products/PiecePartsPage'));
const PortalManagementPage = lazyPage(() => import('./modules/portals/PortalManagementPage'));  // New
const LineLoaderDashboardPage = lazyPage(() => import('./modules/line_loader/LineLoaderDashboardPage'));  // New
const PublicWorkstationScorecardPage = lazyPage(() => import('./modules/public/PublicWorkstationScorecardPage'));
const CompanyProfilePage = lazyPage(() => import('./modules/admin/CompanyProfilePage'));
const TrimClustersPage = lazyPage(() => import('./modules/admin/TrimClustersPage'));
const DefectCodeLineTypePage = lazyPage(() => import('./modules/admin/DefectCodeLineTypePage'));
const QCAnalyticsDashboard = lazyPage(() => import('./modules/admin/QCAnalyticsDashboard'));
const UserManagementPage = lazyPage(() => import('./modules/users/UserManagementPage'));
const SupplierManagementPage = lazyPage(() => import('./modules/suppliers/SupplierManagementPage'));
const CustomerManagementPage = lazyPage(() => import('./modules/admin/CustomerManagementPage'));
const SizesPage = lazyPage(() => import('./modules/admin/SizesPage'));
const TrimsDashboardPage = lazyPage(() => import('./modules/trims/TrimsDashboardPage'));
const ProductionLinesPage = lazyPage(() => import('./modules/production/ProductionLinesPage'));
const FabricColorsPage = lazyPage(() => import('./modules/colors/FabricColorsPage'));
const FabricTypesPage = lazyPage(() => import('./modules/fabric/FabricTypesPage'));
const TrimItemsPage = lazyPage(() => import('./modules/trims/TrimItemsPage'));
const TrimItemVariantsPage = lazyPage(() => import('./modules/trims/TrimItemVariantsPage'));
const ProductManagementPage = lazyPage(() => import('./modules/products/ProductManagementPage'));
const ProductBrandsPage = lazyPage(() => import('./modules/products/ProductBrandsPage'));
const ProductTypesPage = lazyPage(() => import('./modules/products/ProductTypesPage'));
const ProductionLineTypesPage = lazyPage(() => import('./modules/production/ProductionLineTypesPage'));
const CuttingDashboardPage = lazyPage(() => import('./modules/cutting_portal/CuttingDashboardPage'));  // New
const FactoryLayoutPlannerPage = lazyPage(() => import('./modules/production/FactoryLayoutPlannerPage'));
const TrimManagementPage = lazyPage(() => import('./modules/store_manager/TrimManagementPage'));
const TrimOrdersPage = lazyPage(() => import('./modules/store_manager/TrimOrdersPage'));
const TrimOrderDetailPage = lazyPage(() => import('./modules/store_manager/TrimOrderDetailPage'));
const ValidationDashboardPage = lazyPage(() => import('./modules/validation_portal/ValidationDashboardPage'));
const CheckingWorkstationDashboardPage = lazyPage(() => import('./modules/checking_portal/CheckingWorkstationDashboardPage'));
const NumberingWorkstationDashboardPage = lazyPage(() => import('./modules/numbering_portal/NumberingWorkstationDashboardPage'));
const InitializationDashboardPortalPage = lazyPage(() => import('./modules/initialisation_portal/InitializationDashboardPortalPage'));
const AlterPiecesDashboardPage = lazyPage(() => import('./modules/initialisation_portal/AlterPiecesDashboardPage'));
const MaterialReplacementsPage = lazyPage(() => import('./modules/initialisation_portal/MaterialReplacementsPage'));
const ReadyToLoadPage = lazyPage(() => import('./modules/initialisation_portal/ReadyToLoadPage'));
const NumberingBatchDetailsPage = lazyPage(() => import('./modules/numbering_portal/NumberingBatchDetailsPage'));
const PreparationManagerDashboardPage = lazyPage(() => import('./modules/preparation_portal/PreparationManagerDashboardPage'));
const BatchCuttingDetailsPage = lazyPage(() => import('./modules/cutting_portal/BatchCuttingDetailsPage'));
const CreateProductionBatchForm = lazyPage(() => import('./modules/production/CreateProductionBatchForm'));  // Assuming this exists for creating new batches
const WorkstationManagement = lazyPage(() => import('./modules/workstations/WorkstationManagement'));
const PreparationUnloadDashboardPage = lazyPage(() => import('./modules/preparation_portal/PreparationUnloadDashboard'));
const AssetManagementPage = lazyPage(() => import('./modules/asset/AssetManagementPage'));
const SewingPartDashboardPage = lazyPage(() => import('./modules/sewing_portal/SewingPartDashboardPage'));
const SewingManagerDashboardPage = lazyPage(() => import('./modules/sewing_portal/SewingManagerDashboardPage'));
const OverridePasswordPage = lazyPage(() => import('./modules/sewing_portal/OverridePasswordPage'));
const TrimOrderSummaryPage = lazyPage(() => import('./modules/store_manager/TrimOrderSummaryPage'));
const NumberingCheckerSummaryPage = lazyPage(() => import('./modules/numbering_portal/NumberingCheckerSummaryPage'));
const SewingMachineComplaintPage = lazyPage(() => import('./modules/asset/SewingMachineComplaintPage'));
const CuttingManagerReportPage = lazyPage(() => import('./modules/initialisation_portal/CuttingManagerReportPage'));
const CreateSalesOrder = lazyPage(() => import('./modules/accounts/sales/CreateSalesOrder'));
const ProductionWorkflowDashboard = lazyPage(() => import('./modules/production/ProductionWorkflowDashboard'));
const ProductionCapacityDashboard = lazyPage(() => import('./modules/production/ProductionCapacityDashboard'));
const SalesOrderListPage = lazyPage(() => import('./modules/accounts/sales/SalesOrderListPage'));
const CuttingDailyReportPage = lazyPage(() => import('./modules/initialisation_portal/CuttingDailyReportPage'));
const InterliningManagerPage = lazyPage(() => import('./modules/initialisation_portal/InterliningManagerPage'));
const FabricRollManagementPage = lazyPage(() => import('./modules/accounts/purchase/FabricIntakeForm'));
const PurchaseInvoicesPage = lazyPage(() => import('./modules/accounts/purchase/PurchaseInvoicesPage'));
const MechanicsDashboardPage = lazyPage(() => import('./modules/mechanics/MechanicsDashboardPage'));
const AdminMaintenanceDashboard = lazyPage(() => import('./modules/admin/AdminMaintenanceDashboard'));
const MaintenanceSchedulePage = lazyPage(() => import('./modules/maintenance/MaintenanceSchedulePage'));
const SparePartsPage = lazyPage(() => import('./modules/store_manager/SparePartsPage'));
const GeneralItemsPage = lazyPage(() => import('./modules/store_manager/GeneralItemsPage'));
const GeneralItemsMasterPage = lazyPage(() => import('./modules/admin/GeneralItemsMasterPage'));
const SparesAnalyticsPage = lazyPage(() => import('./modules/store_manager/SparesAnalyticsPage'));
const TrimReservationsPage = lazyPage(() => import('./modules/store_manager/TrimReservationsPage'));
const SupplierColorCodesPage = lazyPage(() => import('./modules/store_manager/SupplierColorCodesPage'));
const TrimStockLedgerPage = lazyPage(() => import('./modules/store_manager/TrimStockLedgerPage'));
const FabricRollsPage = lazyPage(() => import('./modules/fabric_store/FabricRollsPage'));
const FabricInwardsPage = lazyPage(() => import('./modules/fabric_store/FabricInwardsPage'));
const DispatchDashboardPage = lazyPage(() => import('./modules/depatch_portal/DispatchDashboardPage'));
const DispatchReceiptsPage = lazyPage(() => import('./modules/depatch_portal/DispatchReceiptsPage'));
const DispatchJobWorkPage = lazyPage(() => import('./modules/depatch_portal/DispatchJobWorkPage'));
const AccountsJobWorkPage = lazyPage(() => import('./modules/accounts/JobWorkPage'));
const SparesIssuanceDashboard = lazyPage(() => import('./modules/store_manager/SparesIssuanceDashboard'));
const BomDashboardPage = lazyPage(() => import('./modules/merchandiser/BomDashboardPage'));
const BomFormPage = lazyPage(() => import('./modules/merchandiser/BomFormPage'));
const GarmentMeasurementChartPage = lazyPage(() => import('./modules/merchandiser/GarmentMeasurementChartPage'));
const MerchandiserPlanningPage = lazyPage(() => import('./modules/merchandiser/MerchandiserPlanningPage'));
const ReleaseRecommendationsPage = lazyPage(() => import('./modules/merchandiser/ReleaseRecommendationsPage'));
const RequirementsPage = lazyPage(() => import('./modules/purchase_department/RequirementsPage'));
const RaiseRequirementPage = lazyPage(() => import('./modules/purchase_department/RaiseRequirementPage'));
const OrdersPage = lazyPage(() => import('./modules/purchase_department/OrdersPage'));
const TrimsLedgerPage = lazyPage(() => import('./modules/purchase_department/TrimsLedgerPage'));
const PurchaseFlowPage = lazyPage(() => import('./modules/purchase_department/PurchaseFlowPage'));
const InwardsPage = lazyPage(() => import('./modules/purchase_department/InwardsPage'));
const GrnInvoiceByDatePage = lazyPage(() => import('./modules/purchase_department/GrnInvoiceByDatePage'));
const HRDataImportPage = lazyPage(() => import('./modules/hr_portal/HRDataImportPage'));
const DailyAttendancePage = lazyPage(() => import('./modules/hr_portal/DailyAttendancePage'));
const EmployeeDirectoryPage = lazyPage(() => import('./modules/hr_portal/EmployeeDirectoryPage'));
const ShiftConfigurationPage = lazyPage(() => import('./modules/hr_portal/ShiftConfigurationPage'));
const ProductionCostingDashboard = lazyPage(() => import('./modules/production/ProductionCostingDashboard'));
const LineStaffCostingPage = lazyPage(() => import('./modules/lineManager/LineStaffCostingPage'));
const OutputLogsPage = lazyPage(() => import('./modules/lineManager/OutputLogsPage'));
const ProductionSettingsPage = lazyPage(() => import('./modules/production/ProductionSettingsPage'));
const ProductionTargetPage = lazyPage(() => import('./modules/production/ProductionTargetPage'));
const ScoreboardPage = lazyPage(() => import('./modules/production/ScoreboardPage'));
const ScorecardDetailedPage = lazyPage(() => import('./modules/production/ScorecardDetailedPage'));
const BomApprovalPage = lazyPage(() => import('./modules/production/BomApprovalPage'));
const JobWorkDashboardPage = lazyPage(() => import('./modules/production_manager/JobWorkDashboardPage'));
const ReceiverDashboardPage = lazyPage(() => import('./modules/receiver/ReceiverDashboardPage'));
const AdminLineConfigPage = lazyPage(() => import('./modules/asset/AdminLineConfigPage'));
const UniversalWorkstationDashboard = lazyPage(() => import('./modules/Universal/UniversalWorkstationDashboard'));
const GarmentProcessingPortal = lazyPage(() => import('./modules/garment_checker/GarmentProcessingPortal'));
const GarmentMonitor = lazyPage(() => import('./modules/garment_checker/GarmentMonitor'));
const ProductionAnalyticsDashboard = lazyPage(() => import('./modules/management/FactoryLineControlBoard'));
const TrimLossRegisterPage = lazyPage(() => import('./modules/trim_loss/TrimLossRegisterPage'));
const CaseDetailPage = lazyPage(() => import('./modules/trim_loss/CaseDetailPage'));
const HrRecoveryQueuePage = lazyPage(() => import('./modules/trim_loss/HrRecoveryQueuePage'));
const FinalQcRegisterPage = lazyPage(() => import('./modules/final_qc/FinalQcRegisterPage'));
const FinalQcDetailPage = lazyPage(() => import('./modules/final_qc/FinalQcDetailPage'));
const LiveQcTrackingPage = lazyPage(() => import('./modules/qc_live/LiveQcTrackingPage'));
const MyBugReportsPage = lazyPage(() => import('./modules/bug_reports/MyBugReportsPage'));
const BugReportDetailPage = lazyPage(() => import('./modules/bug_reports/BugReportDetailPage'));
const BugReportAdminDashboardPage = lazyPage(() => import('./modules/bug_reports/BugReportAdminDashboardPage'));

// ─── Version 3.0 (built portal by portal; see backend docs/VERSION_3_OVERVIEW.md) ───
const VersionChooserPage = lazyPage(() => import('./v3/VersionChooserPage'));
const V3Layout = lazyPage(() => import('./v3/V3Layout'));
const V3HomePage = lazyPage(() => import('./v3/masters/V3HomePage'));
const V3GarmentColoursPage = lazyPage(() => import('./v3/masters/GarmentColoursPage'));
const V3TrimSettingsPage = lazyPage(() => import('./v3/masters/TrimSettingsPage'));
const V3TrimTypesPage = lazyPage(() => import('./v3/masters/TrimTypesPage'));
const V3TrimItemsPage = lazyPage(() => import('./v3/masters/TrimItemsPage'));
const V3OpeningStockPage = lazyPage(() => import('./v3/masters/OpeningStockPage'));
const V3FabricItemsPage = lazyPage(() => import('./v3/masters/FabricItemsPage'));



// Route tree as a constant so lazyPage can read which pages belong to which
// portal (background download of a portal's other pages).
const appRoutes = (
    <Routes>
      {/* --- 1. PUBLIC ROUTES --- */}
      <Route path="/" element={<LoginPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />
      {/* No auth at all, by design — factory-floor TV/kiosk display, open link */}
      <Route path="/kiosk/workstation-scorecard" element={<PublicWorkstationScorecardPage />} />

      {/* --- 2. PROTECTED ROUTES --- */}
      <Route element={<ProtectedRoute />}>
        {/* The root path is the main entry point that redirects based on role */}
        <Route path="/init" element={<InitialRedirect />} />
        {/* After login: choose Version 2.0 (/init → role portal) or 3.0 (/v3) */}
        <Route path="/choose-version" element={<VersionChooserPage />} />
        {/* Version 3.0 */}
        <Route path="/v3" element={<V3Layout />}>
          <Route index element={<V3HomePage />} />
          <Route path="masters/garment-colours" element={<V3GarmentColoursPage />} />
          <Route path="masters/trim-settings" element={<V3TrimSettingsPage />} />
          <Route path="masters/trim-types" element={<V3TrimTypesPage />} />
          <Route path="masters/trim-items" element={<V3TrimItemsPage />} />
          <Route path="masters/opening-stock" element={<V3OpeningStockPage />} />
          <Route path="masters/fabric-items" element={<V3FabricItemsPage />} />
        </Route>
        <Route path="/sewing-machine-complaints" element={<SewingMachineComplaintPage />} />
        {/* Bug Reporting — any logged-in user can file/view their own reports */}
        <Route path="/bug-reports" element={<MyBugReportsPage />} />
        <Route path="/bug-reports/:id" element={<BugReportDetailPage />} />
        {/* Notification link_to aliases — backend paths mapped onto real portal routes */}
        <Route path="/store/trim-orders/:orderId" element={<RedirectWithParams to="/store-manager/trim-orders" />} />
        <Route path="/trim-kits/orders/:orderId" element={<TrimKitLinkResolver />} />
        
        {/* Admin Portal */}
        <Route path="/admin" element={<AdminProtectedRoute><AdminLayout /></AdminProtectedRoute>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<ScorecardDetailedPage />} />
          <Route path="users" element={<UserManagementPage />} />
          <Route path="suppliers" element={<SupplierManagementPage />} />
          <Route path="customers" element={<CustomerManagementPage />} />
          <Route path="sizes" element={<SizesPage />} />
          <Route path="inventory" element={<TrimsDashboardPage />} />
          <Route path="trim-items" element={<TrimItemsPage />} />
          <Route path="trim-item-variants" element={<TrimItemVariantsPage />} />
          <Route path="production-lines" element={<ProductionLinesPage />} />
          <Route path="production-line-types" element={<ProductionLineTypesPage />} />
          <Route path="scorecard-detailed" element={<ScorecardDetailedPage />} />
          <Route path="fabric-colors" element={<FabricColorsPage />} />
          <Route path="fabric-types" element={<FabricTypesPage />} />
          <Route path ="asset-management" element={<AssetManagementPage />} />  
          <Route path="sewing-machine-complaints" element={<SewingMachineComplaintPage />} />
          <Route path="line-config" element={<AdminLineConfigPage />} />  

          
         
          <Route path="workstation-management" element={<WorkstationManagement />} />
          
          <Route path="portal-management" element={<PortalManagementPage />} />
          <Route path="trim-management" element={<TrimManagementPage />} />
          <Route path="maintenance-dashboard" element={<AdminMaintenanceDashboard />} />
          <Route path="maintenance-schedule" element={<MaintenanceSchedulePage />} />
          <Route path="company-profile" element={<CompanyProfilePage />} />
          <Route path="trim-clusters" element={<TrimClustersPage />} />
          <Route path="spares-analytics" element={<SparesAnalyticsPage />} />
          <Route path="spares" element={<SparePartsPage />} />
          <Route path="general-items" element={<GeneralItemsMasterPage />} />
          <Route path="bug-reports" element={<BugReportAdminDashboardPage />} />
          <Route path="bug-reports/:id" element={<BugReportDetailPage />} />
      </Route>

              {/* Store Manager Portal */}
        <Route path="/store-manager" element={<StoreManagerProtectedRoute><StoreManagerLayout /></StoreManagerProtectedRoute>}>
          {/* Fabric moved to its own portal — /fabric-store-portal (role: fabric_store_manager) */}
          <Route index element={<Navigate to="trim-management" replace />} />
          <Route path="trim-management" element={<TrimManagementPage />} />

          {/* Corrected Routes for Trim Orders */}
          {/* This route displays the list of all orders */}
          <Route path="trim-orders" element={<TrimOrdersPage />} />
          
          {/* This route displays the details of a single, specific order */}
          <Route path="trim-orders/:orderId" element={<TrimOrderDetailPage />} />
          
          <Route path="trim-orders/:orderId/summary" element={<TrimOrderSummaryPage />} />
          <Route path="trim-kits/history" element={<KitHistoryPage />} />
          <Route path="trim-reservations" element={<TrimReservationsPage />} />
          <Route path="supplier-color-codes" element={<SupplierColorCodesPage />} />
          <Route path="trim-stock-ledger" element={<TrimStockLedgerPage />} />

          <Route path="spare-parts" element={<SparePartsPage />} />
          <Route path="spare-parts-issuance" element={<SparesIssuanceDashboard />} />
          <Route path="spares-analytics" element={<SparesAnalyticsPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="orders/:id" element={<PurchaseFlowPage />} />
          <Route path="inwards" element={<InwardsPage />} />
          <Route path="raise-requirement" element={<RaiseRequirementPage />} />
          <Route path="general-items" element={<GeneralItemsPage />} />
          <Route path="planning" element={<MerchandiserPlanningPage />} />
          <Route path="production-workflow" element={<ProductionWorkflowDashboard />} />
        </Route>

        {/* Production Manager Portal */}
        <Route path="/production-manager" element={<ProductionManagerProtectedRoute><ProductionManagerLayout /></ProductionManagerProtectedRoute>}>
          <Route index element={<ProductionWorkflowDashboard />} />
          <Route path="dashboard" element={<ProductionWorkflowDashboard />} />
          <Route path="production-lines" element={<ProductionLinesPage />} />
          <Route path="factory-layout-planner" element={<FactoryLayoutPlannerPage />} />
          <Route path="production-line-types" element={<ProductionLineTypesPage />} />
          <Route path="workstation-management" element={<WorkstationManagement />} />
          <Route path="batches/new" element={<CreateProductionBatchForm />} />
          <Route path="batches/edit/:batchId" element={<CreateProductionBatchForm />} />
          <Route path="sewing-machine-complaints" element={<SewingMachineComplaintPage />} />
          <Route path="production-workflow" element={<ProductionWorkflowDashboard />} />
          <Route path="batch-cutting-details/:batchId" element={<BatchCuttingDetailsPage />} />
          <Route path ="asset-management" element={<AssetManagementPage />} />  
          <Route path="maintenance-dashboard" element={<AdminMaintenanceDashboard />} />
          <Route path="maintenance-schedule" element={<MaintenanceSchedulePage />} />
          {/* <Route path="maintenance-logs" element={<MaintenanceLogsPage />} /> */}

          <Route path="batch-details/:batchId" element={<BatchCuttingDetailsPage />} />
          <Route path="batch-cutting-details/:batchId" element={<BatchCuttingDetailsPage />} />
          <Route path="capacity-dashboard" element={<ProductionCapacityDashboard />} />
          <Route path="reports/daily-costing" element={<ProductionCostingDashboard />} />
          <Route path="settings" element={<ProductionSettingsPage />} />
          <Route path="reports/production-analytics" element={<ProductionAnalyticsDashboard />} />
          <Route path="defect-code-line-types" element={<DefectCodeLineTypePage />} />
          <Route path="qc-analytics" element={<QCAnalyticsDashboard />} />
          <Route path="production-targets" element={<ProductionTargetPage />} />
          <Route path="scorecard" element={<ScoreboardPage />} />
          <Route path="scorecard-detailed" element={<ScorecardDetailedPage />} />
          <Route path="bom-approvals" element={<BomApprovalPage />} />
          <Route path="job-work" element={<JobWorkDashboardPage />} />
          <Route path="planning" element={<MerchandiserPlanningPage />} />
          <Route path="trim-kits/orders/:orderId" element={<KitOrderPage />} />
          <Route path="trim-kits/history" element={<KitHistoryPage />} />
          <Route path="bug-reports" element={<BugReportAdminDashboardPage />} />
          <Route path="bug-reports/:id" element={<BugReportDetailPage />} />

        </Route>
      </Route>


      <Route path="/accounts" element={<SalesAccessProtectedRoute><AccountsLayout /></SalesAccessProtectedRoute>}>
            {/* Redirect /accounts to the orders list */}
            <Route index element={<Navigate to="sales/orders" />} />
            <Route path="production-workflow" element={<ProductionWorkflowDashboard />} />
            {/* Sales Order Routes */}
            <Route path="sales/new" element={<CreateSalesOrder />} />
            <Route path="sales/:orderId/edit" element={<CreateSalesOrder />} />
            <Route path="sales/orders" element={<SalesOrderListPage />} />
            <Route path="fabric-rolls" element={<FabricRollManagementPage />} />
            {/* Purchase Department pages rendered inside AccountsLayout */}
            <Route path="purchase/orders" element={<OrdersPage />} />
            <Route path="purchase/orders/:id" element={<PurchaseFlowPage />} />
            <Route path="purchase/invoices" element={<PurchaseInvoicesPage />} />
            <Route path="purchase/trims-ledger" element={<TrimsLedgerPage />} />
            <Route path="purchase/supplier-color-codes" element={<SupplierColorCodesPage />} />
            <Route path="purchase/inwards" element={<InwardsPage />} />
            <Route path="job-work" element={<AccountsJobWorkPage />} />
            {/* Asset Management accessible to accountants */}
            <Route path="asset-management" element={<AssetManagementPage />} />
        </Route>

      <Route path="/cutting-portal" element={<CuttingOperatorProtectedRoute><CuttingPortalLayout /></CuttingOperatorProtectedRoute>}>
          <Route index element={<CuttingDashboardPage />} />
          <Route path="dashboard" element={<CuttingDashboardPage />} />
          <Route path="batch-details/:batchId" element={<BatchCuttingDetailsPage />} />
          <Route path="sewing-machine-complaints" element={<SewingMachineComplaintPage />} />

          {/* Add this new route */}
          {/* <Route path="cut/:batchId/:rollId" element={<CuttingFormPage />} /> */}
          {/* ... other cutting portal routes ... */}
      </Route>
      

      {/* Line Loader Portal */}
      <Route path="/line-loader" element={<LineLoaderProtectedRoute><LineLoaderLayout /></LineLoaderProtectedRoute>}>
          <Route index element={<LineLoaderDashboardPage />} />
          <Route path="dashboard" element={<LineLoaderDashboardPage />} />
          <Route path="trim-kits" element={<KitPickupQueuePage />} />
          <Route path="trim-kits/history" element={<KitHistoryPage />} />
          <Route path="trim-kits/orders/:orderId" element={<KitOrderPage />} />
          <Route path="trim-orders/:orderId/summary" element={<TrimOrderSummaryPage />} />
          <Route path="sewing-machine-complaints" element={<SewingMachineComplaintPage />} />


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

      <Route path="/universal-checker" >
          <Route index element={<UniversalWorkstationDashboard />} />
          <Route path="dashboard" element={<UniversalWorkstationDashboard />} />
          

      </Route>


      <Route path="/initialization-portal" element={<InitializationPortalProtectedRoute><InitializationPortalLayout /></InitializationPortalProtectedRoute>}>
          <Route index element={<InitializationDashboardPortalPage />} />
          <Route path="dashboard" element={<InitializationDashboardPortalPage />} />
          <Route path="alter-pieces" element={<AlterPiecesDashboardPage />} />
          <Route path="material-replacements" element={<MaterialReplacementsPage />} />
          <Route path="ready-to-load" element={<ReadyToLoadPage />} />

          <Route path="summary" element={<NumberingBatchDetailsPage />} />
          <Route path="sewing-machine-complaints" element={<SewingMachineComplaintPage />} />
          <Route path="reports" element={<CuttingManagerReportPage />} />
          <Route path="batch-details/:batchId" element={<BatchCuttingDetailsPage />} />
          <Route path="batch-cutting-details/:batchId" element={<BatchCuttingDetailsPage />} />
          <Route path="production-workflow" element={<ProductionWorkflowDashboard />} />
          <Route path="batches/new" element={<CreateProductionBatchForm />} />
          <Route path="batches/edit/:batchId" element={<CreateProductionBatchForm />} />
          <Route path="reports/daily" element={<CuttingDailyReportPage />} />
          <Route path="management/interlining-rules" element={<InterliningManagerPage />} />
          <Route path="maintenance/sewing-machine-complaints" element={<SewingMachineComplaintPage />} />
          <Route path="line-staff" element={<LineStaffCostingPage />} />
          <Route path="production-logs" element={<OutputLogsPage />} />
          <Route path="fabric-rolls" element={<FabricRollManagementPage />} />
          <Route path="scorecard" element={<ScoreboardPage />} />
      </Route>

      <Route path="/preparation-unload-portal" element={<PreparationUnloadProtectedRoute><PreparationUnloadLayout /></PreparationUnloadProtectedRoute>}>
          <Route index element={<PreparationUnloadDashboardPage />} />
          <Route path="dashboard" element={<PreparationUnloadDashboardPage />} />
          <Route path="sewing-machine-complaints" element={<SewingMachineComplaintPage />} />

          {/* Add more preparation portal specific routes here later */}
      </Route>

      <Route path="/preparation-manager" element={<PreparationManagerProtectedRoute><PreparationManagerLayout /></PreparationManagerProtectedRoute>}>
          <Route index element={<PreparationManagerDashboardPage />} />
          <Route path="dashboard" element={<PreparationManagerDashboardPage />} />
          <Route path="sewing-machine-complaints" element={<SewingMachineComplaintPage />} />
          

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
          <Route path="sewing-machine-complaints" element={<SewingMachineComplaintPage />} />
          <Route path="maintenance/sewing-machine-complaints" element={<SewingMachineComplaintPage />} />
          <Route path="line-staff" element={<LineStaffCostingPage />} />
          <Route path="production-logs" element={<OutputLogsPage />} />
          <Route path="override-password" element={<OverridePasswordPage />} />
          {/* Add more sewing manager specific routes here later */}
      </Route>  

      <Route path="/garment-checker" element={<GarmentLayout />}>
          <Route index element={<GarmentProcessingPortal />} />
          <Route path="dashboard" element={<GarmentProcessingPortal />} />
          <Route path="monitor" element={<GarmentMonitor />} />
          {/* Add more assembly operator specific routes here later */}
      </Route>  


    {/* mechanics portal */}
    <Route path="/mechanics-portal" element={<MechanicsProtectedRoute><MechanicsLayout /></MechanicsProtectedRoute>}>
        <Route index element={<MechanicsDashboardPage />} />
        <Route path="dashboard" element={<MechanicsDashboardPage />} />
        {/* Add more mechanics operator specific routes here later */}
    </Route>

    <Route path="/dispatch-portal" element={<DispatchProtectedRoute><DispatchLayout /></DispatchProtectedRoute>}>
        <Route index element={<DispatchDashboardPage />} />
        <Route path="dashboard" element={<DispatchDashboardPage />} />
        <Route path="receipts" element={<DispatchReceiptsPage />} />
        <Route path="job-work" element={<DispatchJobWorkPage />} />
        <Route path="production-workflow" element={<ProductionWorkflowDashboard />} />
        <Route path="scorecard" element={<ScoreboardPage />} />
        <Route path="scorecard-detailed" element={<ScorecardDetailedPage />} />
        <Route path="attendance" element={<DailyAttendancePage />} />
    </Route>

    <Route path="/fabric-store-portal" element={<FabricStoreProtectedRoute><FabricStoreLayout /></FabricStoreProtectedRoute>}>
        <Route index element={<Navigate to="rolls" replace />} />
        <Route path="dashboard" element={<Navigate to="/fabric-store-portal/rolls" replace />} />
        <Route path="rolls" element={<FabricRollsPage />} />
        <Route path="inwards" element={<FabricInwardsPage />} />
        <Route path="planning" element={<MerchandiserPlanningPage />} />
    </Route>


    <Route path="/hr-portal" element={<HRProtectedRoute><HRLayout /></HRProtectedRoute>}>
            {/* Redirect /hr-portal to dashboard */}
            <Route index element={<Navigate to="dashboard" />} />

            <Route path="dashboard" element={<DailyAttendancePage />} />
            <Route path="attendance" element={<DailyAttendancePage />} />
            <Route path="data-import" element={<HRDataImportPage />} />
            <Route path="shifts" element={<ShiftConfigurationPage />} />
            {/* Future routes: <Route path="payroll" element={<PayrollDashboard />} /> */}
            <Route path="employees" element={<EmployeeDirectoryPage />} />
    </Route>

    <Route path="/maintenance/sewing-machine-complaints" element={<SewingMachineComplaintPage />} />

    {/* Merchandiser Portal */}
    <Route path="/merchandiser" element={<MerchandiserProtectedRoute><MerchandiserLayout /></MerchandiserProtectedRoute>}>
        <Route index element={<Navigate to="bom" replace />} />
        <Route path="bom" element={<BomDashboardPage />} />
        <Route path="bom/new" element={<BomFormPage />} />
        <Route path="bom/:bomId/edit" element={<BomFormPage />} />
        <Route path="bom/:bomId/measurement-chart" element={<GarmentMeasurementChartPage />} />
        <Route path="planning" element={<MerchandiserPlanningPage />} />
        <Route path="release-recommendations" element={<ReleaseRecommendationsPage />} />
        <Route path="production-workflow" element={<ProductionWorkflowDashboard />} />
        <Route path="sales-orders" element={<SalesOrderListPage />} />
        <Route path="fabric-rolls" element={<FabricRollManagementPage />} />
        <Route path="products" element={<ProductManagementPage />} />
        <Route path="product-brands" element={<ProductBrandsPage />} />
        <Route path="product-types" element={<ProductTypesPage />} />
        <Route path="product-piece-parts" element={<PiecePartsPage />} />
    </Route>

    {/* Purchase Department Portal */}
    <Route path="/purchase-department" element={<PurchaseDepartmentProtectedRoute><PurchaseDepartmentLayout /></PurchaseDepartmentProtectedRoute>}>
        <Route index element={<Navigate to="orders" replace />} />
        {/* Requirements is off the portal nav (see PurchaseDepartmentLayout's NAV
            comment) but the route stays — TrimLossLayout's purchase_manager
            dashboard link and ReplacementPanel's standalone review link both
            still point here. */}
        <Route path="requirements" element={<RequirementsPage />} />
        <Route path="raise-requirement" element={<RaiseRequirementPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="orders/:id" element={<PurchaseFlowPage />} />
        <Route path="fabric-rolls" element={<FabricRollManagementPage />} />
        <Route path="suppliers" element={<SupplierManagementPage />} />
        <Route path="supplier-color-codes" element={<SupplierColorCodesPage />} />
        <Route path="inwards" element={<InwardsPage />} />
        <Route path="grn-invoices-by-date" element={<GrnInvoiceByDatePage />} />
    </Route>

    {/* Receiver Portal */}
    <Route path="/receiver" element={<ReceiverProtectedRoute><ReceiverLayout /></ReceiverProtectedRoute>}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<ReceiverDashboardPage />} />
    </Route>

    {/* Trim Loss (lost trim) exception — top-level group; satisfies the hardcoded
        /trim-loss/... links in KitHistoryPage and all trim-loss notification link_to targets. */}
    <Route path="/trim-loss" element={<TrimLossProtectedRoute><TrimLossLayout /></TrimLossProtectedRoute>}>
        <Route index element={<TrimLossRegisterPage />} />
        <Route path="cases/:id" element={<CaseDetailPage />} />
        <Route path="near-misses" element={<TrimLossRegisterPage nearMiss />} />
        <Route path="recovery" element={<HrRecoveryQueuePage />} />
    </Route>

    {/* QA Portal — QC analytics dashboard + Final QC (pre-dispatch AQL check).
        Top-level group so it's reachable by every role the spec allows, not
        nested under any single existing portal. */}
    <Route path="/qa-portal" element={<QaPortalProtectedRoute><QaPortalLayout /></QaPortalProtectedRoute>}>
        <Route index element={<LiveQcTrackingPage />} />
        <Route path="analytics" element={<QCAnalyticsDashboard />} />
        <Route path="defect-code-line-types" element={<DefectCodeLineTypePage />} />
        <Route path="production-workflow" element={<ProductionWorkflowDashboard />} />
        <Route path="final-qc" element={<FinalQcRegisterPage />} />
        <Route path="final-qc/:id" element={<FinalQcDetailPage />} />
    </Route>

      {/* --- 3. CATCH-ALL REDIRECT --- */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
);
registerPrefetchGroups(appRoutes);

function App() {
  return (
    <>
      <OfflineBanner />
      {appRoutes}
    </>
  );
}

export default App;

