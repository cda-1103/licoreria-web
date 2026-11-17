import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  ShoppingBag,
  Lock,
  ShieldCheck,
  Plus,
  Minus,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Store,
  Truck,
  CheckCircle2,
  ExternalLink,
  ArrowUpDown,
  Package,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchBcvRate } from '../lib/bcvService';
import { STORE_COORDS, calculateDeliveryZone } from '../lib/delivery';
import DeliveryMapPicker from './DeliveryMapPicker';

const generateFallbackOrderId = () => `local-${Date.now()}`;
const generateFallbackOrderNum = () => Math.floor(1000 + Math.random() * 9000);

const formatPrice = (value) =>
  new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

const deduplicateProducts = (rows) => {
  const byName = new Map();
  for (const row of rows) {
    if (row.activo === false) continue;
    const key = String(row.nombre || '').trim().toLowerCase();
    if (!key) continue;
    const prev = byName.get(key);
    if (!prev) {
      byName.set(key, row);
      continue;
    }
    const prevTs = new Date(prev.ultima_sincronizacion || prev.actualizado_en || 0).getTime();
    const rowTs = new Date(row.ultima_sincronizacion || row.actualizado_en || 0).getTime();
    if (rowTs > prevTs) {
      byName.set(key, {
        ...row,
        imagen_url: row.imagen_url || prev.imagen_url,
      });
    } else if (!prev.imagen_url && row.imagen_url) {
      byName.set(key, { ...prev, imagen_url: row.imagen_url });
    }
  }
  return Array.from(byName.values());
};

const ProductBottleFallback = ({ title }) => (
  <div className="w-full h-full flex flex-col items-center justify-center bg-[#f8f6f1] text-[#5c5850] p-4 text-center">
    <Package className="w-8 h-8 stroke-[1.5] text-[#9a4d1c] mb-2" />
    <span className="text-[11px] font-medium line-clamp-2">{title}</span>
  </div>
);

export default function Storefront({ onAdminClick, session }) {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [banners, setBanners] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [configMap, setConfigMap] = useState({
    whatsapp_pedidos: '584247476273',
    horario_tienda: 'Lun–Sáb 10:00 AM – 10:00 PM · Dom 11:00 AM – 7:00 PM',
  });
  const [tasaBCV, setTasaBCV] = useState(45.5);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCat, setSelectedCat] = useState('Todas');
  const [onlyFeatured, setOnlyFeatured] = useState(false);
  const [sortBy, setSortBy] = useState('featured');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 16;

  const [heroIndex, setHeroIndex] = useState(0);
  const [quickViewProduct, setQuickViewProduct] = useState(null);

  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState('cart'); // 'cart' | 'checkout' | 'confirmed'

  // Guest Checkout state
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState('pick_up');
  const [address, setAddress] = useState('');
  const [reference, setReference] = useState('');
  const [coords, setCoords] = useState({ lat: STORE_COORDS.lat, lng: STORE_COORDS.lng });
  const [hasPickedPin, setHasPickedPin] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [confirmedOrder, setConfirmedOrder] = useState(null);

  const todayFormatted = useMemo(
    () =>
      new Date().toLocaleDateString('es-VE', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
    []
  );

  useEffect(() => {
    const loadStorefront = async () => {
      try {
        const [rate, prodRes, catRes, banRes, payRes, cfgRes] = await Promise.all([
          fetchBcvRate(),
          supabase.from('productos').select('*').order('nombre'),
          supabase.from('categorias').select('*').order('nombre'),
          supabase.from('banners').select('*').order('orden'),
          supabase.from('metodos_pago_info').select('*'),
          supabase.from('configuracion').select('*'),
        ]);

        if (rate) setTasaBCV(rate);

        if (prodRes?.data) {
          setProducts(deduplicateProducts(prodRes.data));
        }
        if (catRes?.data) {
          setCategories(catRes.data.filter((c) => c.activo !== false));
        }
        if (banRes?.data) {
          setBanners(banRes.data.filter((b) => b.activo !== false));
        }
        if (payRes?.data) {
          const activePay = payRes.data.filter((m) => m.activo !== false);
          setPaymentMethods(activePay);
          if (activePay.length > 0) setSelectedPayment(activePay[0].metodo);
        }
        if (cfgRes?.data) {
          const nextCfg = {};
          cfgRes.data.forEach((row) => {
            nextCfg[row.clave] = row.valor;
          });
          setConfigMap((prev) => ({ ...prev, ...nextCfg }));
        }
      } catch (err) {
        console.error('Error cargando catálogo:', err);
      } finally {
        setLoading(false);
      }
    };

    loadStorefront();

    const refreshInterval = setInterval(async () => {
      try {
        const { data } = await supabase.from('productos').select('*').order('nombre');
        if (data) setProducts(deduplicateProducts(data));
      } catch {
        // silent background refresh
      }
    }, 30000);

    return () => clearInterval(refreshInterval);
  }, []);

  const categoryNameById = useMemo(() => {
    const map = new Map();
    categories.forEach((c) => map.set(c.id, c.nombre));
    return map;
  }, [categories]);

  const activeBanners = useMemo(() => banners.filter((b) => b.activo !== false), [banners]);
  const primaryHeroBanner = activeBanners[heroIndex % Math.max(1, activeBanners.length)] || null;
  const secondaryBanners = useMemo(
    () => activeBanners.filter((b) => b.id !== primaryHeroBanner?.id).slice(0, 2),
    [activeBanners, primaryHeroBanner]
  );

  const filteredProducts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const list = products.filter((p) => {
      if ((p.stock ?? 0) <= 0) return false;
      if (selectedCat !== 'Todas' && p.categoria_id !== selectedCat) return false;
      if (onlyFeatured && !p.destacado) return false;
      if (!q) return true;
      const catName = (categoryNameById.get(p.categoria_id) || '').toLowerCase();
      return (
        p.nombre.toLowerCase().includes(q) ||
        (p.descripcion || '').toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q) ||
        catName.includes(q)
      );
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'price_asc') return Number(a.precio_usd) - Number(b.precio_usd);
      if (sortBy === 'price_desc') return Number(b.precio_usd) - Number(a.precio_usd);
      if (sortBy === 'name') return a.nombre.localeCompare(b.nombre);
      // 'featured'
      if (Boolean(b.destacado) !== Boolean(a.destacado)) return b.destacado ? 1 : -1;
      return a.nombre.localeCompare(b.nombre);
    });
  }, [products, searchTerm, selectedCat, onlyFeatured, sortBy, categoryNameById]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / itemsPerPage));
  const currentItems = useMemo(
    () => filteredProducts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage),
    [filteredProducts, currentPage]
  );

  const handleBannerAction = (banner) => {
    if (!banner) return;
    if (banner.enlace_tipo === 'categoria' && banner.enlace_valor) {
      setSelectedCat(banner.enlace_valor);
      setOnlyFeatured(false);
      setSearchTerm('');
      setCurrentPage(1);
    } else if (banner.enlace_tipo === 'busqueda' && banner.enlace_valor) {
      setSearchTerm(banner.enlace_valor);
      setSelectedCat('Todas');
      setCurrentPage(1);
    } else if (banner.enlace_tipo === 'producto' && banner.enlace_valor) {
      const target = products.find((p) => p.sku === banner.enlace_valor || p.id === banner.enlace_valor);
      if (target) setQuickViewProduct(target);
      return;
    }
    const el = document.getElementById('catalogo');
    el?.scrollIntoView({ behavior: 'smooth' });
  };

  const addToCart = (product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.sku === product.sku);
      if (existing) {
        return prev.map((item) =>
          item.sku === product.sku ? { ...item, qty: Math.min(item.qty + 1, product.stock) } : item
        );
      }
      return [...prev, { ...product, qty: 1 }];
    });
  };

  const updateQty = (sku, delta) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.sku !== sku) return item;
          const nextQty = Math.max(0, Math.min(item.qty + delta, item.stock));
          return { ...item, qty: nextQty };
        })
        .filter((item) => item.qty > 0)
    );
  };

  const getQtyInCart = (sku) => cart.find((item) => item.sku === sku)?.qty || 0;
  const totalItems = cart.reduce((acc, item) => acc + item.qty, 0);
  const subtotalUSD = cart.reduce((acc, item) => acc + Number(item.precio_usd) * item.qty, 0);

  const deliveryZone = useMemo(() => {
    if (deliveryMethod !== 'delivery' || !hasPickedPin) return null;
    return calculateDeliveryZone(coords.lat, coords.lng);
  }, [deliveryMethod, hasPickedPin, coords]);

  const deliveryFeeUSD = deliveryMethod === 'delivery' && deliveryZone && !deliveryZone.requiresQuote ? deliveryZone.costUsd : 0;
  const grandTotalUSD = subtotalUSD + deliveryFeeUSD;

  const openCartDrawer = (step = 'cart') => {
    setCheckoutError('');
    setCheckoutStep(step);
    setIsCartOpen(true);
  };

  const buildWhatsAppUrl = (orderNumber, finalTotals) => {
    const phone = (configMap.whatsapp_pedidos || '584247476273').replace(/\D/g, '');
    const itemsText = cart
      .map(
        (i) =>
          `• ${i.qty}x ${i.nombre} ($${formatPrice(i.precio_usd)} c/u = $${formatPrice(
            i.precio_usd * i.qty
          )})`
      )
      .join('\n');

    const lines = [
      `*PEDIDO #${orderNumber} — B.B.T. TIENDA DE LICORES*`,
      `--------------------------------`,
      `*Cliente:* ${customerName.trim()}`,
      `*Teléfono:* ${customerPhone.trim()}`,
      `*Modalidad:* ${deliveryMethod === 'pick_up' ? 'Retiro en Tienda (C.C. Millenium)' : 'Delivery Mérida'}`,
    ];

    if (deliveryMethod === 'delivery') {
      lines.push(`*Dirección:* ${address.trim()}`);
      if (reference.trim()) lines.push(`*Referencia:* ${reference.trim()}`);
      if (hasPickedPin) {
        lines.push(`*Ubicación Maps:* https://www.google.com/maps?q=${coords.lat},${coords.lng}`);
        if (deliveryZone) {
          lines.push(
            `*Zona Delivery (${deliveryZone.distanceKm} km):* ${
              deliveryZone.requiresQuote ? 'A consultar por WhatsApp' : `$${formatPrice(deliveryZone.costUsd)}`
            }`
          );
        }
      }
    } else {
      lines.push(`*Retiro:* ${STORE_COORDS.address}`);
    }

    lines.push(
      `--------------------------------`,
      `*Productos:*`,
      itemsText,
      `--------------------------------`,
      `*Subtotal:* $${formatPrice(finalTotals.subtotalUsd)}`,
      deliveryMethod === 'delivery'
        ? `*Delivery:* ${
            deliveryZone?.requiresQuote
              ? 'Por confirmar (>10 km)'
              : `$${formatPrice(finalTotals.deliveryUsd)}`
          }`
        : `*Delivery:* $0,00 (Retiro en tienda)`,
      `*TOTAL USD:* $${formatPrice(finalTotals.totalUsd)}`,
      `*TOTAL BS:* Bs. ${formatPrice(finalTotals.totalBs)} (Tasa BCV: ${formatPrice(tasaBCV)})`,
      `*Método de pago:* ${selectedPayment || 'Por definir'}`,
      orderNotes.trim() ? `*Notas:* ${orderNotes.trim()}` : null,
      `--------------------------------`,
      `Quedo atento para confirmar disponibilidad y datos de pago.`
    );

    const message = lines.filter(Boolean).join('\n');
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  };

  const handleConfirmOrder = async (e) => {
    e.preventDefault();
    setCheckoutError('');

    if (cart.length === 0) {
      setCheckoutError('Tu bolsa está vacía.');
      return;
    }
    if (!customerName.trim() || !customerPhone.trim()) {
      setCheckoutError('Ingresa tu nombre y teléfono de WhatsApp.');
      return;
    }
    if (deliveryMethod === 'delivery' && !address.trim()) {
      setCheckoutError('Ingresa la dirección exacta para el delivery.');
      return;
    }
    if (deliveryMethod === 'delivery' && !hasPickedPin) {
      setCheckoutError('Marca tu punto de entrega en el mapa o usa el botón de GPS.');
      return;
    }

    setSubmittingOrder(true);
    try {
      const rpcItems = cart.map((item) => ({
        producto_id: item.id || item.sku,
        sku: item.sku,
        cantidad: item.qty,
      }));

      let orderData = null;

      const { data: rpcResult, error: rpcError } = await supabase.rpc('crear_pedido_guest', {
        p_cliente_nombre: customerName.trim(),
        p_cliente_telefono: customerPhone.trim(),
        p_metodo_entrega: deliveryMethod,
        p_direccion_exacta: deliveryMethod === 'delivery' ? address.trim() : STORE_COORDS.address,
        p_referencia_entrega: deliveryMethod === 'delivery' ? reference.trim() : null,
        p_latitud: deliveryMethod === 'delivery' ? coords.lat : STORE_COORDS.lat,
        p_longitud: deliveryMethod === 'delivery' ? coords.lng : STORE_COORDS.lng,
        p_distancia_km: deliveryZone?.distanceKm ?? 0,
        p_costo_delivery_usd: deliveryFeeUSD,
        p_tasa_bcv_momento: tasaBCV,
        p_metodo_pago_elegido: selectedPayment || 'Por definir',
        p_notas: orderNotes.trim() || null,
        p_items: rpcItems,
      });

      if (!rpcError && rpcResult) {
        orderData = rpcResult;
      } else {
        // Fallback direct insert if SQL RPC hasn't been created yet on user's Supabase
        const totalUsd = Number(grandTotalUSD.toFixed(2));
        const totalBs = Number((totalUsd * tasaBCV).toFixed(2));
        const { data: insertedOrder, error: insertError } = await supabase
          .from('pedidos')
          .insert({
            cliente_nombre: customerName.trim(),
            cliente_telefono: customerPhone.trim(),
            metodo_entrega: deliveryMethod,
            direccion_exacta: deliveryMethod === 'delivery' ? address.trim() : STORE_COORDS.address,
            referencia_entrega: deliveryMethod === 'delivery' ? reference.trim() : null,
            latitud: deliveryMethod === 'delivery' ? coords.lat : STORE_COORDS.lat,
            longitud: deliveryMethod === 'delivery' ? coords.lng : STORE_COORDS.lng,
            distancia_km: deliveryZone?.distanceKm ?? 0,
            costo_delivery_usd: deliveryFeeUSD,
            total_usd: totalUsd,
            total_bs: totalBs,
            tasa_bcv_momento: tasaBCV,
            metodo_pago_elegido: selectedPayment || 'Por definir',
            estado: 'pendiente',
          })
          .select();

        if (insertError) throw insertError;
        const created = insertedOrder?.[0];
        if (created?.id) {
          await supabase.from('detalles_pedido').insert(
            cart.map((i) => ({
              pedido_id: created.id,
              producto_id: i.id || null,
              nombre_producto: i.nombre,
              cantidad: i.qty,
              precio_unitario_usd: i.precio_usd,
            }))
          );
        }
        orderData = {
          id: created?.id || generateFallbackOrderId(),
          numero_orden: created?.numero_orden || generateFallbackOrderNum(),
          subtotal_usd: subtotalUSD,
          costo_delivery_usd: deliveryFeeUSD,
          total_usd: totalUsd,
          total_bs: totalBs,
        };
      }

      const finalTotals = {
        subtotalUsd: subtotalUSD,
        deliveryUsd: deliveryFeeUSD,
        totalUsd: Number(orderData.total_usd ?? grandTotalUSD),
        totalBs: Number(orderData.total_bs ?? grandTotalUSD * tasaBCV),
      };

      const whatsappUrl = buildWhatsAppUrl(orderData.numero_orden, finalTotals);
      setConfirmedOrder({
        numeroOrden: orderData.numero_orden,
        whatsappUrl,
        ...finalTotals,
        requiresQuote: Boolean(deliveryZone?.requiresQuote),
      });
      setCheckoutStep('confirmed');
      setCart([]);

      // Attempt opening WhatsApp smoothly without breaking iframe environments
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setCheckoutError(err?.message || 'No pudimos registrar el pedido. Intenta nuevamente.');
    } finally {
      setSubmittingOrder(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f6f1] text-[#141413] flex flex-col uppercase">
      {/* Slim Utility Bar */}
      <div className="bg-[#141413] text-[#f8f6f1] px-4 md:px-8 h-8 flex items-center justify-between text-[11px] tracking-wide">
        <div className="flex items-center gap-3 whitespace-nowrap overflow-hidden">
          <span className="font-mono-num">
            TASA BCV: <strong className="text-[#e7b98a]">{formatPrice(tasaBCV)} BS</strong>
          </span>
          <span className="hidden sm:inline text-[#a39e93]" aria-hidden="true">
            ·
          </span>
          <span className="hidden sm:inline text-[#d6d1c6] truncate">{todayFormatted}</span>
        </div>
        <div className="hidden md:flex items-center gap-2 text-[#d6d1c6] whitespace-nowrap">
          <span>AV. ANDRÉS BELLO, C.C. MILLENIUM · MÉRIDA</span>
        </div>
      </div>

      {/* Main Sticky Header — 3-Zone Contract */}
      <header className="sticky top-0 z-40 bg-[#f8f6f1]/95 backdrop-blur-md border-b border-[#e2ddd2]">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between gap-3 sm:gap-8">
          {/* Zone 1: Brand Wordmark */}
          <a href="#top" className="flex items-center gap-3 shrink-0 whitespace-nowrap">
            <img src="/logo.png" alt="B.B.T. TIENDA DE LICORES" className="h-8 sm:h-9 w-auto object-contain" />
          </a>

          {/* Zone 2: Clean Nav Links */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#5c5850]">
            <a href="#catalogo" className="hover:text-[#141413] transition-colors whitespace-nowrap shrink-0">
              CATÁLOGO
            </a>
            <button
              type="button"
              onClick={() => {
                setOnlyFeatured(true);
                setSelectedCat('Todas');
                document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="hover:text-[#141413] transition-colors whitespace-nowrap shrink-0 cursor-pointer uppercase"
            >
              DESTACADOS
            </button>
            <a href="#zonas-entrega" className="hover:text-[#141413] transition-colors whitespace-nowrap shrink-0">
              DELIVERY Y TIENDA
            </a>
          </nav>

          {/* Zone 3: Bag Action + Subtle Admin Trigger */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => openCartDrawer('cart')}
              className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 bg-[#141413] text-[#f8f6f1] text-xs font-semibold rounded-sm hover:bg-[#9a4d1c] transition-colors whitespace-nowrap shrink-0 cursor-pointer uppercase"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>BOLSA ({totalItems})</span>
              {totalItems > 0 && (
                <span className="font-mono-num text-[#e7b98a] border-l border-white/20 pl-2">
                  ${formatPrice(subtotalUSD)}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={onAdminClick}
              aria-label="ACCESO ADMINISTRATIVO"
              title={session ? 'IR AL PANEL ADMIN' : 'ACCESO ADMINISTRADOR'}
              className="p-2.5 border border-[#e2ddd2] bg-white text-[#5c5850] hover:text-[#141413] hover:border-[#141413] rounded-sm transition-colors cursor-pointer"
            >
              {session ? <ShieldCheck className="w-4 h-4 text-[#1e3a2f]" /> : <Lock className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Hero + Administrable Promotional Banners */}
      {activeBanners.length > 0 && (
        <section id="top" className="max-w-7xl w-full mx-auto px-4 md:px-8 pt-6 pb-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
            {/* Primary Campaign Banner */}
            {primaryHeroBanner && (
              <div
                className={`${
                  secondaryBanners.length > 0 ? 'lg:col-span-8' : 'lg:col-span-12'
                } relative min-h-[280px] md:min-h-[360px] rounded-sm overflow-hidden border border-[#e2ddd2] bg-[#141413] group`}
              >
                {primaryHeroBanner.imagen_url ? (
                  <img
                    src={primaryHeroBanner.imagen_url}
                    alt={primaryHeroBanner.titulo}
                    referrerPolicy="no-referrer"
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
                  />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/15" />

                <div className="relative z-10 h-full flex flex-col justify-end p-6 md:p-10 max-w-2xl text-white">
                  {primaryHeroBanner.etiqueta && (
                    <span className="text-xs font-medium tracking-wider uppercase text-[#e7b98a] mb-2">
                      {primaryHeroBanner.etiqueta}
                    </span>
                  )}
                  <h1 className="font-display text-3xl md:text-4xl font-semibold leading-[1.12] tracking-tight text-balance mb-3">
                    {primaryHeroBanner.titulo}
                  </h1>
                  {primaryHeroBanner.subtitulo && (
                    <p className="text-sm text-stone-200 leading-relaxed mb-5 max-w-xl">
                      {primaryHeroBanner.subtitulo}
                    </p>
                  )}
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleBannerAction(primaryHeroBanner)}
                      className="px-5 py-2.5 bg-[#f8f6f1] text-[#141413] text-xs font-semibold rounded-sm hover:bg-[#e7b98a] transition-colors cursor-pointer"
                    >
                      {primaryHeroBanner.texto_cta || 'Ver selección'}
                    </button>
                  </div>
                </div>

                {activeBanners.length > 1 && (
                  <div className="absolute bottom-5 right-5 z-10 flex items-center gap-1.5">
                    <button
                      type="button"
                      aria-label="Banner anterior"
                      onClick={() => setHeroIndex((prev) => (prev - 1 + activeBanners.length) % activeBanners.length)}
                      className="p-2 bg-black/55 hover:bg-black/80 text-white rounded-sm border border-white/20 transition-colors cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Siguiente banner"
                      onClick={() => setHeroIndex((prev) => (prev + 1) % activeBanners.length)}
                      className="p-2 bg-black/55 hover:bg-black/80 text-white rounded-sm border border-white/20 transition-colors cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Secondary Promo Cards */}
            {secondaryBanners.length > 0 && (
              <div className="lg:col-span-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
                {secondaryBanners.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => handleBannerAction(b)}
                    className="relative min-h-[165px] rounded-sm overflow-hidden border border-[#e2ddd2] bg-[#141413] text-left group cursor-pointer"
                  >
                    {b.imagen_url && (
                      <img
                        src={b.imagen_url}
                        alt={b.titulo}
                        referrerPolicy="no-referrer"
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/15" />
                    <div className="relative z-10 h-full flex flex-col justify-end p-5 text-white">
                      {b.etiqueta && (
                        <span className="text-[11px] font-medium uppercase tracking-wider text-[#e7b98a] mb-1">
                          {b.etiqueta}
                        </span>
                      )}
                      <h2 className="font-display text-lg font-semibold leading-snug">{b.titulo}</h2>
                      <span className="text-xs text-stone-200 mt-1 underline underline-offset-4">
                        {b.texto_cta || 'Explorar'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Search, Categories & Filters */}
      <section id="catalogo" className="max-w-7xl w-full mx-auto px-4 md:px-8 pt-6 pb-4">
        <div className="bg-white border border-[#e2ddd2] rounded-sm p-3.5 sm:p-4 md:p-5 space-y-3.5 w-full min-w-0 overflow-hidden">
          <div className="flex flex-col md:flex-row gap-2.5 md:gap-3 items-stretch md:items-center justify-between w-full min-w-0">
            {/* Real-time Search */}
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-[#5c5850] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="BUSCAR WHISKY, RON, VINO O CERVEZA..."
                className="w-full min-w-0 pl-10 pr-9 py-2.5 text-xs sm:text-sm bg-[#f8f6f1] border border-[#e2ddd2] rounded-sm outline-none focus:border-[#141413] transition-colors uppercase placeholder:uppercase placeholder:text-xs sm:placeholder:text-sm"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setCurrentPage(1);
                  }}
                  aria-label="LIMPIAR BÚSQUEDA"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#5c5850] hover:text-[#141413] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Sort & Featured Filter */}
            <div className="grid grid-cols-1 min-[480px]:grid-cols-2 md:flex md:items-center gap-2 md:gap-2.5 w-full md:w-auto md:shrink-0 min-w-0">
              <button
                type="button"
                onClick={() => {
                  setOnlyFeatured((prev) => !prev);
                  setCurrentPage(1);
                }}
                className={`w-full md:w-auto px-3.5 py-2.5 text-xs font-semibold rounded-sm border transition-colors whitespace-nowrap text-center cursor-pointer uppercase ${
                  onlyFeatured
                    ? 'bg-[#9a4d1c] text-white border-[#9a4d1c]'
                    : 'bg-[#f8f6f1] text-[#141413] border-[#e2ddd2] hover:border-[#141413]'
                }`}
              >
                SOLO DESTACADOS
              </button>

              <div className="relative flex items-center w-full md:w-auto min-w-0">
                <ArrowUpDown className="w-3.5 h-3.5 text-[#5c5850] absolute left-3 pointer-events-none shrink-0" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-full md:w-auto max-w-full min-w-0 pl-8 pr-3 py-2.5 text-xs font-semibold bg-[#f8f6f1] border border-[#e2ddd2] rounded-sm outline-none focus:border-[#141413] cursor-pointer uppercase truncate"
                >
                  <option value="featured">ORDEN: DESTACADOS</option>
                  <option value="price_asc">PRECIO: MENOR A MAYOR</option>
                  <option value="price_desc">PRECIO: MAYOR A MENOR</option>
                  <option value="name">NOMBRE: A–Z</option>
                </select>
              </div>
            </div>
          </div>

          {/* Horizontal Category Bar */}
          <div className="flex items-center gap-2 w-full max-w-full min-w-0 overflow-x-auto no-scrollbar pt-2.5 border-t border-[#efece4]">
            <button
              type="button"
              onClick={() => {
                setSelectedCat('Todas');
                setCurrentPage(1);
              }}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-sm whitespace-nowrap shrink-0 transition-colors cursor-pointer uppercase ${
                selectedCat === 'Todas'
                  ? 'bg-[#141413] text-[#f8f6f1]'
                  : 'text-[#5c5850] hover:text-[#141413] hover:bg-[#f8f6f1]'
              }`}
            >
              TODAS
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setSelectedCat(cat.id);
                  setCurrentPage(1);
                }}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-sm whitespace-nowrap shrink-0 transition-colors cursor-pointer uppercase ${
                  selectedCat === cat.id
                    ? 'bg-[#141413] text-[#f8f6f1]'
                    : 'text-[#5c5850] hover:text-[#141413] hover:bg-[#f8f6f1]'
                }`}
              >
                {cat.nombre}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Product Grid */}
      <main className="max-w-7xl w-full mx-auto px-4 md:px-8 py-6 flex-1">
        <div className="flex items-center justify-between mb-5">
          <p className="text-xs text-[#5c5850]">
            {loading
              ? 'Cargando catálogo...'
              : `${filteredProducts.length} ${
                  filteredProducts.length === 1 ? 'producto disponible' : 'productos disponibles'
                }`}
          </p>
          {(selectedCat !== 'Todas' || searchTerm || onlyFeatured) && (
            <button
              type="button"
              onClick={() => {
                setSelectedCat('Todas');
                setSearchTerm('');
                setOnlyFeatured(false);
                setCurrentPage(1);
              }}
              className="text-xs font-semibold text-[#9a4d1c] hover:underline cursor-pointer"
            >
              Limpiar filtros
            </button>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {Array.from({ length: 8 }).map((_, idx) => (
              <div key={idx} className="bg-white border border-[#e2ddd2] rounded-sm p-4 animate-pulse">
                <div className="aspect-[3/4] bg-[#efece4] mb-4" />
                <div className="h-3 bg-[#efece4] w-1/3 mb-2" />
                <div className="h-4 bg-[#efece4] w-3/4 mb-4" />
                <div className="h-8 bg-[#efece4] w-full mt-auto" />
              </div>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="bg-white border border-[#e2ddd2] rounded-sm py-20 px-6 text-center">
            <Package className="w-10 h-10 text-[#5c5850] mx-auto mb-3 stroke-[1.5]" />
            <h3 className="font-display text-xl font-semibold mb-1">Sin resultados en stock</h3>
            <p className="text-sm text-[#5c5850] max-w-md mx-auto">
              No encontramos botellas disponibles con esos filtros. Prueba otra categoría o limpia tu búsqueda.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {currentItems.map((product) => {
                const qtyInCart = getQtyInCart(product.sku);
                const catName = categoryNameById.get(product.categoria_id) || 'Licores';
                const lowStock = product.stock <= 3;

                return (
                  <article
                    key={product.sku}
                    className={`bg-white border rounded-sm flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                      qtyInCart > 0 ? 'border-[#141413]' : 'border-[#e2ddd2]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setQuickViewProduct(product)}
                      className="aspect-[3/4] bg-[#f8f6f1] p-4 relative overflow-hidden flex items-center justify-center border-b border-[#efece4] cursor-pointer text-left w-full"
                    >
                      {product.imagen_url ? (
                        <img
                          src={product.imagen_url}
                          alt={product.nombre}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="h-full w-auto object-contain mix-blend-multiply transition-transform duration-300 hover:scale-105"
                        />
                      ) : (
                        <ProductBottleFallback title={product.nombre} />
                      )}
                    </button>

                    <div className="p-4 flex flex-col flex-1">
                      <div className="flex items-center justify-between gap-2 text-[11px] text-[#5c5850] mb-1">
                        <span className="truncate uppercase tracking-wider">{catName}</span>
                        {lowStock ? (
                          <span className="text-[#9a4d1c] font-semibold whitespace-nowrap">
                            Últimas {product.stock}
                          </span>
                        ) : product.destacado ? (
                          <span className="text-[#1e3a2f] font-semibold whitespace-nowrap">Destacado</span>
                        ) : null}
                      </div>

                      <button
                        type="button"
                        onClick={() => setQuickViewProduct(product)}
                        className="text-left cursor-pointer"
                      >
                        <h3 className="font-display text-sm md:text-base font-semibold leading-snug text-[#141413] line-clamp-2 min-h-[2.6rem] hover:text-[#9a4d1c] transition-colors">
                          {product.nombre}
                        </h3>
                      </button>

                      <div className="mt-auto pt-3 border-t border-[#efece4] space-y-3">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                          <span className="font-mono-num text-base sm:text-lg font-bold text-[#141413]">
                            ${formatPrice(product.precio_usd)}
                          </span>
                          <span className="font-mono-num text-[11px] sm:text-xs text-[#5c5850]">
                            BS. {formatPrice(product.precio_usd * tasaBCV)}
                          </span>
                        </div>

                        {qtyInCart === 0 ? (
                          <button
                            type="button"
                            onClick={() => addToCart(product)}
                            className="w-full py-2.5 px-3 bg-[#f8f6f1] border border-[#e2ddd2] hover:bg-[#141413] hover:text-white hover:border-[#141413] text-xs font-semibold rounded-sm transition-colors flex items-center justify-center gap-1.5 cursor-pointer uppercase"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            AGREGAR
                          </button>
                        ) : (
                          <div className="flex items-center justify-between border border-[#141413] bg-[#141413] text-white rounded-sm">
                            <button
                              type="button"
                              aria-label="Disminuir cantidad"
                              onClick={() => updateQty(product.sku, -1)}
                              className="p-2.5 hover:bg-[#9a4d1c] transition-colors cursor-pointer"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="font-mono-num text-xs font-bold px-2">
                              {qtyInCart} en bolsa
                            </span>
                            <button
                              type="button"
                              aria-label="Aumentar cantidad"
                              onClick={() => updateQty(product.sku, 1)}
                              disabled={qtyInCart >= product.stock}
                              className="p-2.5 hover:bg-[#9a4d1c] transition-colors disabled:opacity-40 cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className="mt-10 pt-6 border-t border-[#e2ddd2] flex items-center justify-center gap-4">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => {
                    setCurrentPage((p) => p - 1);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="px-3.5 py-2 border border-[#e2ddd2] bg-white rounded-sm text-xs font-semibold disabled:opacity-40 hover:border-[#141413] cursor-pointer"
                >
                  Anterior
                </button>
                <span className="font-mono-num text-xs text-[#5c5850]">
                  Página {currentPage} de {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => {
                    setCurrentPage((p) => p + 1);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="px-3.5 py-2 border border-[#e2ddd2] bg-white rounded-sm text-xs font-semibold disabled:opacity-40 hover:border-[#141413] cursor-pointer"
                >
                  Siguiente
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Store Location & Delivery Zones Section */}
      <section id="zonas-entrega" className="border-t border-[#e2ddd2] bg-white">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-12 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h2 className="font-display text-xl font-semibold mb-2">Retiro en Tienda</h2>
            <p className="text-sm text-[#5c5850] leading-relaxed mb-3">{STORE_COORDS.address}</p>
            <p className="text-xs text-[#5c5850] mb-3">{configMap.horario_tienda}</p>
            <a
              href={`https://www.google.com/maps?q=${STORE_COORDS.lat},${STORE_COORDS.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#9a4d1c] hover:underline"
            >
              Ver ubicación en Google Maps <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          <div className="md:col-span-2">
            <h2 className="font-display text-xl font-semibold mb-3">Tarifas de Delivery en Mérida</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 bg-[#f8f6f1] border border-[#e2ddd2] rounded-sm">
                <p className="text-xs text-[#5c5850] mb-1">Hasta 5 km</p>
                <p className="font-mono-num text-base font-bold text-[#141413]">$2,00</p>
              </div>
              <div className="p-3.5 bg-[#f8f6f1] border border-[#e2ddd2] rounded-sm">
                <p className="text-xs text-[#5c5850] mb-1">De 5 a 7 km</p>
                <p className="font-mono-num text-base font-bold text-[#141413]">$2,50</p>
              </div>
              <div className="p-3.5 bg-[#f8f6f1] border border-[#e2ddd2] rounded-sm">
                <p className="text-xs text-[#5c5850] mb-1">De 7 a 10 km</p>
                <p className="font-mono-num text-base font-bold text-[#141413]">$3,00</p>
              </div>
              <div className="p-3.5 bg-[#f8f6f1] border border-[#e2ddd2] rounded-sm">
                <p className="text-xs text-[#5c5850] mb-1">Más de 10 km</p>
                <p className="text-xs font-semibold text-[#9a4d1c] mt-1">Consultar por WhatsApp</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#e2ddd2] bg-[#f8f6f1] py-8 px-4 md:px-8 text-center">
        <p className="text-xs font-medium text-[#5c5850] mb-1">
          © {new Date().getFullYear()} B.B.T., C.A. · RIF: J-50144056-5 · Mérida, Venezuela
        </p>
        <p className="text-[11px] text-[#5c5850]">
          Prohibida la venta de alcohol a menores de 18 años. Disfruta con responsabilidad.
        </p>
      </footer>

      {/* Quick View Modal */}
      {quickViewProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-xs"
            onClick={() => setQuickViewProduct(null)}
          />
          <div className="relative bg-white border border-[#e2ddd2] rounded-sm w-full max-w-xl overflow-hidden shadow-2xl grid grid-cols-1 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setQuickViewProduct(null)}
              aria-label="Cerrar detalle"
              className="absolute top-3 right-3 z-10 p-1.5 bg-white/90 border border-[#e2ddd2] rounded-sm text-[#5c5850] hover:text-[#141413] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="bg-[#f8f6f1] p-6 flex items-center justify-center min-h-[240px]">
              {quickViewProduct.imagen_url ? (
                <img
                  src={quickViewProduct.imagen_url}
                  alt={quickViewProduct.nombre}
                  className="max-h-64 w-auto object-contain mix-blend-multiply"
                />
              ) : (
                <ProductBottleFallback title={quickViewProduct.nombre} />
              )}
            </div>

            <div className="p-6 flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center gap-2 text-[11px] text-[#5c5850] mb-1 uppercase">
                  <span>{categoryNameById.get(quickViewProduct.categoria_id) || 'LICORES'}</span>
                </div>
                <h3 className="font-display text-xl font-semibold leading-snug mb-2 uppercase">
                  {quickViewProduct.nombre}
                </h3>
                <p className="text-sm text-[#1e3a2f] font-semibold leading-relaxed uppercase">
                  DISPONIBLE POR DELIVERY O BUSCAR EN TIENDA
                </p>
              </div>

              <div className="pt-4 border-t border-[#efece4] space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="font-mono-num text-2xl font-bold text-[#141413]">
                    ${formatPrice(quickViewProduct.precio_usd)}
                  </span>
                  <span className="font-mono-num text-xs text-[#5c5850] uppercase">
                    BS. {formatPrice(quickViewProduct.precio_usd * tasaBCV)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      addToCart(quickViewProduct);
                      setQuickViewProduct(null);
                    }}
                    className="flex-1 py-3 px-4 bg-[#141413] text-white text-xs font-semibold rounded-sm hover:bg-[#9a4d1c] transition-colors cursor-pointer uppercase"
                  >
                    AGREGAR A LA BOLSA
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cart & One-Step Guest Checkout Drawer */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={() => setIsCartOpen(false)} />

          <div className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col border-l border-[#e2ddd2]">
            {/* Drawer Header */}
            <div className="px-6 py-4 border-b border-[#e2ddd2] flex items-center justify-between bg-[#f8f6f1]">
              <div>
                <h2 className="font-display text-xl font-semibold">
                  {checkoutStep === 'cart'
                    ? 'Tu Bolsa de Compra'
                    : checkoutStep === 'checkout'
                    ? 'Finalizar Pedido'
                    : 'Pedido Registrado'}
                </h2>
                {checkoutStep !== 'confirmed' && (
                  <p className="text-xs text-[#5c5850]">Compra directa sin crear cuenta</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsCartOpen(false)}
                aria-label="Cerrar bolsa"
                className="p-2 text-[#5c5850] hover:text-[#141413] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step 1: Cart Items */}
            {checkoutStep === 'cart' && (
              <>
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {cart.length === 0 ? (
                    <div className="py-20 text-center">
                      <ShoppingBag className="w-10 h-10 text-[#5c5850] mx-auto mb-3 stroke-[1.5]" />
                      <p className="text-sm font-medium mb-1">Tu bolsa está vacía</p>
                      <p className="text-xs text-[#5c5850]">
                        Agrega botellas del catálogo para calcular tu pedido en USD y Bolívares.
                      </p>
                    </div>
                  ) : (
                    cart.map((item) => (
                      <div
                        key={item.sku}
                        className="flex gap-3.5 items-center pb-4 border-b border-[#efece4]"
                      >
                        <div className="w-16 h-20 bg-[#f8f6f1] border border-[#e2ddd2] rounded-sm p-1.5 flex items-center justify-center shrink-0">
                          {item.imagen_url ? (
                            <img
                              src={item.imagen_url}
                              alt={item.nombre}
                              className="h-full object-contain mix-blend-multiply"
                            />
                          ) : (
                            <Package className="w-5 h-5 text-[#5c5850]" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-display text-sm font-semibold truncate">{item.nombre}</h4>
                          <p className="font-mono-num text-xs text-[#5c5850] mt-0.5">
                            ${formatPrice(item.precio_usd)} c/u · Sub: ${formatPrice(item.precio_usd * item.qty)}
                          </p>
                          <div className="flex items-center justify-between mt-2.5">
                            <div className="inline-flex items-center border border-[#e2ddd2] rounded-sm">
                              <button
                                type="button"
                                onClick={() => updateQty(item.sku, -1)}
                                className="p-1.5 hover:bg-[#f8f6f1] cursor-pointer"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="font-mono-num text-xs font-bold px-3">{item.qty}</span>
                              <button
                                type="button"
                                onClick={() => updateQty(item.sku, 1)}
                                disabled={item.qty >= item.stock}
                                className="p-1.5 hover:bg-[#f8f6f1] disabled:opacity-40 cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => updateQty(item.sku, -item.qty)}
                              aria-label="Eliminar producto"
                              className="p-1.5 text-[#5c5850] hover:text-red-700 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {cart.length > 0 && (
                  <div className="p-6 border-t border-[#e2ddd2] bg-[#f8f6f1] space-y-4">
                    <div className="flex items-end justify-between">
                      <span className="text-xs font-semibold text-[#5c5850]">Subtotal productos</span>
                      <div className="text-right">
                        <div className="font-mono-num text-2xl font-bold">${formatPrice(subtotalUSD)}</div>
                        <div className="font-mono-num text-xs text-[#5c5850]">
                          ≈ Bs. {formatPrice(subtotalUSD * tasaBCV)}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCheckoutStep('checkout')}
                      className="w-full py-3.5 bg-[#141413] text-white text-xs font-semibold rounded-sm hover:bg-[#9a4d1c] transition-colors cursor-pointer"
                    >
                      Continuar con Entrega y Pago
                    </button>
                  </div>
                )}
              </>
            )}

            {/* Step 2: One-Step Guest Checkout */}
            {checkoutStep === 'checkout' && (
              <form onSubmit={handleConfirmOrder} className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                  <button
                    type="button"
                    onClick={() => setCheckoutStep('cart')}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#5c5850] hover:text-[#141413] cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" /> Volver a la bolsa ({totalItems})
                  </button>

                  {/* Customer Info */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold mb-1">Nombre completo *</label>
                      <input
                        type="text"
                        required
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="EJ. PEDRO PÉREZ"
                        className="w-full px-3 py-2.5 text-sm bg-[#f8f6f1] border border-[#e2ddd2] rounded-sm outline-none focus:border-[#141413] uppercase placeholder:uppercase"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">TELÉFONO WHATSAPP *</label>
                      <input
                        type="tel"
                        required
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="EJ. 0424-7476273"
                        className="w-full px-3 py-2.5 text-sm bg-[#f8f6f1] border border-[#e2ddd2] rounded-sm outline-none focus:border-[#141413] uppercase placeholder:uppercase"
                      />
                    </div>
                  </div>

                  {/* Delivery Mode */}
                  <div>
                    <label className="block text-xs font-semibold mb-2">MODALIDAD DE ENTREGA *</label>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setDeliveryMethod('pick_up')}
                        className={`p-3 rounded-sm border text-left transition-colors cursor-pointer uppercase ${
                          deliveryMethod === 'pick_up'
                            ? 'bg-[#141413] text-white border-[#141413]'
                            : 'bg-[#f8f6f1] text-[#141413] border-[#e2ddd2]'
                        }`}
                      >
                        <div className="flex items-center gap-2 text-xs font-semibold">
                          <Store className="w-4 h-4" /> RETIRO EN TIENDA
                        </div>
                        <p className="text-[11px] opacity-80 mt-1">C.C. MILLENIUM · GRATIS</p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeliveryMethod('delivery')}
                        className={`p-3 rounded-sm border text-left transition-colors cursor-pointer uppercase ${
                          deliveryMethod === 'delivery'
                            ? 'bg-[#141413] text-white border-[#141413]'
                            : 'bg-[#f8f6f1] text-[#141413] border-[#e2ddd2]'
                        }`}
                      >
                        <div className="flex items-center gap-2 text-xs font-semibold">
                          <Truck className="w-4 h-4" /> DELIVERY MÉRIDA
                        </div>
                        <p className="text-[11px] opacity-80 mt-1">TARIFA SEGÚN DISTANCIA</p>
                      </button>
                    </div>
                  </div>

                  {deliveryMethod === 'pick_up' ? (
                    <div className="p-3.5 bg-[#f8f6f1] border border-[#e2ddd2] rounded-sm text-xs space-y-1">
                      <p className="font-semibold flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-[#9a4d1c]" /> PUNTO DE RETIRO
                      </p>
                      <p className="text-[#5c5850]">{STORE_COORDS.address}</p>
                    </div>
                  ) : (
                    <div className="space-y-3 pt-1">
                      <DeliveryMapPicker
                        coords={hasPickedPin ? coords : null}
                        onChange={(next) => {
                          setCoords(next);
                          setHasPickedPin(true);
                        }}
                      />

                      <div>
                        <label className="block text-xs font-semibold mb-1">DIRECCIÓN EXACTA *</label>
                        <input
                          type="text"
                          required
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          placeholder="URBANIZACIÓN, CALLE, EDIFICIO / CASA, APTO"
                          className="w-full px-3 py-2.5 text-sm bg-[#f8f6f1] border border-[#e2ddd2] rounded-sm outline-none focus:border-[#141413] uppercase placeholder:uppercase"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold mb-1">PUNTO DE REFERENCIA</label>
                        <input
                          type="text"
                          value={reference}
                          onChange={(e) => setReference(e.target.value)}
                          placeholder="EJ. PORTÓN NEGRO FRENTE A LA PANADERÍA"
                          className="w-full px-3 py-2.5 text-sm bg-[#f8f6f1] border border-[#e2ddd2] rounded-sm outline-none focus:border-[#141413] uppercase placeholder:uppercase"
                        />
                      </div>
                    </div>
                  )}

                  {/* Payment Method Selector */}
                  <div>
                    <label className="block text-xs font-semibold mb-1.5">MÉTODO DE PAGO PREFERIDO</label>
                    <div className="grid grid-cols-2 gap-2">
                      {paymentMethods.map((pm) => (
                        <button
                          key={pm.metodo}
                          type="button"
                          onClick={() => setSelectedPayment(pm.metodo)}
                          className={`px-3 py-2.5 text-xs font-semibold rounded-sm border text-left transition-colors cursor-pointer uppercase ${
                            selectedPayment === pm.metodo
                              ? 'border-[#9a4d1c] bg-[#f8f6f1] text-[#141413]'
                              : 'border-[#e2ddd2] bg-white text-[#5c5850] hover:text-[#141413]'
                          }`}
                        >
                          {pm.metodo}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-[#5c5850] mt-1.5">
                      LOS DATOS DE TRANSFERENCIA / PAGO SE COMPARTEN DIRECTAMENTE POR WHATSAPP AL CONFIRMAR.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">NOTAS ADICIONALES (OPCIONAL)</label>
                    <input
                      type="text"
                      value={orderNotes}
                      onChange={(e) => setOrderNotes(e.target.value)}
                      placeholder="EJ. SI NECESITAN HIELO O CAMBIO DE BILLETE"
                      className="w-full px-3 py-2 text-sm bg-[#f8f6f1] border border-[#e2ddd2] rounded-sm outline-none focus:border-[#141413] uppercase placeholder:uppercase"
                    />
                  </div>

                  {checkoutError && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-sm">
                      {checkoutError}
                    </div>
                  )}
                </div>

                {/* Sticky Checkout Summary Footer */}
                <div className="p-6 border-t border-[#e2ddd2] bg-[#f8f6f1] space-y-3">
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between text-[#5c5850]">
                      <span>Subtotal</span>
                      <span className="font-mono-num">${formatPrice(subtotalUSD)}</span>
                    </div>
                    <div className="flex justify-between text-[#5c5850]">
                      <span>Delivery</span>
                      <span className="font-mono-num">
                        {deliveryMethod === 'pick_up'
                          ? '$0,00'
                          : !hasPickedPin
                          ? 'Selecciona pin'
                          : deliveryZone?.requiresQuote
                          ? 'Consultar en WhatsApp'
                          : `$${formatPrice(deliveryFeeUSD)}`}
                      </span>
                    </div>
                    <div className="flex justify-between items-baseline pt-2 border-t border-[#e2ddd2]">
                      <span className="font-semibold text-sm">Total estimado</span>
                      <div className="text-right">
                        <span className="font-mono-num text-xl font-bold block">
                          ${formatPrice(grandTotalUSD)}
                        </span>
                        <span className="font-mono-num text-xs text-[#5c5850]">
                          Bs. {formatPrice(grandTotalUSD * tasaBCV)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submittingOrder}
                    className="w-full py-3.5 bg-[#1e3a2f] text-white text-xs font-semibold rounded-sm hover:bg-[#141413] transition-colors disabled:opacity-60 cursor-pointer"
                  >
                    {submittingOrder ? 'Registrando pedido...' : 'Confirmar Pedido por WhatsApp'}
                  </button>
                </div>
              </form>
            )}

            {/* Step 3: Confirmed Order Receipt */}
            {checkoutStep === 'confirmed' && confirmedOrder && (
              <div className="flex-1 p-6 flex flex-col justify-center items-center text-center space-y-5">
                <div className="w-12 h-12 rounded-full bg-[#1e3a2f]/10 text-[#1e3a2f] flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div>
                  <p className="text-xs font-mono-num uppercase text-[#5c5850] mb-1">
                    Orden #{confirmedOrder.numeroOrden}
                  </p>
                  <h3 className="font-display text-2xl font-semibold mb-2">Pedido registrado</h3>
                  <p className="text-sm text-[#5c5850] max-w-sm">
                    Envía el mensaje por WhatsApp para confirmar disponibilidad inmediata y recibir los datos de pago.
                  </p>
                </div>

                <div className="w-full bg-[#f8f6f1] border border-[#e2ddd2] rounded-sm p-4 text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-[#5c5850]">Total USD</span>
                    <span className="font-mono-num font-bold">${formatPrice(confirmedOrder.totalUsd)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#5c5850]">Total Bs (BCV)</span>
                    <span className="font-mono-num font-bold">Bs. {formatPrice(confirmedOrder.totalBs)}</span>
                  </div>
                  {confirmedOrder.requiresQuote && (
                    <p className="text-[#9a4d1c] pt-1 border-t border-[#e2ddd2]">
                      * Tarifa de delivery (&gt;10 km) se confirma directamente por WhatsApp.
                    </p>
                  )}
                </div>

                <div className="w-full space-y-2.5">
                  <a
                    href={confirmedOrder.whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3.5 bg-[#1e3a2f] text-white text-xs font-semibold rounded-sm hover:bg-[#141413] transition-colors flex items-center justify-center gap-2"
                  >
                    Abrir WhatsApp ahora <ExternalLink className="w-4 h-4" />
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmedOrder(null);
                      setIsCartOpen(false);
                    }}
                    className="w-full py-3 border border-[#e2ddd2] text-xs font-semibold rounded-sm hover:border-[#141413] cursor-pointer"
                  >
                    Volver al catálogo
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}