import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import { supabase } from './lib/supabase';
import Storefront from './components/Storefront';
import AdminPanel from './components/AdminPanel';
import LoginView from './components/LoginView';

const SessionExpiredModal = ({ onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-black/55 backdrop-blur-xs" />
    <div className="relative bg-white p-8 max-w-sm w-full text-center shadow-2xl border border-[#e2ddd2] rounded-sm">
      <Clock className="w-9 h-9 text-[#9a4d1c] mx-auto mb-3" />
      <p className="text-sm font-medium text-[#141413] mb-5 leading-relaxed">
        Tu sesión de administrador ha expirado por seguridad (1 hora).
      </p>
      <button
        type="button"
        onClick={onClose}
        className="w-full bg-[#141413] text-white py-3 text-xs font-semibold rounded-sm hover:bg-[#9a4d1c] transition-colors cursor-pointer"
      >
        Entendido
      </button>
    </div>
  </div>
);

export default function App() {
  const [session, setSession] = useState(null);
  const [isAdminView, setIsAdminView] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showExpiredMsg, setShowExpiredMsg] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: activeSession } }) => {
      setSession(activeSession);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === 'SIGNED_OUT') {
        setIsAdminView(false);
        setSession(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return undefined;
    const timer = setTimeout(async () => {
      await supabase.auth.signOut();
      setShowExpiredMsg(true);
    }, 3600000);
    return () => clearTimeout(timer);
  }, [session]);

  return (
    <div className="min-h-screen bg-[#f8f6f1] text-[#141413]">
      {isAdminView && session ? (
        <AdminPanel onBack={() => setIsAdminView(false)} />
      ) : (
        <Storefront
          onAdminClick={() => (session ? setIsAdminView(true) : setShowLogin(true))}
          session={session}
        />
      )}

      {showLogin && (
        <LoginView
          onClose={() => setShowLogin(false)}
          onLoginSuccess={() => {
            setIsAdminView(true);
            setShowLogin(false);
          }}
        />
      )}

      {showExpiredMsg && <SessionExpiredModal onClose={() => setShowExpiredMsg(false)} />}
    </div>
  );
}