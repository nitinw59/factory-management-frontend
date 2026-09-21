// ─── WORKSPACE DRAWER ────────────────────────────────────────────────────────
// Full-screen overlay that mounts MerchandiserSopWorkspace for the trail's
// "Fabric" or "Trim" node — full screen (not a side drawer) since the
// requirements grid needs the room. Keeps the trail list mounted underneath;
// closing just unmounts this overlay, no navigation involved.

import MerchandiserSopWorkspace from './MerchandiserSopWorkspace';

const WorkspaceDrawer = ({ sop, salesOrder, scope, onSopChanged, onClose }) => (
    <div className="fixed inset-0 bg-white z-40 flex flex-col animate-in fade-in duration-150">
        <MerchandiserSopWorkspace
            sop={sop}
            salesOrder={salesOrder}
            scope={scope}
            onSopChanged={onSopChanged}
            onBack={onClose}
        />
    </div>
);

export default WorkspaceDrawer;
