import GroupChatRoom from "./GroupChatRoom";
import { useLang } from "../hooks/useLang";

type ExpatriationProps = {
  isAuth: boolean;
};

const expatriationTheme = {
    "--chat-bg": "linear-gradient(180deg, #0b1320 0%, #111921 100%)",
    "--chat-panel": "rgba(15, 23, 32, 0.94)",
    "--chat-panel-border": "rgba(48, 140, 232, 0.16)",
    "--chat-text": "#e6edf3",
    "--chat-muted": "#93adc8",
    "--chat-accent": "#308ce8",
    "--chat-accent-contrast": "#031423",
    "--chat-banner-bg": "rgba(48, 140, 232, 0.12)",
    "--chat-banner-text": "#d4e8ff",
    "--chat-note-bg": "rgba(48, 140, 232, 0.1)",
    "--chat-note-text": "#d4e8ff",
    "--chat-bubble-own": "linear-gradient(135deg, #308ce8 0%, #1d4ed8 100%)",
    "--chat-bubble-own-text": "#edf6ff",
    "--chat-bubble-other": "rgba(36, 54, 71, 0.92)",
    "--chat-bubble-other-text": "#e6edf3",
    "--chat-translation-bg": "rgba(48, 140, 232, 0.12)",
    "--chat-danger": "#fb7185",
} as const;

export default function Expatriation({ isAuth }: ExpatriationProps) {
  const { t } = useLang();

  return (
    <GroupChatRoom
      isAuth={isAuth}
      config={{
        room: "expatriation",
        title: t("expatriationTitle"),
        subtitle: t("expatriationSubtitle"),
        banner: t("expatriationBanner"),
        placeholder: t("expatriationPlaceholder"),
        theme: expatriationTheme,
      }}
    />
  );
}
