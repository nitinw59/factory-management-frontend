// This file defines the configuration for all reusable CRUD modules in the Factory App.

// For: factory_users table
export const factoryUserConfig = {
  resource: 'shared/factory_users',
  title: 'Factory User Management',
  fields: [
    { name: 'name', label: 'Full Name', type: 'text', required: true },
    { name: 'email', label: 'User Email', type: 'email', required: true },
    { 
      name: 'role', 
      label: 'Role', 
      type: 'select',
      required: true,
      options: ['factory_admin', 'store_manager', 'line_manager', 'supplier', 'production_manager', 'accountant', 'hr_manager', 'checking_user', 'cutting_operator', 'line_loader', 'validation_user', 'numbering_user', 'cutting_manager', 'preparation_user']  ,  
    },
  ],
  columns: [ { key: 'name', label: 'Name' }, { key: 'email', label: 'Email' }, { key: 'role', label: 'Role' } ]
};

// For: supplier table
export const supplierConfig = {
  resource: 'shared/supplier',
  title: 'Supplier Management',
  getAllResource: 'shared/suppliers/suppliers-detailed',
  fields: [
    { name: 'name', label: 'Supplier Name', type: 'text', required: true },
    { name: 'user_id', label: 'Associated User', type: 'select', required: true, resource: 'shared/factory_users' }, // 'resource' can be used to fetch options
    { name: 'gstn', label: 'GSTN', type: 'text' },
    { name: 'mobile', label: 'Mobile Number', type: 'text' },
    { name: 'city', label: 'City', type: 'text' },
    { name: 'address', label: 'Address', type: 'textarea' },
  ],
  columns: [ { key: 'name', label: 'Name' }, { key: 'mobile', label: 'Mobile' }, { key: 'city', label: 'City' } ]
};

// For: production_line_types table
export const productionLineTypeConfig = {
  resource: 'shared/production_line_types',
  title: 'Production Line Types',
  fields: [
    { name: 'type_name', label: 'Line Type Name', type: 'text', required: true },
  ],
  columns: [ 
    { key: 'type_name', label: 'Type Name' }
  ]
};

// For: production_lines table
export const productionLineConfig = {
  resource: 'shared/production_lines', // Used for CREATE, UPDATE, DELETE
  //getAllResource: 'shared/production-lines-detailed', // Used for the table view
  title: 'Production Lines',
  fields: [
    { name: 'name', label: 'Line Name', type: 'text', required: true },
    { 
      name: 'production_line_type_id', 
      label: 'Line Type', 
      type: 'select', 
      required: true,
      resource: 'shared/production_line_types',
      optionLabelFormatter: (option) => option.type_name // Use 'type_name' for display
    },
    { 
      name: 'line_manager_user_id', 
      label: 'Line Manager', 
      type: 'select', 
      resource: 'shared/factory_users',
      resourceFilter: { role: 'line_manager' } 
    },
  ],
  columns: [ 
    { key: 'name', label: 'Line Name' }, 
    { key: 'type_name', label: 'Type' },
    { key: 'line_manager_name', label: 'Manager' } 
  ]
};

// For: trim_items table
export const trimItemConfig = {
  resource: 'shared/trim_items',
  title: 'Trim Items (Catalog)',
  fields: [
    { name: 'name', label: 'Item Name', type: 'text', required: true },
    { name: 'brand', label: 'Brand', type: 'text', required: true },
    { name: 'description', label: 'Description', type: 'textarea', required: true },
    { name: 'item_code', label: 'Item Code / SKU', type: 'text' },
    { name: 'unit_of_measure', label: 'Unit of Measure', type: 'select', required: true, options: ['pieces', 'meters', 'spools', 'packets'] },
  ],
  columns: [ 
      { key: 'name', label: 'Name' }, 
      { key: 'brand', label: 'Brand' },
      { key: 'item_code', label: 'Code' }, 
      { key: 'unit_of_measure', label: 'Unit' } 
    ]
};

 export const trimItemVariantConfig = {
  resource: 'shared/trim_item_variants',
  getAllResource: 'trims/trim-item-variants-detailed',
  title: 'Trim Item Variants (Stock)',
  fields: [
    { 
      name: 'trim_item_id', 
      label: 'Base Item', 
      type: 'select', 
      required: true, 
      resource: 'shared/trim_items',
      // --- THIS IS THE NEW PROPERTY ---
      // This function tells the form how to display each option.
      optionLabelFormatter: (item) => `${item.name} - ${item.brand}`
    },
    { 
      name: 'fabric_color_id', 
      label: 'Color', 
      type: 'select', 
      required: true, 
      resource: 'shared/fabric_color',
      // Example of another formatter for the color dropdown
      optionLabelFormatter: (color) => `${color.name} (${color.color_number})`
    },
    { name: 'main_store_stock', label: 'Initial Stock', type: 'number', required: true, defaultValue: 0 },
    { name: 'low_stock_threshold', label: 'Low Stock Alert Level', type: 'number', defaultValue: 10 },
  ],
  columns: [ { key: 'item_name', label: 'Item' }, { key: 'color_name', label: 'Color' }, { key: 'main_store_stock', label: 'Current Stock' } ]
};

// For: fabric_color table
export const fabricColorConfig = {
  resource: 'shared/fabric_color',
  title: 'Fabric Colors',
  fields: [
    { name: 'name', label: 'Color Name', type: 'text', required: true },
    { name: 'color_number', label: 'Color Number', type: 'text' },
  ],
  columns: [ { key: 'name', label: 'Name' }, { key: 'color_number', label: 'Number' } ]
};

export const productBrandConfig = {
  resource: 'shared/product_brands',
  title: 'Product Brands',
  fields: [ { name: 'name', label: 'Brand Name', type: 'text', required: true } ],
  columns: [ { key: 'name', label: 'Name' } ]
};

// For: product_types table
export const productTypeConfig = {
  resource: 'shared/product_types',
  title: 'Product Types',
  fields: [ { name: 'type', label: 'Product Type', type: 'text', required: true } ],
  columns: [ { key: 'type', label: 'Type' } ]
};

// --- THIS IS THE FIX ---
// For: products table (Main management page)
export const productConfig = {
  resource: 'shared/products',
  title: 'Product Management',
  // The 'fields' array for the create/edit form has been added.
  fields: [
    { name: 'name', label: 'Product Name', type: 'text', required: true },
    { name: 'sku', label: 'SKU / Item Code', type: 'text' },
    { name: 'description', label: 'Description', type: 'textarea' },
    { 
      name: 'product_brand_id', 
      label: 'Brand', 
      type: 'select', 
      required: true, 
      resource: 'product_brands' 
    },
    { 
      name: 'product_type_id', 
      label: 'Type', 
      type: 'select', 
      required: true, 
      resource: 'product_types',
      // The CrudForm needs to know which property to use for the display label
      optionLabelFormatter: (option) => option.type 
    }
  ],
  columns: [
    { key: 'name', label: 'Product Name' },
    { key: 'sku', label: 'SKU' },
    { key: 'brand_name', label: 'Brand' },
    { key: 'type_name', label: 'Type' },
  ]
};

export const fabricTypeConfig = {
  // The resource path must match the endpoint defined in your backend's server.js
  resource: 'shared/fabric_type',
  title: 'Fabric Type Management',
  fields: [
    { 
      name: 'name', 
      label: 'Fabric Type Name', 
      type: 'text', 
      required: true 
    },
  ],
  columns: [ 
    { key: 'name', label: 'Name' },
  ]
};

export const workstationTypeConfig = {
  resource: 'shared/workstation_types',
  // We need a dedicated endpoint to get the portal name for the table view
  getAllResource: 'shared/workstation-types-detailed', 
  title: 'Workstation Types',
  fields: [
    { 
      name: 'type_name', 
      label: 'Type Name', 
      type: 'text', 
      required: true,
      placeholder: 'e.g., Cutting, Sewing'
    },
    {
      name: 'portal_id',
      label: 'Associated Portal',
      type: 'select',
      // The CrudForm will use this to fetch a list of all available portals
      // and populate the dropdown menu. This is not a required field.
      resource: 'shared/portals', 
    }
  ],
  columns: [ 
    { key: 'type_name', label: 'Type Name' },
    // This column will display the joined name from the 'portals' table
    { key: 'portal_name', label: 'Assigned Portal' }, 
  ]
};

// For: workstations table
// For: workstations table
export const workstationConfig = {
  // Use a dedicated "detailed" endpoint for the table to get joined data like user and type names
  getAllResource: 'shared/workstations-detailed',
  // The base resource is still used for creating, updating, and deleting
  resource: 'shared/workstations',
  title: 'Workstations',
  fields: [
    { 
      name: 'name', 
      label: 'Workstation Name', 
      type: 'text', 
      required: true,
      placeholder: 'e.g., Cutting Table 1, Sewing Machine 5'
    },
    { 
      name: 'workstation_type_id', 
      label: 'Workstation Type', 
      type: 'select', 
      required: true,
      resource: 'shared/workstation_types',
      // Tells the form to display the 'type_name' property from the fetched options
      optionLabelFormatter: (option) => option.type_name
    },
    { 
      name: 'assigned_user_id', 
      label: 'Assigned Operator', 
      type: 'select', 
      resource: 'shared/factory_users',
      // --- IMPROVEMENT: Only show users with roles that can operate a workstation ---
      resourceFilter: { roles: ['cutting_operator', 'line_loader', 'validation_user'] },
      // Tells the form to display the 'name' property from the fetched user options
      optionLabelFormatter: (option) => option.name
    },
    {
      name: 'type',
      label: 'Process Type',
      type: 'select',
      required: true,
      // These options are objects, which is great for storing a value and a label separately
      options: [
        { value: 'loader', label: 'Loader' },
        { value: 'regular', label: 'Regular' },
        { value: 'unloader', label: 'Unloader' },
      ]
    }
  ],
  columns: [
    { key: 'name', label: 'Workstation Name' },
    { key: 'type_name', label: 'Type' }, // This was workstation_type_name in your code, ensure it matches your API response
    { key: 'assigned_user_name', label: 'Assigned To' },
    {
      key: 'process_type', // The key should match the alias from your API ('w.type AS process_type')
      label: 'Process Type',
      // ✅ CORRECTED FORMATTER
      formatter: (item) => {
        // Access the correct property from the row object and check if it's a valid string.
        if (typeof item.process_type === 'string' && item.process_type.length > 0) {
          return item.process_type.charAt(0).toUpperCase() + item.process_type.slice(1);
        }
        return ''; // Return an empty string for invalid or null data
      }
    },
  ]
};




// export const workstationConfig = {
//   resource: 'shared/workstations',
//   title: 'Workstations',
//   fields: [
//     { name: 'name', label: 'Workstation Name', type: 'text', required: true },
//     { 
//       name: 'workstation_type_id', 
//       label: 'Workstation Type', 
//       type: 'select', 
//       required: true,
//       resource: 'shared/workstation_types',
//       optionLabelFormatter: (option) => option.type_name
//     },
//     { 
//       name: 'assigned_user_id', 
//       label: 'Assigned User', 
//       type: 'select', 
//       resource: 'shared/factory_users',
//       optionLabelFormatter: (option) => option.name // Assuming the user object has a 'name' property
//     },
//     // --- NEW FIELD ADDED HERE ---
//     {
//       name: 'type',
//       label: 'Process Type',
//       type: 'select',
//       required: true,
//       // Since the options are fixed in the database ENUM, we can hardcode them here.
//       options: [
//         { value: 'loader', label: 'Loader' },
//         { value: 'regular', label: 'Regular' },
//         { value: 'unloader', label: 'Unloader' },
//       ]
//     }
//   ],
//   columns: [ 
//     { key: 'name', label: 'Workstation Name' },
//     // --- NEW COLUMN ADDED HERE ---
//     // Note: Displaying this will work out-of-the-box since it's a direct column.
//     { key: 'type', label: 'Process Type' }, 
//     // These columns still require a dedicated endpoint with JOINs to display names
//     // { key: 'type_name', label: 'Type' },
//     // { key: 'assigned_user_name', label: 'Assigned To' } 
//   ]
// };

// For: product_piece_parts table
export const piecePartConfig = {
    resource: 'admin/product_piece_parts',
    title: 'Product Piece Parts',
    fields: [
        { name: 'product_id', label: 'Product', type: 'select', required: true, resource: 'admin/products'},
        { name: 'part_name', label: 'Part Name', type: 'text', required: true, placeholder: 'e.g., Front Panel, Pocket' },
        { name: 'part_type', label: 'Part Type', type: 'select', required: true, options: ['PRIMARY', 'SUPPORTING'] },
    ],
    columns: [
        // These columns will require a dedicated endpoint with JOINs to display names
        // { key: 'product_name', label: 'Product'},
        { key: 'part_name', label: 'Part Name' },
        { key: 'part_type', label: 'Part Type' },
    ]
};


export const portalConfig = {
  // The resource path must match the endpoint defined in your backend's server.js
  resource: 'shared/portals',
  title: 'Portal Management',
  fields: [
    { 
      name: 'name', 
      label: 'Portal Name', 
      type: 'text', 
      required: true,
      placeholder: 'e.g., Cutting Portal'
    },
    {
      name: 'url',
      label: 'Portal URL',
      type: 'text',
      required: true,
      placeholder: 'e.g., /cutting-portal/dashboard'
    }
  ],
  columns: [ 
    { key: 'name', label: 'Portal Name' },
    { key: 'url', label: 'URL' },
  ]
};


