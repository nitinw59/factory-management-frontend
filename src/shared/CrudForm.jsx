import React, { useState, useEffect } from 'react';
import { genericApi } from '../api/genericApi';

const Spinner = () => <div className="flex justify-center items-center p-4"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div></div>;

const CrudForm = ({ fields, onSave, onClose, initialData = {}, apiError }) => {
    const [formData, setFormData] = useState({});
    const [dynamicOptions, setDynamicOptions] = useState({});
    const [isLoadingOptions, setIsLoadingOptions] = useState(true);

    useEffect(() => {
        const initialFormState = fields.reduce((acc, field) => {
            acc[field.name] = initialData[field.name] || field.defaultValue || '';
            return acc;
        }, {});
        setFormData(initialFormState);

        const fetchAllOptions = async () => {
            setIsLoadingOptions(true);
            const optionsToFetch = fields.filter(f => f.type === 'select' && f.resource);
            if (optionsToFetch.length === 0) {
                setIsLoadingOptions(false);
                return;
            }

            const optionsPromises = optionsToFetch.map(f => genericApi.getAll(f.resource, f.resourceFilter));
            
            try {
                const results = await Promise.all(optionsPromises);
                const newOptions = {};
                optionsToFetch.forEach((field, index) => {
                    newOptions[field.name] = results[index].data;
                });
                setDynamicOptions(newOptions);
            } catch (error) {
                console.error("Failed to fetch dynamic dropdown options", error);
            } finally {
                setIsLoadingOptions(false);
            }
        };

        fetchAllOptions();
    }, [fields, initialData]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
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
                    <label className="block text-sm font-medium text-gray-700">{field.label}</label>
                    {field.type === 'select' ? (
                        <select name={field.name} value={formData[field.name] || ''} onChange={handleChange} className="mt-1 block w-full p-2 border rounded-md" required={field.required}>
                            <option value="">Select a {field.label}</option>
                            {(field.options || dynamicOptions[field.name] || []).map(option => (
                                <option key={option.id || option} value={option.id || option}>
                                  {/* --- THIS IS THE UPGRADE --- */}
                                  {/* Use the formatter if it exists, otherwise fall back to the default */}
                                  {field.optionLabelFormatter ? field.optionLabelFormatter(option) : (option.name || option)}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <input type={field.type || 'text'} name={field.name} value={formData[field.name] || ''} onChange={handleChange} className="mt-1 block w-full p-2 border rounded-md" required={field.required} />
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

