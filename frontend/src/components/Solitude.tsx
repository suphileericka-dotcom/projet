import GroupChatRoom from "./GroupChatRoom";
import { useLang } from "../hooks/useLang";

type SolitudeProps = {
  isAuth: boolean;
};

const solitudeTheme = {
    "--chat-bg": "linear-gradient(180deg, #0f172a 0%, #020617 100%)",
    "--chat-panel": "rgba(15, 23, 42, 0.94)",
    "--chat-panel-border": "rgba(56, 189, 248, 0.18)",
    "--chat-text": "#e5eef9",
    "--chat-muted": "#9fb2ca",
    "--chat-accent": "#38bdf8",
    "--chat-accent-contrast": "#03131e",
    "--chat-banner-bg": "rgba(56, 189, 248, 0.14)",
    "--chat-banner-text": "#d9f2ff",
    "--chat-note-bg": "rgba(14, 165, 233, 0.12)",
    "--chat-note-text": "#d6f6ff",
    "--chat-bubble-own": "linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%)",
    "--chat-bubble-own-text": "#03131e",
    "--chat-bubble-other": "rgba(15, 23, 42, 0.84)",
    "--chat-bubble-other-text": "#f8fafc",
    "--chat-translation-bg": "rgba(255, 255, 255, 0.08)",
    "--chat-danger": "#fb7185",
} as const;

export default function Solitude({ isAuth }: SolitudeProps) {
  const { t } = useLang();

  return (
    <GroupChatRoom
      isAuth={isAuth}
      config={{
        room: "solitude",
        title: t("solitudeTitle"),
        subtitle: t("solitudeSubtitle"),
        banner: t("solitudeBanner"),
        placeholder: t("chatPlaceholder"),
        noteStorageKey: "solitude_note",
        noteLabel: t("solitudeNoteLabel"),
        theme: solitudeTheme,
      }}
    />
  );
}
