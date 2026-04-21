import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { fetchBcvRate } from '../lib/bcvService';

const Icon = ({ name, className = "" }) => (
  <span className={`material-symbols-outlined ${className}`} style={{ fontSize: 'inherit', verticalAlign: 'middle' }}>
    {name}
  </span>
);

export default function Storefront({ onAdminClick, session }) {
  // --- ESTADOS ---
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [tasaBCV, setTasaBCV] = useState(45.50);
  const [loading, setLoading] = useState(true);
  
  // Filtros y Paginación
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCat, setSelectedCat] = useState('Todas');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 16;

  // Carrito
  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  const hoy = new Date().toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' });

  // --- CARGA DE DATOS ---
  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      const dynamicRate = await fetchBcvRate();
      if (dynamicRate) setTasaBCV(dynamicRate);

      const { data: p } = await supabase.from('productos').select('*').order('nombre');
      const { data: c } = await supabase.from('categorias').select('*').order('nombre');
      
      if (p) setProducts(p);
      if (c) setCategories(c);
      setLoading(false);
    };
    loadAll();
  }, []);

  // --- LÓGICA DE FILTRADO ---
  const filtered = useMemo(() => {
    return products.filter(p => {
      const matchSearch = p.nombre.toLowerCase().includes(searchTerm.toLowerCase());
      const matchCat = selectedCat === 'Todas' || p.categoria_id === selectedCat;
      return matchSearch && matchCat;
    });
  }, [products, searchTerm, selectedCat]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const currentItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filtered.slice(start, start + itemsPerPage);
  }, [filtered, currentPage]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, selectedCat]);

  // --- GESTIÓN DEL CARRITO ---
  const addToCart = (p) => {
    setCart(prev => {
      const exists = prev.find(item => item.sku === p.sku);
      if (exists) return prev.map(item => item.sku === p.sku ? { ...item, qty: Math.min(item.qty + 1, p.stock) } : item);
      return [...prev, { ...p, qty: 1 }];
    });
  };

  const updateQty = (sku, delta) => {
    setCart(prev => prev.map(item => {
      if (item.sku === sku) {
        const newQty = Math.max(0, Math.min(item.qty + delta, item.stock));
        return { ...item, qty: newQty };
      }
      return item;
    }).filter(item => item.qty > 0));
  };

  const getQtyInCart = (sku) => cart.find(item => item.sku === sku)?.qty || 0;
  const totalUSD = cart.reduce((acc, item) => acc + (item.precio_usd * item.qty), 0);

  return (
    <div className="min-h-screen bg-[#fcfcfc] pb-20 relative">
      
      {/* BANNER TASA BCV */}
      <div className="bg-black text-white px-6 py-2.5 flex justify-between items-center sticky top-0 z-[60] border-b border-stone-800 shadow-md">
        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-stone-400">
          TASA BCV: <span className="text-white ml-1">{tasaBCV.toFixed(2)} BS</span>
        </span>
        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-stone-400">{hoy.toUpperCase()}</span>
      </div>

      <header className="px-6 md:px-12 py-10 flex justify-between items-center bg-white border-b border-stone-100">
        <div className="logo-container">
          <img src="/logo.JPG" className="logo-zoom" alt="Logo" />
        </div>

        <button 
          onClick={onAdminClick} 
          className={`flex items-center gap-2 px-5 py-2.5 rounded-full border transition-all duration-300 ${session ? 'bg-black text-white border-black shadow-lg' : 'text-stone-300 border-stone-100 hover:text-black hover:border-black'}`}
        >
          <Icon name={session ? "admin_panel_settings" : "lock_person"} className="text-lg" />
        </button>
      </header>

      {/* FILTROS Y BUSCADOR */}
      <div className="bg-white border-b border-stone-50 sticky top-[37px] z-50">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <input 
            type="text" 
            placeholder="BUSCA TU PRODUCTO FAVORITO..." 
            className="w-full bg-transparent border-b border-stone-200 py-3 text-center text-xs font-bold tracking-[0.4em] uppercase outline-none focus:border-black transition-all"
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <div className="flex gap-6 overflow-x-auto no-scrollbar justify-center mt-6">
            <button 
              onClick={() => setSelectedCat('Todas')} 
              className={`text-[10px] font-black uppercase tracking-widest pb-1 border-b-2 transition-all whitespace-nowrap ${selectedCat === 'Todas' ? 'border-black text-black' : 'border-transparent text-stone-300'}`}
            >
              Todas
            </button>
            {categories.map(c => (
              <button 
                key={c.id} 
                onClick={() => setSelectedCat(c.id)} 
                className={`text-[10px] font-black uppercase tracking-widest pb-1 border-b-2 transition-all whitespace-nowrap ${selectedCat === c.id ? 'border-black text-black' : 'border-transparent text-stone-300'}`}
              >
                {c.nombre}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* GRID DE PRODUCTOS */}
      <main className="p-4 md:p-12 max-w-7xl mx-auto min-h-[400px]">
        {loading ? (
          <div className="py-40 text-center text-[10px] font-black tracking-[0.5em] text-stone-300 uppercase animate-pulse">Sincronizando Bodega...</div>
        ) : filtered.length === 0 ? (
          /* MENSAJE CUANDO NO HAY PRODUCTOS */
          <div className="py-32 flex flex-col items-center justify-center text-center animate-in fade-in duration-700">
            <Icon name="inventory_2" className="text-6xl text-stone-200 mb-6" />
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 max-w-xs leading-relaxed">
              POR LOS MOMENTOS NO TENEMOS STOCK DISPONIBLE EN ESTA CATEGORÍA, SIGUE EXPLORANDO OTRAS OPCIONES
            </p>
            <button onClick={() => setSelectedCat('Todas')} className="mt-8 text-[9px] font-black uppercase underline tracking-widest">Ver Todo</button>
          </div>
        ) : (
          <>
            {/* GRID: 2 COLUMNAS EN MÓVIL (grid-cols-2) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-10">
              {currentItems.map(p => {
                const qty = getQtyInCart(p.sku);
                return (
                  <div 
                    key={p.sku} 
                    className={`group bg-white border p-4 md:p-6 flex flex-col transition-all duration-500 hover:shadow-2xl hover:-translate-y-2 relative ${qty > 0 ? 'border-black ring-1 ring-black shadow-xl' : 'border-stone-200'}`}
                  >
                    {/* CONTADOR EN TARJETA (ESQUINA SUPERIOR DERECHA) */}
                    {qty > 0 && (
                      <div className="absolute top-3 right-3 z-20 bg-black text-white px-2 py-1 flex items-center gap-1 animate-in zoom-in">
                        <span className="text-[8px] font-black uppercase tracking-tighter">CANT: {qty}</span>
                        <Icon name="check" className="text-[10px] font-bold" />
                      </div>
                    )}

                    {p.stock <= 3 && p.stock > 0 && (
                      <div className="absolute top-4 left-4 z-10 bg-red-600 text-white text-[8px] font-black px-2 py-1 uppercase tracking-widest shadow-sm">
                        ÚLTIMAS {p.stock} UNID.
                      </div>
                    )}

                    <div className="aspect-[3/4] bg-stone-50/50 mb-6 flex items-center justify-center p-4 relative overflow-hidden">
                      {p.imagen_url ? (
                        <img src={p.imagen_url} className="h-full w-auto object-contain mix-blend-multiply group-hover:scale-110 transition-all duration-1000" alt={p.nombre} />
                      ) : <Icon name="wine_bar" className="text-stone-100 text-7xl" />}
                      <button 
                        onClick={() => addToCart(p)}
                        className="absolute bottom-0 left-0 w-full bg-black text-white py-4 text-[9px] font-black tracking-[0.3em] translate-y-full group-hover:translate-y-0 transition-transform duration-300"
                      >
                        AÑADIR A BOLSA
                      </button>
                    </div>
                    
                    {/* NOMBRE EN MAYÚSCULAS */}
                    <h3 className="serif text-xs md:text-sm italic leading-tight h-12 overflow-hidden line-clamp-2 text-stone-900 uppercase">
                      {p.nombre}
                    </h3>
                    
                    <div className="mt-4 pt-4 border-t border-stone-50 flex flex-col">
                      <span className="serif text-xl font-bold text-stone-900">${p.precio_usd.toFixed(2)}</span>
                      <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest mt-1">
                        {(p.precio_usd * tasaBCV).toFixed(2)} BS
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* PAGINACIÓN */}
            {totalPages > 1 && (
              <div className="mt-20 flex justify-center items-center gap-6">
                <button disabled={currentPage === 1} onClick={() => setCurrentPage(prev => prev - 1)} className="p-2 border border-stone-200 rounded-full disabled:opacity-20 hover:bg-stone-100 transition-all shadow-sm"><Icon name="arrow_back" /></button>
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-stone-400">Página {currentPage} de {totalPages}</span>
                <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => prev + 1)} className="p-2 border border-stone-200 rounded-full disabled:opacity-20 hover:bg-stone-100 transition-all shadow-sm"><Icon name="arrow_forward" /></button>
              </div>
            )}
          </>
        )}
      </main>

      {/* BOTÓN FLOTANTE DEL CARRITO */}
      <button 
        onClick={() => setIsCartOpen(true)}
        className="fixed bottom-8 right-8 z-[70] w-16 h-16 bg-black text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all group"
      >
        <Icon name="shopping_bag" className="text-2xl" />
        {cart.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] w-6 h-6 flex items-center justify-center rounded-full font-black ring-4 ring-[#fcfcfc]">
            {cart.reduce((a, b) => a + b.qty, 0)}
          </span>
        )}
      </button>

      {/* PANEL LATERAL DEL CARRITO */}
      {isCartOpen && (
        <div className="fixed inset-0 z-[100] flex justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsCartOpen(false)} />
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-500">
            <div className="p-8 border-b border-stone-100 flex justify-between items-center">
              <h2 className="serif italic text-3xl text-stone-900">Tu Selección</h2>
              <button onClick={() => setIsCartOpen(false)} className="text-stone-300 hover:text-black"><Icon name="close" className="text-3xl" /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              {cart.map(item => (
                <div key={item.sku} className="flex gap-4 items-center border-b border-stone-50 pb-6">
                  <div className="w-20 h-20 bg-stone-50 border flex items-center justify-center p-2">
                    <img src={item.imagen_url} className="h-full object-contain mix-blend-multiply" alt={item.nombre} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="serif text-xs uppercase leading-tight truncate">{item.nombre}</h4>
                    <p className="text-[10px] font-bold text-stone-400 mt-1 uppercase tracking-widest">${item.precio_usd.toFixed(2)}</p>
                    <div className="flex items-center gap-4 mt-3">
                      <div className="flex items-center border border-stone-200 rounded-full px-2 py-1">
                        <button onClick={() => updateQty(item.sku, -1)} className="p-1 hover:text-red-600 transition-colors"><Icon name="remove" className="text-sm" /></button>
                        <span className="px-3 text-[11px] font-black">{item.qty}</span>
                        <button onClick={() => updateQty(item.sku, 1)} className="p-1 hover:text-green-600 transition-colors"><Icon name="add" className="text-sm" /></button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {cart.length > 0 && (
              <div className="p-8 border-t border-stone-100 bg-stone-50">
                <div className="flex justify-between items-end mb-8">
                  <span className="text-[10px] font-black uppercase tracking-widest text-stone-400">Total Bolsa</span>
                  <div className="text-right">
                    <div className="serif text-4xl font-bold text-stone-900">${totalUSD.toFixed(2)}</div>
                    <div className="text-[11px] font-bold text-stone-500 uppercase tracking-widest">{(totalUSD * tasaBCV).toFixed(2)} BS</div>
                  </div>
                </div>
                <button className="w-full bg-black text-white py-6 text-[11px] font-black tracking-[0.4em] hover:bg-stone-800 transition-all shadow-xl">
                  CONFIRMAR POR WHATSAPP
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}