import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import Storefront from './components/Storefront';
import AdminPanel from './components/AdminPanel';
import LoginView from './components/LoginView';

// Componente para el aviso de sesión expirada
const SessionExpiredModal = ({ onClose }) => (
  <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
    <div className="relative bg-white p-8 max-w-sm w-full text-center shadow-2xl border border-stone-100">
      <span className="material-symbols-outlined text-5xl text-stone-300 mb-4">history_toggle_off</span>
      <p className="text-[11px] font-black uppercase tracking-widest text-stone-600 mb-6 leading-relaxed">
        Tu sesión de administrador ha expirado por seguridad (1 hora).
      </p>
      <button onClick={onClose} className="w-full bg-black text-white py-4 text-[10px] font-black uppercase tracking-widest hover:bg-stone-800 transition-colors">
        Entendido
      </button>
    </div>
  </div>
);

export default function App() {
  const [session, setSession] = useState(null);
  // Siempre iniciamos en la tienda, sin importar si hay sesión previa
  const [isAdminView, setIsAdminView] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showExpiredMsg, setShowExpiredMsg] = useState(false);

  useEffect(() => {
    // 1. Verificar si ya hay una sesión guardada en el navegador
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      // Nota: Aquí NO cambiamos isAdminView, así siempre arranca en Storefront
    });

    // 2. Escuchar cambios de estado (Login/Logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      
      // Solo forzamos la vista de administrador al cerrar sesión
      if (event === 'SIGNED_OUT') {
        setIsAdminView(false);
        setSession(null);
      }
      
      // Nota: Eliminamos el "setIsAdminView(true)" de aquí para evitar que 
      // al refrescar la página nos devuelva al panel automáticamente.
    });

    return () => subscription.unsubscribe();
  }, []);

  // --- TEMPORIZADOR DE SEGURIDAD (1 HORA) ---
  useEffect(() => {
    let timer;
    if (session) {
      timer = setTimeout(async () => {
        await supabase.auth.signOut();
        setShowExpiredMsg(true);
      }, 3600000); // 1 hora
    }
    return () => { if (timer) clearTimeout(timer); };
  }, [session]);

  return (
    <div className="min-h-screen bg-[#fcfcfc] selection:bg-black selection:text-white">
      
      {/* Lógica de navegación principal */}
      {isAdminView && session ? (
        <AdminPanel onBack={() => setIsAdminView(false)} />
      ) : (
        <Storefront 
          onAdminClick={() => session ? setIsAdminView(true) : setShowLogin(true)} 
          session={session} 
        />
      )}
      
      {/* Modal de Login */}
      {showLogin && (
        <LoginView 
          onClose={() => setShowLogin(false)} 
          onLoginSuccess={() => {
            setIsAdminView(true); // Solo aquí permitimos el cambio automático de vista
            setShowLogin(false);
          }} 
        />
      )}

      {/* Alerta de sesión expirada */}
      {showExpiredMsg && (
        <SessionExpiredModal onClose={() => setShowExpiredMsg(false)} />
      )}
      
    </div>
  );
}