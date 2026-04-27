import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const getEnvVar = (key) => {
  try { return import.meta.env[key]; } catch (e) { return ""; }
};

const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnvVar('VITE_SUPABASE_ANON_KEY');
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const Icon = ({ name, className = "" }) => (
  <span className={`material-symbols-outlined ${className}`} style={{ fontSize: 'inherit', verticalAlign: 'middle' }}>
    {name}
  </span>
);

export default function AdminPanel({ onBack }) {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState('Todas');
  const [uploading, setUploading] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tempPrices, setTempPrices] = useState({});
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: p } = await supabase.from('productos').select('*').order('nombre');
      const { data: c } = await supabase.from('categorias').select('*');
      if (p) setProducts(p);
      if (c) setCategories(c.sort((a, b) => a.nombre.localeCompare(b.nombre)));
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // --- ACCIONES DE PRECIO ---
  const handleConfirmPrice = async (sku) => {
    const newPrice = tempPrices[sku];
    if (newPrice === undefined) return;
    const price = parseFloat(newPrice);
    if (isNaN(price)) return;

    try {
      const { error } = await supabase
        .from('productos')
        .update({ precio_usd: price, precio_bloqueado: true })
        .eq('sku', sku);
      
      if (error) throw error;

      // Actualización local para evitar parpadeos
      setProducts(prev => prev.map(p => p.sku === sku ? { ...p, precio_usd: price, precio_bloqueado: true } : p));
      
      // Limpiar el estado temporal de este producto
      const newTempPrices = { ...tempPrices };
      delete newTempPrices[sku];
      setTempPrices(newTempPrices);
    } catch (err) {
      alert("Error al guardar: " + err.message);
    }
  };

  const handleCancelEdit = (sku) => {
    const newTempPrices = { ...tempPrices };
    delete newTempPrices[sku];
    setTempPrices(newTempPrices);
  };

  const togglePriceLock = async (sku, currentState) => {
    await supabase.from('productos').update({ precio_bloqueado: !currentState }).eq('sku', sku);
    setProducts(prev => prev.map(p => p.sku === sku ? { ...p, precio_bloqueado: !currentState } : p));
  };

  const filtered = useMemo(() => products.filter(p => {
    const matchSearch = p.nombre.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase());
    const matchCat = selectedCat === 'Todas' || p.categoria_id === selectedCat;
    return matchSearch && matchCat;
  }), [products, search, selectedCat]);

  return (
    <div className="flex min-h-screen bg-[#f4f4f4] text-stone-900 selection:bg-black selection:text-white relative">
      
      {/* TRIGGER MENÚ MÓVIL */}
      <button 
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className="md:hidden fixed top-6 right-6 z-[110] bg-black text-white p-3 rounded-full shadow-2xl"
      >
        <Icon name={isSidebarOpen ? "close" : "menu"} />
      </button>

      {/* SIDEBAR RESPONSIVO */}
      <aside className={`
        w-64 fixed h-full bg-white border-r border-stone-200 p-8 flex flex-col z-[100] transition-transform duration-300
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
      `}>
        <div className="mb-10 text-center border-b pb-6">
          <img src="/logo.JPG" className="w-24 mx-auto mix-blend-multiply" alt="Logo" />
          <p className="text-[10px] font-black uppercase tracking-widest mt-4 text-stone-400">Panel Administrativo</p>
        </div>
        
        <nav className="space-y-6">
          <div>
            <label className="text-[9px] font-black uppercase text-stone-400 block mb-2 tracking-widest">Filtrar Categoría</label>
            <select 
              className="w-full bg-stone-50 border border-stone-200 p-3 text-[10px] font-bold uppercase outline-none rounded-none"
              onChange={(e) => { setSelectedCat(e.target.value); setIsSidebarOpen(false); }}
              value={selectedCat}
            >
              <option value="Todas">Todas</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.nombre.toUpperCase()}</option>)}
            </select>
          </div>
        </nav>

        <div className="mt-auto space-y-2">
          <button onClick={onBack} className="w-full bg-stone-100 py-4 text-[10px] font-bold uppercase hover:bg-black hover:text-white transition-all flex items-center justify-center gap-2">
            <Icon name="storefront" className="text-sm" /> Volver a Tienda
          </button>
          <button onClick={() => supabase.auth.signOut()} className="w-full bg-red-50 text-red-600 py-4 text-[10px] font-bold uppercase flex items-center justify-center gap-2">
            <Icon name="logout" className="text-sm" /> Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 p-6 md:p-12 md:ml-64 w-full">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 gap-6 border-b border-stone-200 pb-8">
          <div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tighter serif">Inventario</h1>
            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-[0.2em] mt-2">B.B.T. Licores - Mérida</p>
          </div>
          <div className="relative w-full md:w-80">
            <Icon name="search" className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-300" />
            <input 
              className="w-full bg-white border border-stone-200 pl-12 pr-6 py-4 text-[10px] font-bold uppercase outline-none focus:border-black shadow-sm"
              placeholder="BUSCAR PRODUCTO..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </header>

        <div className="bg-white border border-stone-200 shadow-sm rounded-sm overflow-hidden">
          {/* CABECERA TABLA (Escritorio) */}
          <div className="hidden md:flex bg-stone-50 border-b border-stone-200 px-8 py-4 text-[9px] font-black uppercase tracking-widest text-stone-400">
            <div className="w-32 text-center">Imagen</div>
            <div className="flex-1 ml-10">Descripción</div>
            <div className="w-24 text-center">Modo</div>
            <div className="w-24 text-center">Stock</div>
            <div className="w-64 text-right">Precio de Venta</div>
          </div>

          <div className="divide-y divide-stone-100">
            {loading ? (
              <div className="p-20 text-center animate-pulse text-[10px] font-black text-stone-300">ACTUALIZANDO DATOS...</div>
            ) : filtered.map(p => {
              const editedPrice = tempPrices[p.sku];
              const isModified = editedPrice !== undefined && editedPrice !== p.precio_usd.toFixed(2);
              
              return (
                <div key={p.sku} className="p-6 md:p-8 flex flex-col md:flex-row items-center gap-6 md:gap-10 hover:bg-stone-50/40 transition-all">
                  
                  {/* MULTIMEDIA */}
                  <div className="w-full md:w-32 flex flex-col items-center gap-3">
                    <div className="w-24 h-24 bg-white border border-stone-100 flex items-center justify-center overflow-hidden rounded-sm">
                      <img src={p.imagen_url || "/placeholder.png"} className="h-full object-contain mix-blend-multiply" />
                    </div>
                  </div>

                  {/* INFO */}
                  <div className="flex-1 text-center md:text-left min-w-0">
                    <span className="text-[9px] font-black text-stone-300 uppercase block mb-1">SKU: {p.sku}</span>
                    <h3 className="serif text-xl md:text-2xl text-stone-900 leading-tight">{p.nombre}</h3>
                  </div>

                  {/* CONTROLES */}
                  <div className="flex flex-wrap justify-center md:justify-end items-center gap-6 md:gap-10 w-full md:w-auto">
                    
                    {/* MODO PRECIO */}
                    <div className="flex flex-col items-center">
                      <button 
                        onClick={() => togglePriceLock(p.sku, p.precio_bloqueado)}
                        className={`transition-all ${p.precio_bloqueado ? 'text-orange-600' : 'text-stone-200 hover:text-black'}`}
                      >
                        <Icon name={p.precio_bloqueado ? "person_edit" : "sync"} className="text-4xl md:text-3xl" />
                      </button>
                      <span className="text-[8px] font-black uppercase mt-1 text-stone-400">
                        {p.precio_bloqueado ? 'MANUAL' : 'AUTO'}
                      </span>
                    </div>

                    {/* STOCK */}
                    <div className={`text-sm font-black py-2 px-4 rounded-full border ${p.stock <= 3 ? 'bg-red-50 text-red-600 border-red-100' : 'bg-stone-50 text-stone-400 border-stone-100'}`}>
                      {p.stock} <span className="text-[10px] ml-1">UND</span>
                    </div>

                    {/* PRECIO USD CON CONFIRMACIÓN */}
                    <div className="flex items-center gap-2">
                      {isModified && (
                        <div className="flex gap-1 animate-in zoom-in duration-200">
                          <button 
                            onClick={() => handleConfirmPrice(p.sku)}
                            className="w-10 h-10 bg-black text-white flex items-center justify-center rounded-sm shadow-xl active:scale-90 transition-transform"
                            title="Confirmar cambio"
                          >
                            <Icon name="check" />
                          </button>
                          <button 
                            onClick={() => handleCancelEdit(p.sku)}
                            className="w-10 h-10 bg-stone-200 text-stone-500 flex items-center justify-center rounded-sm active:scale-90 transition-transform"
                            title="Deshacer cambios"
                          >
                            <Icon name="close" />
                          </button>
                        </div>
                      )}
                      
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 font-bold">$</span>
                        <input 
                          type="number"
                          step="0.01"
                          value={editedPrice ?? p.precio_usd.toFixed(2)}
                          onChange={(e) => setTempPrices({ ...tempPrices, [p.sku]: e.target.value })}
                          className={`w-32 border py-3 pl-8 pr-4 text-right serif text-2xl font-bold outline-none rounded-sm transition-all ${isModified ? 'bg-orange-50 border-orange-300' : 'bg-stone-50 border-transparent focus:bg-white focus:border-black'}`}
                        />
                      </div>
                    </div>

                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}