import "./index.css";
import "./style/app.css";

import { Routes, Route, useNavigate, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { API } from "./config/api";
import {
  buildCountryAccessError,
  clearStoredCountry,
  COUNTRY_STORAGE_KEY,
  isAllowedCountry,
  persistCountry,
  storeCountryAccessError,
} from "./config/countryAccess";

// ✅ On garde uniquement ton hook custom
import { useLang } from "./hooks/useLang";

/* =====================
   PAGES
===================== */
import Login from "./pages/Login";
import Register from "./pages/Register";
import Info from "./pages/Info";

/* =====================
   CHATS
===================== */
import Burnout from "./components/Burnout";
import Rupture from "./components/Rupture";
import Solitude from "./components/Solitude";
import Expatriation from "./components/Expatriation";
import Changement from "./components/Changement";

/* =====================
   ESPACES
===================== */
import MyStory from "./pages/MyStory";
import MySpace from "./pages/MySpace";
import Stories from "./pages/Stories";
import Match from "./pages/Match";
import PrivateChat from "./pages/Privatechat";
import Journal from "./pages/Journal";

/* =====================
   AUTH UTILS
===================== */
function isValidAuthToken(): boolean {
  const token = localStorage.getItem("authToken");
  if (!token) return false;
  if (token === "undefined" || token === "null") return false;
  return true;
}

export default function App() {
  const navigate = useNavigate();

  // ✅ Ton système custom
  const { t, lang } = useLang();

  // Langue actuelle (utile si API/IA en a besoin)
  const targetLang = lang;

  const [isAuth, setIsAuth] = useState<boolean>(isValidAuthToken);
  const [accessCheckPending, setAccessCheckPending] = useState<boolean>(isValidAuthToken);

  useEffect(() => {
    let isCancelled = false;

    async function resolveProfileCountry(token: string) {
      try {
        const res = await fetch(`${API}/user/me/space`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) return null;

        const data = await res.json();
        return data?.profile?.country ?? data?.country ?? null;
      } catch {
        return null;
      }
    }

    function denyCountryAccess(country?: string | null) {
      storeCountryAccessError(buildCountryAccessError(country));
      localStorage.removeItem("authToken");
      localStorage.removeItem("userId");
      localStorage.removeItem("username");
      localStorage.removeItem("avatar");
      clearStoredCountry();
      if (!isCancelled) {
        setIsAuth(false);
        setAccessCheckPending(false);
        navigate("/login", { replace: true });
      }
    }

    async function verifyCountryAccess() {
      if (!isAuth) {
        setAccessCheckPending(false);
        return;
      }

      setAccessCheckPending(true);

      const storedCountry = localStorage.getItem(COUNTRY_STORAGE_KEY);
      if (storedCountry) {
        if (isAllowedCountry(storedCountry)) {
          persistCountry(storedCountry);
          if (!isCancelled) {
            setAccessCheckPending(false);
          }
          return;
        }

        denyCountryAccess(storedCountry);
        return;
      }

      const token = localStorage.getItem("authToken");
      if (!token) {
        if (!isCancelled) {
          setAccessCheckPending(false);
        }
        return;
      }

      const profileCountry = await resolveProfileCountry(token);
      if (isCancelled) return;

      if (profileCountry && !isAllowedCountry(profileCountry)) {
        denyCountryAccess(profileCountry);
        return;
      }

      persistCountry(profileCountry);
      setAccessCheckPending(false);
    }

    verifyCountryAccess();

    return () => {
      isCancelled = true;
    };
  }, [isAuth, navigate]);

  function logout() {
    localStorage.clear();
    setIsAuth(false);
    navigate("/");
  }

  const canAccessPrivateSpaces = isAuth && !accessCheckPending;
  const privateRouteFallback =
    isAuth && accessCheckPending ? (
      <div className="app-container">Verification du pays...</div>
    ) : (
      <Navigate to="/login" />
    );

  const homeElement = (
    <div className="app-container">
        <header className="app-header">
          <h1>{t("welcome")}</h1>

          <div className="header-actions">
            <button onClick={() => navigate("/info")}>ℹ️</button>

            {!isAuth && (
              <>
                <button onClick={() => navigate("/login")}>
                  {t("login")}
                </button>
                <button onClick={() => navigate("/register")}>
                  {t("register")}
                </button>
              </>
            )}

            {isAuth && (
              <button onClick={logout}>
                {t("logout")}
              </button>
            )}
          </div>
        </header>

        {/* ESPACES COMMUNS */}
        <section className="spaces-grid">
          <ChatCard
            title={t("stories")}
            description={t("storiesDesc")}
            variant="stories"
            onClick={() => navigate("/stories")}
          />

          <ChatCard
            title={t("burnoutTitle")}
            description={t("burnoutDesc")}
            variant="burnout"
            onClick={() => navigate("/chat/burnout")}
          />

          <ChatCard
            title={t("solitudeTitle")}
            description={t("solitudeDesc")}
            variant="solitude"
            onClick={() => navigate("/chat/solitude")}
          />

          <ChatCard
            title={t("ruptureTitle")}
            description={t("ruptureDesc")}
            variant="rupture"
            onClick={() => navigate("/chat/rupture")}
          />

          <ChatCard
            title={t("expatriationTitle")}
            description={t("expatriationDesc")}
            variant="expatriation"
            onClick={() => navigate("/chat/expatriation")}
          />

          <ChatCard
            title={t("changementTitle")}
            description={t("changementDesc")}
            variant="changement"
            onClick={() => navigate("/chat/changement")}
          />
        </section>

        {/* ESPACES PRIVÉS */}
        {canAccessPrivateSpaces && (
          <section className="spaces-grid">
            <ChatCard
              title={t("myStory")}
              description={t("myStoryDesc")}
              variant="story"
              onClick={() => navigate("/story")}
            />

            <ChatCard
              title={t("mySpace")}
              description={t("mySpaceDesc")}
              variant="personal"
              onClick={() => navigate("/my-space")}
            />

            <ChatCard
              title={t("connections")}
              description={t("connectionsDesc")}
              variant="match"
              onClick={() => navigate("/match")}
            />

            <ChatCard
              title={t("journal")}
              description={t("journalDesc")}
              variant="ai"
              onClick={() => navigate("/journal")}
            />
          </section>
        )}

        {/* Debug invisible */}
        <span style={{ display: "none" }}>{targetLang}</span>
    </div>
  );

  return (
    <Routes>
      <Route path="/" element={homeElement} />

      {/* PUBLIC */}
      <Route path="/login" element={<Login setIsAuth={setIsAuth} />} />
      <Route path="/register" element={<Register setIsAuth={setIsAuth} />} />
      <Route path="/info" element={<Info />} />
      <Route path="/stories" element={<Stories />} />

      {/* PRIVÉ */}
      <Route
        path="/story"
        element={canAccessPrivateSpaces ? <MyStory /> : privateRouteFallback}
      />
      <Route
        path="/my-space"
        element={canAccessPrivateSpaces ? <MySpace /> : privateRouteFallback}
      />
      <Route
        path="/match"
        element={canAccessPrivateSpaces ? <Match /> : privateRouteFallback}
      />
      <Route
        path="/private-chat"
        element={canAccessPrivateSpaces ? <PrivateChat /> : privateRouteFallback}
      />
      <Route
        path="/journal"
        element={canAccessPrivateSpaces ? <Journal /> : privateRouteFallback}
      />

      {/* CHATS */}
      <Route path="/chat/burnout" element={<Burnout isAuth={isAuth} />} />
      <Route path="/chat/solitude" element={<Solitude isAuth={isAuth} />} />
      <Route
        path="/chat/expatriation"
        element={<Expatriation isAuth={isAuth} />}
      />
      <Route path="/chat/rupture" element={<Rupture isAuth={isAuth} />} />
      <Route
        path="/chat/changement"
        element={<Changement isAuth={isAuth} />}
      />
    </Routes>
  );
}

function ChatCard({
  title,
  description,
  variant,
  onClick,
}: {
  title: string;
  description: string;
  variant: string;
  onClick: () => void;
}) {
  return (
    <div className={`space-card space-${variant}`} onClick={onClick}>
      <h4>{title}</h4>
      <p>{description}</p>
    </div>
  );
}
