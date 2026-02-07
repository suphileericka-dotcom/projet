export type AnonymizedVoiceResponse = {
  transcript: string;
  audioUrl: string; // URL publique de l'audio IA
  audioPath?: string;
};

export function useVoiceAnonymizer() {
  async function anonymize(audioUrl: string): Promise<AnonymizedVoiceResponse> {
    const blob = await fetch(audioUrl).then((r) => r.blob());

    const formData = new FormData();
    formData.append("audio", blob, "voice.webm");

    const res = await fetch("http://localhost:8000/api/voice/anonymize", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || "Voice anonymization failed");
    }

    return res.json();
  }

  return { anonymize };
}
