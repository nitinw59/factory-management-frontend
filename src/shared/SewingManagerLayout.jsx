import React from 'react';
import BaseManagerLayout from './BaseManagerLayout'; // Adjust path as needed
import { LuClipboardCheck, LuFileText, LuKeyRound } from 'react-icons/lu';

export default function SewingManagerLayout() {
    const sewingLinks = [
        { to: '/sewing-manager/dashboard', label: 'Sewing Queue', icon: LuClipboardCheck },
        { to: '/sewing-manager/summary', label: 'Batch QC Summary', icon: LuFileText },
    ];

    // Line supervisor's own QC override password (see OverridePasswordPage).
    const overrideLinks = [
        { to: '/sewing-manager/override-password', label: 'Override Password', icon: LuKeyRound },
    ];

    return (
        <BaseManagerLayout 
            portalName="Sewing Portal" 
            basePath="/sewing-manager" 
            // customLinks={sewingLinks} 
            customLinks={overrideLinks}
        />
    );
}