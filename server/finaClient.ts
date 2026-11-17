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

  // Mapear stock por _id, SKU y nombre normalizado
  const stockById = new Map<string, number>();
  const stockBySku = new Map<string, number>();
  const stockByName = new Map<string, number>();

  for (const inv of inventoryItems) {
    const stock = getInventoryStock(inv);
    if (inv?._id) stockById.set(String(inv._id), stock);
    if (inv?.SKU) stockBySku.set(String(inv.SKU).trim(), stock);
    if (inv?.name) stockByName.set(String(inv.name).trim().toLowerCase(), stock);
  }

  const dedupMap = new Map<string, {
    sku: string;
    nombre: string;
    precio_usd: number;
    stock: number;
    categoria_nombre: string;
  }>();

  for (const prod of priceProducts) {
    const idKey = prod?._id ? String(prod._id) : '';
    const skuRaw = prod?.SKU ? String(prod.SKU).trim() : '';
    const nameRaw = String(prod?.name || '').trim();
    const sku = skuRaw || idKey;
    if (!sku || !nameRaw) continue;

    const nameKey = nameRaw.toLowerCase();
    const matchedStock =
      (idKey && stockById.has(idKey) ? stockById.get(idKey) : undefined) ??
      (skuRaw && stockBySku.has(skuRaw) ? stockBySku.get(skuRaw) : undefined) ??
      (nameKey && stockByName.has(nameKey) ? stockByName.get(nameKey) : undefined) ??
      0;

    dedupMap.set(sku, {
      sku,
      nombre: nameRaw,
      precio_usd: getPrincipalChannelPrice(prod),
      stock: Math.max(0, Math.floor(matchedStock)),
      categoria_nombre: String(prod?.category || '').trim(),
    });
  }

  const normalized = Array.from(dedupMap.values());

  const probeLog = [
    `Precios (Canal Principal): ${priceProducts.length} productos`,
    `Cantidades (/api/inventory): ${inventoryItems.length} registros`,
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

async function upsertProductsDirectRest(
  url: string,
  key: string,
  authBearer: string,
  items: Array<{
    sku: string;
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
    // Re-consultar por si hubo conflictos ignorados
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
      actualizado_en: nowIso,
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
}
