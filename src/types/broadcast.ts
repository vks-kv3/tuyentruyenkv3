export type MotionEffect = 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right';
export type TransitionEffect = 'fade' | 'dissolve' | 'slide-left';
export type VoiceOption = 'Charon' | 'Fenrir' | 'Orus' | 'Kore';
export type ExportResolution = '1080p' | '4k';
export type LowerThirdStyle = 'diagonal-classic' | 'modern-chevron' | 'minimal-editorial';

export interface UploadedPhoto {
  id: string;
  filename: string;
  url: string;
  width?: number;
  height?: number;
}

export interface VerifiedPerson {
  name: string;
  title: string;
}

export interface DocumentFacts {
  mainTitle: string;
  eventTime: string;
  location: string;
  attendees: string[];
  keyEvents: string[];
  outcomes: string[];
  significance: string;
  verifiedPersons: VerifiedPerson[];
}

export interface StoryboardScene {
  id: string;
  sceneIndex: number;
  title: string;
  photoId: string;
  durationSec: number;
  narration: string;
  motionEffect: MotionEffect;
  transition: TransitionEffect;
  personTag: {
    name: string;
    title: string;
    show: boolean;
  };
  audioUrl?: string;
  audioDurationSec?: number;
  isClosingScene?: boolean;
}

export interface BroadcastProject {
  unitName: string;
  closingSubtitle: string;
  tickerText: string;
  tickerSpeed: number;
  tickerFontSize: number;
  openingTallSeconds: number;
  lowerThirdStyle: LowerThirdStyle;
  logoUrl: string | null;
  voiceName: VoiceOption;
  bgmVolume: number;
  bgmEnabled: boolean;
  resolution: ExportResolution;
  facts: DocumentFacts | null;
  scenes: StoryboardScene[];
}

export interface RenderedVideoResult {
  videoUrl: string;
  filename: string;
  durationSec: number;
  fileSizeBytes: number;
  resolution: string;
}
