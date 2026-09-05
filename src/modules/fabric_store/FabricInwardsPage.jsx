// Fabric intake for the Fabric Store Portal — reuses the Purchase Department's
// existing Inwards system (PO-line price-variance approval, challan photo,
// roll-level detail) instead of a separate Goods Receipt flow, scoped to
// item_type='fabric' only via InwardsPage's lockedItemType prop.
import InwardsPage from '../purchase_department/InwardsPage';

const FabricInwardsPage = () => (
    <InwardsPage
        lockedItemType="fabric"
        title="Fabric Inwards"
        subtitle="History of fabric goods receipts and pending approvals"
    />
);

export default FabricInwardsPage;
