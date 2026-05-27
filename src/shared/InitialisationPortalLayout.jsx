import React from 'react';
import BaseManagerLayout from './BaseManagerLayout';
import {
    LuLayoutDashboard, LuHammer, LuFileText, LuCalendarClock,
    LuTruck, LuLayers, LuTrophy, LuActivity, LuClipboardList, LuChartBar,
} from 'react-icons/lu';

export default function InitializationPortalLayout() {
    // Primary actions stay flat; everything else is grouped under dropdowns so
    // the top bar doesn't drown in 8+ links.
    const initLinks = [
        { to: '/initialization-portal/dashboard',           label: 'Queue',    icon: LuLayoutDashboard },
        { to: '/initialization-portal/production-workflow', label: 'Workflow', icon: LuActivity },
        {
            label: 'Batches',
            icon: LuClipboardList,
            children: [
                { to: '/initialization-portal/ready-to-load', label: 'Ready to Load',    icon: LuTruck },
                { to: '/initialization-portal/alter-pieces',  label: 'Alter Pieces',     icon: LuHammer },
                { to: '/initialization-portal/summary',       label: 'Batch QC Summary', icon: LuFileText },
            ],
        },
        {
            label: 'Reports',
            icon: LuChartBar,
            children: [
                { to: '/initialization-portal/fabric-rolls', label: 'Fabric',              icon: LuLayers },
                { to: '/initialization-portal/scorecard',    label: 'Scoreboard',          icon: LuTrophy },
                { to: '/merchandiser/planning',              label: 'Production Planning', icon: LuCalendarClock },
            ],
        },
    ];

    return (
        <BaseManagerLayout
            portalName="Initialization Portal"
            basePath="/initialization-portal"
            customLinks={initLinks}
        />
    );
}
