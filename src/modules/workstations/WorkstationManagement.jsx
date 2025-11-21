import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Plus, 
  Edit, 
  Trash2, 
  User, 
  Zap, 
  ChevronRight, 
  X, 
  Loader2, 
  Users, 
  LayoutDashboard, 
  Database,
  AlertCircle,
  CheckCircle,
  ServerCrash
} from 'lucide-react';
// Use the new API import as requested
import { workstationApi } from '../../api/WorkstationApi';

const Button = React.forwardRef(({ children, variant = 'primary', className = '', isLoading = false, ...props }, ref) => {
  const baseStyle = 'inline-flex items-center justify-center px-4 py-2 border rounded-md shadow-sm text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-indigo-600 text-white border-transparent hover:bg-indigo-700 focus:ring-indigo-500',
    secondary: 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 focus:ring-indigo-500',
    danger: 'bg-red-600 text-white border-transparent hover:bg-red-700 focus:ring-red-500',
    dangerOutline: 'bg-white text-red-600 border-red-300 hover:bg-red-50 focus:ring-red-500',
  };
  return (
    <button ref={ref} className={`${baseStyle} ${variants[variant]} ${className}`} disabled={isLoading} {...props}>
      {isLoading && <Loader2 size={16} className="animate-spin mr-2" />}
      {children}
    </button>
  );
});

/**
 * A reusable modal component
 */
const Modal = ({ show, onClose, title, children }) => {
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex items-end justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={onClose}></div>
        {/* Modal panel */}
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="sm:flex sm:items-start">
              <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                <h3 className="text-lg leading-6 font-medium text-gray-900" id="modal-title">{title}</h3>
                <div className="mt-4 w-full">
                  {children}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * A reusable form input (text, select)
 */
const FormInput = ({ label, name, value, onChange, type = 'text', required = false, placeholder = '', options = [], optionLabelKey = 'name', optionValueKey = 'id', error, disabled = false }) => {
  const handleChange = (e) => onChange(name, e.target.value);
  const inputId = `form-input-${name}`;
  const errorId = error ? `form-error-${name}` : undefined;
  
  const baseRing = error ? 'ring-red-500 border-red-500' : 'focus:ring-indigo-500 focus:border-indigo-500';

  if (type === 'select') {
    return (
      <div className="mb-4">
        <label htmlFor={inputId} className="block text-sm font-medium text-gray-700">{label}{required && ' *'}</label>
        <select
          id={inputId}
          name={name}
          value={value || ''}
          onChange={handleChange}
          required={required}
          disabled={disabled}
          className={`mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 sm:text-sm rounded-md shadow-sm ${baseRing} disabled:bg-gray-100`}
          aria-invalid={!!error}
          aria-describedby={errorId}
        >
          <option value="">Select {label}...</option>
          {options.map((opt, index) => {
            const val = opt[optionValueKey];
            const lab = opt[optionLabelKey];
            return <option key={index} value={val}>{lab}</option>;
          })}
        </select>
        {error && <p id={errorId} className="mt-1 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mb-4">
      <label htmlFor={inputId} className="block text-sm font-medium text-gray-700">{label}{required && ' *'}</label>
      <input
        type={type}
        id={inputId}
        name={name}
        value={value || ''}
        onChange={handleChange}
        required={required}
        placeholder={placeholder}
        disabled={disabled}
        className={`mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md ${baseRing} disabled:bg-gray-100`}
        aria-invalid={!!error}
        aria-describedby={errorId}
      />
      {error && <p id={errorId} className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
};

/**
 * Loading spinner component
 */
const LoadingSpinner = ({ message = "Loading data..." }) => (
  <div className="flex justify-center items-center h-64 w-full">
    <Loader2 size={32} className="animate-spin text-indigo-600" />
    <span className="ml-3 text-lg text-gray-700">{message}</span>
  </div>
);

/**
 * Error message component
 */
const ErrorMessage = ({ error, onClear }) => {
  if (!error) return null;
  return (
    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
      <div className="flex">
        <AlertCircle className="h-5 w-5 text-red-500 mr-3" />
        <div>
          <strong className="font-bold">Error! </strong>
          <span className="block sm:inline">{error.message || 'An unknown error occurred.'}</span>
        </div>
      </div>
      {onClear && (
        <span className="absolute top-0 bottom-0 right-0 px-4 py-3" onClick={onClear}>
          <X size={16} className="cursor-pointer" />
        </span>
      )}
    </div>
  );
};

/**
 * Visually distinguishes the process type with a colored badge
 */
const ProcessTypeBadge = ({ type }) => {
  const typeStyles = {
    loader: { text: 'Loader', icon: <Zap size={14} />, bg: 'bg-blue-100', textClr: 'text-blue-800' },
    regular: { text: 'Regular', icon: <Database size={14} />, bg: 'bg-gray-200', textClr: 'text-gray-800' },
    unloader: { text: 'Unloader', icon: <ChevronRight size={14} />, bg: 'bg-green-100', textClr: 'text-green-800' },
  };
  const style = typeStyles[type] || typeStyles.regular;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.textClr}`}>
      {style.icon}
      {style.text}
    </span>
  );
};

/**
 * Card component for a single workstation
 */
const WorkstationCard = ({ workstation, onEdit, onDelete }) => {
  return (
    <div className="bg-white shadow-md rounded-lg p-4 flex flex-col justify-between transition-all hover:shadow-lg">
      <div>
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-md font-semibold text-gray-900 truncate" title={workstation.name}>{workstation.name}</h3>
          <ProcessTypeBadge type={workstation.process_type} />
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <User size={14} className="text-gray-400 flex-shrink-0" />
            <span className="font-medium">Operator:</span>
            {workstation.assigned_user_name ? (
              <span className="text-gray-800 truncate">{workstation.assigned_user_name}</span>
            ) : (
              <span className="text-gray-500 italic">Unassigned</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <LayoutDashboard size={14} className="text-gray-400 flex-shrink-0" />
            <span className="font-medium">Line:</span>
            {workstation.production_line_name ? (
              <span className="text-gray-800 truncate">{workstation.production_line_name}</span>
            ) : (
              <span className="text-gray-500 italic">Not on a line</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
        <Button onClick={onEdit} variant="secondary" className="text-xs !py-1 !px-2 flex-1">
          <Edit size={14} className="mr-1" /> Edit
        </Button>
        <Button onClick={onDelete} variant="dangerOutline" className="text-xs !py-1 !px-2">
          <Trash2 size={14} />
        </Button>
      </div>
    </div>
  );
};

// ====================================================================
// Dedicated Form Components
// ====================================================================

/**
 * Dedicated form for Creating/Editing Workstation Types
 */
const WorkstationTypeForm = ({ initialData, onSubmit, onClose, formSubmissionError, isSubmitting }) => {
  const [formData, setFormData] = useState(initialData || { type_name: '', portal_id: '' });
  const [portals, setPortals] = useState([]);
  const [loadingError, setLoadingError] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});
  const isEdit = !!initialData;

  useEffect(() => {
    // Use the imported workstationApi
    workstationApi.getPortalsSimple()
      .then(response => setPortals(response.data)) // Corrected: extract .data
      .catch(err => setLoadingError(new Error("Could not load portals list.")));
  }, []);

  const handleChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    if (validationErrors[name]) {
      setValidationErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  const validate = () => {
    const errors = {};
    if (!formData.type_name || formData.type_name.trim().length < 3) {
      errors.type_name = 'Type Name is required (min 3 chars).';
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validate()) {
      onSubmit(formData);
    }
  };
  
  const formError = formSubmissionError || loadingError;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {formError && <ErrorMessage error={formError} />}
      
      <FormInput
        label="Type Name"
        name="type_name"
        value={formData.type_name}
        onChange={handleChange}
        required
        placeholder="e.g., Cutting, Sewing"
        error={validationErrors.type_name}
        disabled={isSubmitting}
      />
      
      <FormInput
        type="select"
        label="Associated Portal"
        name="portal_id"
        value={formData.portal_id}
        onChange={handleChange}
        options={portals}
        optionLabelKey="name"
        optionValueKey="id"
        disabled={isSubmitting || !!loadingError}
      />
      
      <div className="flex justify-end gap-2 pt-4 border-t border-gray-100 mt-6">
        <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
        <Button type="submit" variant="primary" isLoading={isSubmitting}>
          {isEdit ? 'Save Changes' : 'Create Type'}
        </Button>
      </div>
    </form>
  );
};

/**
 * Dedicated form for Creating/Editing Workstations
 */
const WorkstationForm = ({ initialData, onSubmit, onClose, formSubmissionError, isSubmitting }) => {
  
  // Helper to initialize form state from the detailed workstation object
  const getInitialFormData = (data) => {
    if (!data) {
      // Default for creating a new workstation
      return { name: '', workstation_type_id: '', assigned_user_id: '', type: 'regular' };
    }
    
    // Map the API object (initialData) to the form's state for editing
    return {
      name: data.name || '',
      workstation_type_id: data.workstation_type_id || '',
      assigned_user_id: data.assigned_user_id || '',
      // The API object has 'process_type', but the form state uses 'type'
      type: data.process_type || 'regular',
    };
  };

  const [formData, setFormData] = useState(getInitialFormData(initialData));
  const [dependencies, setDependencies] = useState({ users: [], workstationTypes: [] });
  const [loadingError, setLoadingError] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});
  const isEdit = !!initialData;

  const processTypeOptions = [
    { value: 'loader', name: 'Loader' },
    { value: 'regular', name: 'Regular' },
    { value: 'unloader', name: 'Unloader' },
  ];

  useEffect(() => {
    // Use the imported workstationApi
    Promise.all([
      workstationApi.getUsersForDropdown(),
      workstationApi.getWorkstationTypesSimple()
    ])
    .then(([usersResponse, workstationTypesResponse]) => {
      // Correctly extract the .data property from the API response
      setDependencies({ 
        users: usersResponse.data, 
        workstationTypes: workstationTypesResponse.data 
      });
      console.log('Loaded dependencies:', { 
        users: usersResponse.data, 
        workstationTypes: workstationTypesResponse.data 
      });
    })
    .catch(err => setLoadingError(new Error("Could not load users or workstation types.")));
  }, []);

  const handleChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    if (validationErrors[name]) {
      setValidationErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  const validate = () => {
    const errors = {};
    if (!formData.name || formData.name.trim().length < 3) {
      errors.name = 'Workstation Name is required (min 3 chars).';
    }
    if (!formData.workstation_type_id) {
      errors.workstation_type_id = 'Workstation Type is required.';
    }
    if (!formData.type) {
      errors.type = 'Process Type is required.';
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validate()) {
      onSubmit(formData);
    }
  };
  
  const formError = formSubmissionError || loadingError;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {formError && <ErrorMessage error={formError} />}

      <FormInput
        label="Workstation Name"
        name="name"
        value={formData.name}
        onChange={handleChange}
        required
        placeholder="e.g., Cutting Table 1"
        error={validationErrors.name}
        disabled={isSubmitting}
      />
      
      <FormInput
        type="select"
        label="Workstation Type"
        name="workstation_type_id"
        value={formData.workstation_type_id}
        onChange={handleChange}
        options={dependencies.workstationTypes}
        optionLabelKey="type_name"
        optionValueKey="id"
        required
        error={validationErrors.workstation_type_id}
        disabled={isSubmitting || !!loadingError}
      />
      
      <FormInput
        type="select"
        label="Process Type"
        name="type"
        value={formData.type}
        onChange={handleChange}
        options={processTypeOptions}
        optionLabelKey="name"
        optionValueKey="value"
        required
        error={validationErrors.type}
        disabled={isSubmitting}
      />

      <FormInput
        type="select"
        label="Assigned Operator"
        name="assigned_user_id"
        value={formData.assigned_user_id}
        onChange={handleChange}
        options={dependencies.users}
        optionLabelKey="name"
        optionValueKey="id"
        disabled={isSubmitting || !!loadingError}
      />
      
      <div className="flex justify-end gap-2 pt-4 border-t border-gray-100 mt-6">
        <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
        <Button type="submit" variant="primary" isLoading={isSubmitting}>
          {isEdit ? 'Save Changes' : 'Create Workstation'}
        </Button>
      </div>
    </form>
  );
};

// ====================================================================
// Dedicated View Components
// ====================================================================

/**
 * Renders the list of Workstation Types
 */
const WorkstationTypeList = ({ types, onEdit, onDelete, onAdd }) => {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-800">Manage Workstation Types</h2>
        <Button onClick={onAdd} variant="primary">
          <Plus size={16} className="mr-1" /> Add Type
        </Button>
      </div>
      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <ul role="list" className="divide-y divide-gray-200">
          {!Array.isArray(types) || types.length === 0 ? (
            <li className="px-4 py-4 sm:px-6 text-gray-500 italic">No workstation types found.</li>
          ) : (
            types.map((type) => (
              <li key={type.id} className="px-4 py-4 sm:px-6">
                <div className="flex items-center justify-between">
                <div className="truncate">
                  <p className="text-md font-medium text-indigo-600 truncate">{type.type_name}</p>
                  <p className="text-sm text-gray-500 truncate">
                    Portal: {type.portal_name || <span className="italic">None</span>}
                  </p>
                </div>
                <div className="ml-5 flex-shrink-0 flex gap-2">
                  <Button onClick={() => onEdit(type)} variant="secondary" className="text-xs !py-1 !px-2">
                    <Edit size={14} className="mr-1" /> Edit
                  </Button>
                  <Button onClick={() => onDelete(type)} variant="dangerOutline" className="text-xs !py-1 !px-2">
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
};

/**
 * Renders the main dashboard of grouped workstations
 */
const WorkstationDashboard = ({ workstationTypes, workstations, onEdit, onDelete, onAdd }) => {
  // Memoized workstations grouped by type for the UI
  const groupedWorkstations = useMemo(() => {
    if (!Array.isArray(workstationTypes)) {
      return []; // Add safety check to ensure workstationTypes is an array
    }
    return workstationTypes.map(type => ({
      ...type,
      workstations: workstations.filter(ws => ws.workstation_type_id === type.id)
    }));
  }, [workstations, workstationTypes]);
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-800">Workstation Dashboard</h2>
        <Button onClick={onAdd} variant="primary">
          <Plus size={16} className="mr-1" /> Add Workstation
        </Button>
      </div>
      <div className="space-y-6">
        {groupedWorkstations.length === 0 && (
           <p className="text-gray-500 italic text-sm">No workstation types found. Create a type first.</p>
        )}
        {groupedWorkstations.map(group => (
          <section key={group.id}>
            <h3 className="text-lg font-medium text-gray-900 mb-3 border-b border-gray-200 pb-2 flex justify-between items-center">
              <span>{group.type_name}</span>
              <span className="text-sm font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{group.workstations.length}</span>
            </h3>
            {group.workstations.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.workstations.map(ws => (
                  <WorkstationCard
                    key={ws.id}
                    workstation={ws}
                    onEdit={() => onEdit(ws)}
                    onDelete={() => onDelete(ws)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-gray-500 italic text-sm px-2">No workstations of this type.</p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
};

// ====================================================================
// Main Application Component
// ====================================================================
export default function App() {
  // 'workstations' or 'types'
  const [activeTab, setActiveTab] = useState('workstations');
  
  // Main data stores
  const [workstationTypes, setWorkstationTypes] = useState([]);
  const [workstations, setWorkstations] = useState([]);
  
  // App state
  const [loading, setLoading] = useState(true);
  const [appError, setAppError] = useState(null);
  const [formSubmissionError, setFormSubmissionError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(null);

  // Modal state
  const [modalState, setModalState] = useState({
    isOpen: false,
    type: null, // 'createWorkstationType', 'editWorkstationType', 'createWorkstation', 'editWorkstation'
    data: null
  });

  // --- Data Loading ---
  const loadData = useCallback(async () => {
    setLoading(true);
    setAppError(null);
    try {
      // We fetch both detailed lists for the main UI
      // Use the imported workstationApi
      const [wsTypesDetailed, wsDetailed] = await Promise.all([
        workstationApi.getWorkstationTypesDetailed(),
        workstationApi.getWorkstationsDetailed(),
      ]);
      
      setWorkstationTypes(wsTypesDetailed.data);
      setWorkstations(wsDetailed.data);
    } catch (err) {
      setAppError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // --- Success Message Handling ---
  const triggerSuccess = (message) => {
    setShowSuccess(message);
    setTimeout(() => setShowSuccess(null), 3000);
  };

  // --- Modal & Form Handling ---
  
  const openModal = (type, data = null) => {
    setFormSubmissionError(null); // Clear old errors
    setModalState({ isOpen: true, type, data });
  };

  const closeModal = () => {
    if (isSubmitting) return; // Don't close while submitting
    setModalState({ isOpen: false, type: null, data: null });
  };

  const handleFormSubmit = async (formData) => {
    setIsSubmitting(true);
    setFormSubmissionError(null);
    try {
      const { type, data } = modalState;
      // Use the imported workstationApi
      switch (type) {
        case 'createWorkstationType':
          await workstationApi.createWorkstationType(formData);
          triggerSuccess("Workstation type created!");
          break;
        case 'editWorkstationType':
          await workstationApi.updateWorkstationType(data.id, formData);
          triggerSuccess("Workstation type updated!");
          break;
        case 'createWorkstation':
          await workstationApi.createWorkstation(formData);
          triggerSuccess("Workstation created!");
          break;
        case 'editWorkstation':
          await workstationApi.updateWorkstation(data.id, formData);
          triggerSuccess("Workstation updated!");
          break;
        default:
          throw new Error('Invalid modal type');
      }
      closeModal();
      await loadData(); // Reload all data
    } catch (err) {
      setFormSubmissionError(err); // Show error *in* the modal
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (type, record) => {
    const isType = type === 'workstation_type';
    const recordName = record.name || record.type_name;
    
    if (!window.confirm(`Are you sure you want to delete "${recordName}"? This action cannot be undone.`)) {
      return;
    }
    
    setAppError(null);
    try {
      // Use the imported workstationApi
      if (isType) {
        await workstationApi.deleteWorkstationType(record.id);
      } else {
        await workstationApi.deleteWorkstation(record.id);
      }
      triggerSuccess(`"${recordName}" was deleted.`);
      await loadData(); // Reload all data
    } catch (err)
 {
      setAppError(err); // Show error at the app level
    }
  };

  // --- Render Logic ---

  const renderModalContent = () => {
    const { type, data } = modalState;
    switch (type) {
      case 'createWorkstationType':
        return <WorkstationTypeForm 
                  onSubmit={handleFormSubmit} 
                  onClose={closeModal} 
                  formSubmissionError={formSubmissionError}
                  isSubmitting={isSubmitting}
                />;
      case 'editWorkstationType':
        return <WorkstationTypeForm 
                  initialData={data}
                  onSubmit={handleFormSubmit} 
                  onClose={closeModal} 
                  formSubmissionError={formSubmissionError}
                  isSubmitting={isSubmitting}
                />;
      case 'createWorkstation':
        return <WorkstationForm 
                  onSubmit={handleFormSubmit} 
                  onClose={closeModal} 
                  formSubmissionError={formSubmissionError}
                  isSubmitting={isSubmitting}
                />;
      case 'editWorkstation':
        return <WorkstationForm 
                  initialData={data}
                  onSubmit={handleFormSubmit} 
                  onClose={closeModal} 
                  formSubmissionError={formSubmissionError}
                  isSubmitting={isSubmitting}
                />;
      default:
        return null;
    }
  };
  
  const modalTitle = {
    'createWorkstationType': 'Create New Workstation Type',
    'editWorkstationType': `Edit "${modalState.data?.type_name}"`,
    'createWorkstation': 'Create New Workstation',
    'editWorkstation': `Edit "${modalState.data?.name}"`,
  }[modalState.type];

  const renderTabContent = () => {
    if (loading) {
      return <LoadingSpinner />;
    }
    
    if (appError) {
      // Show a fatal error screen if initial load fails
      return (
         <div className="text-center p-10 bg-red-50 rounded-lg">
            <ServerCrash className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-red-800">Failed to Load Data</h3>
            <p className="text-red-700 mt-2 mb-4">{appError.message}</p>
            <Button onClick={loadData}>Try Again</Button>
         </div>
      );
    }
    
    if (activeTab === 'workstations') {
      return <WorkstationDashboard 
                workstationTypes={workstationTypes}
                workstations={workstations}
                onAdd={() => openModal('createWorkstation')}
                onEdit={(ws) => openModal('editWorkstation', ws)}
                onDelete={(ws) => handleDelete('workstation', ws)}
              />;
    }
    
    if (activeTab === 'types') {
      return <WorkstationTypeList 
                types={workstationTypes}
                onAdd={() => openModal('createWorkstationType')}
                onEdit={(type) => openModal('editWorkstationType', type)}
                onDelete={(type) => handleDelete('workstation_type', type)}
              />;
    }
    
    return null;
  };

  return (
    <div className="bg-gray-100 min-h-screen p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Workstation Management</h1>
          {/* Global Success Message */}
          {showSuccess && (
            <div className="flex items-center gap-2 text-green-700 bg-green-100 px-4 py-2 rounded-md transition-all duration-300">
              <CheckCircle size={16} />
              <span className="text-sm font-medium">{showSuccess}</span>
            </div>
          )}
        </div>
        
        {/* Tab Navigation */}
        <div className="mb-6">
          <div className="sm:hidden">
            <select
              id="tabs"
              name="tabs"
              className="block w-full focus:ring-indigo-500 focus:border-indigo-500 border-gray-300 rounded-md shadow-sm"
              onChange={(e) => setActiveTab(e.target.value)}
              value={activeTab}
            >
              <option value="workstations">Workstations</option>
              <option value="types">Workstation Types</option>
            </select>
          </div>
          <div className="hidden sm:block">
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                <button
                  onClick={() => setActiveTab('workstations')}
                  className={`group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'workstations'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Users size={16} className="mr-2" />
                  <span>Workstations</span>
                </button>
                <button
                  onClick={() => setActiveTab('types')}
                  className={`group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'types'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <LayoutDashboard size={16} className="mr-2" />
                  <span>Workstation Types</span>
                </button>
              </nav>
            </div>
          </div>
        </div>

        {/* Global App Error (for non-form errors) */}
        {appError && !loading && (
           <ErrorMessage error={appError} onClear={() => setAppError(null)} />
        )}

        {/* Content Area */}
        <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm">
          {renderTabContent()}
        </div>
      </div>
      
      {/* Modal for Create/Edit */}
      <Modal show={modalState.isOpen} onClose={closeModal} title={modalTitle}>
        {renderModalContent()}
      </Modal>
    </div>
  );
}

