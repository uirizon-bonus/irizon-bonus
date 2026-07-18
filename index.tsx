
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

const _API_BASE = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000').replace(/\/$/, '');
const _ADMIN_KEY = import.meta.env.VITE_ADMIN_API_KEY ?? '';
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
    if (_ADMIN_KEY) headers.set('X-Admin-Key', _ADMIN_KEY);
  }
  return _origFetch(input, { ...init, headers });
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
