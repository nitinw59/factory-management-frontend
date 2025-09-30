import React, { useState, useEffect } from 'react';
import { genericApi } from '../api/genericApi'; // Assuming you have this API helper

// A simple spinner component for loading states
const Spinner = () => (
    <div className="flex justify-center items-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
);

/**
 * A dynamic and reusable form component for CRUD operations.
 * It automatically fetches options for select fields and can disable contextual fields.
 */
const CrudForm = ({
    fields,
    initialData = {},
    onSave,
    onClose,
    apiError,
    disabledFields = []
}) => {
    const [formData, setFormData] = useState({});
    const [dynamicOptions, setDynamicOptions] = useState({});
    const [isLoadingOptions, setIsLoadingOptions] = useState(false);

    // Effect 1: Fetch dynamic options for select dropdowns.
    // This runs only when the `fields` configuration changes.
    useEffect(() => {
        const fetchAllOptions = async () => {
            const optionsToFetch = fields.filter(f => f.type === 'select' && f.resource);
            if (optionsToFetch.length === 0) {
                return; // No dynamic options to fetch
            }

            setIsLoadingOptions(true);
            try {
                const optionsPromises = optionsToFetch.map(field => genericApi.getAll(field.resource));
                const results = await Promise.all(optionsPromises);
                
                const newOptions = {};
                optionsToFetch.forEach((field, index) => {
                    newOptions[field.name] = results[index].data || [];
                });
                setDynamicOptions(newOptions);

            } catch (error) {
                console.error("Failed to fetch dynamic dropdown options:", error);
            } finally {
                setIsLoadingOptions(false);
            }
        };
        
        fetchAllOptions();
    }, [JSON.stringify(fields)]); // Use JSON.stringify for deep comparison of the fields array

    // Effect 2: Initialize or reset the form data.
    // This runs when the item being edited (`initialData`) or the form structure (`fields`) changes.
    useEffect(() => {
        const formState = fields.reduce((acc, field) => {
            const initialValue = initialData[field.name];
            const defaultValue = field.defaultValue;

            if (field.type === 'checkbox') {
                acc[field.name] = initialValue !== undefined ? !!initialValue : !!defaultValue;
            } else {
                acc[field.name] = initialValue !== undefined ? initialValue : defaultValue || '';
            }
            return acc;
        }, {});
        setFormData(formState);
    }, [initialData, fields]);


    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prevData => ({
            ...prevData,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

   // Inside CrudForm.js

    const handleSubmit = (e) => {
        e.preventDefault();
        // ✅ CHANGE THIS LINE BACK
        onSave({ ...initialData, ...formData });
    };

    if (isLoadingOptions) {
        return <Spinner />;
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {apiError && <div className="p-3 bg-red-100 text-red-700 rounded-md">{apiError}</div>}
            
            {fields.map(field => {
                const isDisabled = disabledFields.includes(field.name);
                const value = formData[field.name] || '';

                return (
                    <div key={field.name}>
                        {field.type === 'checkbox' ? (
                            <div className="flex items-center">
                                <input
                                    type="checkbox"
                                    id={field.name}
                                    name={field.name}
                                    checked={!!value}
                                    onChange={handleChange}
                                    disabled={isDisabled}
                                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:bg-gray-200"
                                />
                                <label htmlFor={field.name} className={`ml-2 block text-sm font-medium text-gray-700 ${isDisabled ? 'text-gray-400' : ''}`}>{field.label}</label>
                            </div>
                        ) : (
                            <>
                                <label htmlFor={field.name} className={`block text-sm font-medium text-gray-700 ${isDisabled ? 'text-gray-400' : ''}`}>{field.label}</label>
                                {field.type === 'select' ? (
                                    <select
                                        id={field.name}
                                        name={field.name}
                                        value={value}
                                        onChange={handleChange}
                                        disabled={isDisabled}
                                        required={field.required}
                                        className={`mt-1 block w-full p-2 border rounded-md ${isDisabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                    >
                                        <option value="">Select {field.label}</option>
                                        {(field.options || dynamicOptions[field.name] || []).map(option => {
                                            // ✅ FIX: This logic correctly handles all option types (strings, {id, name}, and {value, label})
                                            const isObject = typeof option === 'object' && option !== null;
                                            const optionKey = isObject ? option.value || option.id : option;
                                            const optionValue = isObject ? option.value || option.id : option;
                                            const optionLabel = field.optionLabelFormatter
                                                ? field.optionLabelFormatter(option)
                                                : (isObject ? option.label || option.name : option);

                                            return (
                                                <option key={optionKey} value={optionValue}>
                                                    {optionLabel}
                                                </option>
                                            );
                                        })}
                                    </select>
                                ) : (
                                    <input
                                        type={field.type || 'text'}
                                        id={field.name}
                                        name={field.name}
                                        value={value}
                                        onChange={handleChange}
                                        disabled={isDisabled}
                                        required={field.required}
                                        className={`mt-1 block w-full p-2 border rounded-md ${isDisabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                    />
                                )}
                            </>
                        )}
                    </div>
                );
            })}

            <div className="flex justify-end space-x-3 pt-4 border-t mt-6">
                <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">
                    Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    Save
                </button>
            </div>
        </form>
    );
};

export default CrudForm;