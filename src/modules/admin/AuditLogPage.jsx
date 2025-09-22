import React, { useState, useEffect } from 'react';
import { auditLogApi } from '../../api/auditLogApi';

const Spinner = () => <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;

// A helper to render the JSON data in a readable way
const DataViewer = ({ data }) => {
    if (!data) return <span className="text-gray-400">N/A</span>;
    return <pre className="bg-gray-100 p-2 rounded text-xs overflow-x-auto">{JSON.stringify(data, null, 2)}</pre>;
};

const AuditLogPage = () => {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    auditLogApi.getLogs()
      .then(res => setLogs(res.data || []))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">System Audit Log</h1>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {isLoading ? <Spinner /> : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2 text-left">Timestamp</th>
                <th className="p-2 text-left">User</th>
                <th className="p-2 text-left">Action</th>
                <th className="p-2 text-left">Table</th>
                <th className="p-2 text-left">Record ID</th>
                <th className="p-2 text-left">Old Data</th>
                <th className="p-2 text-left">New Data</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {logs.map(log => (
                <tr key={log.id}>
                  <td className="p-2 align-top">{new Date(log.created_at).toLocaleString()}</td>
                  <td className="p-2 align-top">{log.user_email}</td>
                  <td className="p-2 align-top">{log.action_type}</td>
                  <td className="p-2 align-top">{log.table_name}</td>
                  <td className="p-2 align-top">{log.record_id}</td>
                  <td className="p-2 align-top"><DataViewer data={log.old_data} /></td>
                  <td className="p-2 align-top"><DataViewer data={log.new_data} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default AuditLogPage;
