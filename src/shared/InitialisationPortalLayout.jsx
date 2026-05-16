import React from 'react';
import BaseManagerLayout from './BaseManagerLayout'; // Adjust path as needed
import { LuLayoutDashboard, LuHammer, LuFileText, LuCalendarClock, LuTruck, LuLayers, LuTrophy } from 'react-icons/lu';

export default function InitializationPortalLayout() {
    const initLinks = [
        { to: '/initialization-portal/production-workflow', label: 'Workflow Dashboard' },
        { to: '/initialization-portal/dashboard', label: 'Initialization Queue', icon: LuLayoutDashboard },
        { to: '/initialization-portal/ready-to-load', label: 'Ready to Load', icon: LuTruck },
        { to: '/initialization-portal/alter-pieces', label: 'Alter Pieces', icon: LuHammer },
        { to: '/initialization-portal/summary', label: 'Batch QC Summary', icon: LuFileText },
        { to: '/initialization-portal/fabric-rolls', label: 'Fabric', icon: LuLayers },
        { to: '/initialization-portal/scorecard', label: 'Scoreboard', icon: LuTrophy },
        { to: '/merchandiser/planning', label: 'Production Planning', icon: LuCalendarClock },
    ];

    return (
        <BaseManagerLayout 
            portalName="Initialization Portal" 
            basePath="/initialization-portal" 
            customLinks={initLinks} 
        />
    );
}