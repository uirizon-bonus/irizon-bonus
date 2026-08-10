import React, { useState } from 'react';
import { Lock, LogIn } from 'lucide-react';
import { ADMIN_TOKEN_KEY } from '../utils/adminAuth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

interface AdminLoginProps {
  onSuccess: () => void;
}

const AdminLogin: React.FC<AdminLoginProps> = ({ onSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const payload = await response.json() as { token?: string; detail?: string; error?: string };
      if (!response.ok || !payload.token) {
        throw new Error(payload.detail || payload.error || 'Login yoki parol noto‘g‘ri');
      }
      localStorage.setItem(ADMIN_TOKEN_KEY, payload.token);
      onSuccess();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Kirishda xatolik');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4 font-inter">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white rounded-[28px] shadow-2xl p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-cyan-50 text-cyan-600 flex items-center justify-center mb-4">
            <Lock className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-black text-slate-800">IRIZON Admin</h1>
          <p className="text-sm text-slate-400 mt-1">Panelga kirish</p>
        </div>

        <label className="block text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Login</label>
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoFocus
          autoComplete="username"
          className="w-full mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-cyan-500/20 focus:bg-white transition-all"
        />

        <label className="block text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Parol</label>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          className="w-full mb-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-cyan-500/20 focus:bg-white transition-all"
        />

        {error && <p className="mt-2 text-sm font-semibold text-rose-600">{error}</p>}

        <button
          type="submit"
          disabled={isSubmitting || !username.trim() || !password}
          className="w-full mt-5 flex items-center justify-center gap-2 rounded-xl bg-cyan-600 py-3 text-sm font-bold text-white hover:bg-cyan-700 disabled:opacity-50 transition-all"
        >
          <LogIn className="w-4 h-4" />
          {isSubmitting ? 'Kirilmoqda...' : 'Kirish'}
        </button>
      </form>
    </div>
  );
};

export default AdminLogin;
