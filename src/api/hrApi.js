import api from '../utils/api';

export const hrApi = {

    // ================================
    // DATA IMPORT (CSV UPLOADS)
    // ================================

    // Note: These use FormData and require the multipart/form-data header
    importEmployees: (formData) => 
        api.post('hr/import-employees', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        }),

    importAttendance: (formData) => 
        api.post('hr/import-attendance', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        }),

    // ================================
    // DAILY ATTENDANCE & ANOMALIES
    // ================================

    getDailyAttendanceDashboard: (date) => 
        api.get(`hr/attendance-dashboard?date=${date}`),

    resolveAnomaly: (resolutionData) => 
        // resolutionData expects: { attendance_id, employee_id, punch_out_time }
        api.post('hr/attendance/resolve', resolutionData),

    // ================================
    // EMPLOYEES (Future-proofing)
    // ================================

    getAllEmployees: () => 
        api.get('hr/employees'),

    getEmployeeById: (empId) => 
        api.get(`hr/employees/${empId}`),

    updateEmployee: (empId, employeeData) => 
        api.put(`hr/employees/${empId}`, employeeData),

    // ================================
    // PAYROLL (Future-proofing)
    // ================================

    generateMonthlyPayroll: (month, year) => 
        api.post('hr/payroll/generate', { month, year }),

    getPayrollSummary: (month, year) => 
        api.get(`hr/payroll/summary?month=${month}&year=${year}`),


    getAllEmployees: () => api.get('hr/employees'),
    
    // (Optional future endpoints for editing profiles)
    getEmployeeById: (empId) => api.get(`hr/employees/${empId}`),
    updateEmployee: (empId, employeeData) => api.put(`hr/employees/${empId}`, employeeData),
    importShifts: (formData) => api.post('/hr/import/shifts', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
    getShifts: () => api.get('/hr/shifts'),
    createShift: (data) => api.post('/hr/shifts', data),
    updateShift: (id, data) => api.put(`/hr/shifts/${id}`, data),

};