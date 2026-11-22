import { GenerateContentResponse, GoogleGenAI, Type } from '@google/genai';
import { execFile } from 'child_process';
import crypto from 'crypto';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import mammoth from 'mammoth';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { generateNewsroomBgmWav, readWavInfo } from './server/audioUtils.ts';
import { renderBroadcastMp4, type RenderSceneInput } from './server/ffmpegRenderer.ts';

dotenv.config();

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE_ROOT = '/tmp/vksnd-studio';
const ASSETS_DIR = path.join(STORAGE_ROOT, 'assets');
const AUDIO_DIR = path.join(STORAGE_ROOT, 'audio');
const RENDERS_DIR = path.join(STORAGE_ROOT, 'renders');
const JOBS_DIR = path.join(STORAGE_ROOT, 'jobs');

for (const dir of [STORAGE_ROOT, ASSETS_DIR, AUDIO_DIR, RENDERS_DIR, JOBS_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

function getGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Thiếu GEMINI_API_KEY trong cấu hình máy chủ. Vui lòng kiểm tra mục Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion: 'v1beta',
    httpOptions: {
      apiVersion: 'v1beta',
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      // Do not retry auth or bad request errors
      if (msg.includes('API_KEY_INVALID') || msg.includes('PERMISSION_DENIED') || msg.includes('400') || msg.includes('403')) {
        throw err;
      }
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 800 * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError;
}

function formatGeminiError(err: unknown): { status: number; message: string } {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('API_KEY_INVALID') || msg.includes('PERMISSION_DENIED') || msg.includes('403')) {
    return {
      status: 403,
      message: 'API key Gemini không hợp lệ hoặc chưa được cấp quyền. Vui lòng kiểm tra trong mục Settings > Secrets.',
    };
  }
  if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
    return {
      status: 429,
      message: 'Hệ thống đang chạm giới hạn tần suất gọi Gemini API. Vui lòng thử lại sau vài giây.',
    };
  }
  if (msg.includes('Thiếu GEMINI_API_KEY')) {
    return { status: 400, message: msg };
  }
  return { status: 500, message: msg || 'Đã xảy ra lỗi khi xử lý với Gemini API.' };
}

function safeExt(filename: string, fallback: string): string {
  const ext = path.extname(filename).toLowerCase();
  return ext && /^[.a-z0-9]+$/.test(ext) ? ext : fallback;
}

function urlToLocalPath(mediaUrl: string): string | null {
  if (!mediaUrl.startsWith('/media/')) return null;
  const rel = mediaUrl.slice('/media/'.length).split('?')[0];
  const resolved = path.resolve(STORAGE_ROOT, rel);
  if (!resolved.startsWith(STORAGE_ROOT)) return null;
  return resolved;
}

async function createScaledJpegBase64(imagePath: string): Promise<string | null> {
  try {
    const tmpPath = `${imagePath}_thumb.jpg`;
    await execFileAsync('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', imagePath,
      '-vf', 'scale=768:-1',
      '-q:v', '5',
      tmpPath,
    ]);
    if (fs.existsSync(tmpPath)) {
      const data = fs.readFileSync(tmpPath).toString('base64');
      fs.unlinkSync(tmpPath);
      return data;
    }
  } catch {
    // Fallback to raw bytes if file is small JPEG/PNG
  }
  try {
    const buf = fs.readFileSync(imagePath);
    if (buf.length <= 2 * 1024 * 1024) {
      return buf.toString('base64');
    }
  } catch {
    return null;
  }
  return null;
}

const upload = multer({
  dest: path.join(STORAGE_ROOT, 'tmp_uploads'),
  limits: { fileSize: 200 * 1024 * 1024 },
});

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '150mb' }));

  // Serve stored media with byte-range support for video/audio scrubbing + download flag
  app.get('/media/*', (req, res) => {
    const rel = (req.params as Record<string, string>)[0] || '';
    const filePath = path.resolve(STORAGE_ROOT, rel);
    if (!filePath.startsWith(STORAGE_ROOT) || !fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Không tìm thấy tệp phương tiện.' });
      return;
    }
    if (req.query.download === '1') {
      res.download(filePath, path.basename(filePath));
      return;
    }
    res.sendFile(filePath);
  });

  // 1. Upload & parse Word doc, activity photos, and official logo
  app.post(
    '/api/upload-assets',
    upload.fields([
      { name: 'docx', maxCount: 1 },
      { name: 'photos', maxCount: 40 },
      { name: 'logo', maxCount: 1 },
    ]),
    async (req, res) => {
      try {
        const files = req.files as Record<string, Express.Multer.File[]> | undefined;
        const result: {
          docText?: string;
          docFilename?: string;
          photos: Array<{ id: string; filename: string; url: string }>;
          logoUrl?: string;
        } = { photos: [] };

        // Parse Word document
        const docFile = files?.docx?.[0];
        if (docFile) {
          const origName = Buffer.from(docFile.originalname, 'latin1').toString('utf8');
          const ext = path.extname(origName).toLowerCase();
          result.docFilename = origName;
          if (ext === '.docx') {
            const extracted = await mammoth.extractRawText({ path: docFile.path });
            result.docText = extracted.value.trim();
          } else if (ext === '.txt' || ext === '.md') {
            result.docText = fs.readFileSync(docFile.path, 'utf8').trim();
          } else {
            // Best-effort text extraction or notify user
            const raw = fs.readFileSync(docFile.path);
            try {
              const extracted = await mammoth.extractRawText({ buffer: raw });
              result.docText = extracted.value.trim();
            } catch {
              fs.unlinkSync(docFile.path);
              res.status(400).json({
                error: 'Định dạng file Word chưa được hỗ trợ trực tiếp (.doc cũ). Vui lòng lưu lại dưới dạng .docx hoặc .txt rồi tải lên.',
              });
              return;
            }
          }
          fs.unlinkSync(docFile.path);
        }

        // Save Logo
        const logoFile = files?.logo?.[0];
        if (logoFile) {
          const id = crypto.randomBytes(6).toString('hex');
          const ext = safeExt(logoFile.originalname, '.png');
          const targetName = `logo_${id}${ext}`;
          const targetPath = path.join(ASSETS_DIR, targetName);
          fs.renameSync(logoFile.path, targetPath);
          result.logoUrl = `/media/assets/${targetName}`;
        }

        // Save Activity Photos
        const photoFiles = files?.photos || [];
        for (const pf of photoFiles) {
          const origName = Buffer.from(pf.originalname, 'latin1').toString('utf8');
          const id = crypto.randomBytes(6).toString('hex');
          const ext = safeExt(origName, '.jpg');
          const targetName = `photo_${id}${ext}`;
          const targetPath = path.join(ASSETS_DIR, targetName);
          fs.renameSync(pf.path, targetPath);
          result.photos.push({
            id,
            filename: origName,
            url: `/media/assets/${targetName}`,
          });
        }

        res.json(result);
      } catch (err: unknown) {
        console.error('Upload error:', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Lỗi tải tệp lên máy chủ.' });
      }
    }
  );

  // 2. Analyze Word document + Photos via Gemini 4 Hydrogen
  app.post('/api/analyze-and-storyboard', async (req, res) => {
    try {
      const { docText, photos } = req.body as {
        docText: string;
        photos: Array<{ id: string; filename: string; url: string }>;
      };

      if (!docText || docText.trim().length < 20) {
        res.status(400).json({ error: 'Nội dung file Word quá ngắn hoặc chưa được tải lên.' });
        return;
      }
      if (!photos || photos.length === 0) {
        res.status(400).json({ error: 'Vui lòng tải lên ít nhất 1 hình ảnh hoạt động thực tế.' });
        return;
      }

      const ai = getGenAIClient();
      const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

      // Attach uploaded real activity photos with their IDs & filenames
      parts.push({
        text: `Dưới đây là ${photos.length} HÌNH ẢNH HOẠT ĐỘNG THỰC TẾ được tải lên. Hãy quan sát nội dung từng ảnh (toàn cảnh hội nghị, phát biểu, trao đổi, ký kết, ảnh tập thể...) để sắp xếp đúng trình tự diễn biến sự kiện và gán đúng photoId vào từng phân cảnh:`,
      });

      for (const p of photos) {
        const lp = urlToLocalPath(p.url);
        parts.push({ text: `[Ảnh ID: "${p.id}" | Tên tệp: "${p.filename}"]` });
        if (lp && fs.existsSync(lp)) {
          const b64 = await createScaledJpegBase64(lp);
          if (b64) {
            parts.push({ inlineData: { mimeType: 'image/jpeg', data: b64 } });
          }
        }
      }

      const systemPrompt = `Bạn là chuyên gia sản xuất bản tin truyền hình chính thống, biên tập viên thời sự và đạo diễn hình ảnh của ngành Kiểm sát nhân dân Việt Nam.
Nhiệm vụ: Phân tích TÀI LIỆU WORD CHÍNH THỨC dưới đây và các hình ảnh đính kèm để xây dựng:
1) Bản trích xuất sự kiện chính xác tuyệt đối (facts).
2) Kịch bản phân cảnh chi tiết (scenes) dùng TẤT CẢ các hình ảnh phù hợp theo trình tự diễn biến sự kiện.

NGUYÊN TẮC BẮT BUỘC:
- TUYỆT ĐỐI KHÔNG tự ý bịa đặt, suy diễn, thêm bớt tên người, chức danh, cơ quan, địa danh, ngày tháng hay số liệu không có trong file Word.
- Giữ nguyên chính xác tên cơ quan, đơn vị, chức danh, họ tên và nội dung quan trọng từ tài liệu gốc.
- Lời dẫn bản tin (narration) phải viết theo văn phong phát thanh viên truyền hình Việt Nam: trang trọng, mạch lạc, súc tích, dễ đọc thành tiếng (tránh viết tắt khó đọc như "VKSND" nếu cần đọc rõ là "Viện Kiểm sát nhân dân", tránh ký hiệu lạ).
- Tốc độ đọc chuẩn là 130–145 từ/phút (~2.2–2.4 từ/giây). Mỗi phân cảnh kéo dài khoảng 4–7 giây (tương ứng khoảng 10–20 từ mỗi cảnh) hoặc dài hơn một chút nếu đoạn lời dẫn dài, sao cho toàn bộ bài viết được truyền tải đầy đủ, logic.
- Phân cảnh cuối cùng (isClosingScene = true) ưu tiên chọn ảnh tập thể đơn vị hoặc ảnh toàn cảnh tiêu biểu kết thúc sự kiện.
- Nếu một bức ảnh rõ ràng có nhân vật đang phát biểu/chủ trì được xác nhận tên và chức danh trong file Word, có thể điền personTag (show: true) với đúng họ tên và chức danh trong tài liệu; nếu không chắc chắn ai trong ảnh, đặt show: false và chuỗi rỗng.`;

      parts.push({
        text: `${systemPrompt}\n\n=== NỘI DUNG FILE WORD CHÍNH THỨC ===\n${docText}`,
      });

      const response: GenerateContentResponse = await withRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: { parts },
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                facts: {
                  type: Type.OBJECT,
                  properties: {
                    mainTitle: { type: Type.STRING, description: 'Tiêu đề chính của bài viết từ file Word.' },
                    eventTime: { type: Type.STRING, description: 'Thời gian diễn ra sự kiện (hoặc "Không nêu rõ trong tài liệu").' },
                    location: { type: Type.STRING, description: 'Địa điểm diễn ra sự kiện.' },
                    attendees: { type: Type.ARRAY, items: { type: Type.STRING } },
                    keyEvents: { type: Type.ARRAY, items: { type: Type.STRING } },
                    outcomes: { type: Type.ARRAY, items: { type: Type.STRING } },
                    significance: { type: Type.STRING },
                    verifiedPersons: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          name: { type: Type.STRING },
                          title: { type: Type.STRING },
                        },
                        required: ['name', 'title'],
                      },
                    },
                  },
                  required: ['mainTitle', 'eventTime', 'location', 'attendees', 'keyEvents', 'outcomes', 'significance', 'verifiedPersons'],
                },
                tickerText: {
                  type: Type.STRING,
                  description: 'Tiêu đề bản tin viết IN HOA súc tích dựa trên tiêu đề chính của file Word để chạy trên thanh tiêu đề phía dưới.',
                },
                scenes: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING, description: 'Tên ngắn gọn của phân cảnh (VD: Mở đầu - Toàn cảnh hội nghị).' },
                      photoId: { type: Type.STRING, description: 'Phải khớp chính xác với một Ảnh ID đã cung cấp.' },
                      durationSec: { type: Type.NUMBER, description: 'Thời lượng ước tính tính bằng giây (tối thiểu 4, thường 4.5 đến 8 giây tùy độ dài lời dẫn).' },
                      narration: { type: Type.STRING, description: 'Lời dẫn phát thanh viên tiếng Việt cho phân cảnh này.' },
                      motionEffect: { type: Type.STRING, description: 'Một trong: zoom-in, zoom-out, pan-left, pan-right' },
                      transition: { type: Type.STRING, description: 'Một trong: fade, dissolve, slide-left' },
                      personTagName: { type: Type.STRING, description: 'Họ tên nhân vật xác nhận trong bài (hoặc chuỗi rỗng).' },
                      personTagTitle: { type: Type.STRING, description: 'Chức danh nhân vật xác nhận trong bài (hoặc chuỗi rỗng).' },
                      showPersonTag: { type: Type.BOOLEAN },
                      isClosingScene: { type: Type.BOOLEAN },
                    },
                    required: [
                      'title',
                      'photoId',
                      'durationSec',
                      'narration',
                      'motionEffect',
                      'transition',
                      'personTagName',
                      'personTagTitle',
                      'showPersonTag',
                      'isClosingScene',
                    ],
                  },
                },
              },
              required: ['facts', 'tickerText', 'scenes'],
            },
          },
        })
      );

      const rawJson = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawJson);

      const validPhotoIds = new Set(photos.map((p) => p.id));
      const fallbackPhotoId = photos[0].id;

      const normalizedScenes = (parsed.scenes || []).map((sc: Record<string, unknown>, idx: number, arr: unknown[]) => {
        const motion = ['zoom-in', 'zoom-out', 'pan-left', 'pan-right'].includes(String(sc.motionEffect))
          ? sc.motionEffect
          : idx % 2 === 0
          ? 'zoom-in'
          : 'zoom-out';
        const transition = ['fade', 'dissolve', 'slide-left'].includes(String(sc.transition))
          ? sc.transition
          : 'dissolve';
        const pId = validPhotoIds.has(String(sc.photoId)) ? String(sc.photoId) : photos[idx % photos.length]?.id || fallbackPhotoId;
        const dur = Math.max(4, Math.min(18, Number(sc.durationSec) || 5.5));
        const isLast = idx === arr.length - 1;

        return {
          id: `scene_${idx + 1}_${crypto.randomBytes(3).toString('hex')}`,
          sceneIndex: idx + 1,
          title: String(sc.title || `Phân cảnh ${idx + 1}`),
          photoId: pId,
          durationSec: Number(dur.toFixed(1)),
          narration: String(sc.narration || ''),
          motionEffect: motion,
          transition,
          personTag: {
            name: String(sc.personTagName || ''),
            title: String(sc.personTagTitle || ''),
            show: Boolean(sc.showPersonTag && sc.personTagName),
          },
          isClosingScene: isLast ? true : Boolean(sc.isClosingScene),
        };
      });

      res.json({
        facts: parsed.facts,
        tickerText: String(parsed.tickerText || parsed.facts?.mainTitle || 'BẢN TIN HOẠT ĐỘNG').toUpperCase(),
        scenes: normalizedScenes,
      });
    } catch (err: unknown) {
      console.error('Analyze error:', err);
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 3. Generate Vietnamese Broadcast News Anchor TTS via gemini-3.8-flash-lite-tts
  app.post('/api/generate-tts', async (req, res) => {
    try {
      const { sceneId, text, voiceName } = req.body as {
        sceneId: string;
        text: string;
        voiceName?: string;
      };

      if (!text || !text.trim()) {
        res.status(400).json({ error: 'Nội dung lời dẫn trống, không thể tạo giọng đọc.' });
        return;
      }

      const ai = getGenAIClient();
      const selectedVoice = ['Charon', 'Fenrir', 'Orus', 'Kore'].includes(String(voiceName))
        ? String(voiceName)
        : 'Charon';

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: 'gemini-3.8-flash-lite-tts',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: text.trim(),
                  speechMetadata: {
                    style:
                      'Phát thanh viên thời sự truyền hình Việt Nam, giọng nam trung trầm, ấm áp, trang trọng, truyền cảm, phát âm chuẩn tiếng Việt, tốc độ đọc vừa phải khoảng 135 từ mỗi phút, ngắt nghỉ tự nhiên theo dấu câu.',
                  },
                },
              ],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: selectedVoice },
              },
            },
          },
        })
      );

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        res.status(500).json({ error: 'Gemini TTS không trả về dữ liệu âm thanh.' });
        return;
      }

      const wavBuffer = Buffer.from(base64Audio, 'base64');
      const info = readWavInfo(wavBuffer);
      const hash = crypto.createHash('md5').update(`${sceneId}:${selectedVoice}:${text}`).digest('hex').slice(0, 8);
      const filename = `tts_${sceneId}_${hash}.wav`;
      const outPath = path.join(AUDIO_DIR, filename);
      fs.writeFileSync(outPath, wavBuffer);

      res.json({
        audioUrl: `/media/audio/${filename}`,
        durationSec: Number(info.durationSec.toFixed(2)),
      });
    } catch (err: unknown) {
      console.error('TTS error:', err);
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 3b. Preview voice sample (cached by voice + text hash)
  app.post('/api/preview-voice', async (req, res) => {
    try {
      const { voiceName, sampleText } = req.body as {
        voiceName?: string;
        sampleText?: string;
      };

      const selectedVoice = ['Charon', 'Fenrir', 'Orus', 'Kore'].includes(String(voiceName))
        ? String(voiceName)
        : 'Charon';

      const textToSpeak =
        (sampleText && sampleText.trim()) ||
        'Bản tin hoạt động của Viện Kiểm sát nhân dân Khu vực 3, tỉnh Quảng Trị. Tiếp tục nâng cao chất lượng công tác thực hành quyền công tố và kiểm sát hoạt động tư pháp.';

      const hash = crypto.createHash('md5').update(`${selectedVoice}:${textToSpeak}`).digest('hex').slice(0, 10);
      const filename = `preview_${selectedVoice}_${hash}.wav`;
      const outPath = path.join(AUDIO_DIR, filename);

      if (fs.existsSync(outPath)) {
        const cachedBuf = fs.readFileSync(outPath);
        const info = readWavInfo(cachedBuf);
        res.json({
          audioUrl: `/media/audio/${filename}`,
          durationSec: Number(info.durationSec.toFixed(2)),
        });
        return;
      }

      const ai = getGenAIClient();
      const response = await withRetry(() =>
        ai.models.generateContent({
          model: 'gemini-3.8-flash-lite-tts',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: textToSpeak,
                  speechMetadata: {
                    style:
                      'Phát thanh viên thời sự truyền hình Việt Nam, giọng nam trung trầm, ấm áp, trang trọng, truyền cảm, phát âm chuẩn tiếng Việt, tốc độ đọc vừa phải khoảng 135 từ mỗi phút, ngắt nghỉ tự nhiên theo dấu câu.',
                  },
                },
              ],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: selectedVoice },
              },
            },
          },
        })
      );

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        res.status(500).json({ error: 'Gemini TTS không trả về dữ liệu âm thanh mẫu.' });
        return;
      }

      const wavBuffer = Buffer.from(base64Audio, 'base64');
      const info = readWavInfo(wavBuffer);
      fs.writeFileSync(outPath, wavBuffer);

      res.json({
        audioUrl: `/media/audio/${filename}`,
        durationSec: Number(info.durationSec.toFixed(2)),
      });
    } catch (err: unknown) {
      console.error('Voice preview error:', err);
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 4. Generate a previewable newsroom background music WAV
  app.get('/api/bgm-preview', (req, res) => {
    try {
      const duration = Math.min(180, Math.max(10, Number(req.query.duration) || 30));
      const bgmPath = path.join(AUDIO_DIR, `bgm_preview_${Math.round(duration)}.wav`);
      if (!fs.existsSync(bgmPath)) {
        generateNewsroomBgmWav(duration, bgmPath);
      }
      res.sendFile(bgmPath);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Lỗi tạo nhạc nền.' });
    }
  });

  // 5. Render final 16:9 MP4 (1080p or 4K) using FFmpeg + browser-rendered transparent broadcast PNG plates
  app.post('/api/render-mp4', async (req, res) => {
    try {
      const {
        resolution,
        scenes,
        photos,
        openingTallSeconds,
        tickerSpeed,
        tickerYOffsetTall,
        tickerYOffsetCompact,
        bgmEnabled,
        bgmVolume,
        plates,
      } = req.body as {
        resolution: '1080p' | '4k';
        scenes: Array<{
          id: string;
          photoId: string;
          durationSec: number;
          motionEffect: 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right';
          transition: 'fade' | 'dissolve' | 'slide-left';
          audioUrl?: string;
          personTagPngBase64?: string;
          isClosingScene?: boolean;
        }>;
        photos: Array<{ id: string; url: string }>;
        openingTallSeconds: number;
        tickerSpeed: number;
        tickerYOffsetTall: number;
        tickerYOffsetCompact: number;
        bgmEnabled: boolean;
        bgmVolume: number;
        plates: {
          headerPngBase64: string;
          blueBgTallPngBase64: string;
          redCapTallPngBase64: string;
          blueBgCompactPngBase64: string;
          redCapCompactPngBase64: string;
          tickerStripPngBase64: string;
          closingSlatePngBase64: string;
        };
      };

      if (!scenes || scenes.length === 0) {
        res.status(400).json({ error: 'Chưa có phân cảnh để dựng video.' });
        return;
      }

      const photoMap = new Map(photos.map((p) => [p.id, p.url]));
      const renderScenes: RenderSceneInput[] = [];

      for (const s of scenes) {
        const pUrl = photoMap.get(s.photoId);
        const imgPath = pUrl ? urlToLocalPath(pUrl) : null;
        if (!imgPath || !fs.existsSync(imgPath)) {
          res.status(400).json({ error: `Không tìm thấy tệp ảnh cho phân cảnh ${s.id}.` });
          return;
        }
        const wavPath = s.audioUrl ? urlToLocalPath(s.audioUrl) || undefined : undefined;
        renderScenes.push({
          id: s.id,
          imagePath: imgPath,
          durationSec: Math.max(3, Number(s.durationSec) || 5),
          motionEffect: s.motionEffect || 'zoom-in',
          transition: s.transition || 'dissolve',
          wavPath: wavPath && fs.existsSync(wavPath) ? wavPath : undefined,
          personTagPngBase64: s.personTagPngBase64,
          isClosingScene: s.isClosingScene,
        });
      }

      const jobId = `${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const workDir = path.join(JOBS_DIR, jobId);
      const outFilename = `ban-tin-vksnd-kv3-quang-tri-${jobId}.mp4`;
      const outputMp4Path = path.join(RENDERS_DIR, outFilename);

      const renderResult = await renderBroadcastMp4({
        jobId,
        workDir,
        outputMp4Path,
        resolution: resolution === '4k' ? '4k' : '1080p',
        scenes: renderScenes,
        openingTallSeconds: Math.max(2, Number(openingTallSeconds) || 5),
        tickerSpeed: Math.max(60, Number(tickerSpeed) || 145),
        tickerYOffsetTall: Number(tickerYOffsetTall) || 935,
        tickerYOffsetCompact: Number(tickerYOffsetCompact) || 975,
        bgmEnabled: Boolean(bgmEnabled),
        bgmVolume: Number(bgmVolume ?? 0.12),
        plates,
      });

      // Clean up intermediate job folder to save disk
      fs.rmSync(workDir, { recursive: true, force: true });

      res.json({
        videoUrl: `/media/renders/${outFilename}`,
        filename: outFilename,
        durationSec: renderResult.durationSec,
        fileSizeBytes: renderResult.fileSizeBytes,
        resolution: resolution === '4k' ? '3840 × 2160 (4K UHD)' : '1920 × 1080 (Full HD)',
      });
    } catch (err: unknown) {
      console.error('Render MP4 error:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Lỗi khi dựng video MP4.' });
    }
  });

  // Mount Vite middleware in development or static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`VKSND Broadcast Studio server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
