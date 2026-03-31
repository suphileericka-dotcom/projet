import GroupChatRoom from "./GroupChatRoom";

type RuptureProps = {
  isAuth: boolean;
};

const ruptureConfig = {
  room: "rupture",
  title: "Rupture",
  subtitle: "Un espace bienveillant pour se reconstruire",
  banner: "Un espace pour deposer la peine et avancer apres la rupture.",
  placeholder: "Exprime ce que tu ressens...",
  theme: {
    "--chat-bg": "linear-gradient(180deg, #fff5f5 0%, #fff1f2 100%)",
    "--chat-panel": "rgba(255, 245, 245, 0.95)",
    "--chat-panel-border": "rgba(239, 68, 68, 0.18)",
    "--chat-text": "#571313",
    "--chat-muted": "#8f3a3a",
    "--chat-accent": "#ef4444",
    "--chat-accent-contrast": "#fff4f4",
    "--chat-banner-bg": "rgba(239, 68, 68, 0.1)",
    "--chat-banner-text": "#7f1d1d",
    "--chat-note-bg": "rgba(239, 68, 68, 0.1)",
    "--chat-note-text": "#7f1d1d",
    "--chat-bubble-own": "linear-gradient(135deg, #ef4444 0%, #f97316 100%)",
    "--chat-bubble-own-text": "#fff5f5",
    "--chat-bubble-other": "rgba(255, 255, 255, 0.86)",
    "--chat-bubble-other-text": "#571313",
    "--chat-translation-bg": "rgba(239, 68, 68, 0.08)",
    "--chat-danger": "#be123c",
  },
} as const;

export default function Rupture({ isAuth }: RuptureProps) {
  return <GroupChatRoom isAuth={isAuth} config={ruptureConfig} />;
}
