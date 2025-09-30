import React, { useState } from 'react';
import CrudManager from '../../shared/CrudManager';
import { trimItemConfig, trimItemVariantConfig } from '../../config/crudConfigs';

const TrimManagementPage = () => {
    const [selectedTrimItem, setSelectedTrimItem] = useState(null);

    const handleRowSelect = (item) => {
        setSelectedTrimItem(item);
    };

    return (
        <div>
            <h1 className="text-3xl font-bold mb-6">Trim Management</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                    <h2 className="text-xl font-semibold mb-4">Trim Items</h2>
                    <CrudManager 
                        config={trimItemConfig} 
                        onRowSelect={handleRowSelect}
                        selectedRowId={selectedTrimItem?.id}
                    />
                </div>
                <div>
                     <h2 className="text-xl font-semibold mb-4">
                        Variants {selectedTrimItem ? `for ${selectedTrimItem.name}` : ''}
                    </h2>
                    {selectedTrimItem ? (
                        <CrudManager 
                            config={trimItemVariantConfig}
                            // Pass the selected trim item ID as a filter
                            resourceFilter={{ trim_item_id: selectedTrimItem.id }}
                        />
                    ) : (
                        <div className="p-8 text-center bg-gray-50 rounded-lg">
                            <p className="text-gray-500">Select a trim item on the left to view its variants.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TrimManagementPage;
