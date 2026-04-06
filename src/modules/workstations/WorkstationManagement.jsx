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
  ServerCrash,
  Layers
} from 'lucide-react';
import { workstationApi } from '../../api/WorkstationApi';

// ====================================================================
// Shared UI Components
// ====================================================================

const Button = React.forwardRef(({ children, variant = 'primary', className = '', isLoading = false, ...props }, ref) => {
  const baseStyle = 'inline-flex items-center justify-center px-4 py-2 border rounded-md shadow-sm text-sm font-bold focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95';
  const variants = {
    primary: 'bg-indigo-600 text-white border-transparent hover:bg-indigo-700 focus:ring-indigo-500',
    secondary: 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50 focus:ring-indigo-500',
    danger: 'bg-rose-600 text-white border-transparent hover:bg-rose-700 focus:ring-rose-500',
    dangerOutline: 'bg-white text-rose-600 border-rose-300 hover:bg-rose-50 focus:ring-rose-500',
  };
  return (
    <button ref={ref} className={`${baseStyle} ${variants[variant]} ${className}`} disabled={isLoading || props.disabled} {...props}>
      {isLoading && <Loader2 size={16} className="animate-spin mr-2" />}
      {children}
    </button>
  );
});

const Modal = ({ show, onClose, title, children }) => {
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto backdrop-blur-sm bg-slate-900/60" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
        <div className="inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full border border-slate-200">
          <div className="bg-slate-50 px-6 py-5 border-b border-slate-200 flex justify-between items-center">
            <h3 className="text-xl font-black text-slate-900 tracking-tight" id="modal-title">{title}</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-slate-200/50 hover:bg-slate-200 p-2 rounded-full transition-colors">
                <X size={20} />
            </button>
          </div>
          <div className="bg-white px-6 py-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

const FormInput = ({ label, name, value, onChange, type = 'text', required = false, placeholder = '', options = [], optionLabelKey = 'name', optionValueKey = 'id', error, disabled = false, hint }) => {
  const handleChange = (e) => onChange(name, e.target.value);
  const baseRing = error ? 'ring-rose-500 border-rose-500' : 'focus:ring-indigo-500 focus:border-indigo-500';

  if (type === 'select') {
    return (
      <div className="mb-4">
        <label className="block text-sm font-bold text-slate-700 mb-1">{label}{required && ' *'}</label>
        <select
          name={name} value={value || ''} onChange={handleChange} required={required} disabled={disabled}
          className={`block w-full pl-3 pr-10 py-2.5 text-base border-slate-300 rounded-xl shadow-sm ${baseRing} disabled:bg-slate-100 font-medium`}
        >
          <option value="">Select {label}...</option>
          {options.map((opt, idx) => (
            <option key={idx} value={opt[optionValueKey]}>{opt[optionLabelKey]}</option>
          ))}
        </select>
        {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
        {error && <p className="mt-1 text-sm text-rose-600 font-medium">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mb-4">
      <label className="block text-sm font-bold text-slate-700 mb-1">{label}{required && ' *'}</label>
      <input
        type={type} name={name} value={value || ''} onChange={handleChange} required={required} placeholder={placeholder} disabled={disabled}
        className={`block w-full shadow-sm py-2.5 px-3 sm:text-sm border-slate-300 rounded-xl ${baseRing} disabled:bg-slate-100 font-medium`}
      />
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p className="mt-1 text-sm text-rose-600 font-medium">{error}</p>}
    </div>
  );
};

// NEW: Checkbox component for Boolean Permissions
const FormCheckbox = ({ label, name, checked, onChange, disabled = false, description }) => {
  return (
    <div className="relative flex items-start py-3 px-4 hover:bg-slate-50 rounded-xl transition-colors border border-transparent hover:border-slate-100">
      <div className="flex items-center h-5 mt-1">
        <input
          id={`checkbox-${name}`} name={name} type="checkbox" checked={checked || false}
          onChange={(e) => onChange(name, e.target.checked)} disabled={disabled}
          className="focus:ring-indigo-500 h-5 w-5 text-indigo-600 border-slate-300 rounded disabled:opacity-50"
        />
      </div>
      <div className="ml-4 text-sm">
        <label htmlFor={`checkbox-${name}`} className="font-bold text-slate-800 cursor-pointer">{label}</label>
        {description && <p className="text-slate-500 text-xs mt-0.5 leading-relaxed">{description}</p>}
      </div>
    </div>
  );
};

const LoadingSpinner = ({ message = "Loading Factory Data..." }) => (
  <div className="flex flex-col justify-center items-center h-64 w-full">
    <Loader2 size={40} className="animate-spin text-indigo-600 mb-4" />
    <span className="text-lg font-bold text-slate-600 uppercase tracking-widest">{message}</span>
  </div>
);

const ErrorMessage = ({ error, onClear }) => {
  if (!error) return null;
  return (
    <div className="bg-rose-50 border-l-4 border-rose-500 text-rose-800 p-4 rounded-r-xl mb-6 relative shadow-sm">
      <div className="flex items-start">
        <AlertCircle className="h-5 w-5 text-rose-500 mr-3 mt-0.5" />
        <div>
          <strong className="font-black block uppercase tracking-wider text-xs mb-1">System Error</strong>
          <span className="block text-sm font-medium">{error.message || 'An unknown error occurred.'}</span>
        </div>
      </div>
      {onClear && (
        <button className="absolute top-4 right-4 text-rose-400 hover:text-rose-600" onClick={onClear}>
          <X size={18} />
        </button>
      )}
    </div>
  );
};

const ProcessTypeBadge = ({ type }) => {
  const typeStyles = {
    loader: { text: 'Loader', icon: <Zap size={12} />, bg: 'bg-blue-100', textClr: 'text-blue-800' },
    regular: { text: 'Regular', icon: <Database size={12} />, bg: 'bg-slate-200', textClr: 'text-slate-800' },
    unloader: { text: 'Unloader', icon: <ChevronRight size={12} />, bg: 'bg-emerald-100', textClr: 'text-emerald-800' },
  };
  const style = typeStyles[type] || typeStyles.regular;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${style.bg} ${style.textClr}`}>
      {style.icon} {style.text}
    </span>
  );
};

// ====================================================================
// Cards & Views
// ====================================================================

const WorkstationCard = ({ workstation, onEdit, onDelete }) => {
  return (
    <div className="bg-white shadow-sm rounded-2xl p-5 flex flex-col justify-between transition-all hover:shadow-lg border-t-4 border-indigo-500 group">
      <div>
        <div className="flex justify-between items-start mb-4">
          <div className="pr-2">
            <h3 className="text-xl font-black text-slate-900 tracking-tight leading-tight mb-1">{workstation.name}</h3>
            <p className="text-xs text-indigo-600 font-bold uppercase tracking-wider">{workstation.type_name}</p>
          </div>
          <ProcessTypeBadge type={workstation.process_type} />
        </div>
        
        <div className="space-y-3 mt-4">
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 group-hover:border-indigo-100 transition-colors">
            <div className={`p-2 rounded-lg ${workstation.assigned_user_name ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-400'}`}>
                <User size={18} />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Assigned Operator</span>
              {workstation.assigned_user_name ? (
                <span className="text-sm font-bold text-slate-800">{workstation.assigned_user_name}</span>
              ) : (
                <span className="text-sm text-rose-500 italic font-semibold">Unassigned</span>
              )}
            </div>
          </div>

          {/* NEW: Bulk Approval Permission Badges */}
          <div className="flex flex-wrap gap-1.5 pt-2">
            {workstation.can_approve_multiple_piece && <span className="text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 px-2.5 py-1 rounded-md">Multi-Piece</span>}
            {workstation.can_approve_whole_bundle && <span className="text-[9px] font-black uppercase tracking-wider bg-teal-100 text-teal-800 px-2.5 py-1 rounded-md">Bundle OK</span>}
            {workstation.can_approve_whole_roll && <span className="text-[9px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 px-2.5 py-1 rounded-md shadow-sm border border-rose-200">Roll OK</span>}
            
            {!workstation.can_approve_multiple_piece && !workstation.can_approve_whole_bundle && !workstation.can_approve_whole_roll && (
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 px-1 py-1">Strict Single-Ply</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex gap-2 mt-6 pt-4 border-t border-slate-100">
        <Button onClick={onEdit} variant="secondary" className="text-xs flex-1">
          <Edit size={14} className="mr-2" /> Configure
        </Button>
        <Button onClick={onDelete} variant="dangerOutline" className="text-xs px-3" title="Archive Workstation">
          <Trash2 size={14} />
        </Button>
      </div>
    </div>
  );
};

// ====================================================================
// Forms
// ====================================================================

const WorkstationTypeForm = ({ initialData, onSubmit, onClose, formSubmissionError, isSubmitting }) => {
  const [formData, setFormData] = useState(initialData || { type_name: '', portal_id: '' });
  const [portals, setPortals] = useState([]);
  const [loadingError, setLoadingError] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});

  useEffect(() => {
    workstationApi.getPortalsSimple()
      .then(res => setPortals(res.data))
      .catch(err => setLoadingError(new Error("Could not load portals list.")));
  }, []);

  const handleChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    if (validationErrors[name]) setValidationErrors(prev => ({ ...prev, [name]: null }));
  };

  const validate = () => {
    const errors = {};
    if (!formData.type_name || formData.type_name.trim().length < 3) errors.type_name = 'Required (min 3 chars).';
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validate()) onSubmit(formData);
  };
  
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {formSubmissionError || loadingError ? <ErrorMessage error={formSubmissionError || loadingError} /> : null}
      <FormInput label="Type Name" name="type_name" value={formData.type_name} onChange={handleChange} required placeholder="e.g., Final Assembly" error={validationErrors.type_name} disabled={isSubmitting} />
      <FormInput type="select" label="Associated Portal" name="portal_id" value={formData.portal_id} onChange={handleChange} options={portals} optionLabelKey="name" optionValueKey="id" disabled={isSubmitting || !!loadingError} />
      
      <div className="flex justify-end gap-3 pt-6 mt-2 border-t border-slate-100">
        <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
        <Button type="submit" variant="primary" isLoading={isSubmitting}>{initialData ? 'Save Changes' : 'Create Type'}</Button>
      </div>
    </form>
  );
};

const WorkstationForm = ({ initialData, onSubmit, onClose, formSubmissionError, isSubmitting }) => {
  const getInitialFormData = (data) => {
    if (!data) return { 
      name: '', workstation_type_id: '', assigned_user_id: '', type: 'regular',
      can_approve_multiple_piece: false, can_approve_whole_bundle: false, can_approve_whole_roll: false 
    };
    return {
      name: data.name || '',
      workstation_type_id: data.workstation_type_id || '',
      assigned_user_id: data.assigned_user_id || '',
      assigned_user_name: data.assigned_user_name || '',
      type: data.process_type || 'regular',
      can_approve_multiple_piece: data.can_approve_multiple_piece || false,
      can_approve_whole_bundle: data.can_approve_whole_bundle || false,
      can_approve_whole_roll: data.can_approve_whole_roll || false
    };
  };

  const [formData, setFormData] = useState(getInitialFormData(initialData));
  const [dependencies, setDependencies] = useState({ users: [], workstationTypes: [] });
  const [loadingError, setLoadingError] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});

  const processTypeOptions = [
    { value: 'loader', name: 'Loader (Scans into line)' },
    { value: 'regular', name: 'Regular (Inline processing)' },
    { value: 'unloader', name: 'Unloader (Completes stage)' },
  ];

  useEffect(() => {
    console.log("Loading form dependencies for workstation form...", initialData);
    const currentWsId = initialData ? initialData.id : null;
    Promise.all([workstationApi.getUsersForDropdown(currentWsId), workstationApi.getWorkstationTypesSimple()])
    .then(([usersRes, typesRes]) => setDependencies({ users: usersRes.data, workstationTypes: typesRes.data }))
    .catch(err => setLoadingError(new Error("Could not load form dependencies.")));
  }, []);

  const handleChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    if (validationErrors[name]) setValidationErrors(prev => ({ ...prev, [name]: null }));
  };

  const validate = () => {
    const errors = {};
    if (!formData.name || formData.name.trim().length < 3) errors.name = 'Required (min 3 chars).';
    if (!formData.workstation_type_id) errors.workstation_type_id = 'Type is required.';
    if (!formData.type) errors.type = 'Process Type is required.';
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validate()) onSubmit(formData);
  };
  
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {formSubmissionError || loadingError ? <ErrorMessage error={formSubmissionError || loadingError} /> : null}

      <FormInput label="Workstation Name" name="name" value={formData.name} onChange={handleChange} required error={validationErrors.name} disabled={isSubmitting} />
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormInput type="select" label="Workstation Type" name="workstation_type_id" value={formData.workstation_type_id} onChange={handleChange} options={dependencies.workstationTypes} optionLabelKey="type_name" optionValueKey="id" required error={validationErrors.workstation_type_id} disabled={isSubmitting || !!loadingError} />
        <FormInput type="select" label="Process Role" name="type" value={formData.type} onChange={handleChange} options={processTypeOptions} optionLabelKey="name" optionValueKey="value" required error={validationErrors.type} disabled={isSubmitting} />
      </div>

      <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 mt-2">
        <FormInput 
            type="select" label="Assign Operator" name="assigned_user_id" 
            value={formData.assigned_user_id} onChange={handleChange} 
            options={dependencies.users} optionLabelKey="name" optionValueKey="id" 
            disabled={isSubmitting || !!loadingError} 
            hint="Leave blank to create a floating/unassigned workstation."
        />
      </div>

      <div className="mt-8 pt-6 border-t border-slate-200">
        <h4 className="text-base font-black text-slate-900 mb-4 flex items-center tracking-tight">
           <Zap className="w-5 h-5 mr-2 text-amber-500" />
           Quality Control Permissions
        </h4>
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm divide-y divide-slate-100">
          <FormCheckbox 
            name="can_approve_multiple_piece" label="Allow Multi-Piece Selection" 
            description="Operator can select and process multiple individual plys simultaneously."
            checked={formData.can_approve_multiple_piece} onChange={handleChange} disabled={isSubmitting} 
          />
          <FormCheckbox 
            name="can_approve_whole_bundle" label="Allow Bundle-Level Approval" 
            description="Operator can bypass ply selection to approve an entire bundle with one click."
            checked={formData.can_approve_whole_bundle} onChange={handleChange} disabled={isSubmitting} 
          />
          <FormCheckbox 
            name="can_approve_whole_roll" label="Allow Roll-Level Approval" 
            description="WARNING: Operator can approve every piece and bundle on a fabric roll simultaneously."
            checked={formData.can_approve_whole_roll} onChange={handleChange} disabled={isSubmitting} 
          />
        </div>
      </div>
      
      <div className="flex justify-end gap-3 pt-6 mt-6">
        <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
        <Button type="submit" variant="primary" isLoading={isSubmitting}>
          {initialData ? 'Save Configuration' : 'Create Workstation'}
        </Button>
      </div>
    </form>
  );
};

// ====================================================================
// Main Dashboards
// ====================================================================

const WorkstationTypeList = ({ types, onEdit, onDelete, onAdd }) => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">System Types</h2>
            <p className="text-slate-500 font-medium mt-1">Manage global definitions for factory workstations.</p>
        </div>
        <Button onClick={onAdd} variant="primary" className="shadow-lg">
          <Plus size={18} className="mr-2" /> Add New Type
        </Button>
      </div>
      
      <div className="bg-white shadow-sm border border-slate-200 rounded-2xl overflow-hidden">
        <ul role="list" className="divide-y divide-slate-100">
          {!Array.isArray(types) || types.length === 0 ? (
            <li className="px-6 py-10 text-center text-slate-500 font-medium">No workstation types found.</li>
          ) : (
            types.map((type) => (
              <li key={type.id} className="px-6 py-5 hover:bg-slate-50 transition-colors">
                <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-black text-indigo-700">{type.type_name}</p>
                  <p className="text-sm text-slate-500 font-medium mt-0.5">
                    Assigned Portal: <span className="text-slate-700 font-bold">{type.portal_name || <span className="italic font-normal">None</span>}</span>
                  </p>
                </div>
                <div className="ml-5 flex-shrink-0 flex gap-2">
                  <Button onClick={() => onEdit(type)} variant="secondary" className="text-xs px-4">
                    <Edit size={14} className="mr-2" /> Edit
                  </Button>
                  <Button onClick={() => onDelete(type)} variant="dangerOutline" className="text-xs px-3">
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

const WorkstationDashboard = ({ workstations, onEdit, onDelete, onAdd }) => {
  // NEW: Group by Production Line
  const groupedWorkstations = useMemo(() => {
    if (!Array.isArray(workstations)) return {};
    return workstations.reduce((acc, ws) => {
      const lineName = ws.production_line_name || 'Unassigned / Floating';
      if (!acc[lineName]) acc[lineName] = [];
      acc[lineName].push(ws);
      return acc;
    }, {});
  }, [workstations]);

  const lineGroups = Object.keys(groupedWorkstations).sort();
  
  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center">
            <LayoutDashboard className="mr-3 text-indigo-600" /> Factory Floor View
            </h2>
            <p className="text-slate-500 font-medium mt-1">Manage physical hardware endpoints across all production lines.</p>
        </div>
        <Button onClick={onAdd} variant="primary" className="shadow-lg">
          <Plus size={18} className="mr-2" /> Deploy Workstation
        </Button>
      </div>
      
      <div className="space-y-10">
        {lineGroups.length === 0 && (
           <div className="text-center p-16 bg-white rounded-3xl border-2 border-dashed border-slate-300">
             <p className="text-slate-500 font-bold text-lg mb-2">No active workstations deployed.</p>
             <Button onClick={onAdd} variant="secondary">Deploy First Workstation</Button>
           </div>
        )}

        {lineGroups.map(lineName => (
          <section key={lineName} className="bg-slate-100/50 p-6 sm:p-8 rounded-[2rem] border border-slate-200">
            <h3 className="text-2xl font-black text-slate-900 mb-6 flex items-center tracking-tight">
               <Layers className="mr-3 text-indigo-500" size={24} />
               {lineName}
               <span className="ml-4 text-xs font-black uppercase tracking-widest text-indigo-700 bg-indigo-100 px-3 py-1.5 rounded-lg shadow-sm border border-indigo-200">
                 {groupedWorkstations[lineName].length} Stations
               </span>
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {groupedWorkstations[lineName].map(ws => (
                <WorkstationCard key={ws.id} workstation={ws} onEdit={() => onEdit(ws)} onDelete={() => onDelete(ws)} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

// ====================================================================
// Root Application
// ====================================================================
export default function App() {
  const [activeTab, setActiveTab] = useState('workstations');
  const [workstationTypes, setWorkstationTypes] = useState([]);
  const [workstations, setWorkstations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [appError, setAppError] = useState(null);
  const [formSubmissionError, setFormSubmissionError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(null);

  const [modalState, setModalState] = useState({ isOpen: false, type: null, data: null });

  const loadData = useCallback(async () => {
    setLoading(true); setAppError(null);
    try {
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

  useEffect(() => { loadData(); }, [loadData]);

  const triggerSuccess = (message) => {
    setShowSuccess(message);
    setTimeout(() => setShowSuccess(null), 4000);
  };
  
  const openModal = (type, data = null) => {
    setFormSubmissionError(null); 
    setModalState({ isOpen: true, type, data });
  };

  const closeModal = () => {
    if (isSubmitting) return; 
    setModalState({ isOpen: false, type: null, data: null });
  };

  const handleFormSubmit = async (formData) => {
    console.log("Submitting form with data:", formData);
    setIsSubmitting(true); setFormSubmissionError(null);
    try {
      const { type, data } = modalState;
      switch (type) {
        case 'createWorkstationType':
          await workstationApi.createWorkstationType(formData);
          triggerSuccess("Workstation type created!"); break;
        case 'editWorkstationType':
          await workstationApi.updateWorkstationType(data.id, formData);
          triggerSuccess("Workstation type updated!"); break;
        case 'createWorkstation':
          await workstationApi.createWorkstation(formData);
          triggerSuccess("Workstation deployed successfully!"); break;
        case 'editWorkstation':
          await workstationApi.updateWorkstation(data.id, formData);
          triggerSuccess("Workstation configuration updated!"); break;
        default: throw new Error('Invalid modal type');
      }
      closeModal();
      await loadData();
    } catch (err) {
      setFormSubmissionError(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (type, record) => {
    const isType = type === 'workstation_type';
    const recordName = record.name || record.type_name;
    const actionText = isType ? 'delete' : 'archive';
    
    if (!window.confirm(`Are you sure you want to ${actionText} "${recordName}"?`)) return;
    
    setAppError(null);
    try {
      if (isType) await workstationApi.deleteWorkstationType(record.id);
      else await workstationApi.deleteWorkstation(record.id); // Triggers the soft-delete/archive on backend
      
      triggerSuccess(`"${recordName}" was successfully ${actionText}d.`);
      await loadData();
    } catch (err) {
      setAppError(err); 
    }
  };

  const renderModalContent = () => {
    const { type, data } = modalState;
    
    console.log("Rendering modal for type:", type, "with data:", data);
    if (type === 'createWorkstationType') return <WorkstationTypeForm onSubmit={handleFormSubmit} onClose={closeModal} formSubmissionError={formSubmissionError} isSubmitting={isSubmitting} />;
    if (type === 'editWorkstationType') return <WorkstationTypeForm initialData={data} onSubmit={handleFormSubmit} onClose={closeModal} formSubmissionError={formSubmissionError} isSubmitting={isSubmitting} />;
    if (type === 'createWorkstation') return <WorkstationForm onSubmit={handleFormSubmit} onClose={closeModal} formSubmissionError={formSubmissionError} isSubmitting={isSubmitting} />;
    if (type === 'editWorkstation') return <WorkstationForm initialData={data} onSubmit={handleFormSubmit} onClose={closeModal} formSubmissionError={formSubmissionError} isSubmitting={isSubmitting} />;
    return null;
  };

  return (
    <div className="bg-slate-200/50 min-h-screen p-4 md:p-10 font-inter">
      <div className="max-w-[1400px] mx-auto">
        
        {/* Header Area */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
          <div>
              <h1 className="text-4xl font-black text-slate-900 tracking-tight">Infrastructure Control</h1>
              <p className="text-slate-500 font-medium mt-2">Manage physical endpoints, operators, and quality control permissions.</p>
          </div>
          {showSuccess && (
            <div className="flex items-center gap-3 text-emerald-800 bg-emerald-100 px-6 py-3 rounded-xl shadow-sm border border-emerald-200 animate-in fade-in slide-in-from-right-8">
              <CheckCircle size={20} className="text-emerald-600" />
              <span className="font-bold">{showSuccess}</span>
            </div>
          )}
        </div>
        
        {/* Modern Tab Navigation */}
        <div className="mb-8">
          <div className="bg-white p-1.5 rounded-2xl inline-flex shadow-sm border border-slate-200">
            <button
              onClick={() => setActiveTab('workstations')}
              className={`flex items-center px-6 py-3 rounded-xl font-bold text-sm transition-all ${activeTab === 'workstations' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}
            >
              <Users size={18} className="mr-2" /> Live Endpoints
            </button>
            <button
              onClick={() => setActiveTab('types')}
              className={`flex items-center px-6 py-3 rounded-xl font-bold text-sm transition-all ${activeTab === 'types' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}
            >
              <Database size={18} className="mr-2" /> System Types
            </button>
          </div>
        </div>

        {appError && !loading && <ErrorMessage error={appError} onClear={() => setAppError(null)} />}

        {/* Content Area */}
        <div className="bg-transparent">
            {loading ? <LoadingSpinner /> : (
                activeTab === 'workstations' ? (
                    <WorkstationDashboard workstations={workstations} onAdd={() => openModal('createWorkstation')} onEdit={(ws) => openModal('editWorkstation', ws)} onDelete={(ws) => handleDelete('workstation', ws)} />
                ) : (
                    <WorkstationTypeList types={workstationTypes} onAdd={() => openModal('createWorkstationType')} onEdit={(type) => openModal('editWorkstationType', type)} onDelete={(type) => handleDelete('workstation_type', type)} />
                )
            )}
        </div>
      </div>
      
      <Modal show={modalState.isOpen} onClose={closeModal} title={{

          'createWorkstationType': 'Create System Type',
          'editWorkstationType': `Configure: ${modalState.data?.type_name}`,
          'createWorkstation': 'Deploy New Workstation',
          'editWorkstation': `Endpoint: ${modalState.data?.name}`,
        }[modalState.type]}>
        {renderModalContent()}
      </Modal>
    </div>
  );
}