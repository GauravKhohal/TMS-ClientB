import { getDriverToken } from './driverAuth';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';

async function request(path: string, options: RequestInit = {}) {
  const token = getDriverToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const driverApi = {
  requestOtp: (phone: string) =>
    request('/driver-auth/request-otp', { method: 'POST', body: JSON.stringify({ phone }) }),
  verifyOtp: (phone: string, otp: string) =>
    request('/driver-auth/verify-otp', { method: 'POST', body: JSON.stringify({ phone, otp }) }),
  myTrips: () => request('/driver/trips'),
  respondToTrip: (id: string, decision: 'Accepted' | 'Rejected', reason?: string) =>
    request(`/driver/trips/${id}/respond`, { method: 'PATCH', body: JSON.stringify({ decision, reason }) }),
  updateTripStatus: (id: string, status: 'In Transit' | 'Completed') =>
    request(`/driver/trips/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
};
