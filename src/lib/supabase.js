import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

function makeSvgThumb(label, bottleColor = '#1c1917', labelColor = '#f7f4ee') {
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="360" viewBox="0 0 280 360"><rect width="280" height="360" fill="#f7f4ee"/><rect x="116" y="42" width="48" height="38" rx="4" fill="#9a4d1c"/><path d="M116 80 L94 132 L94 304 Q94 318 108 318 L172 318 Q186 318 186 304 L186 132 L164 80 Z" fill="${bottleColor}"/><rect x="102" y="168" width="76" height="72" rx="2" fill="${labelColor}" stroke="#e2ddd2"/><text x="140" y="208" text-anchor="middle" font-family="Georgia, serif" font-size="11" font-weight="bold" fill="#141413">${label}</text></svg>`
  )}`;
}

function createMockSupabase() {
  console.warn('[AI Studio] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — using in-memory mock client');

  let nextOrderSeq = 1042;

  const tables = {
    configuracion: [
      { clave: 'whatsapp_pedidos', valor: '584247476273', ultima_actualizacion: new Date().toISOString() },
      { clave: 'tasa_bcv', valor: '45.50', ultima_actualizacion: new Date().toISOString() },
      { clave: 'horario_tienda', valor: 'Lun–Sáb 10:00 AM – 10:00 PM · Dom 11:00 AM – 7:00 PM', ultima_actualizacion: new Date().toISOString() },
    ],
    metodos_pago_info: [
      { metodo: 'Pago Móvil', datos_transferencia: 'Se envían al confirmar por WhatsApp', activo: true },
      { metodo: 'Zelle', datos_transferencia: 'Se envían al confirmar por WhatsApp', activo: true },
      { metodo: 'Efectivo USD', datos_transferencia: 'Pago contra entrega / retiro', activo: true },
      { metodo: 'Punto de Venta', datos_transferencia: 'Disponible en tienda / entrega', activo: true },
      { metodo: 'Binance Pay', datos_transferencia: 'Se envía Pay ID por WhatsApp', activo: true },
    ],
    categorias: [
      { id: 'cat-whisky', nombre: 'Whisky', slug: 'whisky', activo: true },
      { id: 'cat-ron', nombre: 'Ron Añejo', slug: 'ron-anejo', activo: true },
      { id: 'cat-vino', nombre: 'Vinos y Espumantes', slug: 'vinos-espumantes', activo: true },
      { id: 'cat-cerveza', nombre: 'Cervezas', slug: 'cervezas', activo: true },
      { id: 'cat-vodka', nombre: 'Vodka y Ginebra', slug: 'vodka-ginebra', activo: true },
      { id: 'cat-tequila', nombre: 'Tequila y Mezcal', slug: 'tequila-mezcal', activo: true },
    ],
    banners: [
      {
        id: 'ban-1',
        titulo: 'Selección de Whiskies de Reserva',
        subtitulo: 'Etiquetas de 12 y 18 años listas para entrega en Mérida o retiro inmediato en C.C. Millenium.',
        etiqueta: 'Destacados de Cava',
        texto_cta: 'Explorar Whiskies',
        imagen_url: '/src/assets/images/banner_whisky_reserve_1794935687160.jpg',
        enlace_tipo: 'categoria',
        enlace_valor: 'cat-whisky',
        orden: 1,
        activo: true,
      },
      {
        id: 'ban-2',
        titulo: 'Rones Venezolanos de Colección',
        subtitulo: 'Solera, Reserva Exclusiva y ediciones especiales con precio actualizado directo de cava.',
        etiqueta: 'Orgullo Nacional',
        texto_cta: 'Ver Rones',
        imagen_url: '/src/assets/images/banner_ron_venezolano_1794935687987.jpg',
        enlace_tipo: 'categoria',
        enlace_valor: 'cat-ron',
        orden: 2,
        activo: true,
      },
      {
        id: 'ban-3',
        titulo: 'Vinos y Espumantes Fríos',
        subtitulo: 'Tintos reserva, blancos frescos y espumantes para celebrar sin salir de casa.',
        etiqueta: 'Para Compartir',
        texto_cta: 'Ver Vinos',
        imagen_url: '/src/assets/images/banner_brindis_vino_1794935688908.jpg',
        enlace_tipo: 'categoria',
        enlace_valor: 'cat-vino',
        orden: 3,
        activo: true,
      },
    ],
    productos: [
      {
        id: 'prod-1',
        sku: 'BBT-001',
        nombre: "Buchanan's Deluxe 12 Años 750ml",
        descripcion: 'Blended Scotch Whisky suave con notas de miel, naranja y roble tostado.',
        precio_usd: 38.0,
        stock: 12,
        categoria_id: 'cat-whisky',
        destacado: true,
        activo: true,
        precio_bloqueado: false,
        imagen_url: makeSvgThumb('BUCHANANS 12', '#26211d'),
      },
      {
        id: 'prod-2',
        sku: 'BBT-002',
        nombre: 'Old Parr 12 Años 750ml',
        descripcion: 'Whisky escocés clásico de cuerpo robusto, especias y frutos maduros.',
        precio_usd: 34.5,
        stock: 8,
        categoria_id: 'cat-whisky',
        destacado: true,
        activo: true,
        precio_bloqueado: false,
        imagen_url: makeSvgThumb('OLD PARR 12', '#2c2219'),
      },
      {
        id: 'prod-3',
        sku: 'BBT-003',
        nombre: 'Santa Teresa 1796 Solera 750ml',
        descripcion: 'Ron venezolano triple añejado por método solera, seco y elegante.',
        precio_usd: 42.0,
        stock: 6,
        categoria_id: 'cat-ron',
        destacado: true,
        activo: true,
        precio_bloqueado: true,
        imagen_url: makeSvgThumb('ST 1796', '#331c13'),
      },
      {
        id: 'prod-4',
        sku: 'BBT-004',
        nombre: 'Diplomático Reserva Exclusiva 750ml',
        descripcion: 'Ron de melaza añejado hasta 12 años con notas de cacao, caramelo y piel de naranja.',
        precio_usd: 39.0,
        stock: 10,
        categoria_id: 'cat-ron',
        destacado: true,
        activo: true,
        precio_bloqueado: false,
        imagen_url: makeSvgThumb('DIPLOMATICO', '#1e3a2f'),
      },
      {
        id: 'prod-5',
        sku: 'BBT-005',
        nombre: 'Cacique Añejo 750ml',
        descripcion: 'Blend venezolano versátil ideal para cócteles y tragos largos.',
        precio_usd: 11.5,
        stock: 24,
        categoria_id: 'cat-ron',
        destacado: false,
        activo: true,
        precio_bloqueado: false,
        imagen_url: makeSvgThumb('CACIQUE', '#3f2818'),
      },
      {
        id: 'prod-6',
        sku: 'BBT-006',
        nombre: 'Casillero del Diablo Cabernet Sauvignon',
        descripcion: 'Vino tinto chileno con notas de cassis, ciruela negra y roble americano.',
        precio_usd: 14.0,
        stock: 15,
        categoria_id: 'cat-vino',
        destacado: false,
        activo: true,
        precio_bloqueado: false,
        imagen_url: makeSvgThumb('CASILLERO', '#3b151e'),
      },
      {
        id: 'prod-7',
        sku: 'BBT-007',
        nombre: 'Polar Pilsen Caja 36 Und (Retornable)',
        descripcion: 'Caja fría lista para retiro o delivery en Mérida.',
        precio_usd: 22.0,
        stock: 18,
        categoria_id: 'cat-cerveza',
        destacado: true,
        activo: true,
        precio_bloqueado: false,
        imagen_url: makeSvgThumb('POLAR PILSEN', '#1c2a3a'),
      },
      {
        id: 'prod-8',
        sku: 'BBT-008',
        nombre: 'Don Julio Reposado 750ml',
        descripcion: 'Tequila 100% agave azul reposado 8 meses en roble blanco americano.',
        precio_usd: 58.0,
        stock: 3,
        categoria_id: 'cat-tequila',
        destacado: true,
        activo: true,
        precio_bloqueado: true,
        imagen_url: makeSvgThumb('DON JULIO', '#292524'),
      },
      {
        id: 'prod-9',
        sku: 'BBT-009',
        nombre: 'Absolut Vodka Original 750ml',
        descripcion: 'Vodka sueco destilado de trigo de invierno, limpio y cristalino.',
        precio_usd: 21.0,
        stock: 9,
        categoria_id: 'cat-vodka',
        destacado: false,
        activo: true,
        precio_bloqueado: false,
        imagen_url: makeSvgThumb('ABSOLUT', '#27272a'),
      },
      {
        id: 'prod-10',
        sku: 'BBT-010',
        nombre: 'Johnnie Walker Black Label 750ml',
        descripcion: 'Whisky escocés de 12 años con carácter ahumado equilibrado y vainilla.',
        precio_usd: 36.0,
        stock: 2,
        categoria_id: 'cat-whisky',
        destacado: false,
        activo: true,
        precio_bloqueado: false,
        imagen_url: makeSvgThumb('JW BLACK', '#141413'),
      },
    ],
    pedidos: [
      {
        id: 'ord-demo-1',
        numero_orden: 1041,
        cliente_nombre: 'Andrea Mendoza',
        cliente_telefono: '0414-7552190',
        metodo_entrega: 'delivery',
        direccion_exacta: 'Res. El Rodeo, Torre B, Apto 4-2',
        referencia_entrega: 'Frente a la farmacia',
        latitud: 8.5892,
        longitud: -71.1604,
        distancia_km: 4.75,
        costo_delivery_usd: 2.0,
        estado: 'pagado',
        total_usd: 40.0,
        total_bs: 1820.0,
        tasa_bcv_momento: 45.5,
        metodo_pago_elegido: 'Pago Móvil',
        creado_en: new Date(Date.now() - 3600 * 1000).toISOString(),
      },
    ],
    detalles_pedido: [
      {
        id: 'det-demo-1',
        pedido_id: 'ord-demo-1',
        producto_id: 'prod-1',
        nombre_producto: "Buchanan's Deluxe 12 Años 750ml",
        cantidad: 1,
        precio_unitario_usd: 38.0,
      },
    ],
  };

  let currentSession = null;
  const authListeners = new Set();
  const uploadedFiles = new Map();

  const notifyAuth = (event, session) => {
    authListeners.forEach((cb) => {
      try {
        cb(event, session);
      } catch {
        // ignore
      }
    });
  };

  const makeQueryBuilder = (tableName) => {
    let op = 'select';
    let payload = null;
    let filters = [];
    let orderCol = null;
    let orderAsc = true;

    const execute = async () => {
      const list = tables[tableName] || [];
      if (op === 'select') {
        let result = list.filter((row) => filters.every(([col, val]) => row[col] === val));
        if (orderCol) {
          result.sort((a, b) => {
            const av = a[orderCol];
            const bv = b[orderCol];
            let cmp = 0;
            if (typeof av === 'number' && typeof bv === 'number') {
              cmp = av - bv;
            } else {
              cmp = String(av ?? '').localeCompare(String(bv ?? ''));
            }
            return orderAsc ? cmp : -cmp;
          });
        }
        return { data: result, error: null };
      }

      if (op === 'update') {
        const updated = [];
        tables[tableName] = list.map((row) => {
          const matches = filters.every(([col, val]) => row[col] === val);
          if (matches) {
            const next = { ...row, ...payload };
            updated.push(next);
            return next;
          }
          return row;
        });
        return { data: updated, error: null };
      }

      if (op === 'insert') {
        const items = (Array.isArray(payload) ? payload : [payload]).map((item, idx) => ({
          id: item.id || `${tableName}-${Date.now()}-${idx}`,
          ...item,
        }));
        tables[tableName] = [...list, ...items];
        return { data: items, error: null };
      }

      if (op === 'upsert') {
        const items = Array.isArray(payload) ? payload : [payload];
        for (const item of items) {
          const keyCol = tableName === 'configuracion' ? 'clave' : tableName === 'metodos_pago_info' ? 'metodo' : 'id';
          const existingIdx = tables[tableName].findIndex((r) => r[keyCol] === item[keyCol]);
          if (existingIdx >= 0) {
            tables[tableName][existingIdx] = { ...tables[tableName][existingIdx], ...item };
          } else {
            tables[tableName].push({ id: item.id || `${tableName}-${Date.now()}`, ...item });
          }
        }
        return { data: items, error: null };
      }

      if (op === 'delete') {
        tables[tableName] = list.filter((row) => !filters.every(([col, val]) => row[col] === val));
        return { data: null, error: null };
      }

      return { data: null, error: null };
    };

    const builder = {
      select() {
        op = 'select';
        return builder;
      },
      insert(data) {
        op = 'insert';
        payload = data;
        return builder;
      },
      upsert(data) {
        op = 'upsert';
        payload = data;
        return builder;
      },
      update(data) {
        op = 'update';
        payload = data;
        return builder;
      },
      delete() {
        op = 'delete';
        return builder;
      },
      eq(col, val) {
        filters.push([col, val]);
        return builder;
      },
      order(col, opts = {}) {
        orderCol = col;
        orderAsc = opts?.ascending !== false;
        return builder;
      },
      then(resolve, reject) {
        return execute().then(resolve, reject);
      },
    };

    return builder;
  };

  return {
    from: (tableName) => makeQueryBuilder(tableName),
    rpc: async (fnName, params = {}) => {
      if (fnName === 'crear_pedido_guest') {
        const items = Array.isArray(params.p_items) ? params.p_items : [];
        let subtotalUsd = 0;
        const detailsToInsert = [];

        for (const item of items) {
          const prod = tables.productos.find((p) => p.id === item.producto_id || p.sku === item.sku);
          if (!prod) continue;
          const qty = Math.max(1, Number(item.cantidad) || 1);
          subtotalUsd += prod.precio_usd * qty;
          detailsToInsert.push({
            producto_id: prod.id,
            nombre_producto: prod.nombre,
            cantidad: qty,
            precio_unitario_usd: prod.precio_usd,
          });
        }

        const deliveryUsd = Number(params.p_costo_delivery_usd) || 0;
        const totalUsd = Number((subtotalUsd + deliveryUsd).toFixed(2));
        const rate = Number(params.p_tasa_bcv_momento) || 1;
        const totalBs = Number((totalUsd * rate).toFixed(2));
        const orderId = `ord-${Date.now()}`;
        const orderNum = nextOrderSeq++;

        tables.pedidos.unshift({
          id: orderId,
          numero_orden: orderNum,
          cliente_nombre: params.p_cliente_nombre,
          cliente_telefono: params.p_cliente_telefono,
          metodo_entrega: params.p_metodo_entrega,
          direccion_exacta: params.p_direccion_exacta,
          referencia_entrega: params.p_referencia_entrega,
          latitud: params.p_latitud,
          longitud: params.p_longitud,
          distancia_km: params.p_distancia_km,
          costo_delivery_usd: deliveryUsd,
          estado: 'pendiente',
          total_usd: totalUsd,
          total_bs: totalBs,
          tasa_bcv_momento: rate,
          metodo_pago_elegido: params.p_metodo_pago_elegido,
          notas: params.p_notas,
          creado_en: new Date().toISOString(),
        });

        detailsToInsert.forEach((det, idx) => {
          tables.detalles_pedido.push({
            id: `det-${Date.now()}-${idx}`,
            pedido_id: orderId,
            ...det,
          });
        });

        return {
          data: {
            id: orderId,
            numero_orden: orderNum,
            subtotal_usd: subtotalUsd,
            costo_delivery_usd: deliveryUsd,
            total_usd: totalUsd,
            total_bs: totalBs,
          },
          error: null,
        };
      }
      return { data: null, error: null };
    },
    auth: {
      getSession: async () => ({ data: { session: currentSession }, error: null }),
      onAuthStateChange: (callback) => {
        authListeners.add(callback);
        return {
          data: {
            subscription: {
              unsubscribe: () => authListeners.delete(callback),
            },
          },
        };
      },
      signInWithPassword: async ({ email }) => {
        currentSession = {
          access_token: 'mock-token',
          user: { id: 'mock-admin', email },
        };
        notifyAuth('SIGNED_IN', currentSession);
        return { data: { session: currentSession, user: currentSession.user }, error: null };
      },
      signOut: async () => {
        currentSession = null;
        notifyAuth('SIGNED_OUT', null);
        return { error: null };
      },
    },
    storage: {
      from: () => ({
        upload: async (fileName, blob) => {
          const url = typeof URL !== 'undefined' && blob ? URL.createObjectURL(blob) : '/logo.png';
          uploadedFiles.set(fileName, url);
          return { data: { path: fileName }, error: null };
        },
        getPublicUrl: (fileName) => ({
          data: { publicUrl: uploadedFiles.get(fileName) || '/logo.png' },
        }),
      }),
    },
  };
}

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : createMockSupabase();