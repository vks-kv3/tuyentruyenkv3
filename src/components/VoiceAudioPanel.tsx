import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Music, Play, RefreshCw, Square, Volume2 } from 'lucide-react';
import type { BroadcastProject, StoryboardScene, VoiceOption } from '../types/broadcast';

interface VoiceAudioPanelProps {
  project: BroadcastProject;
  onUpdateProject: (patch: Partial<BroadcastProject>) => void;
  onUpdateScene: (sceneId: string, patch: Partial<StoryboardScene>) => void;
  onNextStep: () => void;
  onError: (msg: string) => void;
}

const DEFAULT_SAMPLE_TEXT =
  'Bản tin hoạt động của Viện Kiểm sát nhân dân Khu vực 3, tỉnh Quảng Trị. Tiếp tục nâng cao chất lượng công tác thực hành quyền công tố và kiểm sát hoạt động tư pháp.';

const VOICE_OPTIONS: Array<{ id: VoiceOption; label: string; desc: string }> = [
  { id: 'Charon', label: 'Charon — Nam trung trầm, trang trọng', desc: 'Phù hợp bản tin thời sự chính thống' },
  { id: 'Fenrir', label: 'Fenrir — Nam trầm, đĩnh đạc', desc: 'Chất giọng dày, nghiêm trang hội nghị' },
  { id: 'Orus', label: 'Orus — Nam ấm áp, truyền cảm', desc: 'Nhịp đọc mạch lạc, gần gũi' },
  { id: 'Kore', label: 'Kore — Nữ phát thanh viên chuẩn mực', desc: 'Tùy chọn giọng nữ truyền hình' },
];

export const VoiceAudioPanel: React.FC<VoiceAudioPanelProps> = ({
  project,
  onUpdateProject,
  onUpdateScene,
  onNextStep,
  onError,
}) => {
  const [autoSyncDuration, setAutoSyncDuration] = useState(true);
  const [generatingSceneId, setGeneratingSceneId] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [sampleText, setSampleText] = useState(
    () => project.scenes[0]?.narration?.trim() || DEFAULT_SAMPLE_TEXT
  );
  const [previewCache, setPreviewCache] = useState<Record<string, string>>({});
  const [loadingPreviewVoice, setLoadingPreviewVoice] = useState<VoiceOption | null>(null);
  const [playingPreviewVoice, setPlayingPreviewVoice] = useState<VoiceOption | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const firstNarration = project.scenes[0]?.narration?.trim();
    if (firstNarration && sampleText === DEFAULT_SAMPLE_TEXT) {
      setSampleText(firstNarration);
    }
  }, [project.scenes, sampleText]);

  useEffect(() => {
    return () => {
      previewAudioRef.current?.pause();
    };
  }, []);

  const handlePreviewVoice = async (voiceId: VoiceOption) => {
    // Toggle stop if this voice is currently playing
    if (playingPreviewVoice === voiceId && previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
      setPlayingPreviewVoice(null);
      return;
    }

    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      setPlayingPreviewVoice(null);
    }

    const cacheKey = `${voiceId}::${sampleText.trim()}`;
    let audioUrl = previewCache[cacheKey];

    if (!audioUrl) {
      setLoadingPreviewVoice(voiceId);
      try {
        const res = await fetch('/api/preview-voice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            voiceName: voiceId,
            sampleText: sampleText.trim() || DEFAULT_SAMPLE_TEXT,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Không thể tạo mẫu nghe thử giọng đọc.');
        }
        audioUrl = data.audioUrl;
        setPreviewCache((prev) => ({ ...prev, [cacheKey]: audioUrl }));
      } catch (err: unknown) {
        onError(err instanceof Error ? err.message : 'Lỗi khi tạo mẫu nghe thử.');
        setLoadingPreviewVoice(null);
        return;
      } finally {
        setLoadingPreviewVoice(null);
      }
    }

    if (previewAudioRef.current && audioUrl) {
      previewAudioRef.current.src = audioUrl;
      previewAudioRef.current.currentTime = 0;
      setPlayingPreviewVoice(voiceId);
      previewAudioRef.current.play().catch(() => {
        setPlayingPreviewVoice(null);
      });
    }
  };

  const generateSingleTts = async (scene: StoryboardScene): Promise<void> => {
    const res = await fetch('/api/generate-tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sceneId: scene.id,
        text: scene.narration,
        voiceName: project.voiceName,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `Không thể tạo giọng đọc cho cảnh ${scene.sceneIndex}.`);
    }

    const patch: Partial<StoryboardScene> = {
      audioUrl: data.audioUrl,
      audioDurationSec: data.durationSec,
    };

    if (autoSyncDuration && data.durationSec > 0) {
      // Pad slightly (0.8s) for clean transition breathing room, minimum 4.0s
      patch.durationSec = Number(Math.max(4, data.durationSec + 0.8).toFixed(1));
    }

    onUpdateScene(scene.id, patch);
  };

  const handleGenerateAll = async () => {
    const validScenes = project.scenes.filter((s) => s.narration.trim().length > 0);
    if (validScenes.length === 0) return;

    setBatchProgress({ current: 0, total: validScenes.length });
    try {
      for (let i = 0; i < validScenes.length; i++) {
        setBatchProgress({ current: i + 1, total: validScenes.length });
        setGeneratingSceneId(validScenes[i].id);
        await generateSingleTts(validScenes[i]);
      }
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Lỗi khi tạo giọng đọc.');
    } finally {
      setBatchProgress(null);
      setGeneratingSceneId(null);
    }
  };

  const handleRegenerateOne = async (scene: StoryboardScene) => {
    setGeneratingSceneId(scene.id);
    try {
      await generateSingleTts(scene);
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Lỗi khi tạo lại giọng đọc.');
    } finally {
      setGeneratingSceneId(null);
    }
  };

  const voicedCount = project.scenes.filter((s) => Boolean(s.audioUrl)).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-lg font-display font-semibold text-white">
            03. Giọng đọc phát thanh viên & Nhạc nền thời sự
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Đã tạo giọng đọc{' '}
            <span className="font-mono-tabular text-slate-200">
              {voicedCount}/{project.scenes.length}
            </span>{' '}
            phân cảnh · Tốc độ chuẩn 130–145 từ/phút
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleGenerateAll}
            disabled={project.scenes.length === 0 || Boolean(batchProgress)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white transition-colors whitespace-nowrap shrink-0"
          >
            {batchProgress ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>
                  Đang tạo giọng ({batchProgress.current}/{batchProgress.total})...
                </span>
              </>
            ) : (
              <>
                <Mic className="w-3.5 h-3.5" />
                <span>Tạo toàn bộ giọng đọc bản tin</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onNextStep}
            disabled={project.scenes.length === 0}
            className="px-4 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-100 transition-colors whitespace-nowrap shrink-0"
          >
            Tiếp tục: Xuất MP4 →
          </button>
        </div>
      </div>

      {/* Voice & BGM Settings */}
      <audio
        ref={previewAudioRef}
        onEnded={() => setPlayingPreviewVoice(null)}
        onError={() => setPlayingPreviewVoice(null)}
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section className="bg-[#0F172A] border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-semibold text-white">Chọn & nghe thử giọng phát thanh viên</h3>
            </div>
            <span className="text-[11px] text-slate-400">Nghe thử trước khi chọn</span>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">
              Câu mẫu nghe thử (có thể sửa lại theo ý bạn)
            </label>
            <textarea
              rows={2}
              value={sampleText}
              onChange={(e) => setSampleText(e.target.value)}
              className="w-full rounded-lg bg-[#0B1120] border border-slate-800 px-3 py-2 text-xs text-slate-200 leading-relaxed focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {VOICE_OPTIONS.map((v) => {
              const active = project.voiceName === v.id;
              const isLoading = loadingPreviewVoice === v.id;
              const isPlaying = playingPreviewVoice === v.id;
              return (
                <div
                  key={v.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onUpdateProject({ voiceName: v.id })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onUpdateProject({ voiceName: v.id });
                    }
                  }}
                  className={`text-left p-3 rounded-lg border transition-colors cursor-pointer flex flex-col justify-between gap-2.5 ${
                    active
                      ? 'bg-blue-950/50 border-blue-500 text-white'
                      : 'bg-[#0B1120] border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="text-xs font-semibold leading-snug">{v.label}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{v.desc}</div>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
                    <span className={`text-[11px] font-medium ${active ? 'text-blue-300' : 'text-slate-500'}`}>
                      {active ? 'Đang chọn' : 'Nhấn thẻ để chọn'}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePreviewVoice(v.id);
                      }}
                      disabled={Boolean(loadingPreviewVoice && !isLoading)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                        isPlaying
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                      }`}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Đang tạo...</span>
                        </>
                      ) : isPlaying ? (
                        <>
                          <Square className="w-3 h-3 fill-current" />
                          <span>Dừng</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3 h-3 fill-current" />
                          <span>Nghe thử</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={autoSyncDuration}
              onChange={(e) => setAutoSyncDuration(e.target.checked)}
              className="accent-blue-500 rounded"
            />
            <span>Tự động điều chỉnh thời lượng phân cảnh khớp chính xác với độ dài file giọng đọc (+0.8s)</span>
          </label>
        </section>

        <section className="bg-[#0F172A] border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Music className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-white">Nhạc nền thời sự không lời</h3>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={project.bgmEnabled}
                onChange={(e) => onUpdateProject({ bgmEnabled: e.target.checked })}
                className="accent-blue-500 rounded"
              />
              <span>Bật nhạc nền trang trọng</span>
            </label>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
              <span>Âm lượng nhạc nền (luôn nhỏ hơn rõ rệt so với giọng đọc)</span>
              <span className="font-mono-tabular text-slate-200">{Math.round(project.bgmVolume * 100)}%</span>
            </div>
            <input
              type="range"
              min={0.04}
              max={0.25}
              step={0.01}
              disabled={!project.bgmEnabled}
              value={project.bgmVolume}
              onChange={(e) => onUpdateProject({ bgmVolume: Number(e.target.value) })}
              className="w-full accent-blue-500 disabled:opacity-40"
            />
          </div>

          <div className="pt-1">
            <p className="text-xs text-slate-400 mb-1.5">Nghe thử giai điệu nhạc nền thời sự:</p>
            <audio controls src="/api/bgm-preview?duration=24" className="w-full h-9" preload="none" />
          </div>
        </section>
      </div>

      {/* Per-Scene Audio List */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-white">Giọng đọc từng phân cảnh</h3>
        {project.scenes.length === 0 ? (
          <div className="bg-[#0F172A] border border-dashed border-slate-800 rounded-xl p-8 text-center text-sm text-slate-400">
            Chưa có phân cảnh nào. Vui lòng hoàn tất Bước 01 và 02 trước.
          </div>
        ) : (
          <div className="space-y-2.5">
            {project.scenes.map((sc) => {
              const isBusy = generatingSceneId === sc.id;
              return (
                <div
                  key={sc.id}
                  className="bg-[#0F172A] border border-slate-800 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-mono-tabular font-semibold text-blue-400">
                        Cảnh {String(sc.sceneIndex).padStart(2, '0')}
                      </span>
                      <span className="text-slate-300 font-medium truncate">{sc.title}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular text-slate-400">
                        Thời lượng cảnh: {sc.durationSec}s
                      </span>
                      {sc.audioDurationSec && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-tabular text-emerald-400">
                            Giọng đọc: {sc.audioDurationSec}s
                          </span>
                        </>
                      )}
                    </div>
                    <p className="text-sm text-slate-200 leading-relaxed">{sc.narration}</p>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    {sc.audioUrl ? (
                      <audio controls src={sc.audioUrl} className="h-9 w-56" preload="none" />
                    ) : (
                      <span className="text-xs text-slate-500 px-3">Chưa tạo âm thanh</span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRegenerateOne(sc)}
                      disabled={isBusy || Boolean(batchProgress) || !sc.narration.trim()}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 transition-colors whitespace-nowrap shrink-0"
                    >
                      {isBusy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      <span>{sc.audioUrl ? 'Tạo lại' : 'Tạo giọng'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
