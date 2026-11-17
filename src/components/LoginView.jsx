import React, { useState } from 'react';
import { X, Lock } from 'lucide-react';
import { supabase } from '../lib/supabase';

const LoginView = ({ onClose, onLoginSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    const email = e.target.email.value.trim();
    const password = e.target.password.value;

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrorMsg(error.message);
      } else if (onLoginSuccess) {
        onLoginSuccess();
      } else {
        onClose();
      }
    } catch {
      setErrorMsg('Error de red: revisa tu conexión.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-xs">
      <form
        onSubmit={handleLogin}
        className="relative bg-white p-8 shadow-2xl w-full max-w-md border border-[#e2ddd2] rounded-sm"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar login"
          className="absolute top-4 right-4 p-1.5 text-[#5c5850] hover:text-[#141413] cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="text-center mb-6">
          <div className="w-10 h-10 rounded-sm bg-[#f8f6f1] border border-[#e2ddd2] flex items-center justify-center mx-auto mb-3">
            <Lock className="w-4 h-4 text-[#9a4d1c]" />
          </div>
          <h2 className="font-display text-2xl font-semibold text-[#141413]">Acceso Administrativo</h2>
          <p className="text-xs text-[#5c5850] mt-1">Panel exclusivo para gestión de B.B.T.</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1">Correo electrónico</label>
            <input
              name="email"
              type="email"
              placeholder="admin@bbtlicores.com"
              className="w-full px-3.5 py-2.5 bg-[#f8f6f1] border border-[#e2ddd2] rounded-sm outline-none focus:border-[#141413] text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Contraseña</label>
            <input
              name="password"
              type="password"
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 bg-[#f8f6f1] border border-[#e2ddd2] rounded-sm outline-none focus:border-[#141413] text-sm"
              required
            />
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-50 text-red-700 text-xs font-medium border border-red-200 rounded-sm">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#141413] text-white py-3 text-xs font-semibold rounded-sm hover:bg-[#9a4d1c] transition-colors disabled:opacity-50 cursor-pointer"
          >
            {loading ? 'Autenticando...' : 'Entrar al Panel'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default LoginView;