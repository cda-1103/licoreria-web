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
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCat, setSelectedCat] = useState('Todas');
  const [showCatMenu, setShowCatMenu] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 16;

  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  // ESTADOS DE CHECKOUT
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState('pickup'); 
  const [address, setAddress] = useState('');
  const [gpsLink, setGpsLink] = useState('');
  const [isLocating, setIsLocating] = useState(false);

  const hoy = new Date().toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' });

  // --- FUNCIÓN DE FORMATO DE PRECIO (1.300,00) ---
  const formatPrice = (value) => {
    return new Intl.NumberFormat('de-DE', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    }).format(value);
  };

  // --- CARGA DE DATOS ---
  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      const dynamicRate = await fetchBcvRate();
      if (dynamicRate) setTasaBCV(dynamicRate);
      const { data: p } = await supabase.from('productos').select('*').order('nombre');
      const { data: c } = await supabase.from('categorias').select('*');
      if (p) setProducts(p);
      if (c) setCategories(c.sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setLoading(false);
    };
    loadAll();
  }, []);

  const filtered = useMemo(() => {
    return products.filter(p => {
      const matchSearch = p.nombre.toLowerCase().includes(searchTerm.toLowerCase());
      const matchCat = selectedCat === 'Todas' || p.categoria_id === selectedCat;
      return matchSearch && matchCat && p.stock > 0;
    });
  }, [products, searchTerm, selectedCat]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const currentItems = useMemo(() => filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage), [filtered, currentPage]);

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

  const handleCategorySelect = (id) => {
    setSelectedCat(id);
    setShowCatMenu(false);
    setCurrentPage(1);
  };

  // --- LOCALIZACIÓN GPS CORREGIDA ---
  const handleGetLocation = () => {
    setIsLocating(true);
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const link = `https://www.google.com/maps?q=${lat},${lng}`;
          setGpsLink(link);
          setIsLocating(false);
        },
        (error) => {
          console.error(error);
          alert("No pudimos obtener tu ubicación. Por favor, asegúrate de dar permisos de GPS.");
          setIsLocating(false);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  };

  // --- ENVÍO A WHATSAPP ---
  const handleWhatsAppCheckout = (e) => {
    e.preventDefault();
    const orderNum = `BBT-${Math.floor(1000 + Math.random() * 9000)}`;
    let details = cart.map(i => 
      `*${i.qty}x* ${i.nombre.toUpperCase()}\n   (Unid: $${formatPrice(i.precio_usd)} | Sub: *$${formatPrice(i.precio_usd * i.qty)}*)`
    ).join('\n\n');
    
    let msg = `*NUEVO PEDIDO: ${orderNum}*\n`;
    msg += `-----------------------------------\n`;
    msg += `*CLIENTE:* ${customerName.toUpperCase()}\n`;
    msg += `*ENTREGA:* ${deliveryMethod === 'pickup' ? 'RETIRO EN TIENDA' : 'DELIVERY'}\n`;
    
    if (deliveryMethod === 'delivery') {
      msg += `*DIRECCIÓN:* ${address.toUpperCase()}\n`;
      if (gpsLink) msg += `*UBICACIÓN GPS:* ${gpsLink}\n`;
    } else {
      msg += `*PUNTO DE RETIRO:* Av. Andrés Bello (Tienda B.B.T.)\n`;
    }
    
    msg += `-----------------------------------\n`;
    msg += `*DETALLE DE COMPRA:*\n\n${details}\n\n`;
    msg += `-----------------------------------\n`;
    msg += `*TOTAL A PAGAR:*\n`;
    msg += `*USD: $${formatPrice(totalUSD)}*\n`;
    msg += `*BS: ${formatPrice(totalUSD * Number(tasaBCV))}* (Tasa: ${formatPrice(Number(tasaBCV))})\n`;
    msg += `-----------------------------------`;

    const phone = "584247476273"; 
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-[#fcfcfc] pb-10 relative selection:bg-black selection:text-white">
      
      {/* TASA BCV STICKY */}
      <div className="bg-black text-white px-6 py-2.5 flex justify-between items-center sticky top-0 z-[100] border-b border-stone-800 shadow-md">
        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-stone-400">
          TASA BCV: <span className="text-white ml-1">{formatPrice(tasaBCV)} BS</span>
        </span>
        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-stone-400">{hoy.toUpperCase()}</span>
      </div>

      <header className="px-6 md:px-12 py-10 flex justify-between items-center bg-white">
        {/* LOGO + RIF CENTRADO */}
        <div className="flex flex-col items-center">
          <div className="logo-container">
            <img src="/logo.JPG" className="logo-zoom" alt="B.B.T. Licores" />
          </div>
          <span className="text-[11px] font-black text-black mt-1 tracking-[0.05em] mr-4 uppercase">
            RIF: J-50144056-5
          </span>
        </div>
        
        <button onClick={onAdminClick} className="p-3 rounded-full border border-stone-100 text-stone-300 hover:text-black hover:border-black transition-all">
          <Icon name={session ? "admin_panel_settings" : "lock_person"} />
        </button>
      </header>

      {/* FILTROS Y BÚSQUEDA */}
      <div className="bg-white border-y border-stone-100 sticky top-[36px] z-[90]">
        <div className="max-w-4xl mx-auto px-6 py-6 text-center">
          <input 
            type="text" 
            value={searchTerm}
            placeholder="BUSCA TU PRODUCTO FAVORITO..." 
            className="w-full max-w-xl bg-transparent border-b border-stone-200 py-3 text-center text-[11px] font-black tracking-[0.4em] uppercase outline-none focus:border-black transition-all mb-6"
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <div className="flex justify-center items-center gap-10">
            <button 
              onClick={() => handleCategorySelect('Todas')} 
              className={`text-[10px] font-black uppercase tracking-[0.3em] transition-all border-b-2 pb-1 ${selectedCat === 'Todas' ? 'border-black text-black' : 'border-transparent text-stone-300'}`}
            >
              Todas
            </button>
            <button 
              onClick={() => setShowCatMenu(!showCatMenu)}
              className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] transition-all border-b-2 pb-1 ${selectedCat !== 'Todas' ? 'border-black text-black' : 'border-transparent text-stone-300'}`}
            >
              {selectedCat === 'Todas' ? 'CATEGORÍAS' : categories.find(c => c.id === selectedCat)?.nombre}
              <Icon name={showCatMenu ? "expand_less" : "expand_more"} className="text-sm" />
            </button>
          </div>
        </div>

        {showCatMenu && (
          <div className="absolute top-full left-0 w-full bg-white border-b border-stone-200 shadow-2xl animate-in slide-in-from-top duration-300 z-50">
            <div className="max-w-6xl mx-auto p-10 grid grid-cols-2 md:grid-cols-4 gap-x-12 gap-y-6 max-h-[50vh] overflow-y-auto no-scrollbar">
              {categories.map(c => (
                <button 
                  key={c.id} 
                  onClick={() => handleCategorySelect(c.id)} 
                  className={`text-left text-[10px] font-bold uppercase tracking-widest transition-colors ${selectedCat === c.id ? 'text-black' : 'text-stone-400 hover:text-black'}`}
                >
                  {c.nombre}
                </button>
              ))}
            </div>
            <div className="bg-stone-50 border-t border-stone-100 p-4 text-center">
              <button 
                onClick={() => setShowCatMenu(false)} 
                className="flex items-center justify-center gap-2 mx-auto text-[9px] font-black uppercase tracking-[0.4em] text-stone-400 hover:text-black transition-colors"
              >
                <Icon name="close" className="text-xs" /> CERRAR MENÚ
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CATÁLOGO */}
      <main className="p-4 md:p-12 max-w-7xl mx-auto min-h-[50vh]">
        {loading ? (
          <div className="py-20 text-center text-[10px] font-black uppercase tracking-[0.5em] text-stone-200 animate-pulse">Actualizando Bodega...</div>
        ) : filtered.length === 0 ? (
          <div className="py-32 flex flex-col items-center justify-center text-center animate-in fade-in duration-1000">
            <Icon name="inventory_2" className="text-7xl text-stone-100 mb-6" />
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-stone-400 max-w-md leading-relaxed">
              POR LOS MOMENTOS NO TENEMOS STOCK DISPONIBLE
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-10">
              {currentItems.map(p => {
                const qty = getQtyInCart(p.sku);
                return (
                  <div 
                    key={p.sku} 
                    onClick={() => addToCart(p)}
                    className={`cursor-pointer group bg-white border p-4 md:p-6 flex flex-col transition-all duration-500 hover:shadow-2xl hover:-translate-y-2 relative ${qty > 0 ? 'border-black ring-1 ring-black shadow-lg' : 'border-stone-200'}`}
                  >
                    {qty > 0 && (
                      <div className="absolute top-3 right-3 z-20 bg-black text-white px-2.5 py-1.5 flex items-center gap-1 animate-in zoom-in">
                        <span className="text-[9px] font-black uppercase">CANT: {qty}</span>
                      </div>
                    )}
                    {p.stock <= 3 && (
                      <div className="absolute top-4 left-4 z-10 bg-red-600 text-white text-[8px] font-black px-2 py-1 uppercase tracking-widest shadow-sm">
                        ÚLTIMAS {p.stock}
                      </div>
                    )}
                    <div className="aspect-[3/4] bg-stone-50/50 mb-6 flex items-center justify-center p-4 relative overflow-hidden">
                      <img src={p.imagen_url || "/placeholder.png"} className="h-full w-auto object-contain mix-blend-multiply group-hover:scale-110 transition-all duration-1000" />
                    </div>
                    <h3 className="serif text-xs md:text-sm italic leading-tight h-10 overflow-hidden line-clamp-2 text-stone-900 uppercase">
                      {p.nombre}
                    </h3>
                    <div className="mt-4 pt-4 border-t border-stone-50 flex flex-col">
                      <span className="serif text-xl font-bold text-stone-900">${formatPrice(p.precio_usd)}</span>
                      <span className="text-[10px] font-black text-stone-400 uppercase mt-1 tracking-tighter">
                        {formatPrice(p.precio_usd * tasaBCV)} BS
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* PAGINACIÓN */}
            {totalPages > 1 && (
              <div className="mt-20 flex justify-center items-center gap-8 border-t border-stone-100 pt-10">
                <button 
                  disabled={currentPage === 1} 
                  onClick={() => {setCurrentPage(prev => prev - 1); window.scrollTo({top: 0, behavior: 'smooth'});}} 
                  className="p-3 border rounded-full disabled:opacity-20 hover:bg-black hover:text-white transition-all"
                >
                  <Icon name="arrow_back" />
                </button>
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-stone-400">Pág {currentPage} / {totalPages}</span>
                <button 
                  disabled={currentPage === totalPages} 
                  onClick={() => {setCurrentPage(prev => prev + 1); window.scrollTo({top: 0, behavior: 'smooth'});}} 
                  className="p-3 border rounded-full disabled:opacity-20 hover:bg-black hover:text-white transition-all"
                >
                  <Icon name="arrow_forward" />
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* FOOTER */}
      <footer className="py-16 border-t border-stone-100 bg-white text-center px-6">
        <p className="text-[10px] font-black text-stone-400 uppercase tracking-[0.3em] mb-4">
          © {new Date().getFullYear()} TODOS LOS DERECHOS RESERVADOS B.B.T., C.A.
        </p>
        <p className="text-[8px] font-bold text-stone-300 uppercase tracking-[0.2em] leading-loose max-w-lg mx-auto">
          RIF: J-50144056-5 | MÉRIDA, VENEZUELA.<br/>
          PROHIBIDA LA VENTA DE ALCOHOL A MENORES DE 18 AÑOS. DISFRUTA CON RESPONSABILIDAD.
        </p>
      </footer>

      {/* CARRITO FLOTANTE */}
      <button onClick={() => setIsCartOpen(true)} className="fixed bottom-8 right-8 z-[70] w-16 h-16 bg-black text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all">
        <Icon name="shopping_bag" className="text-2xl" />
        {cart.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] w-6 h-6 flex items-center justify-center rounded-full font-black ring-4 ring-[#fcfcfc]">
            {cart.reduce((a, b) => a + b.qty, 0)}
          </span>
        )}
      </button>

      {/* PANEL DEL CARRITO */}
      {isCartOpen && (
        <div className="fixed inset-0 z-[120] flex justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsCartOpen(false)} />
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-500">
            <div className="p-8 border-b border-stone-100 flex justify-between items-center">
              <h2 className="serif italic text-3xl">Bolsa de Compra</h2>
              <button onClick={() => setIsCartOpen(false)} className="text-stone-300 hover:text-black"><Icon name="close" className="text-3xl" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar">
              {cart.map(item => (
                <div key={item.sku} className="flex gap-4 items-center border-b border-stone-50 pb-6">
                  <div className="w-20 h-20 bg-stone-50 border flex items-center justify-center p-2">
                    <img src={item.imagen_url} className="h-full object-contain mix-blend-multiply" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="serif text-xs uppercase leading-tight truncate font-bold">{item.nombre}</h4>
                    <div className="flex justify-between mt-2 text-[9px] font-black text-stone-400 uppercase tracking-widest">
                      <span>P. Unit: ${formatPrice(item.precio_usd)}</span>
                      <span className="text-black">Subtotal: ${formatPrice(item.precio_usd * item.qty)}</span>
                    </div>
                    <div className="flex items-center gap-4 mt-3 border w-fit px-3 py-1 rounded-full border-stone-200">
                      <button onClick={(e) => { e.stopPropagation(); updateQty(item.sku, -1); }} className="hover:text-red-600"><Icon name="remove" className="text-xs" /></button>
                      <span className="px-2 text-xs font-black">{item.qty}</span>
                      <button onClick={(e) => { e.stopPropagation(); updateQty(item.sku, 1); }} className="hover:text-green-600"><Icon name="add" className="text-xs" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {cart.length > 0 && (
              <div className="p-8 border-t border-stone-100 bg-stone-50">
                <div className="flex justify-between items-end mb-8 text-right">
                  <span className="text-[10px] font-black uppercase tracking-widest text-stone-400 block">Total Estimado</span>
                  <div className="serif text-4xl font-bold text-stone-900">${formatPrice(totalUSD)}</div>
                  <div className="text-sm font-bold text-stone-500 uppercase">≈ {formatPrice(totalUSD * tasaBCV)} BS</div>
                </div>
                <button onClick={() => setIsCheckoutOpen(true)} className="w-full bg-black text-white py-6 text-[11px] font-black tracking-[0.4em] uppercase hover:bg-stone-800 transition-all shadow-xl active:scale-95">
                  CONTINUAR PEDIDO
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL DE CHECKOUT */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsCheckoutOpen(false)} />
          <div className="relative bg-white w-full max-w-md p-10 shadow-2xl animate-in zoom-in-95 duration-200">
            <h2 className="serif italic text-3xl mb-8">Confirmar Datos</h2>
            <form onSubmit={handleWhatsAppCheckout} className="space-y-6">
              <div>
                <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest block mb-2">Nombre del Cliente</label>
                <input 
                  type="text" required placeholder="EJ: CLAUDIO DAVILA" 
                  className="w-full border-b border-stone-200 py-2 text-xs font-bold uppercase outline-none focus:border-black transition-colors"
                  value={customerName} onChange={e => setCustomerName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest block mb-3">¿Cómo prefieres recibir?</label>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setDeliveryMethod('pickup')} className={`flex-1 py-4 text-[10px] font-black border transition-all ${deliveryMethod === 'pickup' ? 'bg-black text-white border-black shadow-lg' : 'text-stone-300 border-stone-100 hover:border-stone-300'}`}>RETIRO EN TIENDA</button>
                  <button type="button" onClick={() => setDeliveryMethod('delivery')} className={`flex-1 py-4 text-[10px] font-black border transition-all ${deliveryMethod === 'delivery' ? 'bg-black text-white border-black shadow-lg' : 'text-stone-300 border-stone-100 hover:border-stone-300'}`}>DELIVERY</button>
                </div>
              </div>
              {deliveryMethod === 'pickup' ? (
                <div className="bg-stone-50 p-4 border border-stone-100 text-[10px] font-bold uppercase leading-relaxed text-stone-500 rounded-sm">
                  <span className="text-black block mb-1">📍 DIRECCIÓN BBT TIENDA DE LICORES:</span>
                  AV. ANDRÉS BELLO C.C MILLENIUM LOCAL PB-01 NIVEL PLANTA BAJA LOCAL DE LA ENTRADA.
                </div>
              ) : (
                <div className="space-y-4 animate-in slide-in-from-top-4">
                  <textarea 
                    required placeholder="DIRECCIÓN DE ENTREGA (URB, CALLE, EDIFICIO...)" 
                    className="w-full bg-stone-50 p-4 text-[10px] font-bold border border-stone-100 outline-none h-20 resize-none uppercase" 
                    value={address} onChange={e => setAddress(e.target.value)} 
                  />
                  <button 
                    type="button" 
                    onClick={handleGetLocation} 
                    className={`w-full py-4 text-[9px] font-black border-2 border-dashed flex items-center justify-center gap-3 transition-all ${gpsLink ? 'bg-green-50 border-green-500 text-green-700' : 'text-stone-400 border-stone-200 hover:bg-stone-50'}`}
                  >
                    <Icon name={gpsLink ? "check_circle" : "my_location"} className={gpsLink ? "animate-bounce" : ""}/> 
                    {isLocating ? 'LOCALIZANDO...' : gpsLink ? 'UBICACIÓN GPS LISTA ✓' : 'ENVIAR MI UBICACIÓN GPS'}
                  </button>
                </div>
              )}
              <button type="submit" className="w-full bg-black text-white py-6 text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl hover:scale-[1.02] active:scale-95 transition-all mt-4">
                FINALIZAR POR WHATSAPP
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}