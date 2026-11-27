import React, { useState, useRef, useMemo } from 'react';
import {
  MapPin,
  Navigation,
  X,
  Check,
  Search,
  Globe2,
  Plus,
  Minus,
  Crosshair,
  ShieldCheck,
  Send,
  ExternalLink,
} from 'lucide-react';
import { LocationData } from '../types';
import { PRESET_LOCATIONS } from '../data/languages';

interface GeotagPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectLocation: (loc: LocationData) => void;
  currentSelected?: LocationData;
}

const TILE_SIZE = 256;

function latLngToWorldPoint(lat: number, lng: number, zoom: number) {
  const scale = TILE_SIZE * Math.pow(2, zoom);
  const clampedLat = Math.max(-85.0511, Math.min(85.0511, lat));
  const sinLat = Math.sin((clampedLat * Math.PI) / 180);
  const x = ((lng + 180) / 360) * scale;
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
}

function worldPointToLatLng(x: number, y: number, zoom: number) {
  const scale = TILE_SIZE * Math.pow(2, zoom);
  const lng = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return {
    lat: Math.max(-85, Math.min(85, Number(lat.toFixed(4)))),
    lng: Math.max(-180, Math.min(180, Number((((lng + 540) % 360) - 180).toFixed(4)))),
  };
}

export const GeotagPickerModal: React.FC<GeotagPickerModalProps> = ({
  isOpen,
  onClose,
  onSelectLocation,
  currentSelected,
}) => {
  const defaultLoc: LocationData = currentSelected || {
    name: PRESET_LOCATIONS[0]?.name || 'Kathmandu, Nepal',
    lat: PRESET_LOCATIONS[0]?.lat ?? 27.7172,
    lng: PRESET_LOCATIONS[0]?.lng ?? 85.324,
    city: PRESET_LOCATIONS[0]?.city || 'Kathmandu',
    country: PRESET_LOCATIONS[0]?.country || 'Nepal',
  };

  const [previewLoc, setPreviewLoc] = useState<LocationData>(defaultLoc);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({
    lat: defaultLoc.lat,
    lng: defaultLoc.lng,
  });
  const [zoom, setZoom] = useState<number>(currentSelected ? 12 : 4);
  const [search, setSearch] = useState('');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<'idle' | 'granted' | 'denied'>('idle');
  const [tileErrors, setTileErrors] = useState<Record<string, boolean>>({});

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{
    isDown: boolean;
    startX: number;
    startY: number;
    startCenter: { lat: number; lng: number };
    moved: boolean;
  } | null>(null);

  const mapWidth = 520;
  const mapHeight = 230;

  const tiles = useMemo(() => {
    const centerPt = latLngToWorldPoint(mapCenter.lat, mapCenter.lng, zoom);
    const topLeftX = centerPt.x - mapWidth / 2;
    const topLeftY = centerPt.y - mapHeight / 2;

    const minTileX = Math.floor(topLeftX / TILE_SIZE);
    const maxTileX = Math.floor((topLeftX + mapWidth) / TILE_SIZE);
    const minTileY = Math.floor(topLeftY / TILE_SIZE);
    const maxTileY = Math.floor((topLeftY + mapHeight) / TILE_SIZE);
    const maxIdx = Math.pow(2, zoom);

    const list: Array<{
      key: string;
      url: string;
      left: number;
      top: number;
    }> = [];

    for (let tx = minTileX; tx <= maxTileX; tx++) {
      for (let ty = minTileY; ty <= maxTileY; ty++) {
        if (ty < 0 || ty >= maxIdx) continue;
        const wrappedX = ((tx % maxIdx) + maxIdx) % maxIdx;
        const key = `${zoom}-${wrappedX}-${ty}-${tx}`;
        list.push({
          key,
          url: `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${ty}.png`,
          left: tx * TILE_SIZE - topLeftX,
          top: ty * TILE_SIZE - topLeftY,
        });
      }
    }
    return { list, centerPt, topLeftX, topLeftY };
  }, [mapCenter.lat, mapCenter.lng, zoom]);

  const pinScreenPos = useMemo(() => {
    const pinPt = latLngToWorldPoint(previewLoc.lat, previewLoc.lng, zoom);
    return {
      x: pinPt.x - tiles.topLeftX,
      y: pinPt.y - tiles.topLeftY,
    };
  }, [previewLoc.lat, previewLoc.lng, zoom, tiles.topLeftX, tiles.topLeftY]);

  if (!isOpen) return null;

  // Explicit user-triggered permission request for current GPS location (NEVER called automatically)
  const handleRequestAndDetectLocation = async () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.');
      return;
    }

    setGpsLoading(true);
    setGpsError(null);

    try {
      if (navigator.permissions?.query) {
        const perm = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        if (perm.state === 'denied') {
          setPermissionState('denied');
          setGpsLoading(false);
          setGpsError(
            'Location permission is currently blocked in your browser settings. Allow location access or drop a pin on the map manually.'
          );
          return;
        }
      }
    } catch {
      // Browser permissions API optional; proceed to geolocation prompt
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLoading(false);
        setPermissionState('granted');
        const lat = Number(pos.coords.latitude.toFixed(4));
        const lng = Number(pos.coords.longitude.toFixed(4));
        const detectedLoc: LocationData = {
          name: `My Location (${lat}°, ${lng}°)`,
          lat,
          lng,
          city: 'Current GPS Position',
        };
        setPreviewLoc(detectedLoc);
        setMapCenter({ lat, lng });
        setZoom(13);
      },
      (err) => {
        setGpsLoading(false);
        if (err.code === err.PERMISSION_DENIED) {
          setPermissionState('denied');
          setGpsError(
            'Permission denied. Please enable location access in browser settings or click anywhere on the interactive map to pick a pin.'
          );
        } else {
          setGpsError(err.message || 'Unable to retrieve your current coordinates.');
        }
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const handleMapPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragStateRef.current = {
      isDown: true,
      startX: e.clientX,
      startY: e.clientY,
      startCenter: { ...mapCenter },
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleMapPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || !drag.isDown) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      drag.moved = true;
    }
    if (!drag.moved) return;

    const startWorld = latLngToWorldPoint(drag.startCenter.lat, drag.startCenter.lng, zoom);
    const nextCoords = worldPointToLatLng(startWorld.x - dx, startWorld.y - dy, zoom);
    setMapCenter(nextCoords);
  };

  const handleMapPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    dragStateRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}

    if (drag && !drag.moved && mapContainerRef.current) {
      const rect = mapContainerRef.current.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;
      const centerPt = latLngToWorldPoint(mapCenter.lat, mapCenter.lng, zoom);
      const worldX = centerPt.x - rect.width / 2 + offsetX;
      const worldY = centerPt.y - rect.height / 2 + offsetY;
      const clickedCoords = worldPointToLatLng(worldX, worldY, zoom);
      setPreviewLoc({
        name: `Pinned Location (${clickedCoords.lat}°, ${clickedCoords.lng}°)`,
        lat: clickedCoords.lat,
        lng: clickedCoords.lng,
        city: 'Map Pin',
      });
    }
  };

  const handleFocusPreset = (loc: LocationData) => {
    setPreviewLoc(loc);
    setMapCenter({ lat: loc.lat, lng: loc.lng });
    setZoom(11);
  };

  const handleShareLocation = () => {
    onSelectLocation(previewLoc);
    onClose();
  };

  const filteredPresets = PRESET_LOCATIONS.filter(
    (loc) =>
      loc.name.toLowerCase().includes(search.toLowerCase()) ||
      (loc.country && loc.country.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Interactive Location Sharing and Map"
        onClick={(e) => e.stopPropagation()}
        className="glass-card rounded-t-3xl sm:rounded-3xl p-4 sm:p-6 max-w-2xl w-full max-h-[92vh] max-h-[92dvh] overflow-y-auto scroll-pane border border-purple-500/40 shadow-2xl relative space-y-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Location Sharing &amp; Interactive Map</h3>
              <p className="text-[11px] text-purple-200/75">
                Drag to pan, click the map to drop a pin, or request GPS permission.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close location modal"
            className="min-w-[38px] min-h-[38px] rounded-xl bg-[#131520] border border-white/15 text-gray-300 hover:text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Explicit Permission Consent Banner */}
        <div className="p-3 rounded-2xl bg-[#110c22]/90 border border-purple-400/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-xs text-purple-100/90 leading-snug">
              <span className="font-bold text-white">Explicit Consent Required:</span> Your GPS is never accessed or shared automatically.
            </div>
          </div>
          <button
            type="button"
            onClick={handleRequestAndDetectLocation}
            disabled={gpsLoading}
            className="purple-glow-btn min-h-[40px] text-white px-3.5 py-2 rounded-xl flex items-center justify-center gap-2 text-xs font-bold shrink-0 cursor-pointer disabled:opacity-60 whitespace-nowrap"
          >
            <Navigation className={`w-3.5 h-3.5 ${gpsLoading ? 'animate-spin' : ''}`} />
            <span>
              {gpsLoading
                ? 'Requesting Permission...'
                : permissionState === 'granted'
                ? 'Refresh Current GPS'
                : 'Allow & Detect Location'}
            </span>
          </button>
        </div>

        {gpsError && (
          <div className="text-xs text-amber-200 bg-amber-950/50 border border-amber-500/40 p-2.5 rounded-xl">
            {gpsError}
          </div>
        )}

        {/* Interactive Pan & Zoom Map Viewport */}
        <div className="space-y-2">
          <div
            ref={mapContainerRef}
            onPointerDown={handleMapPointerDown}
            onPointerMove={handleMapPointerMove}
            onPointerUp={handleMapPointerUp}
            className="relative w-full h-[230px] rounded-2xl overflow-hidden border border-purple-400/40 bg-[#0d091f] select-none cursor-grab active:cursor-grabbing touch-none shadow-inner"
            aria-label="Interactive map - drag to pan or click to place pin"
          >
            {/* Atmospheric coordinate grid fallback behind map tiles */}
            <div
              className="absolute inset-0 opacity-30 pointer-events-none"
              style={{
                backgroundImage:
                  'linear-gradient(to right, rgba(167,139,250,0.22) 1px, transparent 1px), linear-gradient(to bottom, rgba(167,139,250,0.22) 1px, transparent 1px)',
                backgroundSize: '32px 32px',
              }}
            />

            {/* Real OpenStreetMap Slippy Tiles */}
            {tiles.list.map((tile) =>
              tileErrors[tile.key] ? null : (
                <img
                  key={tile.key}
                  src={tile.url}
                  alt=""
                  draggable={false}
                  referrerPolicy="no-referrer"
                  onError={() => setTileErrors((prev) => ({ ...prev, [tile.key]: true }))}
                  className="absolute w-[256px] h-[256px] pointer-events-none brightness-90 contrast-105"
                  style={{
                    left: `${tile.left}px`,
                    top: `${tile.top}px`,
                  }}
                />
              )
            )}

            {/* Pin Overlay */}
            <div
              className="absolute pointer-events-none -translate-x-1/2 -translate-y-full transition-transform duration-150"
              style={{
                left: `${pinScreenPos.x}px`,
                top: `${pinScreenPos.y}px`,
              }}
            >
              <div className="flex flex-col items-center">
                <div className="px-2 py-0.5 mb-1 rounded-lg bg-[#0d091f]/90 border border-purple-400/60 text-[10px] font-bold text-white whitespace-nowrap shadow-lg">
                  {previewLoc.name.split('(')[0].trim()}
                </div>
                <div className="w-7 h-7 rounded-full bg-purple-600 border-2 border-white shadow-[0_0_16px_rgba(139,92,246,0.9)] flex items-center justify-center text-white">
                  <MapPin className="w-4 h-4" />
                </div>
              </div>
            </div>

            {/* Map Controls: Zoom + / - & Recenter */}
            <div
              className="absolute top-2.5 right-2.5 flex flex-col gap-1.5 z-10"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(16, z + 1))}
                aria-label="Zoom in map"
                className="w-8 h-8 rounded-xl bg-[#0d091f]/90 hover:bg-purple-800 border border-purple-400/40 text-white flex items-center justify-center cursor-pointer shadow"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(2, z - 1))}
                aria-label="Zoom out map"
                className="w-8 h-8 rounded-xl bg-[#0d091f]/90 hover:bg-purple-800 border border-purple-400/40 text-white flex items-center justify-center cursor-pointer shadow"
              >
                <Minus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setMapCenter({ lat: previewLoc.lat, lng: previewLoc.lng })}
                aria-label="Center map on pin"
                title="Center on selected pin"
                className="w-8 h-8 rounded-xl bg-[#0d091f]/90 hover:bg-purple-800 border border-purple-400/40 text-purple-200 flex items-center justify-center cursor-pointer shadow"
              >
                <Crosshair className="w-4 h-4" />
              </button>
            </div>

            {/* Coordinate Pill Readout */}
            <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between gap-2 pointer-events-none">
              <span className="px-2.5 py-1 rounded-xl bg-[#0b0818]/90 border border-purple-400/35 text-[10px] font-mono tabular-nums text-purple-200">
                Lat {previewLoc.lat.toFixed(4)}° · Lng {previewLoc.lng.toFixed(4)}° · Zoom {zoom}x
              </span>
              <a
                href={`https://www.openstreetmap.org/?mlat=${previewLoc.lat}&mlon=${previewLoc.lng}#map=${zoom}/${previewLoc.lat}/${previewLoc.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                onPointerDown={(e) => e.stopPropagation()}
                className="pointer-events-auto px-2 py-1 rounded-xl bg-[#0b0818]/90 border border-purple-400/35 text-[10px] text-purple-200 hover:text-white inline-flex items-center gap-1"
              >
                <span>OSM</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>

          {/* Selected Pin Summary + Explicit Share Action */}
          <div className="p-3 rounded-2xl bg-[#110c22]/85 border border-purple-400/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <label className="text-[10px] uppercase tracking-wider font-bold text-purple-300 block">
                Selected Location Label
              </label>
              <input
                type="text"
                value={previewLoc.name}
                onChange={(e) => setPreviewLoc((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full bg-[#090616] border border-white/15 focus:border-purple-400 rounded-xl px-3 py-1.5 text-xs text-white outline-none"
              />
            </div>

            <button
              type="button"
              onClick={handleShareLocation}
              className="purple-glow-btn min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-2 shrink-0 cursor-pointer whitespace-nowrap"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Share Location in Chat</span>
            </button>
          </div>
        </div>

        {/* Search & City Presets */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 text-purple-300/70 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search world regions or cities..."
              className="w-full bg-[#090a0f] border border-[#232738] focus:border-purple-500 rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm text-gray-200 outline-none placeholder-gray-500"
            />
          </div>

          <div className="max-h-40 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5 pr-1">
            {filteredPresets.map((loc) => {
              const isSelected = previewLoc.name === loc.name;
              return (
                <button
                  key={loc.name}
                  type="button"
                  onClick={() => handleFocusPreset(loc)}
                  className={`text-left p-2.5 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-purple-900/40 border-purple-400/60 text-white'
                      : 'bg-[#131520]/90 border-[#232738] text-gray-300 hover:border-purple-500/40'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Globe2 className="w-4 h-4 text-purple-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white truncate">{loc.name}</div>
                      <div className="text-[10px] font-mono tabular-nums text-gray-400">
                        {loc.lat}°, {loc.lng}°
                      </div>
                    </div>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-purple-300 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
