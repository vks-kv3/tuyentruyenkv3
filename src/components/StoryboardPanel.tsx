import React from 'react';
import {
  ArrowDown,
  ArrowUp,
  Download,
  Plus,
  SlidersHorizontal,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { calibrateTickerParams } from '../lib/broadcastRenderer';
import type {
  BroadcastProject,
  LowerThirdStyle,
  MotionEffect,
  StoryboardScene,
  TransitionEffect,
  UploadedPhoto,
} from '../types/broadcast';

interface StoryboardPanelProps {
  project: BroadcastProject;
  photos: UploadedPhoto[];
  onUpdateProject: (patch: Partial<BroadcastProject>) => void;
  onUpdateScene: (sceneId: string, patch: Partial<StoryboardScene>) => void;
  onMoveScene: (index: number, direction: -1 | 1) => void;
  onDeleteScene: (sceneId: string) => void;
  onAddScene: () => void;
  onNextStep: () => void;
}

function fmtSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1).padStart(4, '0');
  return `${String(m).padStart(2, '0')}:${s}`;
}

export const StoryboardPanel: React.FC<StoryboardPanelProps> = ({
  project,
  photos,
  onUpdateProject,
  onUpdateScene,
  onMoveScene,
  onDeleteScene,
  onAddScene,
  onNextStep,
}) => {
  const photoMap = new Map(photos.map((p) => [p.id, p]));
  const totalDuration = project.scenes.reduce((s, sc) => s + sc.durationSec, 0);

  const exportMarkdownScript = () => {
    const lines: string[] = [];
    lines.push(`# KỊCH BẢN PHÂN CẢNH BẢN TIN TRUYỀN HÌNH`);
    lines.push(`Đơn vị: ${project.unitName}`);
    lines.push(`Tiêu đề chạy chữ: ${project.tickerText}`);
    lines.push(`Tổng thời lượng dự kiến: ${totalDuration.toFixed(1)} giây`);
    lines.push('');

    if (project.facts) {
      lines.push(`## I. THÔNG TIN XÁC THỰC TỪ TÀI LIỆU GỐC`);
      lines.push(`- Tiêu đề chính: ${project.facts.mainTitle}`);
      lines.push(`- Thời gian: ${project.facts.eventTime}`);
      lines.push(`- Địa điểm: ${project.facts.location}`);
      lines.push(`- Thành phần: ${project.facts.attendees.join('; ')}`);
      lines.push(`- Kết quả nổi bật: ${project.facts.outcomes.join('; ')}`);
      lines.push(`- Ý nghĩa: ${project.facts.significance}`);
      lines.push('');
    }

    lines.push(`## II. BẢNG PHÂN CẢNH CHI TIẾT`);
    let acc = 0;
    for (const sc of project.scenes) {
      const start = acc;
      acc += sc.durationSec;
      const pName = photoMap.get(sc.photoId)?.filename || sc.photoId;
      lines.push(`### Cảnh ${sc.sceneIndex}: ${sc.title} (${fmtSec(start)} – ${fmtSec(acc)})`);
      lines.push(`- Hình ảnh: ${pName}`);
      lines.push(`- Thời lượng: ${sc.durationSec}s · Chuyển động: ${sc.motionEffect} · Chuyển cảnh: ${sc.transition}`);
      if (sc.personTag?.show && sc.personTag.name) {
        lines.push(`- Chữ giới thiệu nhân vật: ${sc.personTag.name} — ${sc.personTag.title}`);
      }
      if (sc.isClosingScene) {
        lines.push(`- Khung kết thúc: ${project.unitName} / ${project.closingSubtitle}`);
      }
      lines.push(`- Lời dẫn: "${sc.narration}"`);
      lines.push('');
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'kich-ban-phan-canh-vksnd-kv3.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  let runningTime = 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-lg font-display font-semibold text-white">
            02. Kịch bản phân cảnh & Đồ họa tiêu đề
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">
            {project.scenes.length} phân cảnh · Tổng thời lượng{' '}
            <span className="font-mono-tabular text-slate-200">{totalDuration.toFixed(1)} giây</span>
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={exportMarkdownScript}
            disabled={project.scenes.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Tải kịch bản (.MD)</span>
          </button>
          <button
            type="button"
            onClick={onNextStep}
            disabled={project.scenes.length === 0}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white transition-colors whitespace-nowrap shrink-0"
          >
            Tiếp tục: Tạo giọng đọc →
          </button>
        </div>
      </div>

      {/* Verified Document Facts */}
      {project.facts && (
        <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-white">Thông tin đối chiếu từ File Word</h3>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="md:col-span-2">
              <dt className="text-slate-400">Tiêu đề chính</dt>
              <dd className="text-slate-100 font-medium mt-0.5">{project.facts.mainTitle}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Thời gian</dt>
              <dd className="text-slate-200 mt-0.5">{project.facts.eventTime}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Địa điểm</dt>
              <dd className="text-slate-200 mt-0.5">{project.facts.location}</dd>
            </div>
            {project.facts.verifiedPersons.length > 0 && (
              <div className="md:col-span-2">
                <dt className="text-slate-400">Nhân vật & chức danh xác thực</dt>
                <dd className="text-slate-200 mt-1 flex flex-wrap gap-x-6 gap-y-1">
                  {project.facts.verifiedPersons.map((vp, idx) => (
                    <div key={idx} className="text-slate-300">
                      <span className="font-medium text-amber-200">{vp.name}</span>
                      {vp.title ? ` — ${vp.title}` : ''}
                    </div>
                  ))}
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {/* Lower-Third Ticker & Identity Configuration */}
      <section className="bg-[#0F172A] border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-white">
              Cấu hình thanh tiêu đề chạy chữ (Phải → Trái) & Nhận diện đơn vị
            </h3>
          </div>
          <button
            type="button"
            onClick={() => {
              const cal = calibrateTickerParams(project.tickerText);
              onUpdateProject({ tickerFontSize: cal.fontSize, tickerSpeed: cal.speed });
            }}
            className="text-xs text-blue-400 hover:text-blue-300 whitespace-nowrap"
          >
            Tự động cân chỉnh cỡ chữ & tốc độ
          </button>
        </div>

        {/* Lower Third Style Selector (3 modern designs) */}
        <div className="space-y-2">
          <label className="block text-xs text-slate-400">
            Kiểu dáng thanh tiêu đề phía dưới (Lower Third)
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {([
              {
                id: 'diagonal-classic' as LowerThirdStyle,
                name: 'Đường chéo Truyền thống',
                desc: 'Mảng đỏ cắt chéo viền vàng chuyển sang xanh dương đậm chuẩn thời sự.',
              },
              {
                id: 'modern-chevron' as LowerThirdStyle,
                name: 'Mũi tên Đôi Hiện đại',
                desc: 'Khối mũi tên đỏ-vàng năng động trên nền xanh coban dải sáng công nghệ.',
              },
              {
                id: 'minimal-editorial' as LowerThirdStyle,
                name: 'Hai tầng Tối giản',
                desc: 'Nhãn đỏ nổi phía trên, dải chữ xanh đậm thanh mảnh tối ưu diện tích ảnh.',
              },
            ]).map((opt) => {
              const active = (project.lowerThirdStyle || 'diagonal-classic') === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onUpdateProject({ lowerThirdStyle: opt.id })}
                  className={`text-left rounded-lg border p-3 transition-colors flex flex-col gap-2.5 ${
                    active
                      ? 'bg-blue-950/50 border-blue-500 text-white'
                      : 'bg-[#0B1120] border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  {/* Visual Mini Preview of the Lower Third Style */}
                  <div className="w-full h-11 rounded bg-slate-950/90 border border-slate-800/80 relative overflow-hidden">
                    {opt.id === 'diagonal-classic' && (
                      <div className="absolute inset-x-0 bottom-0 h-5 bg-gradient-to-r from-[#0C357A] to-[#134AA6] border-t border-amber-400 flex items-center">
                        <div
                          className="h-full w-16 bg-gradient-to-br from-[#991B1B] to-[#DC2626] flex items-center pl-1.5 text-[7px] font-bold text-white shrink-0"
                          style={{ clipPath: 'polygon(0 0, 100% 0, 82% 100%, 0 100%)' }}
                        >
                          BẢN TIN
                        </div>
                        <div className="h-full w-1 bg-amber-400 -ml-2 rotate-[18deg] scale-y-125" />
                        <span className="text-[7px] font-semibold text-white/90 ml-2 truncate">
                          TIÊU ĐỀ CHẠY CHỮ...
                        </span>
                      </div>
                    )}
                    {opt.id === 'modern-chevron' && (
                      <div className="absolute inset-x-0 bottom-0 h-5 bg-gradient-to-r from-[#071B40] to-[#0E3272] border-t border-sky-400 flex items-center">
                        <div
                          className="h-full w-16 bg-gradient-to-r from-[#881337] to-[#DC2626] flex items-center pl-1.5 text-[7px] font-bold text-white shrink-0"
                          style={{ clipPath: 'polygon(0 0, 84% 0, 100% 50%, 84% 100%, 0 100%)' }}
                        >
                          BẢN TIN
                        </div>
                        <div
                          className="h-full w-2.5 bg-amber-400 -ml-1.5 shrink-0"
                          style={{ clipPath: 'polygon(0 0, 45% 0, 100% 50%, 45% 100%, 0 100%, 55% 50%)' }}
                        />
                        <span className="text-[7px] font-semibold text-white/90 ml-1.5 truncate">
                          TIÊU ĐỀ CHẠY CHỮ...
                        </span>
                      </div>
                    )}
                    {opt.id === 'minimal-editorial' && (
                      <>
                        <div
                          className="absolute left-2 bottom-4 h-3 px-2 bg-gradient-to-r from-[#991B1B] to-[#DC2626] border-l-2 border-amber-400 flex items-center text-[6px] font-bold text-white"
                        >
                          BẢN TIN HOẠT ĐỘNG
                        </div>
                        <div className="absolute inset-x-0 bottom-0 h-4 bg-[#09142C]/95 border-t border-blue-500 border-b border-amber-500/60 flex items-center px-2">
                          <span className="text-[7px] font-semibold text-white/90 truncate">
                            TIÊU ĐỀ CHẠY CHỮ TỪ PHẢI SANG TRÁI...
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-white">{opt.name}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">{opt.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs text-slate-400 mb-1.5">
              Nội dung thanh tiêu đề dưới (In hoa, chạy từ phải sang trái)
            </label>
            <input
              type="text"
              value={project.tickerText}
              onChange={(e) => {
                const val = e.target.value.toUpperCase();
                const cal = calibrateTickerParams(val);
                onUpdateProject({
                  tickerText: val,
                  tickerFontSize: cal.fontSize,
                  tickerSpeed: cal.speed,
                });
              }}
              className="w-full rounded-lg bg-[#0B1120] border border-slate-800 px-3.5 py-2 text-sm font-medium text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">
              Tên đơn vị góc trên bên trái
            </label>
            <input
              type="text"
              value={project.unitName}
              onChange={(e) => onUpdateProject({ unitName: e.target.value })}
              className="w-full rounded-lg bg-[#0B1120] border border-slate-800 px-3.5 py-2 text-sm text-amber-200 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                Cỡ chữ ({project.tickerFontSize}px)
              </label>
              <input
                type="range"
                min={26}
                max={48}
                value={project.tickerFontSize}
                onChange={(e) => onUpdateProject({ tickerFontSize: Number(e.target.value) })}
                className="w-full accent-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                Tốc độ ({project.tickerSpeed}px/s)
              </label>
              <input
                type="range"
                min={80}
                max={240}
                step={5}
                value={project.tickerSpeed}
                onChange={(e) => onUpdateProject({ tickerSpeed: Number(e.target.value) })}
                className="w-full accent-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                Thanh lớn đầu ({project.openingTallSeconds}s)
              </label>
              <input
                type="range"
                min={3}
                max={12}
                step={1}
                value={project.openingTallSeconds}
                onChange={(e) => onUpdateProject({ openingTallSeconds: Number(e.target.value) })}
                className="w-full accent-blue-500"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Scene List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Danh sách phân cảnh chi tiết</h3>
          <button
            type="button"
            onClick={onAddScene}
            disabled={photos.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Thêm phân cảnh</span>
          </button>
        </div>

        {project.scenes.length === 0 ? (
          <div className="bg-[#0F172A] border border-dashed border-slate-800 rounded-xl p-8 text-center">
            <p className="text-sm text-slate-300">Chưa có kịch bản phân cảnh.</p>
            <p className="text-xs text-slate-500 mt-1">
              Hãy quay lại bước 01. Tư liệu đầu vào để tải file Word và hình ảnh rồi bấm "Phân tích & Lập kịch bản chi tiết".
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {project.scenes.map((scene, index) => {
              const startSec = runningTime;
              runningTime += scene.durationSec;
              const photo = photoMap.get(scene.photoId);
              const wordCount = scene.narration.trim() ? scene.narration.trim().split(/\s+/).length : 0;

              return (
                <div
                  key={scene.id}
                  className="bg-[#0F172A] border border-slate-800 rounded-xl p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 items-start"
                >
                  {/* Thumbnail + Photo Selector */}
                  <div className="lg:col-span-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono-tabular font-semibold text-blue-400">
                        Cảnh {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="font-mono-tabular text-slate-400">
                        {fmtSec(startSec)} – {fmtSec(runningTime)}
                      </span>
                    </div>
                    <div className="aspect-video rounded-lg overflow-hidden bg-slate-950 border border-slate-800">
                      {photo ? (
                        <img
                          src={photo.url}
                          alt={photo.filename}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-slate-600">
                          Chưa có ảnh
                        </div>
                      )}
                    </div>
                    <select
                      value={scene.photoId}
                      onChange={(e) => onUpdateScene(scene.id, { photoId: e.target.value })}
                      className="w-full rounded-md bg-[#0B1120] border border-slate-800 px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                    >
                      {photos.map((p, idx) => (
                        <option key={p.id} value={p.id}>
                          #{idx + 1} · {p.filename}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Script & Controls */}
                  <div className="lg:col-span-9 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <input
                        type="text"
                        value={scene.title}
                        onChange={(e) => onUpdateScene(scene.id, { title: e.target.value })}
                        className="flex-1 min-w-[200px] rounded-md bg-[#0B1120] border border-slate-800 px-3 py-1.5 text-sm font-medium text-white focus:outline-none focus:border-blue-500"
                      />
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onMoveScene(index, -1)}
                          disabled={index === 0}
                          className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200"
                          title="Chuyển lên"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onMoveScene(index, 1)}
                          disabled={index === project.scenes.length - 1}
                          className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200"
                          title="Chuyển xuống"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteScene(scene.id)}
                          disabled={project.scenes.length <= 1}
                          className="p-1.5 rounded bg-slate-800 hover:bg-red-900/60 disabled:opacity-30 text-slate-300 hover:text-red-300"
                          title="Xóa phân cảnh"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Narration */}
                    <div>
                      <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                        <span>Lời dẫn phát thanh viên</span>
                        <span className="font-mono-tabular">
                          {wordCount} từ · {scene.audioDurationSec ? `Audio: ${scene.audioDurationSec}s` : 'Chưa tạo giọng'}
                        </span>
                      </div>
                      <textarea
                        rows={3}
                        value={scene.narration}
                        onChange={(e) => onUpdateScene(scene.id, { narration: e.target.value })}
                        className="w-full rounded-lg bg-[#0B1120] border border-slate-800 px-3 py-2 text-sm text-slate-100 leading-relaxed focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    {/* Scene Parameters */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                      <div>
                        <label className="block text-slate-400 mb-1">Thời lượng (giây)</label>
                        <input
                          type="number"
                          min={3}
                          max={25}
                          step={0.5}
                          value={scene.durationSec}
                          onChange={(e) =>
                            onUpdateScene(scene.id, { durationSec: Math.max(3, Number(e.target.value) || 5) })
                          }
                          className="w-full rounded-md bg-[#0B1120] border border-slate-800 px-2.5 py-1.5 font-mono-tabular text-slate-100 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Chuyển động ảnh</label>
                        <select
                          value={scene.motionEffect}
                          onChange={(e) =>
                            onUpdateScene(scene.id, { motionEffect: e.target.value as MotionEffect })
                          }
                          className="w-full rounded-md bg-[#0B1120] border border-slate-800 px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-blue-500"
                        >
                          <option value="zoom-in">Phóng to nhẹ</option>
                          <option value="zoom-out">Thu nhỏ nhẹ</option>
                          <option value="pan-left">Lia sang trái</option>
                          <option value="pan-right">Lia sang phải</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Chuyển cảnh</label>
                        <select
                          value={scene.transition}
                          onChange={(e) =>
                            onUpdateScene(scene.id, { transition: e.target.value as TransitionEffect })
                          }
                          className="w-full rounded-md bg-[#0B1120] border border-slate-800 px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-blue-500"
                        >
                          <option value="dissolve">Hòa tan (Dissolve)</option>
                          <option value="fade">Mờ dần (Fade)</option>
                          <option value="slide-left">Trượt nhẹ (Slide)</option>
                        </select>
                      </div>
                      <div className="flex flex-col justify-end">
                        <label className="flex items-center gap-2 cursor-pointer py-1.5 text-slate-300">
                          <input
                            type="checkbox"
                            checked={Boolean(scene.isClosingScene)}
                            onChange={(e) =>
                              onUpdateScene(scene.id, { isClosingScene: e.target.checked })
                            }
                            className="accent-blue-500 rounded"
                          />
                          <span>Khung kết thúc</span>
                        </label>
                      </div>
                    </div>

                    {/* Optional Verified Person Tag */}
                    <div className="pt-1 border-t border-slate-800/80 flex flex-wrap items-center gap-3 text-xs">
                      <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={scene.personTag.show}
                          onChange={(e) =>
                            onUpdateScene(scene.id, {
                              personTag: { ...scene.personTag, show: e.target.checked },
                            })
                          }
                          className="accent-blue-500 rounded"
                        />
                        <UserCheck className="w-3.5 h-3.5 text-amber-400" />
                        <span>Hiện tên nhân vật</span>
                      </label>

                      {scene.personTag.show && (
                        <>
                          {project.facts && project.facts.verifiedPersons.length > 0 && (
                            <select
                              value=""
                              onChange={(e) => {
                                const vp = project.facts?.verifiedPersons[Number(e.target.value)];
                                if (vp) {
                                  onUpdateScene(scene.id, {
                                    personTag: { show: true, name: vp.name, title: vp.title },
                                  });
                                }
                              }}
                              className="rounded bg-[#0B1120] border border-slate-800 px-2 py-1 text-slate-300"
                            >
                              <option value="">Chọn từ tài liệu...</option>
                              {project.facts.verifiedPersons.map((vp, idx) => (
                                <option key={idx} value={idx}>
                                  {vp.name} ({vp.title})
                                </option>
                              ))}
                            </select>
                          )}
                          <input
                            type="text"
                            placeholder="Họ và tên (theo tài liệu)"
                            value={scene.personTag.name}
                            onChange={(e) =>
                              onUpdateScene(scene.id, {
                                personTag: { ...scene.personTag, name: e.target.value },
                              })
                            }
                            className="rounded bg-[#0B1120] border border-slate-800 px-2.5 py-1 text-slate-100 min-w-[160px]"
                          />
                          <input
                            type="text"
                            placeholder="Chức danh"
                            value={scene.personTag.title}
                            onChange={(e) =>
                              onUpdateScene(scene.id, {
                                personTag: { ...scene.personTag, title: e.target.value },
                              })
                            }
                            className="flex-1 rounded bg-[#0B1120] border border-slate-800 px-2.5 py-1 text-amber-200 min-w-[180px]"
                          />
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
