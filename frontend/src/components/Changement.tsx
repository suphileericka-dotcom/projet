import GroupChatRoom from "./GroupChatRoom";
import { useLang } from "../hooks/useLang";

type ChangementProps = {
  isAuth: boolean;
};

const changementTheme = {
    "--chat-bg": "linear-gradient(180deg, #f0fdf9 0%, #d7fbf4 100%)",
    "--chat-panel": "rgba(255, 255, 255, 0.92)",
    "--chat-panel-border": "rgba(20, 184, 166, 0.18)",
    "--chat-text": "#10363a",
    "--chat-muted": "#4b6f73",
    "--chat-accent": "#14b8a6",
    "--chat-accent-contrast": "#f8fffe",
    "--chat-banner-bg": "rgba(20, 184, 166, 0.12)",
    "--chat-banner-text": "#0f5e56",
    "--chat-note-bg": "rgba(20, 184, 166, 0.1)",
    "--chat-note-text": "#0f5e56",
    "--chat-bubble-own": "linear-gradient(135deg, #14b8a6 0%, #0f766e 100%)",
    "--chat-bubble-own-text": "#f8fffe",
    "--chat-bubble-other": "rgba(255, 255, 255, 0.94)",
    "--chat-bubble-other-text": "#10363a",
    "--chat-translation-bg": "rgba(20, 184, 166, 0.08)",
    "--chat-danger": "#e11d48",
} as const;

export default function Changement({ isAuth }: ChangementProps) {
  const { t } = useLang();

  return (
    <GroupChatRoom
      isAuth={isAuth}
      config={{
        room: "changement",
        title: t("changementTitle"),
        subtitle: t("changementSubtitle"),
        banner: t("changementBanner"),
        placeholder: t("changementPlaceholder"),
        theme: changementTheme,
      }}
    />
  );
}
