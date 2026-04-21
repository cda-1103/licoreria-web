import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import Storefront from './components/Storefront';
import AdminPanel from './components/AdminPanel';
import LoginView from './components/LoginView';

export default function App() {
  const [session, setSession] = useState(null);
  const [isAdminView, setIsAdminView] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === 'SIGNED_IN') {
        setIsAdminView(true);
        setShowLogin(false);
      }
      if (event === 'SIGNED_OUT') setIsAdminView(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen">
      {isAdminView && session ? (
        <AdminPanel onBack={() => setIsAdminView(false)} />
      ) : (
        <Storefront 
          onAdminClick={() => session ? setIsAdminView(true) : setShowLogin(true)} 
          session={session} 
        />
      )}
      
      {showLogin && (
        <LoginView 
          onClose={() => setShowLogin(false)} 
          onLoginSuccess={() => setIsAdminView(true)} 
        />
      )}
    </div>
  );
}