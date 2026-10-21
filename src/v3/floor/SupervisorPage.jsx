// Supervisor portal (19 Oct 2026, phase 4): line supervisors, QA managers, the floor in-charge and the factory admin set
// their own override password in 3.0 (as 2.0's Sewing Manager portal) and see the overrides they authorised.
import { PageHeader } from '../components/ui';
import SupervisorPinCard from './SupervisorPinCard';

export default function SupervisorPage() {
    return (
        <div className="max-w-3xl">
            <PageHeader title="Override password" subtitle="Your supervisor password for checkers' screens — rework limit and undo." />
            <SupervisorPinCard />
        </div>
    );
}
