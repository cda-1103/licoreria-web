import { supabase } from './supabase';

export const fetchBcvRate = async () => {
  try {
    const serverRes = await fetch('/api/bcv', { headers: { Accept: 'application/json' } });
    if (serverRes.ok) {
      const serverData = await serverRes.json();
      const rate = parseFloat(serverData?.rate);
      if (rate && rate > 0) return rate;
    }
  } catch {
    // Fallback to direct public API
  }

  try {
    const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (response.ok) {
      const data = await response.json();
      const rate = parseFloat(data.promedio);
      if (rate && rate > 0) return rate;
    }
  } catch {
    // Fallback to Supabase configuracion
  }

  try {
    const { data } = await supabase
      .from('configuracion')
      .select('valor')
      .eq('clave', 'tasa_bcv');
    const saved = parseFloat(data?.[0]?.valor);
    if (saved && saved > 0) return saved;
  } catch {
    // Final fallback handled by caller
  }

  return null;
};