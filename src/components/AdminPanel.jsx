import React, { useState, useEffect, useMemo } from 'react';
import {
  ClipboardList,
  Package,
  Image as ImageIcon,
  Settings,
  Store,
  LogOut,
  Menu,
  X,
  Plus,
  Search,
  RefreshCw,
  Check,
  Camera,
  ExternalLink,
  Trash2,
  Star,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const generateFileName = (prefix) => `${prefix}-${Date.now()}.webp`;

const ORDER_STATUSES = [
  { value: 'pendiente', label: 'Pendiente', cls: 'text-amber-800 bg-amber-50 border-amber-200' },
  { value: 'pagado', label: 'Pagado', cls: 'text-blue-800 bg-blue-50 border-blue-200' },
  { value: 'despachado', label: 'Despachado', cls: 'text-indigo-800 bg-indigo-50 border-indigo-200' },
  { value: 'entregado', label: 'Entregado', cls: 'text-[#1e3a2f] bg-[#1e3a2f]/10 border-[#1e3a2f]/30' },
  { value: 'cancelado', label: 'Cancelado', cls: 'text-red-700 bg-red-50 border-red-200' },
];

const formatPrice = (value) =>
  new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

export default function AdminPanel({ onBack }) {
  const [activeTab, setActiveTab] = useState('pedidos'); // 'pedidos' | 'inventario' | 'banners' | 'config'
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [statusNotice, setStatusNotice] = useState('');

  // Data state
  const [orders, setOrders] = useState([]);
  const [orderDetails, setOrderDetails] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [banners, setBanners] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [configRows, setConfigRows] = useState([]);

  // Orders filter
  const [orderStatusFilter, setOrderStatusFilter] = useState('todos');

  // Inventory filters & edits
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState('Todas');
  const [tempPrices, setTempPrices] = useState({});
  const [uploadingSku, setUploadingSku] = useState(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSavingProd, setIsSavingProd] = useState(false);
  const [newProd, setNewProd] = useState({
    sku: '',
    nombre: '',
    descripcion: '',
    precio_usd: '',
    stock: '',
    categoria_id: '',
    imagen_url: '',
  });

  // Fina sync status
  const [finaStatus, setFinaStatus] = useState({ finaConfigured: false, tenantId: 'bbtiendadelicores' });
  const [finaEndpoint, setFinaEndpoint] = useState('');
  const [syncingFina, setSyncingFina] = useState(false);

  // Banner form state
  const [isBannerModalOpen, setIsBannerModalOpen] = useState(false);
  const [savingBanner, setSavingBanner] = useState(false);
  const [newBanner, setNewBanner] = useState({
    titulo: '',
    subtitulo: '',
    etiqueta: '',
    texto_cta: 'Explorar',
    imagen_url: '',
    enlace_tipo: 'categoria',
    enlace_valor: '',
    orden: 1,
  });

  // Config & payment edits
  const [configEdits, setConfigEdits] = useState({});
  const [newPaymentName, setNewPaymentName] = useState('');

  const showNotice = (msg, persist = false) => {
    setStatusNotice(msg);
    if (!persist) {
      setTimeout(() => setStatusNotice(''), 4500);
    }
  };

  useEffect(() => {
    const loadAll = async () => {
      try {
        const [ordRes, detRes, prodRes, catRes, banRes, payRes, cfgRes, finaRes] = await Promise.all([
          supabase.from('pedidos').select('*').order('creado_en', { ascending: false }),
          supabase.from('detalles_pedido').select('*'),
          supabase.from('productos').select('*').order('nombre'),
          supabase.from('categorias').select('*').order('nombre'),
          supabase.from('banners').select('*').order('orden'),
          supabase.from('metodos_pago_info').select('*'),
          supabase.from('configuracion').select('*'),
          fetch('/api/fina/status').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ]);

        if (ordRes?.data) setOrders(ordRes.data);
        if (detRes?.data) setOrderDetails(detRes.data);
        if (prodRes?.data) setProducts(prodRes.data);
        if (catRes?.data) setCategories(catRes.data);
        if (banRes?.data) setBanners(banRes.data);
        if (payRes?.data) setPaymentMethods(payRes.data);
        if (cfgRes?.data) {
          setConfigRows(cfgRes.data);
          const map = {};
          cfgRes.data.forEach((r) => {
            map[r.clave] = r.valor;
          });
          setConfigEdits(map);
        }
        if (finaRes) setFinaStatus(finaRes);
      } catch (err) {
        console.error('Error cargando panel admin:', err);
      } finally {
        setLoading(false);
      }
    };

    loadAll();

    const intervalId = setInterval(async () => {
      try {
        const [finaRes, prodRes] = await Promise.all([
          fetch('/api/fina/status').then((r) => (r.ok ? r.json() : null)).catch(() => null),
          supabase.from('productos').select('*').order('nombre'),
        ]);
        if (finaRes) setFinaStatus(finaRes);
        if (prodRes?.data) setProducts(prodRes.data);
      } catch {
        // ignore silent poll error
      }
    }, 30000);

    return () => clearInterval(intervalId);
  }, []);

  const compressImage = (file) =>
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1000;
          let { width, height } = img;
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => resolve(blob), 'image/webp', 0.78);
        };
      };
    });

  const handleProductUpload = async (e, sku, isNew = false) => {
    const rawFile = e.target.files?.[0];
    if (!rawFile) return;
    if (!isNew) setUploadingSku(sku);
    else setIsSavingProd(true);

    try {
      const compressedBlob = await compressImage(rawFile);
      const fileName = generateFileName(sku);
      const { error: storageError } = await supabase.storage
        .from('fotos-productos')
        .upload(fileName, compressedBlob, { contentType: 'image/webp' });
      if (storageError) throw storageError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('fotos-productos').getPublicUrl(fileName);

      if (isNew) {
        setNewProd((prev) => ({ ...prev, imagen_url: publicUrl }));
      } else {
        await supabase.from('productos').update({ imagen_url: publicUrl }).eq('sku', sku);
        setProducts((prev) => prev.map((p) => (p.sku === sku ? { ...p, imagen_url: publicUrl } : p)));
        showNotice('Imagen actualizada.');
      }
    } catch (err) {
      showNotice(`Error subiendo imagen: ${err.message}`);
    } finally {
      setUploadingSku(null);
      setIsSavingProd(false);
    }
  };

  const handleBannerUpload = async (e) => {
    const rawFile = e.target.files?.[0];
    if (!rawFile) return;
    setSavingBanner(true);
    try {
      const compressedBlob = await compressImage(rawFile);
      const fileName = generateFileName('banner');
      const { error: storageError } = await supabase.storage
        .from('fotos-productos')
        .upload(fileName, compressedBlob, { contentType: 'image/webp' });
      if (storageError) throw storageError;
      const {
        data: { publicUrl },
      } = supabase.storage.from('fotos-productos').getPublicUrl(fileName);
      setNewBanner((prev) => ({ ...prev, imagen_url: publicUrl }));
    } catch (err) {
      showNotice(`Error subiendo banner: ${err.message}`);
    } finally {
      setSavingBanner(false);
    }
  };

  const handleConfirmPrice = async (sku) => {
    const price = parseFloat(tempPrices[sku]);
    if (Number.isNaN(price) || price < 0) return;
    try {
      await supabase
        .from('productos')
        .update({ precio_usd: price, precio_bloqueado: true })
        .eq('sku', sku);
      setProducts((prev) =>
        prev.map((p) => (p.sku === sku ? { ...p, precio_usd: price, precio_bloqueado: true } : p))
      );
      setTempPrices((prev) => {
        const next = { ...prev };
        delete next[sku];
        return next;
      });
      showNotice(`Precio de ${sku} fijado manualmente.`);
    } catch (err) {
      showNotice(`Error guardando precio: ${err.message}`);
    }
  };

  const toggleProductField = async (sku, field, currentVal) => {
    const nextVal = !currentVal;
    await supabase.from('productos').update({ [field]: nextVal }).eq('sku', sku);
    setProducts((prev) => prev.map((p) => (p.sku === sku ? { ...p, [field]: nextVal } : p)));
  };

  const handleCreateProduct = async (e) => {
    e.preventDefault();
    setIsSavingProd(true);
    try {
      const record = {
        sku: newProd.sku.trim().toUpperCase(),
        nombre: newProd.nombre.trim(),
        descripcion: newProd.descripcion.trim(),
        precio_usd: parseFloat(newProd.precio_usd) || 0,
        stock: parseInt(newProd.stock, 10) || 0,
        categoria_id: newProd.categoria_id,
        imagen_url: newProd.imagen_url || '',
        precio_bloqueado: false,
        destacado: false,
        activo: true,
      };
      const { error } = await supabase.from('productos').insert([record]);
      if (error) throw error;
      setProducts((prev) => [...prev, record].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setNewProd({
        sku: '',
        nombre: '',
        descripcion: '',
        precio_usd: '',
        stock: '',
        categoria_id: '',
        imagen_url: '',
      });
      setIsCreateOpen(false);
      showNotice(`Producto ${record.sku} creado.`);
    } catch (err) {
      showNotice(`Error creando producto: ${err.message}`);
    } finally {
      setIsSavingProd(false);
    }
  };

  const handleFinaSync = async () => {
    setSyncingFina(true);
    try {
      const {
        data: { session: activeSession },
      } = await supabase.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (activeSession?.access_token) {
        headers.Authorization = `Bearer ${activeSession.access_token}`;
      }
      const res = await fetch('/api/fina/sync', {
        method: 'POST',
        headers,
        body: JSON.stringify({ endpoint: finaEndpoint.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showNotice(data.error || 'No se pudo sincronizar con Fina.', true);
      } else {
        showNotice(`Sincronización completa: ${data.synced} productos desde Fina (${data.source}).`);
        const { data: refreshed } = await supabase.from('productos').select('*').order('nombre');
        if (refreshed) setProducts(refreshed);
      }
    } catch {
      showNotice('Error de red comunicando con el servidor Fina.');
    } finally {
      setSyncingFina(false);
    }
  };

  const handleOrderStatusChange = async (orderId, nextStatus) => {
    await supabase.from('pedidos').update({ estado: nextStatus }).eq('id', orderId);
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, estado: nextStatus } : o)));
    showNotice(`Estado de orden actualizado a "${nextStatus}".`);
  };

  const handleCreateBanner = async (e) => {
    e.preventDefault();
    setSavingBanner(true);
    try {
      const record = {
        ...newBanner,
        orden: Number(newBanner.orden) || 1,
        activo: true,
      };
      const { data, error } = await supabase.from('banners').insert([record]).select();
      if (error) throw error;
      const inserted = data?.[0] || { ...record, id: `ban-${Date.now()}` };
      setBanners((prev) => [...prev, inserted].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)));
      setIsBannerModalOpen(false);
      setNewBanner({
        titulo: '',
        subtitulo: '',
        etiqueta: '',
        texto_cta: 'Explorar',
        imagen_url: '',
        enlace_tipo: 'categoria',
        enlace_valor: '',
        orden: 1,
      });
      showNotice('Banner creado.');
    } catch (err) {
      showNotice(`Error creando banner: ${err.message}`);
    } finally {
      setSavingBanner(false);
    }
  };

  const toggleBannerActive = async (id, current) => {
    await supabase.from('banners').update({ activo: !current }).eq('id', id);
    setBanners((prev) => prev.map((b) => (b.id === id ? { ...b, activo: !current } : b)));
  };

  const deleteBanner = async (id) => {
    await supabase.from('banners').delete().eq('id', id);
    setBanners((prev) => prev.filter((b) => b.id !== id));
    showNotice('Banner eliminado.');
  };

  const togglePaymentMethod = async (metodo, current) => {
    await supabase.from('metodos_pago_info').update({ activo: !current }).eq('metodo', metodo);
    setPaymentMethods((prev) =>
      prev.map((m) => (m.metodo === metodo ? { ...m, activo: !current } : m))
    );
  };

  const handleAddPaymentMethod = async (e) => {
    e.preventDefault();
    const label = newPaymentName.trim();
    if (!label) return;
    const record = {
      metodo: label,
      datos_transferencia: 'Coordinar datos por WhatsApp',
      activo: true,
    };
    await supabase.from('metodos_pago_info').upsert([record]);
    setPaymentMethods((prev) => [...prev.filter((m) => m.metodo !== label), record]);
    setNewPaymentName('');
    showNotice(`Método "${label}" agregado.`);
  };

  const handleSaveConfig = async (clave) => {
    const valor = configEdits[clave] ?? '';
    await supabase
      .from('configuracion')
      .upsert([{ clave, valor, ultima_actualizacion: new Date().toISOString() }]);
    setConfigRows((prev) => {
      const exists = prev.some((r) => r.clave === clave);
      if (exists) return prev.map((r) => (r.clave === clave ? { ...r, valor } : r));
      return [...prev, { clave, valor }];
    });
    showNotice(`Configuración "${clave}" guardada.`);
  };

  const filteredProducts = useMemo(
    () =>
      products.filter((p) => {
        const q = search.toLowerCase();
        const mSearch =
          p.nombre.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q);
        const mCat = selectedCat === 'Todas' || p.categoria_id === selectedCat;
        return mSearch && mCat;
      }),
    [products, search, selectedCat]
  );

  const filteredOrders = useMemo(
    () =>
      orders.filter((o) => orderStatusFilter === 'todos' || o.estado === orderStatusFilter),
    [orders, orderStatusFilter]
  );

  const detailsByOrderId = useMemo(() => {
    const map = new Map();
    orderDetails.forEach((d) => {
      if (!map.has(d.pedido_id)) map.set(d.pedido_id, []);
      map.get(d.pedido_id).push(d);
    });
    return map;
  }, [orderDetails]);

  return (
    <div className="flex min-h-screen bg-[#f8f6f1] text-[#141413] relative">
      {/* Sidebar */}
      <aside
        className={`w-64 fixed inset-y-0 left-0 bg-white border-r border-[#e2ddd2] p-6 flex flex-col z-40 transition-transform duration-200 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
      >
        <div className="pb-6 mb-6 border-b border-[#efece4] flex items-center justify-between">
          <div>
            <img src="/logo.png" alt="B.B.T." className="h-8 w-auto object-contain" />
            <p className="text-[11px] font-semibold text-[#5c5850] mt-2">Panel Operativo</p>
          </div>
          <button
            type="button"
            onClick={() => setIsSidebarOpen(false)}
            className="md:hidden p-1.5 text-[#5c5850]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="space-y-1 flex-1">
          {[
            { id: 'pedidos', label: 'Pedidos', icon: ClipboardList },
            { id: 'inventario', label: 'Inventario y Fina', icon: Package },
            { id: 'banners', label: 'Banners Home', icon: ImageIcon },
            { id: 'config', label: 'Configuración y Pagos', icon: Settings },
          ].map((tab) => {
            const TabIcon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setIsSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-xs font-semibold rounded-sm transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#141413] text-white'
                    : 'text-[#5c5850] hover:text-[#141413] hover:bg-[#f8f6f1]'
                }`}
              >
                <TabIcon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="pt-4 border-t border-[#efece4] space-y-2">
          <button
            type="button"
            onClick={onBack}
            className="w-full py-2.5 px-3 bg-[#f8f6f1] border border-[#e2ddd2] text-xs font-semibold rounded-sm flex items-center justify-center gap-2 hover:border-[#141413] cursor-pointer"
          >
            <Store className="w-4 h-4" /> Ver Tienda
          </button>
          <button
            type="button"
            onClick={() => supabase.auth.signOut()}
            className="w-full py-2.5 px-3 bg-red-50 text-red-700 border border-red-200 text-xs font-semibold rounded-sm flex items-center justify-center gap-2 hover:bg-red-100 cursor-pointer"
          >
            <LogOut className="w-4 h-4" /> Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 md:ml-64 p-4 md:p-10 max-w-6xl w-full">
        <div className="flex items-center justify-between gap-4 mb-6 md:hidden">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 bg-white border border-[#e2ddd2] rounded-sm"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-display font-semibold text-lg">Panel B.B.T.</span>
          <button
            type="button"
            onClick={onBack}
            className="text-xs font-semibold underline"
          >
            Tienda
          </button>
        </div>

        {statusNotice && (
          <div className="mb-6 p-3.5 bg-[#141413] text-[#f8f6f1] text-xs font-medium rounded-sm flex items-center justify-between">
            <span>{statusNotice}</span>
            <button type="button" onClick={() => setStatusNotice('')} className="text-[#e7b98a] cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* TAB 1: ORDERS */}
        {activeTab === 'pedidos' && (
          <section className="space-y-6">
            <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-[#e2ddd2]">
              <div>
                <h1 className="font-display text-3xl font-semibold">Control de Pedidos</h1>
                <p className="text-xs text-[#5c5850] mt-1">
                  El inventario se descuenta al facturar en Fina POS. Gestiona aquí el estado de entrega.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[{ value: 'todos', label: 'Todos' }, ...ORDER_STATUSES].map((st) => (
                  <button
                    key={st.value}
                    type="button"
                    onClick={() => setOrderStatusFilter(st.value)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-sm border cursor-pointer ${
                      orderStatusFilter === st.value
                        ? 'bg-[#141413] text-white border-[#141413]'
                        : 'bg-white text-[#5c5850] border-[#e2ddd2] hover:border-[#141413]'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </header>

            {loading ? (
              <div className="p-12 text-center text-xs text-[#5c5850]">Cargando pedidos...</div>
            ) : filteredOrders.length === 0 ? (
              <div className="bg-white border border-[#e2ddd2] rounded-sm p-12 text-center text-sm text-[#5c5850]">
                No hay pedidos en este estado.
              </div>
            ) : (
              <div className="space-y-4">
                {filteredOrders.map((order) => {
                  const items = detailsByOrderId.get(order.id) || [];
                  const statusMeta =
                    ORDER_STATUSES.find((s) => s.value === order.estado) || ORDER_STATUSES[0];

                  return (
                    <div
                      key={order.id}
                      className="bg-white border border-[#e2ddd2] rounded-sm p-5 space-y-4"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#efece4]">
                        <div>
                          <div className="flex items-center gap-2.5">
                            <span className="font-mono-num text-base font-bold">
                              Orden #{order.numero_orden}
                            </span>
                            <span className={`px-2 py-0.5 text-[11px] font-semibold border rounded-sm ${statusMeta.cls}`}>
                              {statusMeta.label}
                            </span>
                          </div>
                          <p className="text-xs text-[#5c5850] mt-1">
                            {order.cliente_nombre} · {order.cliente_telefono} ·{' '}
                            {order.metodo_entrega === 'delivery' ? 'Delivery' : 'Retiro en tienda'} ·{' '}
                            {order.metodo_pago_elegido || 'Pago por definir'}
                          </p>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="font-mono-num text-base font-bold">
                              ${formatPrice(order.total_usd)}
                            </p>
                            <p className="font-mono-num text-[11px] text-[#5c5850]">
                              Bs. {formatPrice(order.total_bs ?? order.total_usd * order.tasa_bcv_momento)}
                            </p>
                          </div>

                          <select
                            value={order.estado}
                            onChange={(e) => handleOrderStatusChange(order.id, e.target.value)}
                            className="px-2.5 py-2 text-xs font-semibold bg-[#f8f6f1] border border-[#e2ddd2] rounded-sm outline-none focus:border-[#141413] cursor-pointer"
                          >
                            {ORDER_STATUSES.map((s) => (
                              <option key={s.value} value={s.value}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {order.metodo_entrega === 'delivery' && (
                        <div className="text-xs text-[#5c5850] flex flex-wrap items-center gap-x-4 gap-y-1">
                          <span>
                            <strong className="text-[#141413]">Dirección:</strong> {order.direccion_exacta}
                          </span>
                          {order.referencia_entrega && (
                            <span>
                              <strong className="text-[#141413]">Ref:</strong> {order.referencia_entrega}
                            </span>
                          )}
                          {order.latitud && order.longitud && (
                            <a
                              href={`https://www.google.com/maps?q=${order.latitud},${order.longitud}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-semibold text-[#9a4d1c] hover:underline"
                            >
                              Ver mapa ({order.distancia_km ?? '?'} km) <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      )}

                      {items.length > 0 && (
                        <div className="bg-[#f8f6f1] border border-[#efece4] rounded-sm p-3 text-xs space-y-1">
                          {items.map((it) => (
                            <div key={it.id} className="flex justify-between font-mono-num">
                              <span className="font-sans">
                                <strong>{it.cantidad}x</strong> {it.nombre_producto || it.producto_id}
                              </span>
                              <span>${formatPrice(it.precio_unitario_usd * it.cantidad)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* TAB 2: INVENTORY & FINA */}
        {activeTab === 'inventario' && (
          <section className="space-y-6">
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-[#e2ddd2]">
              <div>
                <h1 className="font-display text-3xl font-semibold">Inventario y Fina POS</h1>
                <p className="text-xs text-[#5c5850] mt-1">
                  Tenant <span className="font-mono-num">{finaStatus.tenantId}</span> · Auto-sync cada{' '}
                  {finaStatus.autoSyncIntervalSec || 30}s
                  {finaStatus.lastSyncAt
                    ? ` · Última sync: ${new Date(finaStatus.lastSyncAt).toLocaleTimeString('es-VE')} (${finaStatus.lastSyncCount ?? 0} prod)`
                    : ''}
                  {finaStatus.lastSyncError ? ` · Error: ${finaStatus.lastSyncError}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <input
                  value={finaEndpoint}
                  onChange={(e) => setFinaEndpoint(e.target.value)}
                  placeholder="Endpoint Fina (ej. /api/pos/...)"
                  className="px-3 py-2 text-xs font-mono-num bg-white border border-[#e2ddd2] rounded-sm outline-none focus:border-[#141413] w-52"
                />
                <button
                  type="button"
                  onClick={handleFinaSync}
                  disabled={syncingFina}
                  className="px-4 py-2.5 bg-[#9a4d1c] text-white text-xs font-semibold rounded-sm hover:bg-[#141413] transition-colors inline-flex items-center gap-2 disabled:opacity-60 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncingFina ? 'animate-spin' : ''}`} />
                  {syncingFina ? 'Sincronizando...' : 'Sincronizar Fina POS'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(true)}
                  className="px-4 py-2.5 bg-[#141413] text-white text-xs font-semibold rounded-sm hover:bg-[#9a4d1c] transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Nuevo Producto
                </button>
              </div>
            </header>

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[#5c5850] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nombre o SKU..."
                  className="w-full pl-9 pr-4 py-2.5 text-sm bg-white border border-[#e2ddd2] rounded-sm outline-none focus:border-[#141413]"
                />
              </div>
              <select
                value={selectedCat}
                onChange={(e) => setSelectedCat(e.target.value)}
                className="px-3.5 py-2.5 text-xs font-semibold bg-white border border-[#e2ddd2] rounded-sm outline-none focus:border-[#141413]"
              >
                <option value="Todas">Todas las categorías</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-white border border-[#e2ddd2] rounded-sm divide-y divide-[#efece4]">
              {filteredProducts.map((p) => {
                const editedPrice = tempPrices[p.sku];
                const isModified =
                  editedPrice !== undefined && editedPrice !== Number(p.precio_usd).toFixed(2);

                return (
                  <div
                    key={p.sku}
                    className="p-4 md:p-5 flex flex-col md:flex-row md:items-center gap-4 justify-between"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="relative w-16 h-16 bg-[#f8f6f1] border border-[#e2ddd2] rounded-sm flex items-center justify-center shrink-0 overflow-hidden">
                        {p.imagen_url ? (
                          <img src={p.imagen_url} alt={p.nombre} className="h-full object-contain mix-blend-multiply" />
                        ) : (
                          <ImageIcon className="w-5 h-5 text-[#5c5850]" />
                        )}
                        <label
                          title="Cambiar foto"
                          className="absolute bottom-0 right-0 p-1 bg-white/90 border-t border-l border-[#e2ddd2] cursor-pointer hover:bg-[#141413] hover:text-white"
                        >
                          <Camera className="w-3 h-3" />
                          <input
                            type="file"
                            className="hidden"
                            accept="image/*"
                            onChange={(e) => handleProductUpload(e, p.sku)}
                          />
                        </label>
                        {uploadingSku === p.sku && (
                          <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-[11px] font-mono-num text-[#5c5850]">
                          <span>{p.sku}</span>
                          <span aria-hidden="true">·</span>
                          <span>Stock: {p.stock}</span>
                        </div>
                        <h3 className="font-display text-base font-semibold truncate">{p.nombre}</h3>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => toggleProductField(p.sku, 'destacado', p.destacado)}
                        className={`px-2.5 py-1.5 text-[11px] font-semibold rounded-sm border inline-flex items-center gap-1 cursor-pointer ${
                          p.destacado
                            ? 'bg-[#9a4d1c]/10 border-[#9a4d1c] text-[#9a4d1c]'
                            : 'bg-[#f8f6f1] border-[#e2ddd2] text-[#5c5850]'
                        }`}
                      >
                        <Star className="w-3 h-3" /> {p.destacado ? 'Destacado' : 'Normal'}
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleProductField(p.sku, 'precio_bloqueado', p.precio_bloqueado)}
                        className={`px-2.5 py-1.5 text-[11px] font-semibold rounded-sm border cursor-pointer ${
                          p.precio_bloqueado
                            ? 'bg-[#141413] text-white border-[#141413]'
                            : 'bg-[#f8f6f1] text-[#5c5850] border-[#e2ddd2]'
                        }`}
                      >
                        {p.precio_bloqueado ? 'Precio Manual' : 'Auto Fina'}
                      </button>

                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-[#5c5850]">$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={editedPrice ?? Number(p.precio_usd).toFixed(2)}
                          onChange={(e) =>
                            setTempPrices((prev) => ({ ...prev, [p.sku]: e.target.value }))
                          }
                          className="w-24 px-2.5 py-1.5 text-right font-mono-num text-sm font-semibold bg-[#f8f6f1] border border-[#e2ddd2] rounded-sm outline-none focus:border-[#141413]"
                        />
                        {isModified && (
                          <button
                            type="button"
                            onClick={() => handleConfirmPrice(p.sku)}
                            className="p-2 bg-[#1e3a2f] text-white rounded-sm cursor-pointer"
                            title="Guardar precio"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* TAB 3: BANNERS */}
        {activeTab === 'banners' && (
          <section className="space-y-6">
            <header className="flex items-end justify-between pb-5 border-b border-[#e2ddd2]">
              <div>
                <h1 className="font-display text-3xl font-semibold">Banners Promocionales</h1>
                <p className="text-xs text-[#5c5850] mt-1">
                  Administra los banners principales y campañas del Home sin tocar código.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsBannerModalOpen(true)}
                className="px-4 py-2.5 bg-[#141413] text-white text-xs font-semibold rounded-sm hover:bg-[#9a4d1c] inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Nuevo Banner
              </button>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {banners.map((b) => (
                <div
                  key={b.id}
                  className="bg-white border border-[#e2ddd2] rounded-sm overflow-hidden flex flex-col"
                >
                  <div className="h-40 bg-[#141413] relative">
                    {b.imagen_url && (
                      <img src={b.imagen_url} alt={b.titulo} className="w-full h-full object-cover" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
                    <div className="absolute bottom-3 left-4 right-4 text-white">
                      {b.etiqueta && (
                        <span className="text-[10px] uppercase tracking-wider text-[#e7b98a]">
                          {b.etiqueta}
                        </span>
                      )}
                      <h3 className="font-display text-lg font-semibold leading-tight">{b.titulo}</h3>
                    </div>
                  </div>
                  <div className="p-4 flex items-center justify-between gap-3">
                    <div className="text-xs text-[#5c5850] truncate">
                      Orden {b.orden} · Enlace: {b.enlace_tipo}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleBannerActive(b.id, b.activo)}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-sm border cursor-pointer ${
                          b.activo
                            ? 'bg-[#1e3a2f] text-white border-[#1e3a2f]'
                            : 'bg-[#f8f6f1] text-[#5c5850] border-[#e2ddd2]'
                        }`}
                      >
                        {b.activo ? 'Activo' : 'Oculto'}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteBanner(b.id)}
                        className="p-1.5 text-[#5c5850] hover:text-red-700 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* TAB 4: CONFIG & PAYMENT METHODS */}
        {activeTab === 'config' && (
          <section className="space-y-8">
            <header className="pb-5 border-b border-[#e2ddd2]">
              <h1 className="font-display text-3xl font-semibold">Configuración y Métodos de Pago</h1>
              <p className="text-xs text-[#5c5850] mt-1">
                Controla el número de WhatsApp receptor, tasa BCV de respaldo y métodos habilitados en el checkout.
              </p>
            </header>

            <div className="bg-white border border-[#e2ddd2] rounded-sm p-6 space-y-4">
              <h2 className="font-display text-xl font-semibold">Parámetros Generales</h2>
              {['whatsapp_pedidos', 'tasa_bcv', 'horario_tienda', ...configRows.map((c) => c.clave)]
                .filter((v, idx, arr) => arr.indexOf(v) === idx)
                .map((clave) => (
                  <div key={clave} className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <label className="w-48 text-xs font-mono-num font-semibold text-[#5c5850]">
                      {clave}
                    </label>
                    <input
                      value={configEdits[clave] ?? ''}
                      onChange={(e) =>
                        setConfigEdits((prev) => ({ ...prev, [clave]: e.target.value }))
                      }
                      className="flex-1 px-3 py-2 text-sm bg-[#f8f6f1] border border-[#e2ddd2] rounded-sm outline-none focus:border-[#141413]"
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveConfig(clave)}
                      className="px-4 py-2 bg-[#141413] text-white text-xs font-semibold rounded-sm hover:bg-[#9a4d1c] cursor-pointer"
                    >
                      Guardar
                    </button>
                  </div>
                ))}
            </div>

            <div className="bg-white border border-[#e2ddd2] rounded-sm p-6 space-y-4">
              <h2 className="font-display text-xl font-semibold">Métodos de Pago en Checkout</h2>
              <div className="divide-y divide-[#efece4]">
                {paymentMethods.map((pm) => (
                  <div key={pm.metodo} className="py-3 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold">{pm.metodo}</p>
                      <p className="text-xs text-[#5c5850]">{pm.datos_transferencia}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => togglePaymentMethod(pm.metodo, pm.activo)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-sm border cursor-pointer ${
                        pm.activo
                          ? 'bg-[#1e3a2f] text-white border-[#1e3a2f]'
                          : 'bg-[#f8f6f1] text-[#5c5850] border-[#e2ddd2]'
                      }`}
                    >
                      {pm.activo ? 'Activo' : 'Desactivado'}
                    </button>
                  </div>
                ))}
              </div>

              <form onSubmit={handleAddPaymentMethod} className="flex gap-2 pt-3 border-t border-[#efece4]">
                <input
                  value={newPaymentName}
                  onChange={(e) => setNewPaymentName(e.target.value)}
                  placeholder="Agregar método (ej. PayPal)"
                  className="flex-1 px-3 py-2 text-sm bg-[#f8f6f1] border border-[#e2ddd2] rounded-sm outline-none focus:border-[#141413]"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#141413] text-white text-xs font-semibold rounded-sm hover:bg-[#9a4d1c] cursor-pointer"
                >
                  Agregar
                </button>
              </form>
            </div>
          </section>
        )}
      </main>

      {/* Modal: Create Product */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsCreateOpen(false)} />
          <form
            onSubmit={handleCreateProduct}
            className="relative bg-white border border-[#e2ddd2] rounded-sm w-full max-w-lg p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center border-b border-[#efece4] pb-3">
              <h2 className="font-display text-2xl font-semibold">Nuevo Producto</h2>
              <button type="button" onClick={() => setIsCreateOpen(false)} className="cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex justify-center">
              <label className="w-28 h-28 bg-[#f8f6f1] border border-dashed border-[#e2ddd2] flex flex-col items-center justify-center cursor-pointer rounded-sm overflow-hidden">
                {newProd.imagen_url ? (
                  <img src={newProd.imagen_url} alt="" className="h-full object-contain" />
                ) : (
                  <>
                    <Camera className="w-5 h-5 text-[#5c5850] mb-1" />
                    <span className="text-[11px] text-[#5c5850]">Subir foto</span>
                  </>
                )}
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={(e) => handleProductUpload(e, newProd.sku || 'nuevo', true)}
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-semibold mb-1">Nombre *</label>
                <input
                  required
                  value={newProd.nombre}
                  onChange={(e) => setNewProd({ ...newProd, nombre: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-[#f8f6f1] border border-[#e2ddd2] rounded-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold mb-1">Descripción</label>
                <input
                  value={newProd.descripcion}
                  onChange={(e) => setNewProd({ ...newProd, descripcion: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-[#f8f6f1] border border-[#e2ddd2] rounded-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">SKU *</label>
                <input
                  required
                  value={newProd.sku}
                  onChange={(e) => setNewProd({ ...newProd, sku: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-[#f8f6f1] border border-[#e2ddd2] rounded-sm font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Categoría *</label>
                <select
                  required
                  value={newProd.categoria_id}
                  onChange={(e) => setNewProd({ ...newProd, categoria_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-[#f8f6f1] border border-[#e2ddd2] rounded-sm"
                >
                  <option value="">Elegir...</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Precio USD *</label>
                <input
                  required
                  type="number"
                  step="0.01"
                  value={newProd.precio_usd}
                  onChange={(e) => setNewProd({ ...newProd, precio_usd: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-[#f8f6f1] border border-[#e2ddd2] rounded-sm font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Stock *</label>
                <input
                  required
                  type="number"
                  value={newProd.stock}
                  onChange={(e) => setNewProd({ ...newProd, stock: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-[#f8f6f1] border border-[#e2ddd2] rounded-sm font-mono-num"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={isSavingProd}
                className="flex-1 py-3 bg-[#141413] text-white text-xs font-semibold rounded-sm hover:bg-[#9a4d1c] cursor-pointer"
              >
                {isSavingProd ? 'Guardando...' : 'Registrar Producto'}
              </button>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="px-5 py-3 border border-[#e2ddd2] text-xs font-semibold rounded-sm cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Create Banner */}
      {isBannerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsBannerModalOpen(false)} />
          <form
            onSubmit={handleCreateBanner}
            className="relative bg-white border border-[#e2ddd2] rounded-sm w-full max-w-lg p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center border-b border-[#efece4] pb-3">
              <h2 className="font-display text-2xl font-semibold">Nuevo Banner</h2>
              <button type="button" onClick={() => setIsBannerModalOpen(false)} className="cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Imagen de banner</label>
                <label className="flex items-center justify-center gap-2 p-4 border border-dashed border-[#e2ddd2] bg-[#f8f6f1] rounded-sm cursor-pointer text-xs font-semibold text-[#5c5850]">
                  <Camera className="w-4 h-4" />
                  {newBanner.imagen_url ? 'Imagen lista (clic para cambiar)' : 'Subir foto promocional'}
                  <input type="file" className="hidden" accept="image/*" onChange={handleBannerUpload} />
                </label>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Título *</label>
                <input
                  required
                  value={newBanner.titulo}
                  onChange={(e) => setNewBanner({ ...newBanner, titulo: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-[#f8f6f1] border border-[#e2ddd2] rounded-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Subtítulo</label>
                <input
                  value={newBanner.subtitulo}
                  onChange={(e) => setNewBanner({ ...newBanner, subtitulo: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-[#f8f6f1] border border-[#e2ddd2] rounded-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Etiqueta superior</label>
                  <input
                    value={newBanner.etiqueta}
                    onChange={(e) => setNewBanner({ ...newBanner, etiqueta: e.target.value })}
                    placeholder="Ej. Oferta Fin de Semana"
                    className="w-full px-3 py-2 text-sm bg-[#f8f6f1] border border-[#e2ddd2] rounded-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Texto botón</label>
                  <input
                    value={newBanner.texto_cta}
                    onChange={(e) => setNewBanner({ ...newBanner, texto_cta: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-[#f8f6f1] border border-[#e2ddd2] rounded-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Tipo enlace</label>
                  <select
                    value={newBanner.enlace_tipo}
                    onChange={(e) => setNewBanner({ ...newBanner, enlace_tipo: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-[#f8f6f1] border border-[#e2ddd2] rounded-sm"
                  >
                    <option value="categoria">Filtrar Categoría</option>
                    <option value="busqueda">Buscar Palabra</option>
                    <option value="ninguno">Sin enlace</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Destino</label>
                  {newBanner.enlace_tipo === 'categoria' ? (
                    <select
                      value={newBanner.enlace_valor}
                      onChange={(e) => setNewBanner({ ...newBanner, enlace_valor: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-[#f8f6f1] border border-[#e2ddd2] rounded-sm"
                    >
                      <option value="">Elegir categoría...</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={newBanner.enlace_valor}
                      onChange={(e) => setNewBanner({ ...newBanner, enlace_valor: e.target.value })}
                      placeholder="Ej. Old Parr"
                      className="w-full px-3 py-2 text-sm bg-[#f8f6f1] border border-[#e2ddd2] rounded-sm"
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={savingBanner}
                className="flex-1 py-3 bg-[#141413] text-white text-xs font-semibold rounded-sm hover:bg-[#9a4d1c] cursor-pointer"
              >
                {savingBanner ? 'Guardando...' : 'Publicar Banner'}
              </button>
              <button
                type="button"
                onClick={() => setIsBannerModalOpen(false)}
                className="px-5 py-3 border border-[#e2ddd2] text-xs font-semibold rounded-sm cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}