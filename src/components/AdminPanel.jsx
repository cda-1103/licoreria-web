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
  const [loading, setLoading] = useState(true);
  const [tempPrices, setTempPrices] = useState({});
  const [uploading, setUploading] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newProd, setNewProd] = useState({
    sku: '', nombre: '', descripcion: '', precio_usd: '', stock: '', categoria_id: '', imagen_url: ''
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: p } = await supabase.from('productos').select('*').order('nombre');
      const { data: c } = await supabase.from('categorias').select('*').order('nombre');
      if (p) setProducts(p);
      if (c) setCategories(c);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const compressImage = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          let width = img.width;
          let height = img.height;
          if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => resolve(blob), 'image/webp', 0.7);
        };
      };
    });
  };

  const handleUpload = async (e, sku, isNew = false) => {
    const rawFile = e.target.files[0];
    if (!rawFile) return;
    if (!isNew) setUploading(sku); else setIsSaving(true);

    try {
      const compressedBlob = await compressImage(rawFile);
      const fileName = `${sku}-${Date.now()}.webp`;
      const { error: storageError } = await supabase.storage.from('fotos-productos').upload(fileName, compressedBlob, { contentType: 'image/webp' });
      if (storageError) throw storageError;
      const { data: { publicUrl } } = supabase.storage.from('fotos-productos').getPublicUrl(fileName);

      if (isNew) {
        setNewProd({ ...newProd, imagen_url: publicUrl });
      } else {
        await supabase.from('productos').update({ imagen_url: publicUrl }).eq('sku', sku);
        setProducts(prev => prev.map(p => p.sku === sku ? { ...p, imagen_url: publicUrl } : p));
      }
    } catch (err) { alert("Error: " + err.message); }
    finally { setUploading(null); setIsSaving(false); }
  };

  const handleConfirmPrice = async (sku) => {
    const price = parseFloat(tempPrices[sku]);
    try {
      await supabase.from('productos').update({ precio_usd: price, precio_bloqueado: true }).eq('sku', sku);
      setProducts(prev => prev.map(p => p.sku === sku ? { ...p, precio_usd: price, precio_bloqueado: true } : p));
      const n = { ...tempPrices }; delete n[sku]; setTempPrices(n);
    } catch (err) { alert(err.message); }
  };

  const togglePriceLock = async (sku, state) => {
    await supabase.from('productos').update({ precio_bloqueado: !state }).eq('sku', sku);
    setProducts(prev => prev.map(p => p.sku === sku ? { ...p, precio_bloqueado: !state } : p));
  };

  const filtered = useMemo(() => products.filter(p => {
    const mSearch = p.nombre.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase());
    const mCat = selectedCat === 'Todas' || p.categoria_id === selectedCat;
    return mSearch && mCat;
  }), [products, search, selectedCat]);

  return (
    <div className="flex min-h-screen bg-[#f4f4f4] text-stone-900 selection:bg-black selection:text-white relative">
      
      {/* SIDEBAR */}
      <aside className={`w-64 fixed h-full bg-white border-r border-stone-200 p-8 flex flex-col z-[100] transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <div className="mb-10 text-center border-b pb-6">
          <img src="/logo.JPG" className="w-24 mx-auto mix-blend-multiply" alt="Logo" />
          <p className="text-[10px] font-black uppercase tracking-widest mt-4 text-stone-400">Admin B.B.T.</p>
        </div>

        <div className="mb-10">
          <label className="text-[9px] font-black uppercase text-stone-400 block mb-2">Categoría</label>
          {/* text-base evita el zoom en móviles */}
          <select 
            value={selectedCat}
            onChange={(e) => { setSelectedCat(e.target.value); setIsSidebarOpen(false); }}
            className="w-full bg-stone-50 border border-stone-200 p-3 text-base font-bold uppercase outline-none focus:border-black rounded-none cursor-pointer"
          >
            <option value="Todas">Todo el Inventario</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.nombre.toUpperCase()}</option>)}
          </select>
        </div>

        <div className="mt-auto space-y-2">
          <button onClick={onBack} className="w-full bg-stone-100 py-4 text-[10px] font-bold uppercase flex items-center justify-center gap-2 mb-2 transition-colors hover:bg-black hover:text-white"><Icon name="storefront" /> Tienda</button>
          <button onClick={() => supabase.auth.signOut()} className="w-full bg-red-50 text-red-600 py-4 text-[10px] font-bold uppercase flex items-center justify-center gap-2"><Icon name="logout" /> Salir</button>
        </div>
      </aside>

      <main className="flex-1 p-6 md:p-12 md:ml-64 w-full">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 gap-6 border-b border-stone-200 pb-8">
          <div className="w-full md:w-auto flex justify-between items-center md:block">
            <h1 className="text-4xl md:text-6xl serif font-bold tracking-tighter">Inventario</h1>
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="md:hidden p-2 bg-white border rounded-sm"><Icon name={isSidebarOpen ? "close" : "menu"} className="text-2xl" /></button>
          </div>
          <div className="flex gap-4 w-full md:w-auto">
            <button onClick={() => setIsCreateOpen(true)} className="bg-black text-white px-6 py-4 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 flex-1 md:flex-none justify-center shadow-xl">
              <Icon name="add" /> Nuevo
            </button>
            <div className="relative flex-[2] md:w-80">
              <Icon name="search" className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-300" />
              <input 
                className="w-full bg-white border border-stone-200 pl-12 pr-6 py-4 text-base font-bold uppercase outline-none focus:border-black shadow-sm" 
                placeholder="BUSCAR..." 
                value={search} 
                onChange={(e) => setSearch(e.target.value)} 
              />
            </div>
          </div>
        </header>

        <div className="bg-white border shadow-sm rounded-sm overflow-hidden">
          <div className="divide-y divide-stone-100">
            {loading ? <div className="p-20 text-center text-stone-300 font-bold uppercase tracking-widest animate-pulse">Sincronizando...</div> : filtered.map(p => {
              const editedPrice = tempPrices[p.sku];
              const isModified = editedPrice !== undefined && editedPrice !== p.precio_usd.toFixed(2);
              
              return (
                <div key={p.sku} className="p-6 md:p-8 flex flex-col md:flex-row items-center gap-6 md:gap-10 hover:bg-stone-50/40 transition-colors">
                  <div className="w-28 flex flex-col items-center gap-2">
                    <div className="w-24 h-24 bg-stone-50 border relative flex items-center justify-center overflow-hidden">
                      {p.imagen_url ? <img src={p.imagen_url} className="h-full object-contain mix-blend-multiply" alt="" /> : <Icon name="image" className="text-stone-200 text-3xl" />}
                      {uploading === p.sku && <div className="absolute inset-0 bg-white/80 flex items-center justify-center animate-spin"><Icon name="sync" /></div>}
                    </div>
                    <label className="w-full bg-stone-100 py-2 flex justify-center cursor-pointer hover:bg-black hover:text-white transition-colors">
                      <Icon name="add_a_photo" className="text-xs" />
                      <input type="file" className="hidden" accept="image/*" onChange={(e) => handleUpload(e, p.sku)} />
                    </label>
                  </div>

                  <div className="flex-1 text-center md:text-left">
                    <span className="text-[9px] font-black text-stone-300 uppercase">SKU: {p.sku}</span>
                    <h3 className="serif text-xl text-stone-900 leading-tight">{p.nombre}</h3>
                  </div>

                  <div className="flex flex-wrap justify-center items-center gap-6">
                    {/* MEJORA: SWITCH PARA MODO PRECIO */}
                    <div className="flex flex-col items-center gap-1">
                      <button 
                        onClick={() => togglePriceLock(p.sku, p.precio_bloqueado)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${p.precio_bloqueado ? 'bg-orange-600' : 'bg-stone-200'}`}
                      >
                        <span className={`${p.precio_bloqueado ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`} />
                      </button>
                      <span className="text-[8px] font-black text-stone-400 uppercase tracking-tighter">
                        {p.precio_bloqueado ? 'MANUAL' : 'AUTO'}
                      </span>
                    </div>

                    <div className="text-xs font-black py-2 px-4 rounded-full border bg-stone-50">{p.stock} UND</div>
                    
                    <div className="flex items-center gap-2">
                      {isModified && (
                        <div className="flex gap-1 animate-in zoom-in duration-200">
                          <button onClick={() => handleConfirmPrice(p.sku)} className="w-10 h-10 bg-black text-white flex items-center justify-center rounded-sm"><Icon name="check" /></button>
                          <button onClick={() => setTempPrices(prev => { const n = {...prev}; delete n[p.sku]; return n; })} className="w-10 h-10 bg-stone-200 text-stone-500 flex items-center justify-center rounded-sm"><Icon name="close" /></button>
                        </div>
                      )}
                      <input 
                        type="number" 
                        step="0.01" 
                        value={editedPrice ?? p.precio_usd.toFixed(2)} 
                        onChange={(e) => setTempPrices({...tempPrices, [p.sku]: e.target.value})} 
                        className={`w-28 border py-2.5 text-right serif text-base font-bold bg-stone-50 focus:bg-white px-2 ${isModified ? 'border-orange-300' : 'border-transparent'}`} 
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* MODAL CREAR PRODUCTO */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsCreateOpen(false)} />
          <form onSubmit={(e) => { e.preventDefault(); handleCreateProduct(e); }} className="relative bg-white w-full max-w-lg p-10 shadow-2xl animate-in zoom-in-95 duration-200">
            <h2 className="serif text-3xl mb-8 border-b pb-4 text-center text-stone-900">Nuevo Registro</h2>
            
            <div className="flex justify-center mb-8">
              <label className="w-32 h-32 bg-stone-50 border-2 border-dashed flex flex-col items-center justify-center cursor-pointer relative overflow-hidden group">
                {newProd.imagen_url ? <img src={newProd.imagen_url} className="h-full object-contain mix-blend-multiply" alt="" /> : <><Icon name="add_a_photo" className="text-stone-300 text-3xl" /><span className="text-[8px] font-black text-stone-400 mt-2 uppercase">Añadir Foto</span></>}
                <input type="file" className="hidden" accept="image/*" onChange={(e) => handleUpload(e, 'new', true)} />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="col-span-2">
                <label className="text-[9px] font-black uppercase text-stone-400 block mb-1">Nombre Comercial</label>
                <input required className="w-full border-b py-2 text-base font-bold outline-none focus:border-black uppercase" value={newProd.nombre} onChange={e => setNewProd({...newProd, nombre: e.target.value})} />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-stone-400 block mb-1">SKU</label>
                <input required className="w-full border-b py-2 text-base font-bold outline-none focus:border-black uppercase" value={newProd.sku} onChange={e => setNewProd({...newProd, sku: e.target.value})} />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-stone-400 block mb-1">Categoría</label>
                <select required className="w-full border-b py-2 text-base font-bold bg-transparent outline-none focus:border-black" value={newProd.categoria_id} onChange={e => setNewProd({...newProd, categoria_id: e.target.value})}>
                  <option value="">Elegir...</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-stone-400 block mb-1">Precio USD</label>
                <input required type="number" step="0.01" className="w-full border-b py-2 text-base font-bold" value={newProd.precio_usd} onChange={e => setNewProd({...newProd, precio_usd: e.target.value})} />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-stone-400 block mb-1">Stock</label>
                <input required type="number" className="w-full border-b py-2 text-base font-bold" value={newProd.stock} onChange={e => setNewProd({...newProd, stock: e.target.value})} />
              </div>
            </div>

            <div className="mt-10 flex gap-4">
              <button type="submit" disabled={isSaving} className="flex-1 bg-black text-white py-5 text-[10px] font-black uppercase tracking-widest hover:bg-stone-800 transition-all">
                {isSaving ? 'GUARDANDO...' : 'REGISTRAR'}
              </button>
              <button type="button" onClick={() => setIsCreateOpen(false)} className="px-8 border border-stone-200 py-5 text-[10px] font-black uppercase hover:bg-stone-50 transition-all">Cancelar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}