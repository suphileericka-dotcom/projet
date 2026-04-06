import GroupChatRoom from "./GroupChatRoom";
import { useLang } from "../hooks/useLang";

type BurnoutProps = {
  isAuth: boolean;
};

const burnoutTheme = {
    "--chat-bg": "linear-gradient(180deg, #121212 0%, #1d2333 100%)",
    "--chat-panel": "rgba(10, 10, 10, 0.92)",
    "--chat-panel-border": "rgba(74, 222, 128, 0.2)",
    "--chat-text": "#f8fafc",
    "--chat-muted": "#9bb0ad",
    "--chat-accent": "#4ade80",
    "--chat-accent-contrast": "#06150c",
    "--chat-banner-bg": "rgba(74, 222, 128, 0.12)",
    "--chat-banner-text": "#dbffe7",
    "--chat-note-bg": "rgba(74, 222, 128, 0.12)",
    "--chat-note-text": "#dbffe7",
    "--chat-bubble-own": "linear-gradient(135deg, #4ade80 0%, #22c55e 100%)",
    "--chat-bubble-own-text": "#072111",
    "--chat-bubble-other": "rgba(24, 24, 27, 0.88)",
    "--chat-bubble-other-text": "#f8fafc",
    "--chat-translation-bg": "rgba(255, 255, 255, 0.06)",
    "--chat-danger": "#fb7185",
} as const;

export default function Burnout({ isAuth }: BurnoutProps) {
  const { t } = useLang();

  return (
    <GroupChatRoom
      isAuth={isAuth}
      config={{
        room: "burnout",
        title: t("burnoutTitle"),
        subtitle: t("burnoutSubtitle"),
        banner: t("burnoutBanner"),
        placeholder: t("chatPlaceholder"),
        theme: burnoutTheme,
      }}
    />
  );
}
