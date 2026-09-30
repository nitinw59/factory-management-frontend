import api from '../utils/api';

// A line supervisor's own override password — verified server-side when a
// checker unlocks a rejected piece or reverts an approval.
export const supervisorPinApi = {
  getStatus: () => api.get('/supervisor-pin/status'),
  setPin: (pin) => api.put('/supervisor-pin', { pin }),
};
