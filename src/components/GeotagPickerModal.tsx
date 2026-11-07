import React, { useState } from 'react';
import { MapPin, Navigation, X, Check, Search, Globe2 } from 'lucide-react';
import { LocationData } from '../types';
import { PRESET_LOCATIONS } from '../data/languages';

interface GeotagPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectLocation: (loc: LocationData) => void;
  currentSelected?: LocationData;
}

export const GeotagPickerModal: React.FC<GeotagPickerModalProps> = ({
  isOpen,
  onClose,
  onSelectLocation,
  currentSelected,
}) => {
  const [search, setSearch] = useState('');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.');
      return;
    }

    setGpsLoading(true);
    setGpsError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLoading(false);
        const loc: LocationData = {
          name: `Current Location (${pos.coords.latitude.toFixed(2)}°, ${pos.coords.longitude.toFixed(2)}°)`,
          lat: Number(pos.coords.latitude.toFixed(4)),
          lng: Number(pos.coords.longitude.toFixed(4)),
          city: 'Local Area',
        };
        onSelectLocation(loc);
        onClose();
      },
      (err) => {
        setGpsLoading(false);
        setGpsError(err.message || 'Unable to retrieve your location');
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const filteredPresets = PRESET_LOCATIONS.filter(
    (loc) =>
      loc.name.toLowerCase().includes(search.toLowerCase()) ||
      (loc.country && loc.country.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="glass-card rounded-3xl p-5 sm:p-7 max-w-lg w-full border border-purple-500/40 shadow-2xl relative space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-900/40 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Geotag Location</h3>
              <p className="text-xs text-gray-400">Attach geographic coordinates & context to query</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#131520] border border-[#232738] text-gray-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* GPS Quick Action */}
        <button
          onClick={handleGetCurrentLocation}
          disabled={gpsLoading}
          className="w-full purple-glow-btn text-white py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold transition-all"
        >
          <Navigation className={`w-4 h-4 ${gpsLoading ? 'animate-spin' : ''}`} />
          <span>{gpsLoading ? 'Detecting Coordinates...' : 'Use My Current GPS Position'}</span>
        </button>

        {gpsError && (
          <div className="text-xs text-amber-300 bg-amber-950/40 border border-amber-500/30 p-2.5 rounded-xl">
            {gpsError} (Please pick a location preset below)
          </div>
        )}

        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search world regions or cities..."
            className="w-full bg-[#090a0f] border border-[#232738] focus:border-purple-500 rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm text-gray-200 outline-none placeholder-gray-500"
          />
        </div>

        {/* Presets List */}
        <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-1">
            Global Locations
          </div>
          {filteredPresets.map((loc) => {
            const isSelected = currentSelected?.name === loc.name;
            return (
              <button
                key={loc.name}
                onClick={() => {
                  onSelectLocation(loc);
                  onClose();
                }}
                className={`w-full text-left p-3 rounded-xl border flex items-center justify-between transition-all ${
                  isSelected
                    ? 'bg-purple-900/30 border-purple-500/50 text-white'
                    : 'bg-[#131520] border-[#232738] text-gray-300 hover:border-purple-500/30 hover:bg-[#181a29]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Globe2 className="w-4 h-4 text-purple-400" />
                  <div>
                    <div className="text-xs sm:text-sm font-semibold text-white">{loc.name}</div>
                    <div className="text-[10px] text-gray-400">
                      Lat: {loc.lat}°, Lng: {loc.lng}°
                    </div>
                  </div>
                </div>
                {isSelected && <Check className="w-4 h-4 text-purple-400" />}
              </button>
            );
          })}
        </div>

        {/* Custom manual entry if user typed something not found */}
        {search && filteredPresets.length === 0 && (
          <button
            onClick={() => {
              onSelectLocation({
                name: search,
                city: search,
                lat: 0,
                lng: 0,
              });
              onClose();
            }}
            className="w-full text-center py-2.5 px-3 bg-[#131520] border border-dashed border-purple-500/40 hover:border-purple-500 rounded-xl text-xs text-purple-300"
          >
            Use custom location "{search}"
          </button>
        )}
      </div>
    </div>
  );
};
