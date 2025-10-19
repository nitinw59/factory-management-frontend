// In TrimManagementPage.jsx

import React, { useState } from 'react';
import CrudManager from '../../shared/CrudManager';
// ✅ Import the new config
import { trimItemConfig, trimItemVariantConfig, trimSubstituteConfig } from '../../config/crudConfigs';

const TrimManagementPage = () => {
    const [selectedTrimItem, setSelectedTrimItem] = useState(null);
    // ✅ NEW: Add state to track the selected VARIANT
    const [selectedVariant, setSelectedVariant] = useState(null);

    const handleTrimItemSelect = (item) => {
        setSelectedTrimItem(item);
        // ✅ NEW: Reset the selected variant when the parent item changes
        setSelectedVariant(null); 
    };

    // ✅ NEW: Handler for when a variant is selected
    const handleVariantSelect = (variant) => {
        setSelectedVariant(variant);
    };

    return (
        <div>
            <h1 className="text-3xl font-bold mb-6">Trim Management & Substitutions</h1>
            {/* ✅ MODIFIED: Change the grid to have 3 columns */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* --- Column 1: Trim Items (No changes here) --- */}
                <div>
                    <h2 className="text-xl font-semibold mb-4">1. Select Item</h2>
                    <CrudManager 
                        config={trimItemConfig} 
                        onRowSelect={handleTrimItemSelect}
                        selectedRowId={selectedTrimItem?.id}
                    />
                </div>

                {/* --- Column 2: Variants --- */}
                <div>
                     <h2 className="text-xl font-semibold mb-4">
                        2. Select Variant {selectedTrimItem ? `for ${selectedTrimItem.name}` : ''}
                    </h2>
                    {selectedTrimItem ? (
                        <CrudManager 
                            config={trimItemVariantConfig}
                            resourceFilter={{ trim_item_id: selectedTrimItem.id }}
                            // ✅ NEW: Add handlers to track the selected variant
                            onRowSelect={handleVariantSelect}
                            selectedRowId={selectedVariant?.id}
                        />
                    ) : (
                        <div className="p-8 text-center bg-gray-50 rounded-lg h-full flex items-center justify-center">
                            <p className="text-gray-500">Select a trim item on the left.</p>
                        </div>
                    )}
                </div>

                {/* ✅ --- Column 3: NEW - Substitutes --- */}
                <div>
                     <h2 className="text-xl font-semibold mb-4">
                        3. Manage Substitutes {selectedVariant ? `for ${selectedVariant.color_name}` : ''}
                    </h2>
                    {selectedVariant ? (
                        <CrudManager 
                            // Use the new config
                            config={trimSubstituteConfig}
                            // Filter substitutes by the original variant's ID
                            resourceFilter={{ original_variant_id: selectedVariant.id }}
                        />
                    ) : (
                        <div className="p-8 text-center bg-gray-50 rounded-lg h-full flex items-center justify-center">
                            <p className="text-gray-500">Select a variant in the middle column.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TrimManagementPage;