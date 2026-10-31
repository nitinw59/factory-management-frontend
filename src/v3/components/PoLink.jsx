// A PO number: a link to the PO for those who may open it; plain text for the stores, who don't see POs (prices) since
// 29 Oct 2026.
import { Link } from 'react-router-dom';
import { useCanOpen } from '../V3Access';

export default function PoLink({ id, className = '', children }) {
    const canOpen = useCanOpen('purchasing.orders');
    return canOpen ? <Link to={`/v3/purchasing/orders/${id}`} className={className}>{children}</Link> : <span>{children}</span>;
}
