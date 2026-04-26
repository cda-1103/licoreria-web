import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

const LoginView = ({ onClose }) => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    const email = e.target.email.value.trim();
    const password = e.target.password.value;

    console.log("Intentando conexión para:", email);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error("Error de Supabase:", error.message);
        setErrorMsg(error.message);
      } else {
        console.log("Login exitoso, sesión:", data.session);
        onClose(); // Solo cerramos el modal, App.jsx hará el resto
      }
    } catch (err) {
      console.error("Error de red:", err);
      setErrorMsg("Error de red: Revisa tu conexión.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-stone-900/60 backdrop-blur-md">
      <form onSubmit={handleLogin} className="bg-white p-12 shadow-2xl w-full max-w-md border border-stone-200">
        <div className="text-center mb-10 serif italic text-3xl">ADMIN</div>
        
        <div className="space-y-6">
          <input name="email" type="email" placeholder="CORREO ELECTRONICO" className="w-full p-4 bg-stone-50 border border-stone-100 outline-none focus:border-black text-[10px] font-bold tracking-widest" required />
          <input name="password" type="password" placeholder="CONTRASEÑA" className="w-full p-4 bg-stone-50 border border-stone-100 outline-none focus:border-black text-[10px] font-bold tracking-widest" required />
          
          {errorMsg && (
            <div className="p-3 bg-red-50 text-red-600 text-[10px] font-bold uppercase text-center border border-red-100">
              {errorMsg}
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading} 
            className="w-full bg-black text-white py-6 text-[10px] font-black tracking-[0.4em] hover:bg-stone-800 transition-all disabled:opacity-50"
          >
            {loading ? 'AUTENTICANDO...' : 'ENTRAR'}
          </button>
          
          <button type="button" onClick={onClose} className="w-full text-stone-300 text-[9px] font-black uppercase tracking-widest">SALIR</button>
        </div>
      </form>
    </div>
  );
};

export default LoginView;