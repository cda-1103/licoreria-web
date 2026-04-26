import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Configuración de Supabase con acceso seguro
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
  const [updatingPrice, setUpdatingPrice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tempPrices, setTempPrices] = useState({});

  // Carga inicial (Solo ocurre al entrar)
  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: p } = await supabase.from('productos').select('*').order('nombre');
      const { data: c } = await supabase.from('categorias').select('*').order('nombre');
      if (p) setProducts(p);
      if (c) setCategories(c);
    } catch (err) {
      console.error("Error cargando inventario:", err);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    onBack(); 
  };

  // --- LÓGICA DE PRECIOS (ACTUALIZACIÓN LOCAL SIN REFRESH) ---
  const handlePriceUpdate = async (sku) => {
    const newPrice = tempPrices[sku];
    if (newPrice === undefined) return;
    const price = parseFloat(newPrice);
    if (isNaN(price)) return;

    setUpdatingPrice(sku);
    try {
      const { error } = await supabase
        .from('productos')
        .update({ precio_usd: price, precio_bloqueado: true })
        .eq('sku', sku);

      if (error) throw error;
      
      // CAMBIO CLAVE: Actualizamos solo el producto en el estado local
      setProducts(prev => prev.map(p => 
        p.sku === sku ? { ...p, precio_usd: price, precio_bloqueado: true } : p
      ));
      
      // Limpiamos el precio temporal de ese item
      setTempPrices(prev => {
        const next = { ...prev };
        delete next[sku];
        return next;
      });
    } catch (err) {
      alert("Error al guardar: " + err.message);
    } finally {
      setUpdatingPrice(null);
    }
  };

  const togglePriceLock = async (sku, currentState) => {
    try {
      const { error } = await supabase
        .from('productos')
        .update({ precio_bloqueado: !currentState })
        .eq('sku', sku);
      
      if (error) throw error;

      // Actualizamos el candado localmente
      setProducts(prev => prev.map(p => 
        p.sku === sku ? { ...p, precio_bloqueado: !currentState } : p
      ));
    } catch (err) {
      console.error(err);
    }
  };

  // --- LÓGICA DE IMÁGENES (SIN REFRESH) ---
  const compressImage = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (e) => {
        const img = new Image();
        img.src = e.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          let width = img.width;
          let height = img.height;
          if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
            resolve(new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".webp", { type: 'image/webp' }));
          }, 'image/webp', 0.8);
        };
      };
    });
  };

  const handleUpload = async (e, sku) => {
    const rawFile = e.target.files[0];
    if (!rawFile) return;
    setUploading(sku);
    try {
      const file = await compressImage(rawFile);
      const fileName = `${sku}-${Date.now()}.webp`;
      const { error: upErr } = await supabase.storage.from('fotos-productos').upload(fileName, file);
      if (upErr) throw upErr;
      
      const { data: { publicUrl } } = supabase.storage.from('fotos-productos').getPublicUrl(fileName);
      const { error: dbErr } = await supabase.from('productos').update({ imagen_url: publicUrl }).eq('sku', sku);
      if (dbErr) throw dbErr;
      
      // Actualizamos la foto localmente
      setProducts(prev => prev.map(p => p.sku === sku ? { ...p, imagen_url: publicUrl } : p));
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setUploading(null);
    }
  };

  const handleDeleteImage = async (sku, imageUrl) => {
    if (!confirm("¿Eliminar esta foto?")) return;
    setUploading(sku);
    try {
      const fileName = imageUrl.split('fotos-productos/')[1];
      if (fileName) {
        await supabase.storage.from('fotos-productos').remove([fileName]);
      }
      const { error } = await supabase.from('productos').update({ imagen_url: null }).eq('sku', sku);
      if (error) throw error;
      
      // Limpiamos la foto localmente
      setProducts(prev => prev.map(p => p.sku === sku ? { ...p, imagen_url: null } : p));
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setUploading(null);
    }
  };

  const filtered = useMemo(() => products.filter(p => {
    const matchSearch = p.nombre.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase());
    const matchCat = selectedCat === 'Todas' || p.categoria_id === selectedCat;
    return matchSearch && matchCat;
  }), [products, search, selectedCat]);

  return (
    <div className="flex min-h-screen bg-[#f4f4f4] text-stone-900 selection:bg-black selection:text-white">
      {/* SIDEBAR */}
      <aside className="w-64 fixed h-full bg-white border-r border-stone-200 p-8 flex flex-col z-50">
        <div className="mb-10 text-center border-b pb-6">
          <img src="/logo.JPG" className="w-32 mx-auto mix-blend-multiply" alt="Logo" />
          <p className="text-[10px] font-black uppercase tracking-widest mt-4 text-stone-400">Admin B.B.T.</p>
        </div>
        
        <nav className="space-y-6">
          <div>
            <label className="text-[9px] font-black uppercase text-stone-400 block mb-2 tracking-widest">Categoría</label>
            <select 
              className="w-full bg-stone-50 border border-stone-200 p-3 text-[10px] font-bold uppercase outline-none focus:border-black rounded-none"
              onChange={(e) => setSelectedCat(e.target.value)}
              value={selectedCat}
            >
              <option value="Todas">Todas</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.nombre.toUpperCase()}</option>)}
            </select>
          </div>
        </nav>

        <div className="mt-auto space-y-2">
          <button onClick={onBack} className="w-full bg-stone-100 py-4 text-[10px] font-bold uppercase hover:bg-black hover:text-white transition-all">Ver Tienda</button>
          <button onClick={handleLogout} className="w-full bg-red-50 text-red-600 py-4 text-[10px] font-bold uppercase hover:bg-red-600 hover:text-white transition-all">Salir</button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="ml-64 flex-1 p-12">
        <header className="flex justify-between items-end mb-12 border-b border-stone-200 pb-8">
          <div>
            <h1 className="text-6xl serif font-bold tracking-tighter">Inventario</h1>
            <p className="text-xs font-bold text-stone-400 uppercase tracking-[0.2em] mt-2">B.B.T. Licores - Mérida</p>
          </div>
          <div className="relative">
            <Icon name="search" className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-300" />
            <input 
              className="w-80 bg-white border border-stone-200 pl-12 pr-6 py-4 text-[10px] font-bold uppercase outline-none focus:border-black shadow-sm"
              placeholder="Buscar por SKU o Nombre..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </header>

        <div className="bg-white border border-stone-200 shadow-sm overflow-hidden">
          {/* CABECERA */}
          <div className="bg-stone-50 border-b border-stone-200 px-8 py-4 flex text-[9px] font-black uppercase tracking-widest text-stone-400">
            <div className="w-32 text-center">Multimedia</div>
            <div className="flex-1 ml-10">Producto / SKU</div>
            <div className="w-32 text-center">Modo Precio</div>
            <div className="w-24 text-center">Stock</div>
            <div className="w-56 text-right">Precio USD</div>
          </div>

          <div className="divide-y divide-stone-100">
            {loading ? (
              <div className="p-20 text-center uppercase text-[10px] font-black tracking-widest text-stone-300 animate-pulse">Sincronizando...</div>
            ) : filtered.map(p => {
              const editedPrice = tempPrices[p.sku];
              const hasChanges = editedPrice !== undefined && editedPrice !== p.precio_usd.toFixed(2);
              
              return (
                <div key={p.sku} className={`p-8 flex items-center gap-10 hover:bg-stone-50/40 transition-all ${updatingPrice === p.sku ? 'opacity-30' : ''}`}>
                  
                  {/* MULTIMEDIA */}
                  <div className="w-32 flex flex-col items-center gap-3">
                    <div className="w-24 h-24 bg-stone-50 border border-stone-100 relative flex items-center justify-center overflow-hidden rounded-sm">
                      {p.imagen_url ? (
                        <img src={p.imagen_url} className="h-full object-contain mix-blend-multiply" alt="" />
                      ) : (
                        <Icon name="image" className="text-stone-200 text-4xl" />
                      )}
                      {uploading === p.sku && (
                        <div className="absolute inset-0 bg-white/90 flex items-center justify-center">
                          <Icon name="sync" className="animate-spin text-black" />
                        </div>
                      )}
                    </div>
                    
                    <div className="flex flex-col w-full gap-1">
                      <div className="relative w-full">
                        <button className="w-full bg-stone-100 py-2 text-[8px] font-black uppercase tracking-tighter hover:bg-black hover:text-white transition-all flex items-center justify-center gap-1">
                          <Icon name="add_a_photo" className="text-xs" /> {p.imagen_url ? 'Cambiar' : 'Añadir'}
                        </button>
                        <input type="file" accept="image/*" onChange={(e) => handleUpload(e, p.sku)} className="absolute inset-0 opacity-0 cursor-pointer" />
                      </div>
                      {p.imagen_url && (
                        <button 
                          onClick={() => handleDeleteImage(p.sku, p.imagen_url)}
                          className="w-full bg-red-50 text-red-600 py-2 text-[8px] font-black uppercase tracking-tighter hover:bg-red-600 hover:text-white transition-all flex items-center justify-center gap-1"
                        >
                          <Icon name="delete" className="text-xs" /> Eliminar
                        </button>
                      )}
                    </div>
                  </div>

                  {/* INFO */}
                  <div className="flex-1 min-w-0">
                    <span className="text-[9px] font-black text-stone-300 uppercase block mb-1">SKU: {p.sku}</span>
                    <h3 className="serif text-xl text-stone-900 leading-tight truncate">{p.nombre}</h3>
                  </div>

                  {/* MODO PRECIO */}
                  <div className="w-32 text-center">
                    <button 
                      onClick={() => togglePriceLock(p.sku, p.precio_bloqueado)}
                      className={`flex flex-col items-center mx-auto transition-all ${p.precio_bloqueado ? 'text-orange-600' : 'text-stone-300 hover:text-black'}`}
                    >
                      <Icon name={p.precio_bloqueado ? "person_edit" : "sync_saved_locally"} className="text-3xl" />
                      <span className="text-[8px] font-black uppercase mt-2 tracking-tighter leading-none">
                        {p.precio_bloqueado ? 'MANUAL' : 'AUTO'}
                      </span>
                    </button>
                  </div>

                  {/* STOCK */}
                  <div className="w-24 text-center">
                    <div className={`text-xs font-black py-2 px-3 rounded-full border ${p.stock <= 3 ? 'bg-red-50 text-red-600 border-red-100 animate-pulse' : 'bg-stone-50 text-stone-500 border-stone-100'}`}>
                      {p.stock} <span className="text-[9px] ml-0.5">UND</span>
                    </div>
                  </div>

                  {/* PRECIO USD */}
                  <div className="w-56 text-right flex items-center justify-end gap-3">
                    {hasChanges && (
                      <div className="flex gap-1 animate-in zoom-in duration-200">
                        <button onClick={() => handlePriceUpdate(p.sku)} className="w-9 h-9 flex items-center justify-center bg-black text-white rounded-sm shadow-xl hover:scale-110 active:scale-95 transition-all">
                          <Icon name="done" />
                        </button>
                        <button onClick={() => setTempPrices(prev => { const n = {...prev}; delete n[p.sku]; return n; })} className="w-9 h-9 flex items-center justify-center bg-stone-200 text-stone-500 rounded-sm hover:bg-stone-300 transition-all">
                          <Icon name="close" />
                        </button>
                      </div>
                    )}
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 font-bold text-sm">$</span>
                      <input 
                        type="number"
                        step="0.01"
                        value={editedPrice ?? p.precio_usd.toFixed(2)}
                        onChange={(e) => setTempPrices(prev => ({...prev, [p.sku]: e.target.value}))}
                        className={`w-32 border py-3 pl-8 pr-4 text-right serif text-2xl font-bold outline-none transition-all rounded-sm ${hasChanges ? 'bg-orange-50 border-orange-300' : 'bg-stone-50 border-transparent focus:bg-white focus:border-black'}`}
                      />
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