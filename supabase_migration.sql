-- Migración integral B.B.T. Tienda de Licores
-- Ejecutar en el SQL Editor de Supabase

-- 1. Tabla de caché de autenticación para Fina Partner POS
CREATE TABLE IF NOT EXISTS public.fina_auth_cache (
  id integer PRIMARY KEY DEFAULT 1,
  x_access_token text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.fina_auth_cache DISABLE ROW LEVEL SECURITY;

-- 2. Tabla de banners promocionales administrables
CREATE TABLE IF NOT EXISTS public.banners (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  titulo text NOT NULL,
  subtitulo text,
  etiqueta text,
  texto_cta text DEFAULT 'Ver selección',
  imagen_url text,
  enlace_tipo text NOT NULL DEFAULT 'ninguno' CHECK (enlace_tipo = ANY (ARRAY['categoria'::text, 'producto'::text, 'busqueda'::text, 'ninguno'::text])),
  enlace_valor text,
  orden integer NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamp with time zone DEFAULT now(),
  CONSTRAINT banners_pkey PRIMARY KEY (id)
);

ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Banners públicos visibles" ON public.banners;
CREATE POLICY "Banners públicos visibles" ON public.banners
  FOR SELECT USING (activo = true);
DROP POLICY IF EXISTS "Admins gestionan banners" ON public.banners;
CREATE POLICY "Admins gestionan banners" ON public.banners
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Mejoras en productos (soft-delete y trazabilidad de Fina)
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS ultima_sincronizacion timestamp with time zone;

-- 4. Mejoras en pedidos y detalles_pedido para Guest Checkout + Delivery por zonas
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS referencia_entrega text,
  ADD COLUMN IF NOT EXISTS costo_delivery_usd numeric NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS distancia_km numeric,
  ADD COLUMN IF NOT EXISTS total_bs numeric,
  ADD COLUMN IF NOT EXISTS notas text;

ALTER TABLE public.detalles_pedido
  ADD COLUMN IF NOT EXISTS nombre_producto text;

-- 5. Función atómica para crear pedidos sin sesión (Guest Checkout seguro)
CREATE OR REPLACE FUNCTION public.crear_pedido_guest(
  p_cliente_nombre text,
  p_cliente_telefono text,
  p_metodo_entrega text,
  p_direccion_exacta text DEFAULT NULL,
  p_referencia_entrega text DEFAULT NULL,
  p_latitud numeric DEFAULT NULL,
  p_longitud numeric DEFAULT NULL,
  p_distancia_km numeric DEFAULT NULL,
  p_costo_delivery_usd numeric DEFAULT 0,
  p_tasa_bcv_momento numeric DEFAULT 1,
  p_metodo_pago_elegido text DEFAULT NULL,
  p_notas text DEFAULT NULL,
  p_items jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pedido_id uuid;
  v_numero_orden integer;
  v_subtotal_usd numeric := 0;
  v_total_usd numeric := 0;
  v_total_bs numeric := 0;
  v_item jsonb;
  v_prod record;
  v_qty integer;
BEGIN
  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'El carrito no puede estar vacío';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := GREATEST(1, (v_item->>'cantidad')::integer);
    SELECT id, nombre, precio_usd, stock
    INTO v_prod
    FROM public.productos
    WHERE id = (v_item->>'producto_id')::uuid AND COALESCE(activo, true) = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Producto no encontrado o inactivo';
    END IF;

    v_subtotal_usd := v_subtotal_usd + (v_prod.precio_usd * v_qty);
  END LOOP;

  v_total_usd := v_subtotal_usd + COALESCE(p_costo_delivery_usd, 0);
  v_total_bs := ROUND(v_total_usd * COALESCE(p_tasa_bcv_momento, 1), 2);

  INSERT INTO public.pedidos (
    cliente_nombre,
    cliente_telefono,
    metodo_entrega,
    direccion_exacta,
    referencia_entrega,
    latitud,
    longitud,
    distancia_km,
    costo_delivery_usd,
    estado,
    total_usd,
    total_bs,
    tasa_bcv_momento,
    metodo_pago_elegido,
    notas
  )
  VALUES (
    TRIM(p_cliente_nombre),
    TRIM(p_cliente_telefono),
    p_metodo_entrega,
    p_direccion_exacta,
    p_referencia_entrega,
    p_latitud,
    p_longitud,
    p_distancia_km,
    COALESCE(p_costo_delivery_usd, 0),
    'pendiente',
    v_total_usd,
    v_total_bs,
    p_tasa_bcv_momento,
    p_metodo_pago_elegido,
    p_notas
  )
  RETURNING id, numero_orden INTO v_pedido_id, v_numero_orden;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := GREATEST(1, (v_item->>'cantidad')::integer);
    SELECT id, nombre, precio_usd
    INTO v_prod
    FROM public.productos
    WHERE id = (v_item->>'producto_id')::uuid;

    INSERT INTO public.detalles_pedido (
      pedido_id,
      producto_id,
      nombre_producto,
      cantidad,
      precio_unitario_usd
    )
    VALUES (
      v_pedido_id,
      v_prod.id,
      v_prod.nombre,
      v_qty,
      v_prod.precio_usd
    );
  END LOOP;

  RETURN jsonb_build_object(
    'id', v_pedido_id,
    'numero_orden', v_numero_orden,
    'subtotal_usd', v_subtotal_usd,
    'costo_delivery_usd', COALESCE(p_costo_delivery_usd, 0),
    'total_usd', v_total_usd,
    'total_bs', v_total_bs
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_pedido_guest(
  text, text, text, text, text, numeric, numeric, numeric, numeric, numeric, text, text, jsonb
) TO anon, authenticated, service_role;

-- 6. Función de sincronización desde Fina Partner respetando precio_bloqueado
CREATE OR REPLACE FUNCTION public.sincronizar_productos_fina(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_cat_id uuid;
  v_slug text;
  v_count integer := 0;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF COALESCE(TRIM(v_item->>'categoria_nombre'), '') <> '' THEN
      v_slug := TRIM(BOTH '-' FROM LOWER(REGEXP_REPLACE(TRIM(v_item->>'categoria_nombre'), '[^a-zA-Z0-9]+', '-', 'g')));
      IF v_slug = '' THEN
        v_slug := 'categoria';
      END IF;

      SELECT id INTO v_cat_id
      FROM public.categorias
      WHERE LOWER(nombre) = LOWER(TRIM(v_item->>'categoria_nombre'))
         OR slug = v_slug
      LIMIT 1;

      IF v_cat_id IS NULL THEN
        INSERT INTO public.categorias (nombre, slug, activo)
        VALUES (TRIM(v_item->>'categoria_nombre'), v_slug, true)
        ON CONFLICT (nombre) DO UPDATE SET activo = true
        RETURNING id INTO v_cat_id;
      END IF;
    ELSE
      v_cat_id := NULL;
    END IF;

    INSERT INTO public.productos (
      sku, nombre, precio_usd, stock, categoria_id, activo, actualizado_en, ultima_sincronizacion
    )
    VALUES (
      TRIM(v_item->>'sku'),
      TRIM(v_item->>'nombre'),
      COALESCE((v_item->>'precio_usd')::numeric, 0),
      COALESCE((v_item->>'stock')::integer, 0),
      v_cat_id,
      true,
      now(),
      now()
    )
    ON CONFLICT (sku) DO UPDATE SET
      nombre = EXCLUDED.nombre,
      precio_usd = CASE
        WHEN public.productos.precio_bloqueado THEN public.productos.precio_usd
        ELSE EXCLUDED.precio_usd
      END,
      stock = EXCLUDED.stock,
      categoria_id = COALESCE(EXCLUDED.categoria_id, public.productos.categoria_id),
      activo = true,
      actualizado_en = now(),
      ultima_sincronizacion = now();

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('synced', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.sincronizar_productos_fina(jsonb) TO anon, authenticated, service_role;

-- 7. Semilla inicial sugerida de configuración y métodos de pago
INSERT INTO public.configuracion (clave, valor)
VALUES
  ('whatsapp_pedidos', '584247476273'),
  ('tasa_bcv', '45.50')
ON CONFLICT (clave) DO NOTHING;

INSERT INTO public.metodos_pago_info (metodo, datos_transferencia, activo)
VALUES
  ('Pago Móvil', 'Coordinar datos por WhatsApp', true),
  ('Zelle', 'Coordinar datos por WhatsApp', true),
  ('Efectivo USD', 'Pago contra entrega / retiro', true),
  ('Punto de Venta', 'Disponible en tienda / entrega', true),
  ('Binance Pay', 'Coordinar ID por WhatsApp', true)
ON CONFLICT (metodo) DO NOTHING;
