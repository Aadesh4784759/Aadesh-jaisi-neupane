import React, { useState, useRef } from 'react';
import {
  MapPin,
  Image as ImageIcon,
  Video,
  Upload,
  Share2,
  Download,
  Filter,
  Sparkles,
  Search,
  Globe,
  Tag,
  Calendar,
  X,
  Check,
  Compass,
} from 'lucide-react';
import { GeotaggedMedia, LocationData } from '../types';
import { PRESET_LOCATIONS, SUPPORTED_LANGUAGES } from '../data/languages';
import { GeotagPickerModal } from './GeotagPickerModal';

interface GeotagGalleryViewProps {
  mediaItems: GeotaggedMedia[];
  onAddMedia: (media: GeotaggedMedia) => void;
  onDeleteMedia: (id: string) => void;
  isOnline: boolean;
}

export const GeotagGalleryView: React.FC<GeotagGalleryViewProps> = ({
  mediaItems,
  onAddMedia,
  onDeleteMedia,
  isOnline,
}) => {
  const [selectedLocationFilter, setSelectedLocationFilter] = useState<string>('all');
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMediaForShare, setActiveMediaForShare] = useState<GeotaggedMedia | null>(null);
  const [selectedPinItem, setSelectedPinItem] = useState<GeotaggedMedia | null>(null);

  // New Media Upload State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<{ url: string; type: 'photo' | 'video'; mimeType: string } | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadCaption, setUploadCaption] = useState('');
  const [uploadLocation, setUploadLocation] = useState<LocationData | null>(PRESET_LOCATIONS[0]);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [copiedShareLink, setCopiedShareLink] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Extract unique locations and tags for filtering
  const allLocations = Array.from(new Set(mediaItems.map((m) => m.location.city || m.location.name)));
  const allTags = Array.from(new Set(mediaItems.flatMap((m) => m.tags)));

  // Filtered media
  const filteredMedia = mediaItems.filter((item) => {
    const matchesLoc =
      selectedLocationFilter === 'all' ||
      item.location.city === selectedLocationFilter ||
      item.location.name === selectedLocationFilter;
    const matchesTag = selectedTagFilter === 'all' || item.tags.includes(selectedTagFilter);
    const matchesSearch =
      !searchQuery ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.location.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.caption?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.detectedLandmark?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesLoc && matchesTag && matchesSearch;
  });

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');

    if (!isVideo && !isImage) {
      alert('Please select an image or video file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setUploadFile({
        url: result,
        type: isVideo ? 'video' : 'photo',
        mimeType: file.type,
      });
      setUploadTitle(file.name.replace(/\.[^/.]+$/, ''));
    };
    reader.readAsDataURL(file);
  };

  // AI Visual & Geotag Analysis
  const handleAnalyzeWithAI = async () => {
    if (!uploadFile || !uploadLocation) return;
    setIsAnalyzing(true);

    try {
      if (!isOnline) {
        setUploadCaption(`Geotagged scene at ${uploadLocation.name}. Preserved in offline regional catalog.`);
        setIsAnalyzing(false);
        return;
      }

      const res = await fetch('/api/analyze-geotag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageData: uploadFile.url,
          imageMimeType: uploadFile.mimeType,
          locationName: uploadLocation.name,
          lat: uploadLocation.lat,
          lng: uploadLocation.lng,
        }),
      });

      const data = await res.json();
      if (data.title) setUploadTitle(data.title);
      if (data.culturalSummary) setUploadCaption(data.culturalSummary);
    } catch (err) {
      console.error('Analyze error:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Save new media
  const handleSaveMedia = () => {
    if (!uploadFile || !uploadLocation) return;

    const newMedia: GeotaggedMedia = {
      id: `media-${Date.now()}`,
      title: uploadTitle || `${uploadLocation.name} Geotag`,
      type: uploadFile.type,
      mediaUrl: uploadFile.url,
      thumbnailUrl: uploadFile.url,
      location: uploadLocation,
      timestamp: Date.now(),
      caption: uploadCaption || `Logged from ${uploadLocation.name}`,
      tags: ['Geotagged', uploadLocation.city || 'Travel', 'Regional'],
      translatedCaptions: {
        es: `Foto geoetiquetada en ${uploadLocation.name}`,
        ja: `${uploadLocation.name} で撮影されたジオタグ写真`,
      },
    };

    onAddMedia(newMedia);
    setIsUploadModalOpen(false);
    setUploadFile(null);
    setUploadTitle('');
    setUploadCaption('');
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 space-y-6 pb-28">
      {/* Top Banner & Upload Action */}
      <div className="glass-card rounded-2xl p-4 sm:p-6 border border-purple-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-950/70 border border-purple-500/30 text-purple-300 text-xs font-semibold mb-1">
            <Compass className="w-3.5 h-3.5 text-purple-400" />
            <span>Organized Content Management & Regional Map</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white">Geotagged Photo & Video Hub</h2>
          <p className="text-xs text-gray-400">
            Organize, search, and share multilingual visual content tagged across global coordinates.
          </p>
        </div>

        <button
          onClick={() => setIsUploadModalOpen(true)}
          className="purple-glow-btn text-white font-semibold py-2.5 px-5 rounded-xl flex items-center justify-center gap-2 text-xs sm:text-sm whitespace-nowrap"
        >
          <Upload className="w-4 h-4" />
          <span>Upload Geotagged Media</span>
        </button>
      </div>

      {/* INTERACTIVE WORLD MAP PIN VISUALIZER */}
      <div className="glass-card rounded-2xl p-4 sm:p-5 border border-purple-500/30 relative overflow-hidden space-y-3">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-bold text-white">Interactive Geotag Map</h3>
          </div>
          <span className="text-xs text-purple-300 font-medium">
            {mediaItems.length} Tagged Coordinates Worldwide
          </span>
        </div>

        {/* Custom SVG Stylized World Map with Glowing Geotag Pins */}
        <div className="relative w-full h-56 sm:h-72 bg-[#0d0f18] rounded-xl border border-[#232738] overflow-hidden flex items-center justify-center">
          {/* Subtle Map Grid Background */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293710_1px,transparent_1px),linear-gradient(to_bottom,#1f293710_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

          {/* Continents Graphic Path Placeholder */}
          <svg
            className="w-full h-full opacity-20 text-indigo-400"
            viewBox="0 0 1000 500"
            fill="currentColor"
          >
            {/* Simplified World outlines */}
            <path d="M150,120 Q200,80 260,110 T320,180 Q250,220 200,200 Z" /> {/* North America */}
            <path d="M250,250 Q310,240 330,320 T280,440 Q240,360 250,250 Z" /> {/* South America */}
            <path d="M480,100 Q540,80 580,130 T520,190 Q460,150 480,100 Z" /> {/* Europe */}
            <path d="M470,200 Q540,190 560,280 T510,400 Q440,300 470,200 Z" /> {/* Africa */}
            <path d="M600,90 Q750,70 850,150 T800,260 Q650,230 600,90 Z" /> {/* Asia */}
            <path d="M780,320 Q860,310 880,380 T800,430 Q750,370 780,320 Z" /> {/* Australia */}
          </svg>

          {/* Interactive Geotag Pins mapped by coordinates */}
          {mediaItems.map((item) => {
            // Normalize Lat (-90 to 90) to Y (100% to 0%), Lng (-180 to 180) to X (0% to 100%)
            const xPercent = Math.max(5, Math.min(95, ((item.location.lng + 180) / 360) * 100));
            const yPercent = Math.max(8, Math.min(92, ((90 - item.location.lat) / 180) * 100));
            const isSelected = selectedPinItem?.id === item.id;

            return (
              <div
                key={item.id}
                style={{ left: `${xPercent}%`, top: `${yPercent}%` }}
                className="absolute -translate-x-1/2 -translate-y-1/2 z-20 group cursor-pointer"
                onClick={() => setSelectedPinItem(item)}
              >
                {/* Glowing Pulse Ring */}
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center transition-transform hover:scale-125 ${
                    isSelected
                      ? 'bg-purple-500 shadow-lg shadow-purple-500/80 scale-125'
                      : 'bg-purple-600/80 hover:bg-purple-500 shadow-md shadow-purple-900/50'
                  }`}
                >
                  <MapPin className="w-3.5 h-3.5 text-white" />
                </div>

                {/* Tooltip on Hover */}
                <div className="hidden group-hover:block absolute bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-[#131520] border border-purple-500/50 text-white text-[10px] px-2.5 py-1 rounded-lg shadow-xl z-30">
                  <span className="font-bold">{item.title}</span> • {item.location.city || item.location.name}
                </div>
              </div>
            );
          })}

          {/* Selected Pin Mini Card Overlay */}
          {selectedPinItem && (
            <div className="absolute bottom-3 left-3 right-3 sm:left-auto sm:right-3 sm:w-80 glass-card rounded-xl p-3 border border-purple-500/50 shadow-2xl z-30 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2">
              <img
                src={selectedPinItem.thumbnailUrl || selectedPinItem.mediaUrl}
                alt={selectedPinItem.title}
                className="w-14 h-14 rounded-lg object-cover shrink-0 border border-white/10"
              />
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-bold text-white truncate">{selectedPinItem.title}</h4>
                <p className="text-[11px] text-purple-300 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  <span className="truncate">{selectedPinItem.location.name}</span>
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <button
                    onClick={() => setActiveMediaForShare(selectedPinItem)}
                    className="text-[10px] bg-purple-900/40 text-purple-200 border border-purple-500/30 px-2 py-0.5 rounded-md hover:bg-purple-900"
                  >
                    View & Share
                  </button>
                  <button
                    onClick={() => setSelectedPinItem(null)}
                    className="text-[10px] text-gray-400 hover:text-white"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search landmarks, tags, cities, or captions..."
            className="w-full bg-[#131520] border border-[#232738] focus:border-purple-500 rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm text-gray-200 outline-none placeholder-gray-500"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          {/* Location Filter */}
          <select
            value={selectedLocationFilter}
            onChange={(e) => setSelectedLocationFilter(e.target.value)}
            className="bg-[#131520] border border-[#232738] text-xs font-medium text-gray-300 rounded-xl px-3 py-2 outline-none cursor-pointer"
          >
            <option value="all">All Locations</option>
            {allLocations.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>

          {/* Tag Filter */}
          <select
            value={selectedTagFilter}
            onChange={(e) => setSelectedTagFilter(e.target.value)}
            className="bg-[#131520] border border-[#232738] text-xs font-medium text-gray-300 rounded-xl px-3 py-2 outline-none cursor-pointer"
          >
            <option value="all">All Tags</option>
            {allTags.map((t) => (
              <option key={t} value={t}>
                #{t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* MEDIA GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {filteredMedia.map((item) => (
          <div
            key={item.id}
            className="glass-card glass-card-hover rounded-2xl overflow-hidden border border-[#232738] hover:border-purple-500/50 flex flex-col justify-between group shadow-lg"
          >
            {/* Media Thumbnail Container */}
            <div className="relative aspect-4/3 w-full overflow-hidden bg-[#090a0f]">
              {item.type === 'video' ? (
                <video src={item.mediaUrl} className="w-full h-full object-cover" controls />
              ) : (
                <img
                  src={item.mediaUrl}
                  alt={item.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                />
              )}

              {/* Type Badge */}
              <div className="absolute top-2.5 left-2.5 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-full border border-white/10 text-[10px] text-white flex items-center gap-1">
                {item.type === 'video' ? <Video className="w-3 h-3 text-red-400" /> : <ImageIcon className="w-3 h-3 text-purple-400" />}
                <span className="capitalize">{item.type}</span>
              </div>

              {/* Coordinates Badge */}
              <div className="absolute top-2.5 right-2.5 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-full border border-white/10 text-[9px] text-purple-300 flex items-center gap-1">
                <MapPin className="w-2.5 h-2.5" />
                <span>
                  {item.location.lat}°, {item.location.lng}°
                </span>
              </div>
            </div>

            {/* Info Body */}
            <div className="p-4 space-y-3 flex-grow flex flex-col justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-purple-400 font-semibold">
                  <span className="flex items-center gap-1 truncate">
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span className="truncate">{item.location.name}</span>
                  </span>
                  <span className="text-[10px] text-gray-500">
                    {new Date(item.timestamp).toLocaleDateString()}
                  </span>
                </div>

                <h4 className="text-sm font-bold text-white group-hover:text-purple-300 transition-colors line-clamp-1">
                  {item.title}
                </h4>

                {item.caption && (
                  <p className="text-xs text-gray-400 line-clamp-2">
                    {item.caption}
                  </p>
                )}

                {item.detectedLandmark && (
                  <div className="text-[10px] bg-purple-950/40 text-purple-300 border border-purple-500/20 px-2 py-0.5 rounded-md inline-block">
                    Landmark: {item.detectedLandmark}
                  </div>
                )}
              </div>

              {/* Tags & Action Buttons */}
              <div className="space-y-3 pt-2 border-t border-[#232738]">
                <div className="flex flex-wrap gap-1">
                  {item.tags.slice(0, 3).map((tag, idx) => (
                    <span
                      key={idx}
                      className="text-[10px] bg-[#090a0f] text-gray-400 border border-[#232738] px-2 py-0.5 rounded-md"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={() => setActiveMediaForShare(item)}
                    className="text-xs text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Share Card</span>
                  </button>

                  <button
                    onClick={() => onDeleteMedia(item.id)}
                    className="text-gray-500 hover:text-red-400 transition-colors text-xs"
                    title="Delete Media"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* SHAREABLE MEDIA GEOTAG CARD MODAL */}
      {activeMediaForShare && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-card rounded-3xl p-5 sm:p-7 max-w-md w-full border border-purple-500/50 shadow-2xl relative space-y-4">
            <button
              onClick={() => setActiveMediaForShare(null)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-[#131520] border border-[#232738] text-gray-400 hover:text-white flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Branded Geotag Share Card */}
            <div className="bg-[#090a0f] rounded-2xl overflow-hidden border border-purple-500/40 p-4 space-y-3">
              <div className="flex items-center justify-between text-xs text-purple-300 font-bold border-b border-white/10 pb-2">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  <span>Aadesh AI Geotagged Memory</span>
                </span>
                <span className="text-[10px] text-gray-400">Verifiable GPS</span>
              </div>

              <div className="rounded-xl overflow-hidden aspect-video relative">
                <img
                  src={activeMediaForShare.mediaUrl}
                  alt={activeMediaForShare.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-2 left-2 bg-black/75 px-2.5 py-1 rounded-md text-[10px] text-white flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-purple-400" />
                  <span>{activeMediaForShare.location.name}</span>
                </div>
              </div>

              <div>
                <h3 className="text-base font-bold text-white">{activeMediaForShare.title}</h3>
                <p className="text-xs text-gray-300 mt-1">{activeMediaForShare.caption}</p>
              </div>

              {/* Multilingual Translations */}
              {activeMediaForShare.translatedCaptions && (
                <div className="space-y-1.5 pt-2 border-t border-white/10 text-xs">
                  <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider block">
                    Multilingual Captions
                  </span>
                  {Object.entries(activeMediaForShare.translatedCaptions).map(([code, text]) => {
                    const lObj = SUPPORTED_LANGUAGES.find((l) => l.code === code);
                    return (
                      <p key={code} className="text-gray-300 text-[11px] italic bg-[#131520] p-1.5 rounded-lg border border-[#232738]">
                        <span className="font-bold text-purple-300">{lObj?.name || code}:</span> {text}
                      </p>
                    );
                  })}
                </div>
              )}

              <div className="flex justify-between items-center text-[10px] text-gray-500 pt-2 border-t border-white/5">
                <span>Lat: {activeMediaForShare.location.lat}° | Lng: {activeMediaForShare.location.lng}°</span>
                <span>{new Date(activeMediaForShare.timestamp).toLocaleDateString()}</span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(
                    `Check out "${activeMediaForShare.title}" geotagged at ${activeMediaForShare.location.name} on Aadesh AI!`
                  );
                  setCopiedShareLink(true);
                  setTimeout(() => setCopiedShareLink(false), 2000);
                }}
                className="flex-1 purple-glow-btn text-white text-xs font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2"
              >
                {copiedShareLink ? <Check className="w-4 h-4 text-white" /> : <Share2 className="w-4 h-4" />}
                <span>{copiedShareLink ? 'Link Copied!' : 'Copy Share Card'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UPLOAD GEOTAGGED MEDIA MODAL */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-card rounded-3xl p-5 sm:p-7 max-w-lg w-full border border-purple-500/50 shadow-2xl relative space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Upload className="w-4 h-4 text-purple-400" />
                <span>Upload Geotagged Media</span>
              </h3>
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="w-8 h-8 rounded-full bg-[#131520] border border-[#232738] text-gray-400 hover:text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* File Dropzone */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*,video/*"
              className="hidden"
            />
            {uploadFile ? (
              <div className="relative rounded-2xl overflow-hidden aspect-video bg-[#090a0f] border border-purple-500/40">
                {uploadFile.type === 'video' ? (
                  <video src={uploadFile.url} className="w-full h-full object-cover" controls />
                ) : (
                  <img src={uploadFile.url} alt="Upload preview" className="w-full h-full object-cover" />
                )}
                <button
                  onClick={() => setUploadFile(null)}
                  className="absolute top-2 right-2 bg-red-600/80 hover:bg-red-600 text-white p-1 rounded-lg text-xs"
                >
                  Change
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-purple-500/40 hover:border-purple-400 rounded-2xl p-8 text-center cursor-pointer bg-[#090a0f]/50 transition-colors"
              >
                <Upload className="w-8 h-8 text-purple-400 mx-auto mb-2 animate-bounce" />
                <p className="text-sm font-semibold text-white">Click or drag photo/video to upload</p>
                <p className="text-xs text-gray-400 mt-1">Supports PNG, JPG, WebP, MP4, WebM</p>
              </div>
            )}

            {/* Geotag Location Selector */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-300">Geographic Location</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowLocationPicker(true)}
                  className="flex-1 bg-[#090a0f] border border-[#232738] hover:border-purple-500 p-2.5 rounded-xl text-xs sm:text-sm text-left flex items-center justify-between text-purple-300"
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <MapPin className="w-3.5 h-3.5 text-purple-400" />
                    <span>{uploadLocation ? uploadLocation.name : 'Select Location'}</span>
                  </span>
                  <span className="text-[10px] text-gray-500">Change</span>
                </button>
              </div>
            </div>

            {/* Title */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-300">Title</label>
              <input
                type="text"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                placeholder="e.g. Asakusa Lantern in Tokyo"
                className="w-full bg-[#090a0f] border border-[#232738] focus:border-purple-500 p-2.5 rounded-xl text-xs sm:text-sm text-white outline-none"
              />
            </div>

            {/* Caption */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-300">Caption / Description</label>
                {uploadFile && (
                  <button
                    type="button"
                    onClick={handleAnalyzeWithAI}
                    disabled={isAnalyzing}
                    className="text-[10px] text-purple-400 hover:text-purple-300 flex items-center gap-1 font-semibold"
                  >
                    <Sparkles className="w-3 h-3 text-purple-400" />
                    <span>{isAnalyzing ? 'Analyzing...' : 'AI Auto-Describe & Translate'}</span>
                  </button>
                )}
              </div>
              <textarea
                value={uploadCaption}
                onChange={(e) => setUploadCaption(e.target.value)}
                rows={3}
                placeholder="Describe this scene or landmark..."
                className="w-full bg-[#090a0f] border border-[#232738] focus:border-purple-500 p-2.5 rounded-xl text-xs sm:text-sm text-white outline-none resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#131520] border border-[#232738] text-xs text-gray-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveMedia}
                disabled={!uploadFile || !uploadLocation}
                className="purple-glow-btn text-white text-xs font-semibold px-5 py-2 rounded-xl disabled:opacity-50"
              >
                Save Geotagged Media
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Geotag Picker Modal */}
      <GeotagPickerModal
        isOpen={showLocationPicker}
        onClose={() => setShowLocationPicker(false)}
        onSelectLocation={(loc) => setUploadLocation(loc)}
        currentSelected={uploadLocation || undefined}
      />
    </div>
  );
};
