const FINA_API_BASE = 'https://api.finapartner.com';
const TENANT_ID = process.env.FINA_TENANT_ID || 'bbtiendadelicores';
const REFERER = `https://${TENANT_ID}.finapartner.com/`;
const TIMEZONE = 'America/Caracas';

let inMemoryFinaToken: string | null = null;

export function decodeJwtExp(token: string): number | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;

  try {
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }
    const jsonString = Buffer.from(base64, 'base64').toString('utf8');
    const payload = JSON.parse(jsonString);
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

export function isJwtExpired(token: string, bufferMinutes = 15): boolean {
  const expSeconds = decodeJwtExp(token);
  if (!expSeconds) return true;
  const nowSeconds = Math.floor(Date.now() / 1000);
  return expSeconds <= nowSeconds + bufferMinutes * 60;
}

function cleanSupabaseUrl(input?: string): string {
  let u = (input || '').trim().replace(/^["']+|["']+$/g, '').trim();
  if (!u) return '';
  if (u.includes('supabase.com/dashboard/project/')) {
    const match = u.match(/project\/([a-zA-Z0-9_-]+)/);
    if (match?.[1]) return `https://${match[1]}.supabase.co`;
  }
  if (/^[a-z0-9]{15,30}$/i.test(u)) return `https://${u}.supabase.co`;
  if (!u.startsWith('http://') && !u.startsWith('https://')) u = `https://${u}`;
  u = u.replace(/\/+$/, '').replace(/\/rest\/v1\/?$/, '').replace(/\/rest\/?$/, '').replace(/\/auth\/v1\/?$/, '');
  try {
    const p = new URL(u);
    return `${p.protocol}//${p.host}`;
  } catch {
    return u;
  }
}

function getSupabaseServerConfig() {
  const url = cleanSupabaseUrl(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  return { url, key };
}

export async function getCachedTokenFromSupabase(): Promise<string | null> {
  const { url, key } = getSupabaseServerConfig();
  if (!url || !key) return null;

  try {
    const res = await fetch(`${url}/rest/v1/fina_auth_cache?id=eq.1&select=x_access_token,expires_at`, {
      method: 'GET',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
    });

    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ x_access_token?: string }>;
    if (Array.isArray(data) && data.length > 0 && data[0].x_access_token) {
      const token = data[0].x_access_token;
      if (!isJwtExpired(token, 15)) return token;
    }
  } catch {
    // fallback gracefully
  }
  return null;
}

export async function saveTokenToSupabase(token: string): Promise<void> {
  const { url, key } = getSupabaseServerConfig();
  if (!url || !key || !token) return;

  const expSeconds = decodeJwtExp(token);
  const expiresAt = expSeconds
    ? new Date(expSeconds * 1000).toISOString()
    : new Date(Date.now() + 23 * 3600 * 1000).toISOString();

  try {
    await fetch(`${url}/rest/v1/fina_auth_cache`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        id: 1,
        x_access_token: token,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      }),
    });
  } catch {
    // ignore cache write failure
  }
}

export async function loginToFina(): Promise<string> {
  const email = process.env.FINA_EMAIL;
  const password = process.env.FINA_PASSWORD;

  if (!email || !password) {
    throw new Error('Configura FINA_EMAIL y FINA_PASSWORD en las variables de entorno del servidor.');
  }

  const res = await fetch(`${FINA_API_BASE}/api/auth/signin`, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/plain, */*',
      'content-type': 'application/json',
      tenantid: TENANT_ID,
      Referer: REFERER,
    },
    body: JSON.stringify({
      email,
      password,
      tenantId: TENANT_ID,
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Fina login error (${res.status}): ${errorBody}`);
  }

  const json = (await res.json()) as Record<string, any>;
  const token =
    json?.data?.token ||
    json?.data?.accessToken ||
    json?.token ||
    json?.accessToken ||
    json?.data?.xAccessToken ||
    null;

  if (!token) {
    throw new Error('Fina login exitoso pero no retornó token JWT.');
  }

  await saveTokenToSupabase(token);
  return token;
}

export async function getValidFinaToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh) {
    if (inMemoryFinaToken && !isJwtExpired(inMemoryFinaToken, 15)) {
      return inMemoryFinaToken;
    }
    const cached = await getCachedTokenFromSupabase();
    if (cached) {
      inMemoryFinaToken = cached;
      return cached;
    }
  }

  const newToken = await loginToFina();
  inMemoryFinaToken = newToken;
  return newToken;
}

export async function fetchFina(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const url = endpoint.startsWith('http')
    ? endpoint
    : `${FINA_API_BASE}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  let token = await getValidFinaToken();
  const reqHeaders = new Headers(options.headers || {});
  reqHeaders.set('accept', 'application/json, text/plain, */*');
  reqHeaders.set('tenantid', TENANT_ID);
  reqHeaders.set('Referer', REFERER);
  reqHeaders.set('timezone', TIMEZONE);
  reqHeaders.set('x-access-token', token);
  reqHeaders.delete('if-none-match');
  reqHeaders.delete('If-None-Match');

  let res = await fetch(url, { ...options, headers: reqHeaders });

  if (res.status === 401 || res.status === 403) {
    token = await getValidFinaToken(true);
    reqHeaders.set('x-access-token', token);
    res = await fetch(url, { ...options, headers: reqHeaders });
  }

  return res;
}

export function getFinaStatus() {
  const { url, key } = getSupabaseServerConfig();
  return {
    finaConfigured: Boolean(process.env.FINA_EMAIL && process.env.FINA_PASSWORD),
    supabaseConfigured: Boolean(url && key),
    tenantId: TENANT_ID,
  };
}

async function fetchAllFinaPages(
  buildPath: (page: number, pageSize: number) => string,
  extractKey: 'products' | 'data',
  pageSize = 100
): Promise<any[]> {
  const all: any[] = [];
  const maxPages = 50;

  for (let page = 1; page <= maxPages; page++) {
    const res = await fetchFina(buildPath(page, pageSize), { method: 'GET' });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Fina respondió HTTP ${res.status} en página ${page}: ${errText.slice(0, 160)}`);
    }

    const payload = (await res.json()) as any;
    const list = Array.isArray(payload?.[extractKey])
      ? payload[extractKey]
      : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.products)
      ? payload.products
      : [];

    if (list.length === 0) break;
    all.push(...list);

    const totalPages = Number(payload?.totalPages || payload?.pagination?.totalPages || 0);
    if (totalPages > 0 && page >= totalPages) break;
    if (list.length < pageSize) break;
  }

  return all;
}

function getPrincipalChannelPrice(product: any): number {
  const channels = product?.salesChannels && typeof product.salesChannels === 'object'
    ? Object.values(product.salesChannels)
    : [];

  const principal = channels.find(
    (ch: any) =>
      String(ch?.name || '').trim().toLowerCase() === 'principal' ||
      ch?.salesChannelId === '688913251860c52c656c4f8d'
  ) as any;

  if (principal && principal.sellingPrice !== undefined && principal.sellingPrice !== null) {
    return Number(principal.sellingPrice) || 0;
  }

  return Number(product?.sellingPrice ?? product?.price ?? 0) || 0;
}

function getInventoryStock(invItem: any): number {
  if (Array.isArray(invItem?.items) && invItem.items.length > 0) {
    const sumLots = invItem.items.reduce((acc: number, lot: any) => {
      if (typeof lot?.amount === 'number') return acc + lot.amount;
      if (Array.isArray(lot?.locationData)) {
        return acc + lot.locationData.reduce((s: number, loc: any) => s + (Number(loc?.amount) || 0), 0);
      }
      return acc;
    }, 0);
    return Math.max(0, Math.floor(sumLots));
  }

  if (Array.isArray(invItem?.skuVariations) && invItem.skuVariations.length > 0) {
    const varSum = invItem.skuVariations.reduce(
      (acc: number, v: any) => acc + (Number(v?.amountVariation) || 0),
      0
    );
    if (varSum > 0) return Math.floor(varSum);
  }

  return Math.max(0, Math.floor(Number(invItem?.totalAmount ?? invItem?.stock ?? invItem?.amount ?? 0)));
}

export async function syncFinaInventory(
  customEndpoint?: string,
  userJwt?: string
): Promise<{ synced: number; source: string; probe: string[] }> {
  const status = getFinaStatus();
  if (!status.finaConfigured) {
    throw new Error('Faltan credenciales de Fina (FINA_EMAIL / FINA_PASSWORD) en el servidor.');
  }

  // 1. Obtener precios de venta del Canal Principal
  const priceEndpointTemplate =
    (customEndpoint || process.env.FINA_PRODUCTS_ENDPOINT || '').trim() ||
    '/api/pos/sales-channel/products?currentPage={page}&pageSize={pageSize}&search=&type=item';

  const priceProducts = await fetchAllFinaPages(
    (page, pageSize) =>
      priceEndpointTemplate.includes('{page}')
        ? priceEndpointTemplate
            .replaceAll('{page}', String(page))
            .replaceAll('{pageSize}', String(pageSize))
        : `${priceEndpointTemplate}${priceEndpointTemplate.includes('?') ? '&' : '?'}currentPage=${page}&pageSize=${pageSize}`,
    'products',
    100
  );

  // 2. Obtener cantidades reales desde /api/inventory
  const inventoryItems = await fetchAllFinaPages(
    (page, pageSize) =>
      `/api/inventory?currentPage=${page}&pageSize=${pageSize}&search=&sortedColumn=updatedAt&sortedDirection=desc&useScore=false&useSecurityStock=false`,
    'data',
    100
  );

  // Mapear inventario completo por _id, SKU (lowercase) y nombre normalizado
  const invById = new Map<string, any>();
  const invBySku = new Map<string, any>();
  const invByName = new Map<string, any>();

  for (const inv of inventoryItems) {
    if (inv?._id) invById.set(String(inv._id).trim(), inv);
    if (inv?.SKU) {
      const s = String(inv.SKU).trim().toLowerCase();
      if (s) invBySku.set(s, inv);
    }
    if (inv?.name) {
      const n = String(inv.name).trim().toLowerCase();
      if (n) invByName.set(n, inv);
    }
  }

  type NormalizedSyncItem = {
    sku: string;
    alt_sku: string | null;
    nombre: string;
    precio_usd: number;
    stock: number;
    categoria_nombre: string;
  };

  const dedupMap = new Map<string, NormalizedSyncItem>();
  const seenNames = new Set<string>();

  for (const prod of priceProducts) {
    const prodId = prod?._id ? String(prod._id).trim() : '';
    const prodSku = prod?.SKU ? String(prod.SKU).trim() : '';
    const nameRaw = String(prod?.name || '').trim();
    if (!nameRaw) continue;

    const nameKey = nameRaw.toLowerCase();
    const matchedInv =
      (prodSku && invBySku.get(prodSku.toLowerCase())) ||
      (nameKey && invByName.get(nameKey)) ||
      (prodId && invById.get(prodId)) ||
      null;

    const invId = matchedInv?._id ? String(matchedInv._id).trim() : '';
    const invSku = matchedInv?.SKU ? String(matchedInv.SKU).trim() : '';

    // Usar SKU de código de barras si existe; si no, priorizar inv._id (ID canónico de inventario) sobre prod._id
    const sku = prodSku || invSku || invId || prodId;
    if (!sku) continue;

    const altSku = prodId && prodId !== sku ? prodId : null;
    const stock = matchedInv ? getInventoryStock(matchedInv) : 0;

    dedupMap.set(sku.toLowerCase(), {
      sku,
      alt_sku: altSku,
      nombre: nameRaw,
      precio_usd: getPrincipalChannelPrice(prod),
      stock: Math.max(0, Math.floor(stock)),
      categoria_nombre: String(prod?.category || matchedInv?.category || '').trim(),
    });
    seenNames.add(nameKey);
  }

  // Respaldo: incluir cualquier artículo presente en /api/inventory que no vino en sales-channel
  for (const inv of inventoryItems) {
    const nameRaw = String(inv?.name || '').trim();
    if (!nameRaw) continue;
    const nameKey = nameRaw.toLowerCase();
    if (seenNames.has(nameKey)) continue;

    const invId = inv?._id ? String(inv._id).trim() : '';
    const invSku = inv?.SKU ? String(inv.SKU).trim() : '';
    const sku = invSku || invId;
    if (!sku || dedupMap.has(sku.toLowerCase())) continue;

    dedupMap.set(sku.toLowerCase(), {
      sku,
      alt_sku: null,
      nombre: nameRaw,
      precio_usd: Number(inv?.sellingPrice ?? 0) || 0,
      stock: getInventoryStock(inv),
      categoria_nombre: String(inv?.category || '').trim(),
    });
    seenNames.add(nameKey);
  }

  const normalized = Array.from(dedupMap.values());

  const probeLog = [
    `Precios (Canal Principal): ${priceProducts.length} productos`,
    `Cantidades (/api/inventory): ${inventoryItems.length} registros`,
    `Productos unificados: ${normalized.length}`,
  ];

  const { url, key } = getSupabaseServerConfig();
  if (!url || !key) {
    return {
      synced: normalized.length,
      source: '/api/pos/sales-channel/products + /api/inventory',
      probe: probeLog,
    };
  }

  const authBearer = process.env.SUPABASE_SERVICE_ROLE_KEY ? key : userJwt || key;

  const rpcRes = await fetch(`${url}/rest/v1/rpc/sincronizar_productos_fina`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${authBearer}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_items: normalized }),
  });

  if (rpcRes.ok) {
    if (process.env.SUPABASE_SERVICE_ROLE_KEY || userJwt) {
      await cleanupDuplicateAndStaleRest(url, key, authBearer, normalized).catch(() => {});
    }
    return {
      synced: normalized.length,
      source: '/api/pos/sales-channel/products + /api/inventory',
      probe: probeLog,
    };
  }

  const errText = await rpcRes.text();
  if (rpcRes.status !== 404 && !errText.includes('PGRST202')) {
    throw new Error(`Error sincronizando con Supabase: ${errText}`);
  }

  // Fallback directo vía PostgREST cuando la función RPC aún no fue creada en Supabase
  await upsertProductsDirectRest(url, key, authBearer, normalized);

  return {
    synced: normalized.length,
    source: '/api/pos/sales-channel/products + /api/inventory (REST)',
    probe: probeLog,
  };
}

function slugifyCategory(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'general';
}

async function cleanupDuplicateAndStaleRest(
  url: string,
  key: string,
  authBearer: string,
  items: Array<{
    sku: string;
    alt_sku?: string | null;
    nombre: string;
  }>
): Promise<void> {
  const headers = {
    apikey: key,
    Authorization: `Bearer ${authBearer}`,
    'Content-Type': 'application/json',
  };

  const res = await fetch(
    `${url}/rest/v1/productos?select=id,sku,nombre,stock,precio_usd,precio_bloqueado,imagen_url,destacado,activo,ultima_sincronizacion&limit=10000`,
    { headers }
  );
  if (!res.ok) return;

  const existing = (await res.json()) as Array<{
    id: string;
    sku: string;
    nombre: string;
    stock?: number;
    precio_usd?: number;
    precio_bloqueado?: boolean;
    imagen_url?: string | null;
    destacado?: boolean;
    activo?: boolean;
    ultima_sincronizacion?: string | null;
  }>;

  const canonicalSkuSet = new Set(items.map((i) => i.sku.trim().toLowerCase()));
  const byName = new Map<string, typeof existing>();

  for (const row of existing) {
    const k = String(row.nombre || '').trim().toLowerCase();
    if (!k) continue;
    const arr = byName.get(k) || [];
    arr.push(row);
    byName.set(k, arr);
  }

  // 1. Eliminar o desactivar duplicados por nombre (conservando la fila con SKU canónico)
  for (const group of byName.values()) {
    if (group.length <= 1) continue;
    const sorted = [...group].sort((a, b) => {
      const aCanon = canonicalSkuSet.has(String(a.sku || '').trim().toLowerCase()) ? 1 : 0;
      const bCanon = canonicalSkuSet.has(String(b.sku || '').trim().toLowerCase()) ? 1 : 0;
      if (bCanon !== aCanon) return bCanon - aCanon;
      return (b.imagen_url ? 1 : 0) - (a.imagen_url ? 1 : 0);
    });

    const keeper = sorted[0];
    const dups = sorted.slice(1);

    // Preservar imagen/destacado/precio_bloqueado si estaban en un duplicado
    const patchKeeper: Record<string, any> = {};
    for (const d of dups) {
      if (!keeper.imagen_url && d.imagen_url && !patchKeeper.imagen_url) patchKeeper.imagen_url = d.imagen_url;
      if (!keeper.destacado && d.destacado) patchKeeper.destacado = true;
      if (!keeper.precio_bloqueado && d.precio_bloqueado) {
        patchKeeper.precio_bloqueado = true;
        patchKeeper.precio_usd = d.precio_usd;
      }
    }
    if (Object.keys(patchKeeper).length > 0) {
      await fetch(`${url}/rest/v1/productos?id=eq.${keeper.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(patchKeeper),
      });
    }

    for (const d of dups) {
      const delRes = await fetch(`${url}/rest/v1/productos?id=eq.${d.id}`, {
        method: 'DELETE',
        headers,
      });
      if (!delRes.ok) {
        await fetch(`${url}/rest/v1/productos?id=eq.${d.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ activo: false, stock: 0 }),
        });
      }
    }
  }

  // 2. Desactivar productos huérfanos de Fina que ya no están en el catálogo actual (si fue sync completo)
  if (items.length >= 50) {
    const staleIds = existing
      .filter((row) => {
        const skuLower = String(row.sku || '').trim().toLowerCase();
        const looksLikeFina = /^[0-9a-f]{24}$/i.test(skuLower) || Boolean(row.ultima_sincronizacion);
        return looksLikeFina && !canonicalSkuSet.has(skuLower) && (row.activo !== false || Number(row.stock || 0) > 0);
      })
      .map((r) => r.id);

    for (let i = 0; i < staleIds.length; i += 100) {
      const slice = staleIds.slice(i, i + 100);
      const inList = slice.map((id) => `"${id}"`).join(',');
      await fetch(`${url}/rest/v1/productos?id=in.(${inList})`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ activo: false, stock: 0 }),
      });
    }
  }
}

async function upsertProductsDirectRest(
  url: string,
  key: string,
  authBearer: string,
  items: Array<{
    sku: string;
    alt_sku?: string | null;
    nombre: string;
    precio_usd: number;
    stock: number;
    categoria_nombre: string;
  }>
): Promise<void> {
  const headers = {
    apikey: key,
    Authorization: `Bearer ${authBearer}`,
    'Content-Type': 'application/json',
  };

  // 1. Leer categorías actuales
  const catRes = await fetch(`${url}/rest/v1/categorias?select=id,nombre,slug&limit=1000`, {
    headers,
  });
  if (!catRes.ok) {
    throw new Error(`Error leyendo categorías de Supabase: ${await catRes.text()}`);
  }
  const existingCats = (await catRes.json()) as Array<{ id: string; nombre: string; slug: string }>;
  const catByLower = new Map<string, string>();
  existingCats.forEach((c) => {
    if (c.nombre) catByLower.set(c.nombre.trim().toLowerCase(), c.id);
  });

  // Crear categorías faltantes
  const missingCatNames = Array.from(
    new Set(items.map((i) => i.categoria_nombre.trim()).filter((n) => n && !catByLower.has(n.toLowerCase())))
  );

  if (missingCatNames.length > 0) {
    const toInsert = missingCatNames.map((nombre) => ({
      nombre,
      slug: slugifyCategory(nombre),
      activo: true,
    }));
    const insCatRes = await fetch(`${url}/rest/v1/categorias?on_conflict=nombre`, {
      method: 'POST',
      headers: {
        ...headers,
        Prefer: 'resolution=ignore-duplicates,return=representation',
      },
      body: JSON.stringify(toInsert),
    });
    if (insCatRes.ok) {
      const createdCats = (await insCatRes.json()) as Array<{ id: string; nombre: string }>;
      createdCats.forEach((c) => {
        if (c.nombre && c.id) catByLower.set(c.nombre.trim().toLowerCase(), c.id);
      });
    }
    const refreshCatRes = await fetch(`${url}/rest/v1/categorias?select=id,nombre&limit=1000`, {
      headers,
    });
    if (refreshCatRes.ok) {
      const refreshed = (await refreshCatRes.json()) as Array<{ id: string; nombre: string }>;
      refreshed.forEach((c) => {
        if (c.nombre && c.id) catByLower.set(c.nombre.trim().toLowerCase(), c.id);
      });
    }
  }

  // 2. Leer productos existentes para respetar precio_bloqueado = true
  const prodRes = await fetch(
    `${url}/rest/v1/productos?select=sku,precio_bloqueado,precio_usd,categoria_id&limit=10000`,
    { headers }
  );
  if (!prodRes.ok) {
    throw new Error(`Error leyendo productos de Supabase: ${await prodRes.text()}`);
  }
  const existingProds = (await prodRes.json()) as Array<{
    sku: string;
    precio_bloqueado?: boolean;
    precio_usd?: number;
    categoria_id?: string | null;
  }>;
  const prodBySku = new Map(existingProds.map((p) => [p.sku, p]));

  const nowIso = new Date().toISOString();
  const rowsToUpsert = items.map((item) => {
    const prev = prodBySku.get(item.sku);
    const catId = catByLower.get(item.categoria_nombre.toLowerCase()) || prev?.categoria_id || null;
    const precioUsd = prev?.precio_bloqueado ? Number(prev.precio_usd ?? item.precio_usd) : item.precio_usd;
    return {
      sku: item.sku,
      nombre: item.nombre,
      precio_usd: precioUsd,
      stock: item.stock,
      categoria_id: catId,
      activo: true,
      actualizado_en: nowIso,
      ultima_sincronizacion: nowIso,
    };
  });

  // 3. Upsert en lotes de 200
  const chunkSize = 200;
  for (let i = 0; i < rowsToUpsert.length; i += chunkSize) {
    const chunk = rowsToUpsert.slice(i, i + chunkSize);
    const upRes = await fetch(`${url}/rest/v1/productos?on_conflict=sku`, {
      method: 'POST',
      headers: {
        ...headers,
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(chunk),
    });
    if (!upRes.ok) {
      const upErr = await upRes.text();
      if (upErr.includes('42501')) {
        throw new Error(
          'Permiso RLS denegado en productos (42501). Configura SUPABASE_SERVICE_ROLE_KEY en el servidor o ejecuta supabase_migration.sql en tu SQL Editor.'
        );
      }
      throw new Error(`Error guardando lote en productos: ${upErr}`);
    }
  }

  await cleanupDuplicateAndStaleRest(url, key, authBearer, items);
}
