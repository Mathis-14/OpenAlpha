"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { ApiError, transcribeAudio } from "@/lib/api";
import { cn } from "@/lib/utils";

type VoiceInputProps = {
  accent: "blue" | "orange";
  disabled?: boolean;
  onTranscription: (text: string) => Promise<void> | void;
  onError: (message: string | null) => void;
  getAuthToken?: () => Promise<string | null>;
};

const MAX_RECORDING_MS = 30_000;
const PREFERRED_AUDIO_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

function detectPreferredAudioType(): string {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    return "";
  }

  for (const mimeType of PREFERRED_AUDIO_TYPES) {
    if (typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }

  return "";
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType.includes("webm")) {
    return "webm";
  }
  if (mimeType.includes("ogg")) {
    return "ogg";
  }
  if (mimeType.includes("mp4") || mimeType.includes("mpeg") || mimeType.includes("mp3")) {
    return "m4a";
  }

  return "webm";
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getIdleClasses(accent: "blue" | "orange"): string {
  return accent === "orange"
    ? "border-black/[0.08] bg-[#fff4ec] text-[#c85f14] hover:bg-[#ffe8d8]"
    : "border-black/[0.08] bg-[#f4f8ff] text-[#1080ff] hover:bg-[#e9f3ff]";
}

function getRecordingClasses(accent: "blue" | "orange"): string {
  return accent === "orange"
    ? "border-[#E8701A]/30 bg-[#E8701A] text-white shadow-[0_0_0_4px_rgba(232,112,26,0.14)]"
    : "border-[#1080ff]/30 bg-[#1080ff] text-white shadow-[0_0_0_4px_rgba(16,128,255,0.14)]";
}

export default function VoiceInput({
  accent,
  disabled = false,
  onTranscription,
  onError,
  getAuthToken,
}: VoiceInputProps) {
  const [supported, setSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const isSupported =
      typeof window !== "undefined" &&
      typeof MediaRecorder !== "undefined" &&
      typeof navigator !== "undefined" &&
      Boolean(navigator.mediaDevices?.getUserMedia);

    setSupported(isSupported);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (stopTimeoutRef.current) {
        clearTimeout(stopTimeoutRef.current);
      }
      abortRef.current?.abort();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function resetTimers() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
  }

  function releaseStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function handleRecorderStop(mimeTypeHint: string) {
    resetTimers();
    releaseStream();
    setRecording(false);

    const blobType = mediaRecorderRef.current?.mimeType || mimeTypeHint || "audio/webm";
    const blob = new Blob(chunksRef.current, { type: blobType });
    chunksRef.current = [];

    if (blob.size === 0) {
      onError("No audio was captured. Try recording again.");
      return;
    }

    setTranscribing(true);
    onError(null);
    abortRef.current = new AbortController();

    try {
      const file = new File(
        [blob],
        `voice-input.${extensionForMimeType(blob.type || mimeTypeHint)}`,
        { type: blob.type || mimeTypeHint || "audio/webm" },
      );
      const authToken = getAuthToken ? await getAuthToken() : null;
      const { text } = await transcribeAudio(file, abortRef.current.signal, authToken);
      const transcript = text.trim();

      if (!transcript) {
        onError("Transcription returned no text. Try speaking more clearly.");
        return;
      }

      Promise.resolve(onTranscription(transcript)).catch((error) => {
        onError((error as Error).message || "Failed to hand off the transcript.");
      });
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        if (error instanceof ApiError && error.status === 429) {
          onError(error.message || "Voice transcription limit reached.");
          return;
        }

        onError((error as Error).message || "Transcription failed. Try again.");
      }
    } finally {
      setTranscribing(false);
      abortRef.current = null;
    }
  }

  async function startRecording() {
    onError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = detectPreferredAudioType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      streamRef.current = stream;
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      setElapsedSeconds(0);
      setRecording(true);

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener("stop", () => {
        void handleRecorderStop(mimeType);
      });

      recorder.start();
      timerRef.current = setInterval(() => {
        setElapsedSeconds((current) => current + 1);
      }, 1000);
      stopTimeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      }, MAX_RECORDING_MS);
    } catch (error) {
      releaseStream();
      setRecording(false);
      const message =
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Microphone access is blocked. Enable microphone access in your browser or site settings and try again."
          : "Recording failed. Check your microphone and try again.";
      onError(message);
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }

  async function handleClick() {
    if (disabled || transcribing) {
      return;
    }

    if (recording) {
      stopRecording();
      return;
    }

    await startRecording();
  }

  if (!supported) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => {
        void handleClick();
      }}
      disabled={disabled || transcribing}
      className={cn(
        "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[10px] border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        recording ? getRecordingClasses(accent) : getIdleClasses(accent),
        recording && "animate-pulse",
      )}
      aria-label={recording ? "Stop recording" : "Start voice recording"}
      title={recording ? "Stop recording" : "Start voice recording"}
    >
      {transcribing ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-xs">...</span>
        </>
      ) : recording ? (
        <>
          <Square className="h-3.5 w-3.5 fill-current" />
          <span className="text-xs tabular-nums">{formatDuration(elapsedSeconds)}</span>
        </>
      ) : (
        <Mic className="h-4 w-4" />
      )}
    </button>
  );
}
