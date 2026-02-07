import "./index.css";
import "./style/app.css";

import { Routes, Route, useNavigate, Navigate } from "react-router-dom";
import { useState } from "react";

// i18n
import { useLang } from "./hooks/useLang";
import { useTranslation } from "react-i18next";

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
  const { t } = useLang();
  const { i18n } = useTranslation();

  // langue cible utilisée par l'app (API, IA, etc.)
  const targetLang: string = i18n.resolvedLanguage ?? "fr";

  //  AUTH 
  const [isAuth, setIsAuth] = useState<boolean>(isValidAuthToken);

  function logout() {
    localStorage.clear();
    setIsAuth(false);
    navigate("/");
  }

  function Home() {
    return (
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
              <button onClick={logout}>{t("logout")}</button>
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
        {isAuth && (
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

           
          </section>
        )}

        {/* debug invisible */}
        <span style={{ display: "none" }}>{targetLang}</span>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Home />} />

      {/* PUBLIC */}
      <Route path="/login" element={<Login setIsAuth={setIsAuth} />} />
      <Route path="/register" element={<Register setIsAuth={setIsAuth} />} />
      <Route path="/info" element={<Info />} />
      <Route path="/stories" element={<Stories />} />

      {/* PRIVÉ */}
      <Route
        path="/story"
        element={isAuth ? <MyStory /> : <Navigate to="/login" />}
      />
      <Route
        path="/my-space"
        element={isAuth ? <MySpace /> : <Navigate to="/login" />}
      />
      <Route
        path="/match"
        element={isAuth ? <Match /> : <Navigate to="/login" />}
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
