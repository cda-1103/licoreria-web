import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

const Icon = ({ name, className = "" }) => (
  <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

export default function AdminPanel({ onBack }) {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState('Todas');
  const [uploading, setUploading] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    const { data: p } = await supabase.from('productos').select('*').order('nombre');
    const { data: c } = await supabase.from('categorias').select('*').order('nombre');
    if (p) setProducts(p);
    if (c) setCategories(c);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleUpload = async (e, sku) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      setUploading(sku);
      const fileName = `${sku}-${Date.now()}.${file.name.split('.').pop()}`;
      const { error: upErr } = await supabase.storage.from('fotos-productos').upload(fileName, file);
      if (upErr) throw upErr;

      const { data: { publicUrl } } = supabase.storage.from('fotos-productos').getPublicUrl(fileName);
      const { error: dbErr } = await supabase.from('productos').update({ imagen_url: publicUrl }).eq('sku', sku);
      if (dbErr) throw dbErr;

      fetchData();
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
    <div className="flex min-h-screen bg-[#f9f9f9]">
      <aside className="w-64 fixed h-full bg-stone-100 border-r border-stone-200 p-8 flex flex-col z-50">
        <div className="serif italic text-xl border-b border-black mb-10 pb-5">ADMIN PANEL</div>
        
        <div className="space-y-4">
          <div className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Filtrar Categoría</div>
          <select 
            className="w-full bg-white border border-stone-200 p-3 text-[10px] font-bold uppercase outline-none"
            onChange={(e) => setSelectedCat(e.target.value)}
          >
            <option value="Todas">Todas</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.nombre.toUpperCase()}</option>)}
          </select>
        </div>

        <button onClick={onBack} className="mt-auto border border-stone-300 py-4 text-[10px] font-bold uppercase tracking-widest hover:bg-white transition-all">Back to Store</button>
      </aside>

      <main className="ml-64 flex-1 p-12">
        <header className="flex justify-between items-end border-b border-stone-200 pb-10 mb-10">
          <div>
            <span className="text-[10px] uppercase tracking-[0.4em] text-stone-400 mb-2 block font-bold">Stock Control</span>
            <h1 className="text-6xl serif font-bold tracking-tight">Inventory</h1>
          </div>
          <div className="relative w-80">
            <Icon name="search" className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-300" />
            <input 
              className="w-full bg-white border border-stone-200 pl-12 pr-4 py-4 text-[10px] font-bold uppercase tracking-widest outline-none focus:ring-1 focus:ring-black"
              placeholder="SKU OR PRODUCT NAME..."
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </header>

        <div className="bg-white border border-stone-200 divide-y divide-stone-100">
          {loading ? <div className="p-20 text-center text-[10px] font-bold uppercase tracking-widest">Sincronizando...</div> :
            filtered.map(p => (
              <div key={p.sku} className="p-8 flex items-center gap-10 hover:bg-stone-50 transition-all">
                {/* Miniatura con Opción de Subir Foto */}
                <div className="w-24 h-24 bg-stone-50 border border-stone-100 relative group flex items-center justify-center p-2 overflow-hidden">
                  {p.imagen_url ? (
                    <img src={p.imagen_url} className="h-full object-contain mix-blend-multiply opacity-80" />
                  ) : <Icon name="image" className="text-stone-200 text-3xl" />}
                  
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Icon name="add_a_photo" className="text-white text-2xl" />
                    <input type="file" onChange={(e) => handleUpload(e, p.sku)} className="absolute inset-0 opacity-0 cursor-pointer" disabled={uploading === p.sku} />
                  </div>
                  {uploading === p.sku && <div className="absolute inset-0 bg-white/80 flex items-center justify-center animate-pulse"><Icon name="sync" className="animate-spin" /></div>}
                </div>

                <div className="flex-1">
                  <span className="text-[9px] font-bold text-stone-300 uppercase tracking-widest block">Ref: {p.sku}</span>
                  <h3 className="serif text-xl text-stone-800">{p.nombre}</h3>
                </div>

                <div className="w-32 text-center border-x border-stone-50">
                  <div className="text-[9px] font-black uppercase text-stone-400 mb-1">Existencia</div>
                  <div className={`font-bold ${p.stock < 12 ? 'text-orange-600' : 'text-stone-900'}`}>{p.stock} UNID.</div>
                </div>

                <div className="w-32 text-right">
                  <div className="text-[9px] font-black uppercase text-stone-400 mb-1">Precio Unit.</div>
                  <div className="serif text-xl font-bold text-stone-900">${p.precio_usd.toFixed(2)}</div>
                </div>
              </div>
            ))
          }
        </div>
      </main>
    </div>
  );
}