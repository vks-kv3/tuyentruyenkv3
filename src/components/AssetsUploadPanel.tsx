import React, { useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  Image as ImageIcon,
  Loader2,
  Shield,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import type { UploadedPhoto } from '../types/broadcast';

interface AssetsUploadPanelProps {
  docText: string;
  docFilename: string;
  photos: UploadedPhoto[];
  logoUrl: string | null;
  isAnalyzing: boolean;
  onDocTextChange: (text: string, filename?: string) => void;
  onAssetsUploaded: (payload: {
    docText?: string;
    docFilename?: string;
    photos?: UploadedPhoto[];
    logoUrl?: string;
  }) => void;
  onRemovePhoto: (id: string) => void;
  onMovePhoto: (index: number, direction: -1 | 1) => void;
  onAnalyzeStoryboard: () => void;
  onError: (msg: string) => void;
}

export const AssetsUploadPanel: React.FC<AssetsUploadPanelProps> = ({
  docText,
  docFilename,
  photos,
  logoUrl,
  isAnalyzing,
  onDocTextChange,
  onAssetsUploaded,
  onRemovePhoto,
  onMovePhoto,
  onAnalyzeStoryboard,
  onError,
}) => {
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);
  const photosInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const uploadFormField = async (fieldName: string, fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploadingField(fieldName);
    try {
      const formData = new FormData();
      for (let i = 0; i < fileList.length; i++) {
        formData.append(fieldName, fileList[i]);
      }

      const res = await fetch('/api/upload-assets', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Tải tệp lên thất bại.');
      }

      onAssetsUploaded({
        docText: data.docText,
        docFilename: data.docFilename,
        photos: data.photos && data.photos.length > 0 ? data.photos : undefined,
        logoUrl: data.logoUrl,
      });
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Lỗi tải tệp lên.');
    } finally {
      setUploadingField(null);
    }
  };

  const canAnalyze = docText.trim().length >= 20 && photos.length > 0 && !isAnalyzing;

  return (
    <div className="space-y-6">
      {/* Header & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-lg font-display font-semibold text-white">
            01. Tiếp nhận tư liệu sản xuất bản tin
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Tải lên file Word chính thức, hình ảnh thực tế của đơn vị và logo ngành Kiểm sát nhân dân.
          </p>
        </div>
        <button
          type="button"
          onClick={onAnalyzeStoryboard}
          disabled={!canAnalyze}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white transition-colors whitespace-nowrap shrink-0"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Đang phân tích & lập kịch bản...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>Phân tích & Lập kịch bản chi tiết</span>
            </>
          )}
        </button>
      </div>

      {/* 2x2 Input Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 1. Word Document */}
        <section className="bg-[#0F172A] border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <FileText className="w-5 h-5 text-blue-400 shrink-0" />
              <div>
                <h3 className="text-sm font-semibold text-white">1. File Word nội dung tin bài chính thức</h3>
                <p className="text-xs text-slate-400">Hỗ trợ .docx, .txt · Nguồn sự kiện chuẩn xác duy nhất</p>
              </div>
            </div>
            <input
              ref={docInputRef}
              type="file"
              accept=".docx,.doc,.txt,.md"
              className="hidden"
              onChange={(e) => {
                uploadFormField('docx', e.target.files);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => docInputRef.current?.click()}
              disabled={uploadingField === 'docx'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors whitespace-nowrap shrink-0"
            >
              {uploadingField === 'docx' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              <span>{docFilename ? 'Đổi file' : 'Chọn file Word'}</span>
            </button>
          </div>

          {docFilename && (
            <div className="text-xs text-slate-300 flex items-center gap-2">
              <span className="font-medium text-blue-300 truncate">{docFilename}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular text-slate-400">{docText.length} ký tự</span>
            </div>
          )}

          <textarea
            value={docText}
            onChange={(e) => onDocTextChange(e.target.value)}
            rows={7}
            placeholder="Nội dung trích xuất từ file Word sẽ hiển thị tại đây (hoặc bạn có thể dán trực tiếp văn bản bài viết chính thức)..."
            className="w-full rounded-lg bg-[#0B1120] border border-slate-800 px-3.5 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 resize-y leading-relaxed"
          />
        </section>

        {/* 2. Logo + Reference Video */}
        <div className="flex flex-col gap-5">
          {/* Official Logo */}
          <section className="bg-[#0F172A] border border-slate-800 rounded-xl p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-16 h-16 rounded-lg bg-[#0B1120] border border-slate-800 flex items-center justify-center shrink-0 overflow-hidden p-1.5">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt="Logo ngành Kiểm sát nhân dân"
                    referrerPolicy="no-referrer"
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <Shield className="w-6 h-6 text-slate-600" />
                )}
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-white">2. Logo ngành Kiểm sát nhân dân</h3>
                <p className="text-xs text-slate-400 mt-0.5 truncate">
                  {logoUrl
                    ? 'Đã nạp logo · Hiển thị cố định góc trên trái màn hình'
                    : 'Ưu tiên file PNG nền trong suốt (.png, .svg, .jpg)'}
                </p>
              </div>
            </div>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                uploadFormField('logo', e.target.files);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              disabled={uploadingField === 'logo'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors whitespace-nowrap shrink-0"
            >
              {uploadingField === 'logo' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              <span>{logoUrl ? 'Đổi logo' : 'Tải logo'}</span>
            </button>
          </section>

          {/* Broadcast Layout Standard Summary */}
          <section className="bg-[#0F172A] border border-slate-800 rounded-xl p-5 flex-1 flex flex-col justify-center gap-2">
            <h3 className="text-sm font-semibold text-white">Quy chuẩn đồ họa bản tin</h3>
            <ul className="text-xs text-slate-400 space-y-1.5 leading-relaxed">
              <li>Góc trên trái: Logo ngành Kiểm sát + tên VIỆN KIỂM SÁT NHÂN DÂN KHU VỰC 3 - QUẢNG TRỊ cố định.</li>
              <li>Cạnh dưới: Thanh tiêu đề xanh dương kết hợp mảng đỏ đường chéo, chữ trắng in hoa chạy từ phải sang trái.</li>
              <li>Hình ảnh thực tế giữ nguyên khuôn mặt, bối cảnh và biển bảng; kết thúc bằng khung hình tập thể trang trọng.</li>
            </ul>
          </section>
        </div>
      </div>

      {/* 3. Real Activity Photos Grid */}
      <section className="bg-[#0F172A] border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <ImageIcon className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-white">
                3. Hình ảnh thực tế hoạt động của đơn vị ({photos.length} ảnh)
              </h3>
              <p className="text-xs text-slate-400">
                Giữ nguyên bối cảnh, khuôn mặt, biển bảng thực tế · AI sẽ sắp xếp theo đúng diễn biến lời dẫn.
              </p>
            </div>
          </div>
          <input
            ref={photosInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              uploadFormField('photos', e.target.files);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => photosInputRef.current?.click()}
            disabled={uploadingField === 'photos'}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 transition-colors whitespace-nowrap shrink-0"
          >
            {uploadingField === 'photos' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            <span>Thêm ảnh hoạt động</span>
          </button>
        </div>

        {photos.length === 0 ? (
          <button
            type="button"
            onClick={() => photosInputRef.current?.click()}
            className="w-full rounded-lg border border-dashed border-slate-700 hover:border-blue-500/60 bg-[#0B1120] py-10 px-4 text-center transition-colors"
          >
            <Upload className="w-6 h-6 text-slate-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-300">Nhấn để chọn nhiều hình ảnh hoạt động thực tế</p>
            <p className="text-xs text-slate-500 mt-1">Hỗ trợ JPG, PNG, WEBP chất lượng cao</p>
          </button>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {photos.map((photo, index) => (
              <div
                key={photo.id}
                className="group bg-[#0B1120] border border-slate-800 rounded-lg overflow-hidden flex flex-col"
              >
                <div className="relative aspect-video bg-slate-950 overflow-hidden">
                  <img
                    src={photo.url}
                    alt={photo.filename}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute top-1.5 left-1.5 bg-slate-950/80 text-slate-200 font-mono-tabular text-[11px] px-1.5 py-0.5 rounded">
                    #{index + 1}
                  </span>
                </div>
                <div className="p-2 flex items-center justify-between gap-1">
                  <span className="text-[11px] text-slate-400 truncate" title={photo.filename}>
                    {photo.filename}
                  </span>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onMovePhoto(index, -1)}
                      disabled={index === 0}
                      className="p-1 text-slate-400 hover:text-white disabled:opacity-25"
                      title="Đưa lên trước"
                    >
                      <ArrowLeft className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onMovePhoto(index, 1)}
                      disabled={index === photos.length - 1}
                      className="p-1 text-slate-400 hover:text-white disabled:opacity-25"
                      title="Đưa ra sau"
                    >
                      <ArrowRight className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemovePhoto(photo.id)}
                      className="p-1 text-slate-400 hover:text-red-400"
                      title="Xóa ảnh"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
