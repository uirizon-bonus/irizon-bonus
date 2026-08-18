
import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ADMIN_TOKEN_KEY } from './utils/adminAuth';

const _API_BASE = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000').replace(/\/$/, '');
const _IS_PORTAL = import.meta.env.MODE === 'portal';
export const SESSION_TOKEN_KEY = 'irizon_session_token';

const _origFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = input instanceof Request ? input.url : String(input);
  if (!url.startsWith(_API_BASE)) {
    return _origFetch(input, init);
  }
  const headers = new Headers(init?.headers);
  if (_IS_PORTAL) {
    const token = localStorage.getItem(SESSION_TOKEN_KEY) ?? '';
    if (token) headers.set('Authorization', `Bearer ${token}`);
  } else {
    // Admin key is obtained via /api/admin/login and stored in localStorage —
    // no longer baked into the bundle.
    const adminToken = localStorage.getItem(ADMIN_TOKEN_KEY) ?? '';
    if (adminToken) headers.set('X-Admin-Key', adminToken);
  }
  return _origFetch(input, { ...init, headers }).then((response) => {
    // A rejected admin token (invalid/expired) bounces back to the login screen.
    if (!_IS_PORTAL && response.status === 401 && localStorage.getItem(ADMIN_TOKEN_KEY)) {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
      window.location.reload();
    }
    return response;
  });
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
