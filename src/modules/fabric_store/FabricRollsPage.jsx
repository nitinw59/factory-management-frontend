// Fabric roll browsing/management for the Fabric Store Portal — reuses the
// existing Pool/Requirements/All-Rolls UI wholesale (Accounts' FabricIntakeForm.jsx,
// exported as FabricRollManagementPage) rather than rebuilding it: it's already
// fully wired to fabricStoreApi (roll CRUD) and storeManagerApi.getFabricColors
// (shared master), and is still used as-is at /accounts/fabric-rolls too.
export { default } from '../accounts/purchase/FabricIntakeForm';
