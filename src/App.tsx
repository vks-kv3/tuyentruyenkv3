import { useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { AssetsUploadPanel } from './components/AssetsUploadPanel';
import { BroadcastMonitor } from './components/BroadcastMonitor';
import { ExportVideoPanel } from './components/ExportVideoPanel';
import { StoryboardPanel } from './components/StoryboardPanel';
import { VoiceAudioPanel } from './components/VoiceAudioPanel';
import { calibrateTickerParams } from './lib/broadcastRenderer';
import type {
  BroadcastProject,
  RenderedVideoResult,
  StoryboardScene,
  UploadedPhoto,
} from './types/broadcast';

type StudioTab = 'assets' | 'storyboard' | 'audio' | 'export';

const INITIAL_PROJECT: BroadcastProject = {
  unitName: 'VIỆN KIỂM SÁT NHÂN DÂN KHU VỰC 3 - QUẢNG TRỊ',
  closingSubtitle: 'BẢN TIN HOẠT ĐỘNG',
  tickerText: 'VIỆN KIỂM SÁT NHÂN DÂN KHU VỰC 3 - QUẢNG TRỊ · BẢN TIN HOẠT ĐỘNG',
  tickerSpeed: 150,
  tickerFontSize: 38,
  openingTallSeconds: 5,
  lowerThirdStyle: 'diagonal-classic',
  logoUrl: null,
  voiceName: 'Charon',
  bgmVolume: 0.12,
  bgmEnabled: true,
  resolution: '1080p',
  facts: null,
  scenes: [],
};

export default function App() {
  const [activeTab, setActiveTab] = useState<StudioTab>('assets');
  const [project, setProject] = useState<BroadcastProject>(INITIAL_PROJECT);
  const [docText, setDocText] = useState('');
  const [docFilename, setDocFilename] = useState('');
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [renderedVideo, setRenderedVideo] = useState<RenderedVideoResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleUpdateProject = (patch: Partial<BroadcastProject>) => {
    setProject((prev) => ({ ...prev, ...patch }));
  };

  const handleAssetsUploaded = (payload: {
    docText?: string;
    docFilename?: string;
    photos?: UploadedPhoto[];
    logoUrl?: string;
  }) => {
    setErrorMsg(null);
    if (payload.docText !== undefined) {
      setDocText(payload.docText);
    }
    if (payload.docFilename !== undefined) {
      setDocFilename(payload.docFilename);
    }
    if (payload.photos && payload.photos.length > 0) {
      setPhotos((prev) => [...prev, ...payload.photos!]);
    }
    if (payload.logoUrl) {
      handleUpdateProject({ logoUrl: payload.logoUrl });
    }
  };

  const handleRemovePhoto = (id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  const handleMovePhoto = (index: number, direction: -1 | 1) => {
    setPhotos((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(target, 0, item);
      return copy;
    });
  };

  const handleAnalyzeStoryboard = async () => {
    setErrorMsg(null);
    setIsAnalyzing(true);
    try {
      const res = await fetch('/api/analyze-and-storyboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docText,
          photos: photos.map((p) => ({ id: p.id, filename: p.filename, url: p.url })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Không thể phân tích tài liệu.');
      }

      const cal = calibrateTickerParams(data.tickerText || '');
      setProject((prev) => ({
        ...prev,
        facts: data.facts,
        tickerText: data.tickerText || prev.tickerText,
        tickerFontSize: cal.fontSize,
        tickerSpeed: cal.speed,
        scenes: data.scenes || [],
      }));
      setRenderedVideo(null);
      setActiveTab('storyboard');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi khi phân tích tài liệu.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleUpdateScene = (sceneId: string, patch: Partial<StoryboardScene>) => {
    setProject((prev) => ({
      ...prev,
      scenes: prev.scenes.map((sc) => (sc.id === sceneId ? { ...sc, ...patch } : sc)),
    }));
  };

  const handleMoveScene = (index: number, direction: -1 | 1) => {
    setProject((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.scenes.length) return prev;
      const copy = [...prev.scenes];
      const [item] = copy.splice(index, 1);
      copy.splice(target, 0, item);
      return {
        ...prev,
        scenes: copy.map((s, idx) => ({ ...s, sceneIndex: idx + 1 })),
      };
    });
  };

  const handleDeleteScene = (sceneId: string) => {
    setProject((prev) => {
      if (prev.scenes.length <= 1) return prev;
      const filtered = prev.scenes.filter((s) => s.id !== sceneId);
      return {
        ...prev,
        scenes: filtered.map((s, idx) => ({ ...s, sceneIndex: idx + 1 })),
      };
    });
  };

  const handleAddScene = () => {
    if (photos.length === 0) return;
    setProject((prev) => {
      const idx = prev.scenes.length + 1;
      const newScene: StoryboardScene = {
        id: `scene_custom_${Date.now()}`,
        sceneIndex: idx,
        title: `Phân cảnh bổ sung ${idx}`,
        photoId: photos[0].id,
        durationSec: 5,
        narration: '',
        motionEffect: idx % 2 === 0 ? 'zoom-out' : 'zoom-in',
        transition: 'dissolve',
        personTag: { name: '', title: '', show: false },
        isClosingScene: false,
      };
      return { ...prev, scenes: [...prev.scenes, newScene] };
    });
  };

  const NAV_ITEMS: Array<{ id: StudioTab; label: string }> = [
    { id: 'assets', label: '01. Tư liệu' },
    { id: 'storyboard', label: '02. Kịch bản' },
    { id: 'audio', label: '03. Giọng đọc' },
    { id: 'export', label: '04. Xuất MP4' },
  ];

  return (
    <div className="min-h-screen bg-[#0B1120] text-slate-100 flex flex-col">
      {/* Top Bar: 3-Zone Contract */}
      <header className="sticky top-0 z-30 bg-[#0B1120]/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-[1400px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => setActiveTab('assets')}
            className="font-display text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0 text-left"
          >
            Xưởng Bản Tin VKSND Khu Vực 3
          </button>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium">
            {NAV_ITEMS.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`py-5 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'border-blue-500 text-white'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('export')}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors whitespace-nowrap shrink-0"
            >
              Xuất Video MP4
            </button>
          </div>
        </div>

        {/* Mobile Nav Row */}
        <div className="flex md:hidden border-t border-slate-800 px-4 overflow-x-auto gap-4">
          {NAV_ITEMS.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`py-2.5 text-xs font-medium border-b-2 whitespace-nowrap shrink-0 ${
                  active ? 'border-blue-500 text-white' : 'border-transparent text-slate-400'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Broadcast Production Workspace */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-6 py-6 space-y-6">
        {errorMsg && (
          <div className="flex items-start justify-between gap-3 bg-red-950/60 border border-red-700/60 text-red-100 px-4 py-3 rounded-xl text-sm">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              className="text-red-300 hover:text-white shrink-0"
              aria-label="Đóng thông báo lỗi"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Dominant Anchor: 16:9 Live Broadcast Monitor */}
        <BroadcastMonitor project={project} photos={photos} />

        {/* Step Workspace */}
        <div>
          {activeTab === 'assets' && (
            <AssetsUploadPanel
              docText={docText}
              docFilename={docFilename}
              photos={photos}
              logoUrl={project.logoUrl}
              isAnalyzing={isAnalyzing}
              onDocTextChange={(text, fname) => {
                setDocText(text);
                if (fname !== undefined) setDocFilename(fname);
              }}
              onAssetsUploaded={handleAssetsUploaded}
              onRemovePhoto={handleRemovePhoto}
              onMovePhoto={handleMovePhoto}
              onAnalyzeStoryboard={handleAnalyzeStoryboard}
              onError={(msg) => setErrorMsg(msg)}
            />
          )}

          {activeTab === 'storyboard' && (
            <StoryboardPanel
              project={project}
              photos={photos}
              onUpdateProject={handleUpdateProject}
              onUpdateScene={handleUpdateScene}
              onMoveScene={handleMoveScene}
              onDeleteScene={handleDeleteScene}
              onAddScene={handleAddScene}
              onNextStep={() => setActiveTab('audio')}
            />
          )}

          {activeTab === 'audio' && (
            <VoiceAudioPanel
              project={project}
              onUpdateProject={handleUpdateProject}
              onUpdateScene={handleUpdateScene}
              onNextStep={() => setActiveTab('export')}
              onError={(msg) => setErrorMsg(msg)}
            />
          )}

          {activeTab === 'export' && (
            <ExportVideoPanel
              project={project}
              photos={photos}
              renderedVideo={renderedVideo}
              onUpdateProject={handleUpdateProject}
              onRenderComplete={(res) => setRenderedVideo(res)}
              onError={(msg) => setErrorMsg(msg)}
            />
          )}
        </div>
      </main>
    </div>
  );
}
