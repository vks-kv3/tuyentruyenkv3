import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Grid, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { LoadedMediaCache, renderBroadcastFrame } from '../lib/broadcastRenderer';
import type { BroadcastProject, UploadedPhoto } from '../types/broadcast';

interface BroadcastMonitorProps {
  project: BroadcastProject;
  photos: UploadedPhoto[];
}

function formatTimecode(sec: number): string {
  const safe = Math.max(0, sec);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const tenths = Math.floor((safe % 1) * 10);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

export const BroadcastMonitor: React.FC<BroadcastMonitorProps> = ({ project, photos }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [showSafeGuides, setShowSafeGuides] = useState(false);
  const [mediaVersion, setMediaVersion] = useState(0);

  const mediaCacheRef = useRef<LoadedMediaCache>({
    logoImg: null,
    photos: new Map(),
  });

  // Synchronized audio elements
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const bgmAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastPlayedSceneIdRef = useRef<string | null>(null);

  const totalDuration = useMemo(
    () => project.scenes.reduce((sum, s) => sum + s.durationSec, 0),
    [project.scenes]
  );

  // Scene start/end boundaries
  const sceneRanges = useMemo(() => {
    let acc = 0;
    return project.scenes.map((s) => {
      const start = acc;
      acc += s.durationSec;
      return { scene: s, start, end: acc };
    });
  }, [project.scenes]);

  // Preload logo image
  useEffect(() => {
    if (!project.logoUrl) {
      mediaCacheRef.current.logoImg = null;
      setMediaVersion((v) => v + 1);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      mediaCacheRef.current.logoImg = img;
      setMediaVersion((v) => v + 1);
    };
    img.src = project.logoUrl;
  }, [project.logoUrl]);

  // Preload uploaded photos
  useEffect(() => {
    const cache = mediaCacheRef.current.photos;
    const validIds = new Set(photos.map((p) => p.id));
    for (const k of cache.keys()) {
      if (!validIds.has(k)) cache.delete(k);
    }
    for (const p of photos) {
      if (cache.has(p.id)) continue;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        cache.set(p.id, img);
        setMediaVersion((v) => v + 1);
      };
      img.src = p.url;
    }
  }, [photos]);

  // Draw current frame whenever project, media, or currentTime updates
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let cancelled = false;
    document.fonts.ready.then(() => {
      if (cancelled) return;
      renderBroadcastFrame(ctx, canvas.width, canvas.height, project, mediaCacheRef.current, currentTime);
    });
    return () => {
      cancelled = true;
    };
  }, [project, currentTime, mediaVersion]);

  // Playback animation loop
  useEffect(() => {
    if (!isPlaying || totalDuration <= 0) {
      voiceAudioRef.current?.pause();
      bgmAudioRef.current?.pause();
      lastPlayedSceneIdRef.current = null;
      return;
    }

    let rafId = 0;
    let lastTs = performance.now();

    // Start BGM if enabled
    if (project.bgmEnabled && bgmAudioRef.current) {
      bgmAudioRef.current.volume = isMuted ? 0 : Math.min(0.4, project.bgmVolume);
      bgmAudioRef.current.currentTime = currentTime % Math.max(10, totalDuration);
      bgmAudioRef.current.play().catch(() => {});
    }

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - lastTs) / 1000);
      lastTs = now;

      setCurrentTime((prev) => {
        const next = prev + dt;
        if (next >= totalDuration) {
          setIsPlaying(false);
          return 0;
        }
        return next;
      });

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, totalDuration]);

  // Sync scene voiceover WAV and BGM volume during playback
  useEffect(() => {
    if (bgmAudioRef.current) {
      bgmAudioRef.current.volume = isMuted || !project.bgmEnabled ? 0 : Math.min(0.4, project.bgmVolume);
    }
    if (voiceAudioRef.current) {
      voiceAudioRef.current.muted = isMuted;
    }

    if (!isPlaying) return;

    const activeRange = sceneRanges.find((r) => currentTime >= r.start && currentTime < r.end);
    if (!activeRange) return;

    const { scene, start } = activeRange;
    if (lastPlayedSceneIdRef.current !== scene.id) {
      lastPlayedSceneIdRef.current = scene.id;
      const va = voiceAudioRef.current;
      if (va) {
        va.pause();
        if (scene.audioUrl) {
          va.src = scene.audioUrl;
          const offset = Math.max(0, currentTime - start - 0.2);
          va.currentTime = offset;
          va.play().catch(() => {});
        } else {
          va.removeAttribute('src');
        }
      }
    }
  }, [isPlaying, currentTime, sceneRanges, isMuted, project.bgmEnabled, project.bgmVolume]);

  const activeRange = sceneRanges.find((r) => currentTime >= r.start && currentTime < r.end) || sceneRanges[0];

  const handleScrub = (newTime: number) => {
    const clamped = Math.max(0, Math.min(totalDuration, newTime));
    lastPlayedSceneIdRef.current = null;
    setCurrentTime(clamped);
    if (bgmAudioRef.current && isPlaying && project.bgmEnabled) {
      bgmAudioRef.current.currentTime = clamped % Math.max(10, totalDuration);
    }
  };

  const bgmPreviewUrl = `/api/bgm-preview?duration=${Math.max(15, Math.ceil(totalDuration || 30))}`;

  return (
    <div className="bg-[#0F172A] border border-slate-800 rounded-xl overflow-hidden">
      {/* Hidden audio elements for synchronized broadcast preview */}
      <audio ref={voiceAudioRef} preload="auto" />
      <audio ref={bgmAudioRef} src={bgmPreviewUrl} loop preload="none" />

      {/* Monitor Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 bg-[#0B1120]">
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="font-display font-semibold text-slate-200">Màn hình kiểm duyệt 16:9</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono-tabular">
            {project.resolution === '4k' ? '3840 × 2160' : '1920 × 1080'} · 30 fps
          </span>
          {activeRange && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-slate-300 truncate max-w-[260px]">
                Cảnh {activeRange.scene.sceneIndex}/{project.scenes.length}: {activeRange.scene.title}
              </span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowSafeGuides((v) => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md transition-colors whitespace-nowrap shrink-0 ${
            showSafeGuides
              ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70'
          }`}
        >
          <Grid className="w-3.5 h-3.5" />
          <span>Khung an toàn</span>
        </button>
      </div>

      {/* 16:9 Canvas Stage */}
      <div className="relative w-full aspect-video bg-black">
        <canvas ref={canvasRef} width={1280} height={720} className="w-full h-full block" />

        {showSafeGuides && (
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-[5%] border border-dashed border-amber-400/45" />
            <div className="absolute inset-[10%] border border-dotted border-sky-400/35" />
          </div>
        )}

        {project.scenes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="bg-slate-950/75 border border-slate-800 px-5 py-3 rounded-lg text-center max-w-md">
              <p className="text-sm font-medium text-slate-200">
                Khung bố cục chuẩn bản tin VKSND Khu vực 3 - Quảng Trị
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Tải lên File Word, Hình ảnh hoạt động và Logo để AI lập kịch bản và trình chiếu trực tiếp tại đây.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Transport & Timeline Scrubber */}
      <div className="px-4 py-3 bg-[#0B1120] border-t border-slate-800 space-y-2.5">
        {/* Scene Segmented Scrubber */}
        <div className="relative">
          <input
            type="range"
            min={0}
            max={Math.max(1, totalDuration)}
            step={0.05}
            value={currentTime}
            onChange={(e) => handleScrub(Number(e.target.value))}
            disabled={totalDuration <= 0}
            aria-label="Thanh thời gian bản tin"
            className="w-full accent-blue-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
          />
          {sceneRanges.length > 0 && (
            <div className="flex w-full h-1.5 mt-1.5 gap-0.5 rounded overflow-hidden">
              {sceneRanges.map(({ scene, start }) => {
                const widthPct = totalDuration > 0 ? (scene.durationSec / totalDuration) * 100 : 0;
                const isActive = activeRange?.scene.id === scene.id;
                return (
                  <button
                    key={scene.id}
                    type="button"
                    onClick={() => handleScrub(start)}
                    title={`Cảnh ${scene.sceneIndex}: ${scene.title} (${scene.durationSec}s)`}
                    style={{ width: `${widthPct}%` }}
                    className={`h-full transition-colors ${
                      isActive
                        ? 'bg-blue-500'
                        : scene.audioUrl
                        ? 'bg-slate-600 hover:bg-slate-500'
                        : 'bg-slate-800 hover:bg-slate-700'
                    }`}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Transport Controls */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPlaying((p) => !p)}
              disabled={project.scenes.length === 0}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white transition-colors whitespace-nowrap shrink-0"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isPlaying ? 'Tạm dừng' : 'Phát bản tin'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                handleScrub(0);
              }}
              disabled={project.scenes.length === 0}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Về đầu</span>
            </button>
            <button
              type="button"
              onClick={() => setIsMuted((m) => !m)}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              aria-label={isMuted ? 'Bật tiếng' : 'Tắt tiếng'}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>

          <div className="font-mono-tabular text-xs text-slate-300">
            <span>{formatTimecode(currentTime)}</span>
            <span className="text-slate-500 mx-1.5">/</span>
            <span className="text-slate-400">{formatTimecode(totalDuration)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
