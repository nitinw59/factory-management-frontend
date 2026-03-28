import React from 'react';
import BaseManagerLayout from './BaseManagerLayout'; // Adjust path as needed
import { LuLayoutDashboard, LuHammer, LuFileText } from 'react-icons/lu';

export default function InitializationPortalLayout() {
    const initLinks = [
        { to: '/initialization-portal/production-workflow', label: 'Workflow Dashboard' },
        { to: '/initialization-portal/dashboard', label: 'Initialization Queue', icon: LuLayoutDashboard },
        { to: '/initialization-portal/alter-pieces', label: 'Alter Pieces', icon: LuHammer },
        { to: '/initialization-portal/summary', label: 'Batch QC Summary', icon: LuFileText },
    ];

    return (
        <BaseManagerLayout 
            portalName="Initialization Portal" 
            basePath="/initialization-portal" 
            customLinks={initLinks} 
        />
    );
}