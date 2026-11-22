import React, { useState } from 'react';
import { CheckCircle2, Download, FileCode, Film, Loader2, AlertTriangle } from 'lucide-react';
import { generateExportPlates } from '../lib/broadcastRenderer';
import type {
  BroadcastProject,
  ExportResolution,
  RenderedVideoResult,
  UploadedPhoto,
} from '../types/broadcast';

interface ExportVideoPanelProps {
  project: BroadcastProject;
  photos: UploadedPhoto[];
  renderedVideo: RenderedVideoResult | null;
  onUpdateProject: (patch: Partial<BroadcastProject>) => void;
  onRenderComplete: (result: RenderedVideoResult) => void;
  onError: (msg: string) => void;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Không tải được ảnh: ${url}`));
    img.src = url;
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const ExportVideoPanel: React.FC<ExportVideoPanelProps> = ({
  project,
  photos,
  renderedVideo,
  onUpdateProject,
  onRenderComplete,
  onError,
}) => {
  const [isRendering, setIsRendering] = useState(false);
  const [renderPhase, setRenderPhase] = useState('');

  const totalDuration = project.scenes.reduce((sum, s) => sum + s.durationSec, 0);
  const voicedCount = project.scenes.filter((s) => Boolean(s.audioUrl)).length;

  const handleRenderMp4 = async () => {
    if (project.scenes.length === 0) return;
    setIsRendering(true);
    setRenderPhase('Đang chuẩn bị lớp đồ họa độ phân giải cao...');
    try {
      await document.fonts.ready;
      const logoImg = project.logoUrl ? await loadImage(project.logoUrl).catch(() => null) : null;
      const generated = generateExportPlates(project, logoImg);

      setRenderPhase('Đang dựng chuyển cảnh, ghép thanh chạy chữ & hòa âm FFmpeg H.264...');
      const res = await fetch('/api/render-mp4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resolution: project.resolution,
          scenes: project.scenes.map((s) => ({
            id: s.id,
            photoId: s.photoId,
            durationSec: s.durationSec,
            motionEffect: s.motionEffect,
            transition: s.transition,
            audioUrl: s.audioUrl,
            personTagPngBase64: generated.personTagsBySceneId[s.id],
            isClosingScene: s.isClosingScene,
          })),
          photos: photos.map((p) => ({ id: p.id, url: p.url })),
          openingTallSeconds: project.openingTallSeconds,
          tickerSpeed: project.tickerSpeed,
          tickerYOffsetTall: generated.tickerYOffsetTall,
          tickerYOffsetCompact: generated.tickerYOffsetCompact,
          bgmEnabled: project.bgmEnabled,
          bgmVolume: project.bgmVolume,
          plates: generated.plates,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Quá trình dựng video MP4 gặp lỗi.');
      }

      onRenderComplete(data as RenderedVideoResult);
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Không thể xuất video MP4.');
    } finally {
      setIsRendering(false);
      setRenderPhase('');
    }
  };

  const handleDownloadConfig = () => {
    const payload = {
      unitName: project.unitName,
      closingSubtitle: project.closingSubtitle,
      resolution: project.resolution === '4k' ? '3840x2160' : '1920x1080',
      fps: 30,
      format: 'MP4 (H.264 yuv420p + AAC 48kHz)',
      tickerText: project.tickerText,
      tickerFontSize: project.tickerFontSize,
      tickerSpeedPxPerSec: project.tickerSpeed,
      openingTallSeconds: project.openingTallSeconds,
      lowerThirdStyle: project.lowerThirdStyle,
      facts: project.facts,
      scenes: project.scenes,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cau-hinh-va-kich-ban-vksnd-kv3.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-lg font-display font-semibold text-white">
            04. Dựng & Xuất Video Bản Tin MP4
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Kết xuất tệp MP4 chuẩn phát hành (H.264 + AAC 48kHz) giữ nguyên chất lượng ảnh thực tế và đồ họa truyền hình.
          </p>
        </div>
        <button
          type="button"
          onClick={handleDownloadConfig}
          disabled={project.scenes.length === 0}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 transition-colors whitespace-nowrap shrink-0"
        >
          <FileCode className="w-3.5 h-3.5" />
          <span>Tải cấu hình & kịch bản (.JSON)</span>
        </button>
      </div>

      {/* Export Controls & Pre-Flight Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <section className="lg:col-span-5 bg-[#0F172A] border border-slate-800 rounded-xl p-5 space-y-5">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-white">Thông số xuất bản</h3>
            <div className="grid grid-cols-2 gap-2.5">
              {([
                { id: '1080p', title: 'Full HD 1080p', sub: '1920 × 1080 · 30 fps' },
                { id: '4k', title: '4K Ultra HD', sub: '3840 × 2160 · 30 fps' },
              ] as Array<{ id: ExportResolution; title: string; sub: string }>).map((opt) => {
                const active = project.resolution === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onUpdateProject({ resolution: opt.id })}
                    className={`text-left p-3 rounded-lg border transition-colors ${
                      active
                        ? 'bg-blue-950/50 border-blue-500 text-white'
                        : 'bg-[#0B1120] border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-xs font-semibold">{opt.title}</div>
                    <div className="font-mono-tabular text-[11px] text-slate-400 mt-0.5">{opt.sub}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2.5 pt-2 border-t border-slate-800 text-xs">
            <h4 className="font-semibold text-slate-300">Kiểm tra thành phần trước khi dựng</h4>
            <div className="flex items-center justify-between text-slate-300">
              <span>Phân cảnh & Hình ảnh thực tế</span>
              <span className="font-mono-tabular text-slate-200">
                {project.scenes.length} cảnh · {totalDuration.toFixed(1)}s
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span>Logo góc trên trái</span>
              <span className={project.logoUrl ? 'text-emerald-400' : 'text-amber-400'}>
                {project.logoUrl ? 'Đã nạp tệp logo' : 'Chưa có file logo'}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span>Giọng đọc phát thanh viên</span>
              <span
                className={`font-mono-tabular ${
                  voicedCount === project.scenes.length && project.scenes.length > 0
                    ? 'text-emerald-400'
                    : 'text-amber-400'
                }`}
              >
                {voicedCount}/{project.scenes.length} cảnh đã có audio
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span>Nhạc nền thời sự</span>
              <span className="font-mono-tabular text-slate-200">
                {project.bgmEnabled ? `Bật (${Math.round(project.bgmVolume * 100)}%)` : 'Tắt'}
              </span>
            </div>
          </div>

          {voicedCount < project.scenes.length && project.scenes.length > 0 && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-950/30 border border-amber-700/40 text-xs text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                Một số phân cảnh chưa có tệp giọng đọc. Bạn vẫn có thể dựng video ngay, hoặc quay lại Bước 03 để tạo đủ giọng đọc trước khi xuất MP4.
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={handleRenderMp4}
            disabled={project.scenes.length === 0 || isRendering}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white transition-colors"
          >
            {isRendering ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang dựng video MP4...</span>
              </>
            ) : (
              <>
                <Film className="w-4 h-4" />
                <span>Tiến hành dựng & xuất video MP4</span>
              </>
            )}
          </button>

          {renderPhase && <p className="text-xs text-blue-300 text-center">{renderPhase}</p>}
        </section>

        {/* Rendered Output Video Player */}
        <section className="lg:col-span-7 bg-[#0F172A] border border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4">
          {renderedVideo ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <h3 className="text-sm font-semibold text-white">Đã xuất tệp video MP4 hoàn chỉnh</h3>
                    <p className="text-xs text-slate-400 font-mono-tabular">
                      {renderedVideo.resolution} · {renderedVideo.durationSec.toFixed(1)}s ·{' '}
                      {formatFileSize(renderedVideo.fileSizeBytes)}
                    </p>
                  </div>
                </div>
                <a
                  href={`${renderedVideo.videoUrl}?download=1`}
                  download={renderedVideo.filename}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Tải về MP4</span>
                </a>
              </div>

              <div className="aspect-video w-full rounded-lg overflow-hidden bg-black border border-slate-800">
                <video
                  key={renderedVideo.videoUrl}
                  src={renderedVideo.videoUrl}
                  controls
                  className="w-full h-full"
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center py-14 px-6 text-center border border-dashed border-slate-800 rounded-lg bg-[#0B1120]">
              <Film className="w-8 h-8 text-slate-600 mb-3" />
              <p className="text-sm font-medium text-slate-300">Chưa có tệp MP4 được kết xuất</p>
              <p className="text-xs text-slate-500 mt-1 max-w-md">
                Khi bạn bấm "Tiến hành dựng & xuất video MP4", máy chủ sẽ kết hợp ảnh gốc, chuyển động mượt, đồ họa nhận diện VKSND và âm thanh để tạo tệp MP4 thực tế tải về ngay tại đây.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
