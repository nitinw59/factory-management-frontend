// This file defines the configuration for all reusable CRUD modules in the Factory App.

// For: factory_users table
export const factoryUserConfig = {
  resource: 'admin/factory_users',
  title: 'Factory User Management',
  fields: [
    { name: 'name', label: 'Full Name', type: 'text', required: true },
    { name: 'email', label: 'User Email', type: 'email', required: true },
    { 
      name: 'role', 
      label: 'Role', 
      type: 'select',
      required: true,
      options: ['factory_admin', 'store_manager', 'line_manager', 'supplier', 'production_manager', 'accountant', 'hr_manager', 'loader', 'checker'],  
    },
  ],
  columns: [ { key: 'name', label: 'Name' }, { key: 'email', label: 'Email' }, { key: 'role', label: 'Role' } ]
};

// For: supplier table
export const supplierConfig = {
  resource: 'shared/supplier',
  title: 'Supplier Management',
  getAllResource: 'admin/suppliers-detailed',
  fields: [
    { name: 'name', label: 'Supplier Name', type: 'text', required: true },
    { name: 'user_id', label: 'Associated User', type: 'select', required: true, resource: 'admin/factory_users' }, // 'resource' can be used to fetch options
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
  getAllResource: 'admin/production-lines-detailed', // Used for the table view
  title: 'Production Lines',
  fields: [
    { name: 'name', label: 'Line Name', type: 'text', required: true },
    { 
      name: 'production_line_type_id', 
      label: 'Line Type', 
      type: 'select', 
      required: true,
      resource: 'production_line_types',
      optionLabelFormatter: (option) => option.type_name // Use 'type_name' for display
    },
    { 
      name: 'line_manager_user_id', 
      label: 'Line Manager', 
      type: 'select', 
      resource: 'factory_users',
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
      resource: 'trim_items',
      // --- THIS IS THE NEW PROPERTY ---
      // This function tells the form how to display each option.
      optionLabelFormatter: (item) => `${item.name} - ${item.brand}`
    },
    { 
      name: 'fabric_color_id', 
      label: 'Color', 
      type: 'select', 
      required: true, 
      resource: 'fabric_color',
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


