import type { BroadcastProject, LowerThirdStyle, StoryboardScene } from '../types/broadcast';

export interface LoadedMediaCache {
  logoImg: HTMLImageElement | null;
  photos: Map<string, HTMLImageElement>;
}

/**
 * Computes auto-calibrated ticker font size (at 1080p base) and speed based on headline length.
 */
export function calibrateTickerParams(tickerText: string): { fontSize: number; speed: number } {
  const len = tickerText.trim().length;
  if (len <= 55) {
    return { fontSize: 42, speed: 145 };
  }
  if (len <= 95) {
    return { fontSize: 38, speed: 155 };
  }
  if (len <= 140) {
    return { fontSize: 34, speed: 170 };
  }
  return { fontSize: 31, speed: 185 };
}

function drawTopLeftIdentity(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  logoImg: HTMLImageElement | null,
  unitName: string
) {
  const s = W / 1920;
  const padX = 48 * s;
  const padY = 32 * s;
  const maxLogoH = 62 * s;
  const maxLogoW = 76 * s;

  let textStartX = padX;

  if (logoImg && logoImg.naturalWidth > 0) {
    const ratio = Math.min(maxLogoW / logoImg.naturalWidth, maxLogoH / logoImg.naturalHeight);
    const drawW = logoImg.naturalWidth * ratio;
    const drawH = logoImg.naturalHeight * ratio;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.72)';
    ctx.shadowBlur = 10 * s;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2 * s;
    ctx.drawImage(logoImg, padX, padY + (maxLogoH - drawH) / 2, drawW, drawH);
    ctx.restore();

    textStartX = padX + drawW + 16 * s;
  }

  // Unit Name next to logo: small, crisp, light gold with subtle dark outline for high contrast on any photo
  ctx.save();
  ctx.font = `700 ${Math.round(23 * s)}px "Be Vietnam Pro", sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  const textY = padY + maxLogoH / 2 + 1 * s;
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.strokeStyle = 'rgba(7, 13, 28, 0.92)';
  ctx.lineWidth = 5 * s;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
  ctx.shadowBlur = 8 * s;
  ctx.strokeText(unitName, textStartX, textY);

  ctx.fillStyle = '#FEF08A';
  ctx.fillText(unitName, textStartX, textY);
  ctx.restore();
}

function getLowerThirdHeights(H: number, style: LowerThirdStyle): { tallH: number; compactH: number } {
  if (style === 'modern-chevron') {
    return { tallH: Math.round(H * 0.15), compactH: Math.round(H * 0.106) };
  }
  if (style === 'minimal-editorial') {
    return { tallH: Math.round(H * 0.126), compactH: Math.round(H * 0.095) };
  }
  return { tallH: Math.round(H * 0.162), compactH: Math.round(H * 0.112) };
}

function drawBlueBarBg(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  barHeightPx: number,
  style: LowerThirdStyle
) {
  const s = W / 1920;
  const topY = H - barHeightPx;

  ctx.save();

  if (style === 'modern-chevron') {
    // Sleek dark-cobalt modern broadcast gradient with sky-blue top beam
    const grad = ctx.createLinearGradient(0, topY, W, H);
    grad.addColorStop(0, '#071B40');
    grad.addColorStop(0.5, '#0E3272');
    grad.addColorStop(1, '#061533');
    ctx.fillStyle = grad;
    ctx.fillRect(0, topY, W, barHeightPx);

    const beamGrad = ctx.createLinearGradient(0, topY, W, topY);
    beamGrad.addColorStop(0, '#F59E0B');
    beamGrad.addColorStop(0.28, '#38BDF8');
    beamGrad.addColorStop(0.85, '#1D4ED8');
    beamGrad.addColorStop(1, 'rgba(37, 99, 235, 0.25)');
    ctx.fillStyle = beamGrad;
    ctx.fillRect(0, topY, W, 4 * s);

    // Subtle bottom metallic highlight
    ctx.fillStyle = 'rgba(148, 163, 184, 0.2)';
    ctx.fillRect(0, H - 2 * s, W, 2 * s);
    ctx.restore();
    return;
  }

  if (style === 'minimal-editorial') {
    // Slim frosted dark-navy ribbon with crisp royal-blue top edge & subtle gold bottom trim
    ctx.fillStyle = 'rgba(9, 20, 44, 0.92)';
    ctx.fillRect(0, topY, W, barHeightPx);

    const blueTop = ctx.createLinearGradient(0, topY, W, topY);
    blueTop.addColorStop(0, '#2563EB');
    blueTop.addColorStop(0.7, '#3B82F6');
    blueTop.addColorStop(1, 'rgba(37, 99, 235, 0.3)');
    ctx.fillStyle = blueTop;
    ctx.fillRect(0, topY, W, 3 * s);

    ctx.fillStyle = 'rgba(245, 158, 11, 0.55)';
    ctx.fillRect(0, H - 3 * s, W, 3 * s);
    ctx.restore();
    return;
  }

  // Default: 'diagonal-classic'
  const grad = ctx.createLinearGradient(0, topY, W, H);
  grad.addColorStop(0, '#0C357A');
  grad.addColorStop(0.55, '#134AA6');
  grad.addColorStop(1, '#092B63');
  ctx.fillStyle = grad;
  ctx.fillRect(0, topY, W, barHeightPx);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.fillRect(0, topY, W, 2 * s);

  const goldGrad = ctx.createLinearGradient(0, topY, W, topY);
  goldGrad.addColorStop(0, '#F59E0B');
  goldGrad.addColorStop(0.35, '#FDE68A');
  goldGrad.addColorStop(1, 'rgba(245, 158, 11, 0.35)');
  ctx.fillStyle = goldGrad;
  ctx.fillRect(0, topY, W, 3.5 * s);
  ctx.restore();
}

function drawRedDiagonalCap(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  barHeightPx: number,
  isTall: boolean,
  style: LowerThirdStyle
) {
  const s = W / 1920;
  const topY = H - barHeightPx;

  if (style === 'modern-chevron') {
    const baseW = (isTall ? 370 : 335) * s;
    const tipX = baseW + 46 * s;
    const midY = topY + barHeightPx / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 16 * s;
    ctx.shadowOffsetX = 6 * s;

    // Primary crimson chevron wedge pointing right (>)
    ctx.beginPath();
    ctx.moveTo(0, topY);
    ctx.lineTo(baseW, topY);
    ctx.lineTo(tipX, midY);
    ctx.lineTo(baseW, H);
    ctx.lineTo(0, H);
    ctx.closePath();

    const redGrad = ctx.createLinearGradient(0, topY, tipX, H);
    redGrad.addColorStop(0, '#881337');
    redGrad.addColorStop(0.55, '#DC2626');
    redGrad.addColorStop(1, '#991B1B');
    ctx.fillStyle = redGrad;
    ctx.fill();
    ctx.restore();

    // Secondary gold chevron blade parallel to edge
    ctx.save();
    const gap = 10 * s;
    const stripeW = 12 * s;
    ctx.beginPath();
    ctx.moveTo(baseW + gap, topY);
    ctx.lineTo(baseW + gap + stripeW, topY);
    ctx.lineTo(tipX + gap + stripeW, midY);
    ctx.lineTo(baseW + gap + stripeW, H);
    ctx.lineTo(baseW + gap, H);
    ctx.lineTo(tipX + gap, midY);
    ctx.closePath();
    ctx.fillStyle = '#F59E0B';
    ctx.fill();

    // Crisp label inside crimson chevron
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const labelX = 48 * s;
    if (isTall) {
      ctx.font = `800 ${Math.round(27 * s)}px "Be Vietnam Pro", sans-serif`;
      ctx.fillText('BẢN TIN', labelX, topY + barHeightPx * 0.36);
      ctx.fillStyle = '#FDE68A';
      ctx.font = `800 ${Math.round(23 * s)}px "Be Vietnam Pro", sans-serif`;
      ctx.fillText('HOẠT ĐỘNG', labelX, topY + barHeightPx * 0.66);
    } else {
      ctx.font = `800 ${Math.round(23 * s)}px "Be Vietnam Pro", sans-serif`;
      ctx.fillText('BẢN TIN HOẠT ĐỘNG', labelX, topY + barHeightPx * 0.51);
    }
    ctx.restore();
    return;
  }

  if (style === 'minimal-editorial') {
    // Left slim mask cap over ticker entry margin + elevated crimson editorial tag above bar
    ctx.save();
    // Subtle left margin fade-mask so ticker cleanly disappears into left safe zone
    const maskGrad = ctx.createLinearGradient(0, topY, 96 * s, topY);
    maskGrad.addColorStop(0, 'rgba(9, 20, 44, 1)');
    maskGrad.addColorStop(0.55, 'rgba(9, 20, 44, 0.98)');
    maskGrad.addColorStop(1, 'rgba(9, 20, 44, 0)');
    ctx.fillStyle = maskGrad;
    ctx.fillRect(0, topY, 96 * s, barHeightPx);

    // Top-border continuity over left fade zone
    ctx.fillStyle = '#2563EB';
    ctx.fillRect(0, topY, 96 * s, 3 * s);
    ctx.fillStyle = 'rgba(245, 158, 11, 0.55)';
    ctx.fillRect(0, H - 3 * s, 96 * s, 3 * s);

    // Elevated upper tag anchored cleanly above the left corner
    const tagH = 44 * s;
    const tagY = topY - tagH;
    const tagW = 310 * s;
    const tagX = 48 * s;

    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 12 * s;
    ctx.shadowOffsetY = -2 * s;

    ctx.beginPath();
    ctx.moveTo(tagX, tagY);
    ctx.lineTo(tagX + tagW, tagY);
    ctx.lineTo(tagX + tagW - 18 * s, topY);
    ctx.lineTo(tagX, topY);
    ctx.closePath();

    const tagGrad = ctx.createLinearGradient(tagX, tagY, tagX + tagW, topY);
    tagGrad.addColorStop(0, '#991B1B');
    tagGrad.addColorStop(1, '#DC2626');
    ctx.fillStyle = tagGrad;
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = '#FBBF24';
    ctx.fillRect(tagX, tagY, 6 * s, tagH);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `800 ${Math.round(20 * s)}px "Be Vietnam Pro", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('BẢN TIN HOẠT ĐỘNG', tagX + 20 * s, tagY + tagH / 2 + 1 * s);
    ctx.restore();
    return;
  }

  // Default: 'diagonal-classic'
  const redTopX = (isTall ? 410 : 365) * s;
  const redBottomX = (isTall ? 350 : 315) * s;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 16 * s;
  ctx.shadowOffsetX = 6 * s;

  ctx.beginPath();
  ctx.moveTo(0, topY);
  ctx.lineTo(redTopX, topY);
  ctx.lineTo(redBottomX, H);
  ctx.lineTo(0, H);
  ctx.closePath();

  const redGrad = ctx.createLinearGradient(0, topY, redTopX, H);
  redGrad.addColorStop(0, '#991B1B');
  redGrad.addColorStop(0.6, '#DC2626');
  redGrad.addColorStop(1, '#B91C1C');
  ctx.fillStyle = redGrad;
  ctx.fill();
  ctx.restore();

  // Crisp gold diagonal transition stripe
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(redTopX, topY);
  ctx.lineTo(redTopX + 8 * s, topY);
  ctx.lineTo(redBottomX + 8 * s, H);
  ctx.lineTo(redBottomX, H);
  ctx.closePath();
  ctx.fillStyle = '#FBBF24';
  ctx.fill();

  ctx.fillStyle = '#FBBF24';
  ctx.fillRect(0, topY, redTopX + 8 * s, 3.5 * s);

  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const labelX = 48 * s;
  if (isTall) {
    ctx.font = `800 ${Math.round(28 * s)}px "Be Vietnam Pro", sans-serif`;
    ctx.fillText('BẢN TIN', labelX, topY + barHeightPx * 0.36);
    ctx.fillStyle = '#FEF08A';
    ctx.font = `800 ${Math.round(24 * s)}px "Be Vietnam Pro", sans-serif`;
    ctx.fillText('HOẠT ĐỘNG', labelX, topY + barHeightPx * 0.65);
  } else {
    ctx.font = `800 ${Math.round(24 * s)}px "Be Vietnam Pro", sans-serif`;
    ctx.fillText('BẢN TIN HOẠT ĐỘNG', labelX, topY + barHeightPx * 0.52);
  }
  ctx.restore();
}

function drawPersonTag(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  name: string,
  title: string,
  barHeightPx: number,
  style: LowerThirdStyle
) {
  if (!name.trim()) return;
  const s = W / 1920;
  const boxH = 88 * s;
  const extraOffset = style === 'minimal-editorial' ? 54 * s : 0;
  const boxY = H - barHeightPx - boxH - 18 * s - extraOffset;
  const boxX = 48 * s;

  ctx.save();
  ctx.font = `700 ${Math.round(28 * s)}px "Be Vietnam Pro", sans-serif`;
  const nameW = ctx.measureText(name).width;
  ctx.font = `500 ${Math.round(21 * s)}px "Public Sans", sans-serif`;
  const titleW = ctx.measureText(title).width;
  const boxW = Math.min(W * 0.62, Math.max(nameW, titleW) + 72 * s);

  // Sleek dark institutional backing with gold accent edge
  ctx.fillStyle = 'rgba(11, 23, 46, 0.88)';
  ctx.beginPath();
  ctx.moveTo(boxX, boxY);
  ctx.lineTo(boxX + boxW, boxY);
  ctx.lineTo(boxX + boxW - 22 * s, boxY + boxH);
  ctx.lineTo(boxX, boxY + boxH);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#DC2626';
  ctx.fillRect(boxX, boxY, 7 * s, boxH);

  ctx.fillStyle = '#FFFFFF';
  ctx.textBaseline = 'top';
  ctx.font = `700 ${Math.round(27 * s)}px "Be Vietnam Pro", sans-serif`;
  ctx.fillText(name, boxX + 24 * s, boxY + 14 * s);

  if (title.trim()) {
    ctx.fillStyle = '#FDE68A';
    ctx.font = `500 ${Math.round(20 * s)}px "Public Sans", sans-serif`;
    ctx.fillText(title, boxX + 24 * s, boxY + 49 * s);
  }
  ctx.restore();
}

function drawClosingSlate(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  unitName: string,
  closingSubtitle: string
) {
  const s = W / 1920;
  ctx.save();
  const scrim = ctx.createLinearGradient(0, H * 0.35, 0, H);
  scrim.addColorStop(0, 'rgba(9, 20, 44, 0.15)');
  scrim.addColorStop(0.55, 'rgba(9, 20, 44, 0.78)');
  scrim.addColorStop(1, 'rgba(7, 15, 34, 0.94)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, W, H);

  const centerY = H * 0.76;

  // Gold thin rule
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(W / 2 - 140 * s, centerY - 48 * s, 280 * s, 3 * s);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
  ctx.shadowBlur = 12 * s;

  ctx.fillStyle = '#FEF08A';
  ctx.font = `800 ${Math.round(44 * s)}px "Be Vietnam Pro", sans-serif`;
  ctx.fillText(unitName, W / 2, centerY);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = `600 ${Math.round(28 * s)}px "Be Vietnam Pro", sans-serif`;
  ctx.fillText(closingSubtitle, W / 2, centerY + 56 * s);
  ctx.restore();
}

function measureTickerStrip(
  text: string,
  fontSize1080: number,
  scaleFactor: number
): { width: number; height: number; canvas: HTMLCanvasElement } {
  const cleanText = `  ${text.trim().toUpperCase()}   •   ${text.trim().toUpperCase()}  `;
  const fontSize = Math.round(fontSize1080 * scaleFactor);
  const stripH = Math.round(88 * scaleFactor);

  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  ctx.font = `700 ${fontSize}px "Be Vietnam Pro", sans-serif`;
  const measuredW = Math.ceil(ctx.measureText(cleanText).width) + Math.round(80 * scaleFactor);

  c.width = Math.max(400, measuredW);
  c.height = stripH;

  // Re-apply font after resize
  ctx.font = `700 ${fontSize}px "Be Vietnam Pro", sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 6 * scaleFactor;
  ctx.shadowOffsetY = 2 * scaleFactor;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(cleanText, 20 * scaleFactor, stripH / 2);

  return { width: c.width, height: c.height, canvas: c };
}

/**
 * Renders an exact frame of the live 16:9 broadcast monitor onto a target Canvas.
 */
export function renderBroadcastFrame(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  project: BroadcastProject,
  media: LoadedMediaCache,
  currentTimeSec: number
): void {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#070D1A';
  ctx.fillRect(0, 0, W, H);

  const style = project.lowerThirdStyle || 'diagonal-classic';
  const scenes = project.scenes;
  if (scenes.length === 0) {
    drawTopLeftIdentity(ctx, W, H, media.logoImg, project.unitName);
    const { tallH } = getLowerThirdHeights(H, style);
    drawBlueBarBg(ctx, W, H, tallH, style);
    drawRedDiagonalCap(ctx, W, H, tallH, true, style);
    return;
  }

  // Locate active scene & transition blend
  let acc = 0;
  let activeIdx = scenes.length - 1;
  let localT = 0;

  for (let i = 0; i < scenes.length; i++) {
    if (currentTimeSec < acc + scenes[i].durationSec || i === scenes.length - 1) {
      activeIdx = i;
      localT = Math.max(0, currentTimeSec - acc);
      break;
    }
    acc += scenes[i].durationSec;
  }

  const totalDur = scenes.reduce((sum, sc) => sum + sc.durationSec, 0);
  const activeScene = scenes[activeIdx];
  const prevScene = activeIdx > 0 ? scenes[activeIdx - 1] : null;
  const transDur = 0.5;
  const inTrans = prevScene && localT < transDur;

  const drawScenePhoto = (scene: StoryboardScene, progress: number, alpha: number, slideOffsetX = 0) => {
    const img = media.photos.get(scene.photoId);
    if (!img || img.naturalWidth === 0) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    if (slideOffsetX !== 0) {
      ctx.translate(slideOffsetX, 0);
    }

    // Cover-fit image cleanly while computing Ken Burns zoom/pan
    const baseScale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    let zoom = 1.0;
    let panX = 0;
    const p = Math.max(0, Math.min(1, progress));

    if (scene.motionEffect === 'zoom-in') {
      zoom = 1.0 + 0.07 * p;
    } else if (scene.motionEffect === 'zoom-out') {
      zoom = 1.07 - 0.07 * p;
    } else if (scene.motionEffect === 'pan-left') {
      zoom = 1.06;
      panX = (0.5 - p) * W * 0.04;
    } else {
      zoom = 1.06;
      panX = (p - 0.5) * W * 0.04;
    }

    const drawW = img.naturalWidth * baseScale * zoom;
    const drawH = img.naturalHeight * baseScale * zoom;
    const drawX = (W - drawW) / 2 + panX;
    const drawY = (H - drawH) / 2;

    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    ctx.restore();
  };

  if (inTrans && prevScene) {
    const blend = localT / transDur;
    if (activeScene.transition === 'slide-left') {
      drawScenePhoto(prevScene, 1, 1, -blend * W);
      drawScenePhoto(activeScene, localT / activeScene.durationSec, 1, (1 - blend) * W);
    } else {
      drawScenePhoto(prevScene, 1, 1);
      drawScenePhoto(activeScene, localT / activeScene.durationSec, blend);
    }
  } else {
    drawScenePhoto(activeScene, localT / activeScene.durationSec, 1);
  }

  // Lower-third sizing (tall in opening seconds, then smoothly compacting)
  const { tallH, compactH } = getLowerThirdHeights(H, style);
  const tallUntil = project.openingTallSeconds || 5;
  const isTall = currentTimeSec < tallUntil;
  const barH = isTall ? tallH : compactH;

  // Person tag if enabled
  if (activeScene.personTag?.show && activeScene.personTag.name && !activeScene.isClosingScene) {
    const tagAlpha = localT < 0.4 ? localT / 0.4 : localT > activeScene.durationSec - 0.4 ? Math.max(0, (activeScene.durationSec - localT) / 0.4) : 1;
    ctx.save();
    ctx.globalAlpha = tagAlpha;
    drawPersonTag(ctx, W, H, activeScene.personTag.name, activeScene.personTag.title, barH, style);
    ctx.restore();
  }

  // Closing slate or lower-third ticker
  const isClosingActive = Boolean(activeScene.isClosingScene && localT >= 0.35);

  if (isClosingActive) {
    const fadeIn = Math.min(1, (localT - 0.35) / 0.6);
    ctx.save();
    ctx.globalAlpha = fadeIn;
    drawClosingSlate(ctx, W, H, project.unitName, project.closingSubtitle);
    ctx.restore();
  } else {
    drawBlueBarBg(ctx, W, H, barH, style);

    // Scrolling ticker text right-to-left
    const scaleFactor = W / 1920;
    const strip = measureTickerStrip(project.tickerText || 'BẢN TIN HOẠT ĐỘNG', project.tickerFontSize, scaleFactor);
    const speedPx = (project.tickerSpeed || 145) * scaleFactor;
    const tickerX = W - ((currentTimeSec * speedPx + W * 0.22) % (W + strip.width));
    const tickerY = H - barH + (barH - strip.height) / 2 + 2 * scaleFactor;
    ctx.drawImage(strip.canvas, tickerX, tickerY);

    drawRedDiagonalCap(ctx, W, H, barH, isTall, style);
  }

  // Persistent Top-Left Logo & Unit Name
  drawTopLeftIdentity(ctx, W, H, media.logoImg, project.unitName);

  // Subtle fade-to-black in final 0.9s
  if (totalDur > 2 && currentTimeSec > totalDur - 0.9) {
    const blackAlpha = Math.min(1, (currentTimeSec - (totalDur - 0.9)) / 0.9);
    ctx.save();
    ctx.fillStyle = `rgba(0, 0, 0, ${blackAlpha.toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

/**
 * Generates crisp transparent PNG graphic plates at full export resolution (1080p or 4K) for FFmpeg.
 */
export function generateExportPlates(
  project: BroadcastProject,
  logoImg: HTMLImageElement | null
): {
  tickerYOffsetTall: number;
  tickerYOffsetCompact: number;
  plates: {
    headerPngBase64: string;
    blueBgTallPngBase64: string;
    redCapTallPngBase64: string;
    blueBgCompactPngBase64: string;
    redCapCompactPngBase64: string;
    tickerStripPngBase64: string;
    closingSlatePngBase64: string;
  };
  personTagsBySceneId: Record<string, string>;
} {
  const is4k = project.resolution === '4k';
  const W = is4k ? 3840 : 1920;
  const H = is4k ? 2160 : 1080;
  const scaleFactor = W / 1920;

  const makeLayer = (drawFn: (ctx: CanvasRenderingContext2D) => void): string => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d')!;
    drawFn(ctx);
    return c.toDataURL('image/png');
  };

  const style = project.lowerThirdStyle || 'diagonal-classic';
  const { tallH, compactH } = getLowerThirdHeights(H, style);
  const { tallH: tallH1080, compactH: compactH1080 } = getLowerThirdHeights(1080, style);

  const headerPngBase64 = makeLayer((ctx) => {
    drawTopLeftIdentity(ctx, W, H, logoImg, project.unitName);
  });

  const blueBgTallPngBase64 = makeLayer((ctx) => {
    drawBlueBarBg(ctx, W, H, tallH, style);
  });

  const redCapTallPngBase64 = makeLayer((ctx) => {
    drawRedDiagonalCap(ctx, W, H, tallH, true, style);
  });

  const blueBgCompactPngBase64 = makeLayer((ctx) => {
    drawBlueBarBg(ctx, W, H, compactH, style);
  });

  const redCapCompactPngBase64 = makeLayer((ctx) => {
    drawRedDiagonalCap(ctx, W, H, compactH, false, style);
  });

  const strip = measureTickerStrip(project.tickerText || 'BẢN TIN HOẠT ĐỘNG', project.tickerFontSize, scaleFactor);
  const tickerStripPngBase64 = strip.canvas.toDataURL('image/png');

  const tickerYOffsetTall = Math.round((1080 - tallH1080) + (tallH1080 - 88) / 2 + 2);
  const tickerYOffsetCompact = Math.round((1080 - compactH1080) + (compactH1080 - 88) / 2 + 2);

  const closingSlatePngBase64 = makeLayer((ctx) => {
    drawClosingSlate(ctx, W, H, project.unitName, project.closingSubtitle);
  });

  const personTagsBySceneId: Record<string, string> = {};
  let accTime = 0;
  for (const sc of project.scenes) {
    const barHForScene = accTime < (project.openingTallSeconds || 5) ? tallH : compactH;
    if (sc.personTag?.show && sc.personTag.name && !sc.isClosingScene) {
      personTagsBySceneId[sc.id] = makeLayer((ctx) => {
        drawPersonTag(ctx, W, H, sc.personTag.name, sc.personTag.title, barHForScene, style);
      });
    }
    accTime += sc.durationSec;
  }

  return {
    tickerYOffsetTall,
    tickerYOffsetCompact,
    plates: {
      headerPngBase64,
      blueBgTallPngBase64,
      redCapTallPngBase64,
      blueBgCompactPngBase64,
      redCapCompactPngBase64,
      tickerStripPngBase64,
      closingSlatePngBase64,
    },
    personTagsBySceneId,
  };
}
