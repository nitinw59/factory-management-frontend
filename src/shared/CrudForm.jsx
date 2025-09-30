import React, { useState, useEffect } from 'react';
import { genericApi } from '../api/genericApi';

const Spinner = () => <div className="flex justify-center p-4"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div></div>;

const CrudForm = ({ fields, onSave, onClose, initialData = {}, apiError }) => {
    const [formData, setFormData] = useState({});
    const [dynamicOptions, setDynamicOptions] = useState({});
    const [isLoadingOptions, setIsLoadingOptions] = useState(true);

    useEffect(() => {
        const initialFormState = fields.reduce((acc, field) => {
            if (field.type === 'checkbox') {
                acc[field.name] = !!initialData[field.name];
            } else {
                acc[field.name] = initialData[field.name] || field.defaultValue || '';
            }
            return acc;
        }, {});
        setFormData(initialFormState);

        // --- THIS IS THE FIX ---
        // The logic to fetch options and set the loading state is now fully implemented.
        const fetchAllOptions = async () => {
            setIsLoadingOptions(true);
            try {
                const optionsToFetch = fields.filter(f => f.type === 'select' && f.resource);
                if (optionsToFetch.length === 0) {
                    return; // No dynamic options to fetch
                }

                const optionsPromises = optionsToFetch.map(f => genericApi.getAll(f.resource, f.resourceFilter));
                const results = await Promise.all(optionsPromises);
                
                const newOptions = {};
                optionsToFetch.forEach((field, index) => {
                    newOptions[field.name] = results[index].data;
                });
                setDynamicOptions(newOptions);

            } catch (error) {
                console.error("Failed to fetch dynamic dropdown options", error);
                // Optionally set an error state here
            } finally {
                // This will run regardless of success or failure, ensuring the spinner always disappears.
                setIsLoadingOptions(false);
            }
        };
        // --- END OF FIX ---
        
        fetchAllOptions();
    }, [fields, initialData]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({ ...initialData, ...formData });
    };

    if (isLoadingOptions) return <Spinner />;

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {apiError && <div className="p-3 bg-red-100 text-red-700 rounded-md">{apiError}</div>}
            {fields.map(field => (
                <div key={field.name}>
                    {field.type === 'checkbox' ? (
                        <div className="flex items-center">
                            <input
                                type="checkbox"
                                id={field.name}
                                name={field.name}
                                checked={!!formData[field.name]}
                                onChange={handleChange}
                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <label htmlFor={field.name} className="ml-2 block text-sm font-medium text-gray-700">{field.label}</label>
                        </div>
                    ) : (
                        <>
                           <label className="block text-sm font-medium text-gray-700">{field.label}</label>
                           {field.type === 'select' ? (
                                <select name={field.name} value={formData[field.name] || ''} onChange={handleChange} className="mt-1 block w-full p-2 border rounded-md" required={field.required}>
                                    <option value="">Select a {field.label}</option>
                                    {(field.options || dynamicOptions[field.name] || []).map(option => (
                                        <option key={option.id || option} value={option.id || option}>
                                          {field.optionLabelFormatter ? field.optionLabelFormatter(option) : (option.name || option)}
                                        </option>
                                    ))}
                                </select>
                           ) : (
                               <input type={field.type || 'text'} name={field.name} value={formData[field.name] || ''} onChange={handleChange} className="mt-1 block w-full p-2 border rounded-md" required={field.required} />
                           )}
                        </>
                    )}
                </div>
            ))}
            <div className="flex justify-end space-x-2 pt-4 border-t">
                <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg">Save</button>
            </div>
        </form>
    );
};

export default CrudForm;

