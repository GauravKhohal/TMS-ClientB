'use client';

export function saveDriverAuth(token: string, driver: object) {
  localStorage.setItem('driver_token', token);
  localStorage.setItem('driver_user', JSON.stringify(driver));
}

export function getDriver() {
  if (typeof window === 'undefined') return null;
  const d = localStorage.getItem('driver_user');
  return d ? JSON.parse(d) : null;
}

export function getDriverToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('driver_token');
}

export function driverLogout() {
  localStorage.removeItem('driver_token');
  localStorage.removeItem('driver_user');
  window.location.href = '/driver/login';
}
