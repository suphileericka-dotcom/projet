import { useRef } from "react";

type MicButtonProps = {
  onVoiceRecorded: (audioUrl: string) => void;
};

export default function MicButton({ onVoiceRecorded }: MicButtonProps) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingRef = useRef(false);

  async function startRecording() {
    if (recordingRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recordingRef.current = true;

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        if (!recordingRef.current) return;
        recordingRef.current = false;

        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const audioUrl = URL.createObjectURL(blob);

        onVoiceRecorded(audioUrl);

        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        mediaRecorderRef.current = null;
      };

      recorder.start();
    } catch (err) {
      console.error("Micro indisponible", err);
      recordingRef.current = false;
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    if (!recordingRef.current) return;
    if (recorder.state !== "recording") return;
    recorder.stop();
  }

  return (
    <button
      type="button"
      className="mic-btn"
      onMouseDown={startRecording}
      onMouseUp={stopRecording}
      onMouseLeave={stopRecording}
      onTouchStart={startRecording}
      onTouchEnd={stopRecording}
      aria-label="Maintenir pour enregistrer"
    >
      <span className="mic-icon" />
    </button>
  );
}
