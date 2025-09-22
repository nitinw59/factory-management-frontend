// src/shared/CrudTable.jsx

import React from 'react';
import { LuPlus, LuPencil, LuTrash2 } from 'react-icons/lu';

const CrudTable = ({ title, columns, data, onEdit, onDelete, onAdd, extraActions, userRole }) => (
  <div className="bg-white rounded-xl shadow-lg p-6">
    <div className="flex items-center justify-between mb-6">
      <h2 className="text-2xl font-bold text-gray-800">{title}</h2>
      <button
        onClick={onAdd}
        className="flex items-center px-4 py-2 bg-blue-600 text-white font-medium rounded-lg shadow-md hover:bg-blue-700 transition duration-300"
      >
        <LuPlus className="mr-2" /> Add {title.slice(0, -1)}
      </button>
    </div>
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {columns.map(col => (
              <th key={col.key} scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {col.label}
              </th>
            ))}
            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {data.length > 0 ? (
            data.map(item => (
              <tr key={item.id} className="hover:bg-gray-50">
                {columns.map(col => (
                  <td key={col.key} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {item[col.key]}
                  </td>
                ))}
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex justify-end space-x-2">
                    {extraActions && extraActions(item)}
                    <button onClick={() => onEdit(item)} className="text-indigo-600 hover:text-indigo-900" title="Edit">
                      <LuPencil />
                    </button>
                    {/* The delete button is only visible if the user is an 'admin' */}
                    {userRole === 'admin' && (
                      <button onClick={() => onDelete(item)} className="text-red-600 hover:text-red-900" title="Delete">
                        <LuTrash2 />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length + 1} className="px-6 py-4 text-center text-gray-500">
                No data available.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
);

export default CrudTable;
