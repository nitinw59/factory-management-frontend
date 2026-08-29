import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, ArrowLeft, ShieldCheck, BarChart2, ClipboardCheck, Activity, Tags, GitBranch } from 'lucide-react';
import NotificationBell from './NotificationBell';
import ReportBugButton from './ReportBugButton';

// Where "back to my portal" sends each role.
const PORTAL_HOME = {
    factory_admin: '/admin/dashboard',
    line_loader: '/line-loader/dashboard',
    cutting_manager: '/cutting-portal/dashboard',
    garment_checker: '/garment-checker/dashboard',
    production_manager: '/production-manager/dashboard',
    quality_manager: '/qa-portal',
    dispatch_officer: '/dispatch-portal/dashboard',
    accountant: '/accounts',
    store_manager: '/store-manager/trim-orders',
    // numbering_user has no dedicated portal home mapped yet — falls back to /init below.
};

// Roles allowed on the Live Floor tab — matches LiveQcTrackingPage's own
// inline gate and the backend's LIVE_QC_VIEWER_ROLES broadcast target.
const LIVE_QC_ROLES = ['factory_admin', 'production_manager', 'quality_manager', 'cutting_manager'];

// Matches DefectCodeLineTypePage's own inline gate / the backend's
// defect-code admin endpoints — hidden from roles who'd only hit 403s.
const DEFECT_CODES_ROLES = ['factory_admin', 'production_manager', 'quality_manager'];

// Roles that both reach the QA Portal (QaPortalProtectedRoute.ALLOWED_ROLES)
// and are authorized for the workflow dashboard/batch-drilldown backend
// routes (authorizedRolesForWorkflow) — accountant/store_manager/
// dispatch_officer already have this same dashboard linked from their own
// portals, so it's left out of this nav to avoid duplicating it.
const PRODUCTION_WORKFLOW_ROLES = ['factory_admin', 'production_manager', 'cutting_manager', 'quality_manager'];

const QaPortalLayout = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => { logout(); navigate('/login'); };
    const home = PORTAL_HOME[user?.role] || '/init';
    const canViewLive = LIVE_QC_ROLES.includes(user?.role);
    const canManageDefectCodes = DEFECT_CODES_ROLES.includes(user?.role);
    const canViewProductionWorkflow = PRODUCTION_WORKFLOW_ROLES.includes(user?.role);

    return (
        <div className="flex flex-col h-screen bg-slate-50 font-sans">
            <header className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-20">
                <div className="container mx-auto px-4 sm:px-6 py-3 flex justify-between items-center gap-4">
                    <div className="flex items-center gap-4 sm:gap-8 min-w-0">
                        <NavLink to={home} className="flex items-center gap-1.5 text-sm font-semibold text-slate-400 hover:text-slate-600 transition-colors shrink-0">
                            <ArrowLeft size={16} /> <span className="hidden sm:inline">My portal</span>
                        </NavLink>
                        <span className="w-px h-5 bg-slate-200 shrink-0" />
                        <div className="flex items-center gap-2 min-w-0">
                            <div className="p-1.5 bg-indigo-100 rounded-lg text-indigo-600 shrink-0"><ShieldCheck size={18} /></div>
                            <span className="font-black text-base sm:text-lg text-slate-800 tracking-tight truncate">QA Portal</span>
                        </div>
                        <nav className="hidden md:flex items-center gap-5">
                            {canViewLive && (
                                <NavLink end to="/qa-portal" className={({ isActive }) => `flex items-center gap-1.5 text-sm font-medium transition-colors ${isActive ? 'text-indigo-600' : 'text-slate-600 hover:text-indigo-600'}`}>
                                    <Activity size={14} /> Live Floor
                                </NavLink>
                            )}
                            <NavLink to="/qa-portal/analytics" className={({ isActive }) => `flex items-center gap-1.5 text-sm font-medium transition-colors ${isActive ? 'text-indigo-600' : 'text-slate-600 hover:text-indigo-600'}`}>
                                <BarChart2 size={14} /> Analytics
                            </NavLink>
                            <NavLink to="/qa-portal/final-qc" className={({ isActive }) => `flex items-center gap-1.5 text-sm font-medium transition-colors ${isActive ? 'text-indigo-600' : 'text-slate-600 hover:text-indigo-600'}`}>
                                <ClipboardCheck size={14} /> Final QC
                            </NavLink>
                            {canManageDefectCodes && (
                                <NavLink to="/qa-portal/defect-code-line-types" className={({ isActive }) => `flex items-center gap-1.5 text-sm font-medium transition-colors ${isActive ? 'text-indigo-600' : 'text-slate-600 hover:text-indigo-600'}`}>
                                    <Tags size={14} /> Defect Codes
                                </NavLink>
                            )}
                            {canViewProductionWorkflow && (
                                <NavLink to="/qa-portal/production-workflow" className={({ isActive }) => `flex items-center gap-1.5 text-sm font-medium transition-colors ${isActive ? 'text-indigo-600' : 'text-slate-600 hover:text-indigo-600'}`}>
                                    <GitBranch size={14} /> Production Workflow
                                </NavLink>
                            )}
                        </nav>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                        {user && <span className="hidden lg:inline text-sm font-medium text-slate-700">Welcome, {user.name}</span>}
                        <ReportBugButton />
                        <NotificationBell />
                        <button onClick={handleLogout} className="flex items-center text-sm font-medium text-slate-500 hover:text-rose-600 transition-colors gap-1.5">
                            <LogOut size={15} /> <span className="hidden sm:inline">Logout</span>
                        </button>
                    </div>
                </div>
            </header>
            <main className="flex-1 overflow-y-auto p-4 sm:p-6">
                <Outlet />
            </main>
        </div>
    );
};

export default QaPortalLayout;
