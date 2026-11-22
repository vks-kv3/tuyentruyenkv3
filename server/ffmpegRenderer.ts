import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { buildMasterVoiceoverWav, generateNewsroomBgmWav } from './audioUtils.ts';

export interface RenderSceneInput {
  id: string;
  imagePath: string;
  durationSec: number;
  motionEffect: 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right';
  transition: 'fade' | 'dissolve' | 'slide-left';
  wavPath?: string;
  personTagPngBase64?: string;
  isClosingScene?: boolean;
}

export interface RenderJobInput {
  jobId: string;
  workDir: string;
  outputMp4Path: string;
  resolution: '1080p' | '4k';
  scenes: RenderSceneInput[];
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
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg thoát với mã ${code}: ${stderr.trim() || 'Lỗi xử lý video'}`));
      }
    });
  });
}

function saveBase64Png(base64DataUrl: string, filePath: string): void {
  const cleaned = base64DataUrl.replace(/^data:image\/\w+;base64,/, '');
  fs.writeFileSync(filePath, Buffer.from(cleaned, 'base64'));
}

function mapTransitionName(t: 'fade' | 'dissolve' | 'slide-left'): string {
  if (t === 'slide-left') return 'slideleft';
  if (t === 'dissolve') return 'dissolve';
  return 'fade';
}

export async function renderBroadcastMp4(input: RenderJobInput): Promise<{
  durationSec: number;
  fileSizeBytes: number;
}> {
  const {
    workDir,
    outputMp4Path,
    resolution,
    scenes,
    openingTallSeconds,
    tickerSpeed,
    tickerYOffsetTall,
    tickerYOffsetCompact,
    bgmEnabled,
    bgmVolume,
    plates,
  } = input;

  if (scenes.length === 0) {
    throw new Error('Không có phân cảnh nào để dựng video.');
  }

  fs.mkdirSync(workDir, { recursive: true });
  fs.mkdirSync(path.dirname(outputMp4Path), { recursive: true });

  const width = resolution === '4k' ? 3840 : 1920;
  const height = resolution === '4k' ? 2160 : 1080;
  const fps = 30;
  const transDur = scenes.length > 1 ? 0.5 : 0;
  const halfTrans = transDur / 2;

  // Save graphic plate PNGs
  const headerPath = path.join(workDir, 'header.png');
  const blueTallPath = path.join(workDir, 'blue_tall.png');
  const redTallPath = path.join(workDir, 'red_tall.png');
  const blueCompactPath = path.join(workDir, 'blue_compact.png');
  const redCompactPath = path.join(workDir, 'red_compact.png');
  const tickerStripPath = path.join(workDir, 'ticker_strip.png');
  const closingSlatePath = path.join(workDir, 'closing_slate.png');

  saveBase64Png(plates.headerPngBase64, headerPath);
  saveBase64Png(plates.blueBgTallPngBase64, blueTallPath);
  saveBase64Png(plates.redCapTallPngBase64, redTallPath);
  saveBase64Png(plates.blueBgCompactPngBase64, blueCompactPath);
  saveBase64Png(plates.redCapCompactPngBase64, redCompactPath);
  saveBase64Png(plates.tickerStripPngBase64, tickerStripPath);
  saveBase64Png(plates.closingSlatePngBase64, closingSlatePath);

  // 1. Render each scene clip with exact zoompan supersampling + optional person tag & closing slate
  const sceneClipPaths: string[] = [];
  let timelineCursor = 0;
  const audioClips: Array<{ wavPath?: string; startSec: number; durationSec: number }> = [];

  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    audioClips.push({
      wavPath: s.wavPath,
      startSec: timelineCursor,
      durationSec: s.durationSec,
    });
    timelineCursor += s.durationSec;

    let clipLen = s.durationSec;
    if (scenes.length > 1) {
      if (i === 0 || i === scenes.length - 1) {
        clipLen = s.durationSec + halfTrans;
      } else {
        clipLen = s.durationSec + transDur;
      }
    }

    const totalFrames = Math.max(15, Math.round(clipLen * fps));
    const ssWidth = width * 2;
    const ssHeight = height * 2;

    let zpExpr = '';
    if (s.motionEffect === 'zoom-in') {
      zpExpr = `zoompan=z='1.0+0.07*(on/${totalFrames})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${width}x${height}:fps=${fps}`;
    } else if (s.motionEffect === 'zoom-out') {
      zpExpr = `zoompan=z='1.07-0.07*(on/${totalFrames})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${width}x${height}:fps=${fps}`;
    } else if (s.motionEffect === 'pan-left') {
      zpExpr = `zoompan=z='1.06':x='(iw-iw/zoom)*(1-on/${totalFrames})':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${width}x${height}:fps=${fps}`;
    } else {
      zpExpr = `zoompan=z='1.06':x='(iw-iw/zoom)*(on/${totalFrames})':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${width}x${height}:fps=${fps}`;
    }

    const sceneClipPath = path.join(workDir, `scene_${i}.mp4`);
    sceneClipPaths.push(sceneClipPath);

    const ffArgs: string[] = ['-loop', '1', '-i', s.imagePath];
    let filterComplex = `[0:v]scale=${ssWidth}:${ssHeight}:force_original_aspect_ratio=increase,crop=${ssWidth}:${ssHeight},setsar=1,${zpExpr},format=yuv420p[bg]`;
    let lastLabel = 'bg';

    if (s.personTagPngBase64) {
      const tagPath = path.join(workDir, `person_${i}.png`);
      saveBase64Png(s.personTagPngBase64, tagPath);
      ffArgs.push('-i', tagPath);
      const tagStart = 0.4;
      const tagEnd = Math.max(1.5, clipLen - 0.5);
      filterComplex += `;[${lastLabel}][1:v]overlay=0:0:enable='between(t,${tagStart.toFixed(2)},${tagEnd.toFixed(2)})'[tagged]`;
      lastLabel = 'tagged';
    }

    if (s.isClosingScene) {
      const closeInputIdx = s.personTagPngBase64 ? 2 : 1;
      ffArgs.push('-i', closingSlatePath);
      filterComplex += `;[${lastLabel}][${closeInputIdx}:v]overlay=0:0:enable='gte(t,0.4)'[closed]`;
      lastLabel = 'closed';
    }

    ffArgs.push(
      '-filter_complex',
      filterComplex,
      '-map',
      `[${lastLabel}]`,
      '-t',
      clipLen.toFixed(3),
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '16',
      '-pix_fmt',
      'yuv420p',
      sceneClipPath
    );

    await runFfmpeg(ffArgs);
  }

  const totalDurationSec = timelineCursor;

  // 2. Concatenate / xfade scene clips into base_scenes.mp4
  const baseScenesPath = path.join(workDir, 'base_scenes.mp4');
  if (sceneClipPaths.length === 1) {
    fs.copyFileSync(sceneClipPaths[0], baseScenesPath);
  } else {
    const xfadeArgs: string[] = [];
    for (const p of sceneClipPaths) {
      xfadeArgs.push('-i', p);
    }

    const filterParts: string[] = [];
    let currentLabel = '[0:v]';
    let accDuration = scenes[0].durationSec;

    for (let i = 1; i < sceneClipPaths.length; i++) {
      const offset = Math.max(0.1, accDuration - halfTrans);
      const transName = mapTransitionName(scenes[i].transition);
      const outLabel = i === sceneClipPaths.length - 1 ? '[vout]' : `[xf${i}]`;
      filterParts.push(
        `${currentLabel}[${i}:v]xfade=transition=${transName}:duration=${transDur.toFixed(2)}:offset=${offset.toFixed(3)}${outLabel}`
      );
      currentLabel = outLabel;
      accDuration += scenes[i].durationSec;
    }

    xfadeArgs.push(
      '-filter_complex',
      filterParts.join(';'),
      '-map',
      '[vout]',
      '-t',
      totalDurationSec.toFixed(3),
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '16',
      '-pix_fmt',
      'yuv420p',
      baseScenesPath
    );

    await runFfmpeg(xfadeArgs);
  }

  // 3. Build Master Voiceover WAV & Newsroom BGM WAV
  const voiceMasterPath = path.join(workDir, 'voice_master.wav');
  buildMasterVoiceoverWav(audioClips, totalDurationSec, voiceMasterPath);

  const bgmMasterPath = path.join(workDir, 'bgm_master.wav');
  if (bgmEnabled) {
    generateNewsroomBgmWav(totalDurationSec, bgmMasterPath);
  }

  // 4. Composite persistent broadcast graphics (logo header, diagonal red+blue lower third, scrolling ticker) + mix audio -> final MP4
  const lastScene = scenes[scenes.length - 1];
  const closingHideTickerTime = lastScene.isClosingScene
    ? Math.max(openingTallSeconds + 1, totalDurationSec - lastScene.durationSec + 0.35)
    : totalDurationSec;

  const tallEnd = Math.min(openingTallSeconds, closingHideTickerTime);
  const scaleFactor = resolution === '4k' ? 2 : 1;
  const effectiveSpeed = tickerSpeed * scaleFactor;
  const yTall = Math.round(tickerYOffsetTall * scaleFactor);
  const yCompact = Math.round(tickerYOffsetCompact * scaleFactor);
  const fadeOutStart = Math.max(0.5, totalDurationSec - 1.0);

  const finalArgs: string[] = [
    '-i', baseScenesPath,       // 0
    '-i', headerPath,           // 1
    '-i', blueTallPath,         // 2
    '-i', redTallPath,          // 3
    '-i', blueCompactPath,      // 4
    '-i', redCompactPath,       // 5
    '-i', tickerStripPath,      // 6
    '-i', voiceMasterPath,      // 7
  ];

  if (bgmEnabled) {
    finalArgs.push('-i', bgmMasterPath); // 8
  }

  // Layering order:
  // base -> blueBg (tall then compact) -> scrolling ticker -> redCap (tall then compact) -> persistent header -> final fade-out
  const vFilters = [
    `[0:v][2:v]overlay=0:0:enable='between(t,0,${tallEnd.toFixed(2)})'[v1]`,
    `[v1][4:v]overlay=0:0:enable='between(t,${tallEnd.toFixed(2)},${closingHideTickerTime.toFixed(2)})'[v2]`,
    `[v2][6:v]overlay=x='W-mod(t*${effectiveSpeed.toFixed(1)}+W*0.22,W+w)':y='if(lt(t,${tallEnd.toFixed(2)}),${yTall},${yCompact})':enable='lt(t,${closingHideTickerTime.toFixed(2)})'[v3]`,
    `[v3][3:v]overlay=0:0:enable='between(t,0,${tallEnd.toFixed(2)})'[v4]`,
    `[v4][5:v]overlay=0:0:enable='between(t,${tallEnd.toFixed(2)},${closingHideTickerTime.toFixed(2)})'[v5]`,
    `[v5][1:v]overlay=0:0[v6]`,
    `[v6]fade=t=out:st=${fadeOutStart.toFixed(2)}:d=0.9,format=yuv420p[vfinal]`,
  ];

  let aFilter = '';
  if (bgmEnabled) {
    const safeBgmVol = Math.max(0, Math.min(0.4, bgmVolume));
    aFilter = `;[7:a]volume=1.05,aresample=48000[va];[8:a]volume=${safeBgmVol.toFixed(3)},aresample=48000[ba];[va][ba]amix=inputs=2:duration=first:dropout_transition=2,afade=t=out:st=${fadeOutStart.toFixed(2)}:d=0.9[afinal]`;
  } else {
    aFilter = `;[7:a]volume=1.05,aresample=48000,afade=t=out:st=${fadeOutStart.toFixed(2)}:d=0.9[afinal]`;
  }

  finalArgs.push(
    '-filter_complex',
    vFilters.join(';') + aFilter,
    '-map',
    '[vfinal]',
    '-map',
    '[afinal]',
    '-t',
    totalDurationSec.toFixed(3),
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '18',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-ar',
    '48000',
    '-movflags',
    '+faststart',
    outputMp4Path
  );

  await runFfmpeg(finalArgs);

  const stat = fs.statSync(outputMp4Path);
  return {
    durationSec: totalDurationSec,
    fileSizeBytes: stat.size,
  };
}
