declare module 'whisper.rn' {
  export interface TranscribeResult {
    result: string;
    language: string;
    segments: Array<{ text: string; t0: number; t1: number }>;
    isAborted: boolean;
  }

  export interface TranscribeOptions {
    language?: string;
    translate?: boolean;
    maxThreads?: number;
    nProcessors?: number;
    maxContext?: number;
    maxLen?: number;
    temperature?: number;
    beamSize?: number;
    bestOf?: number;
    prompt?: string;
  }

  export class WhisperContext {
    transcribe(
      filePathOrBase64: string | number,
      options?: TranscribeOptions
    ): {
      stop: () => Promise<void>;
      promise: Promise<TranscribeResult>;
    };
    release(): Promise<void>;
  }

  export function initWhisper(input: { filePath: string | number }): Promise<WhisperContext>;
}
