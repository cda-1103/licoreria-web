import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { LocateFixed, MapPin, AlertCircle } from 'lucide-react';
import { STORE_COORDS, calculateDeliveryZone } from '../lib/delivery';

export default function DeliveryMapPicker({ coords, onChange }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const customerMarkerRef = useRef(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState('');

  const zoneInfo = coords ? calculateDeliveryZone(coords.lat, coords.lng) : null;

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const initialLat = coords?.lat ?? STORE_COORDS.lat;
    const initialLng = coords?.lng ?? STORE_COORDS.lng;

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLng],
      zoom: 13,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    const storeIcon = L.divIcon({
      className: 'bbt-store-pin',
      html: `<div style="width:28px;height:28px;border-radius:9999px;background:#141413;border:2px solid #ffffff;box-shadow:0 2px 6px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;color:#ffffff;font-size:10px;font-weight:700;">BBT</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    L.marker([STORE_COORDS.lat, STORE_COORDS.lng], { icon: storeIcon })
      .addTo(map)
      .bindPopup('B.B.T. Tienda de Licores (C.C. Millenium)');

    // 5km, 7km, 10km visual reference rings
    L.circle([STORE_COORDS.lat, STORE_COORDS.lng], {
      radius: 5000,
      color: '#1e3a2f',
      weight: 1,
      fillOpacity: 0.03,
      dashArray: '4 4',
    }).addTo(map);

    L.circle([STORE_COORDS.lat, STORE_COORDS.lng], {
      radius: 7000,
      color: '#9a4d1c',
      weight: 1,
      fillOpacity: 0.02,
      dashArray: '4 4',
    }).addTo(map);

    const customerIcon = L.divIcon({
      className: 'bbt-customer-pin',
      html: `<div style="width:24px;height:24px;border-radius:9999px;background:#9a4d1c;border:3px solid #ffffff;box-shadow:0 3px 10px rgba(0,0,0,0.4);"></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    const marker = L.marker([initialLat, initialLng], {
      icon: customerIcon,
      draggable: true,
    }).addTo(map);

    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      onChange({ lat: Number(pos.lat.toFixed(6)), lng: Number(pos.lng.toFixed(6)) });
    });

    map.on('click', (e) => {
      const { lat, lng } = e.latlng;
      marker.setLatLng([lat, lng]);
      onChange({ lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) });
    });

    mapRef.current = map;
    customerMarkerRef.current = marker;

    return () => {
      map.remove();
      mapRef.current = null;
      customerMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!coords || !mapRef.current || !customerMarkerRef.current) return;
    const current = customerMarkerRef.current.getLatLng();
    if (Math.abs(current.lat - coords.lat) > 0.00001 || Math.abs(current.lng - coords.lng) > 0.00001) {
      customerMarkerRef.current.setLatLng([coords.lat, coords.lng]);
      mapRef.current.setView([coords.lat, coords.lng], 15, { animate: true });
    }
  }, [coords]);

  const handleLocate = () => {
    setGeoError('');
    if (!('geolocation' in navigator)) {
      setGeoError('Tu navegador no soporta geolocalización. Marca el pin en el mapa.');
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = {
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        };
        onChange(next);
        setLocating(false);
      },
      () => {
        setGeoError('No pudimos acceder al GPS. Toca directamente en el mapa para fijar tu pin.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="space-y-3 uppercase">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-[#5c5850] flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-[#9a4d1c]" />
          TOCA EL MAPA O ARRASTRA EL PIN HASTA TU DIRECCIÓN
        </span>
        <button
          type="button"
          onClick={handleLocate}
          disabled={locating}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#141413] text-white rounded-sm hover:bg-[#9a4d1c] transition-colors disabled:opacity-60 cursor-pointer uppercase"
        >
          <LocateFixed className="w-3.5 h-3.5" />
          {locating ? 'LOCALIZANDO...' : 'USAR MI GPS'}
        </button>
      </div>

      <div
        ref={mapContainerRef}
        className="w-full h-52 rounded-sm border border-[#e2ddd2] overflow-hidden bg-[#efece4]"
      />

      {geoError && (
        <div className="flex items-start gap-2 p-2.5 text-xs text-[#9a4d1c] bg-[#f8f6f1] border border-[#e2ddd2] rounded-sm">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{geoError}</span>
        </div>
      )}

      {zoneInfo ? (
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-[#f8f6f1] border border-[#e2ddd2] rounded-sm text-xs">
          <div>
            <p className="font-semibold text-[#141413]">{zoneInfo.zoneLabel}</p>
            <p className="text-[#5c5850] font-mono-num">
              Distancia estimada: {zoneInfo.distanceKm} km desde C.C. Millenium
            </p>
          </div>
          <div className="text-right shrink-0">
            {zoneInfo.requiresQuote ? (
              <span className="font-semibold text-[#9a4d1c]">Consultar en WhatsApp</span>
            ) : (
              <span className="font-mono-num font-bold text-[#1e3a2f] text-sm">
                +${zoneInfo.costUsd.toFixed(2)}
              </span>
            )}
          </div>
        </div>
      ) : (
        <p className="text-xs text-[#5c5850]">
          Fija tu ubicación en el mapa para calcular la zona de delivery desde C.C. Millenium.
        </p>
      )}
    </div>
  );
}
