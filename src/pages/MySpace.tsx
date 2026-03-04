import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../style/mySpace.css";

const API =
  import.meta.env.VITE_API_URL
    ? `${import.meta.env.VITE_API_URL}/api`
    : "http://localhost:8000/api";

type Story = {
  id: string;
  title: string;
  body: string;
  tags: string[];
};

type Me = {
  id: string;
  username: string | null;
  email: string | null;
  avatar: string | null;
  dark_mode: boolean;
  created_at: number | null;
};

export default function MySpace() {
  const navigate = useNavigate();
  const token = localStorage.getItem("authToken");

  const [me, setMe] = useState<Me | null>(null);
  const [myStory, setMyStory] = useState<Story | null>(null);
  const [loading, setLoading] = useState(true);

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const [pwOpen, setPwOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const [meRes, storyRes] = await Promise.all([
          fetch(`${API}/user/me`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API}/mystory/me`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (meRes.ok) {
          const data: Me = await meRes.json();
          setMe(data);
          setUsername(data.username ?? "");
          setEmail(data.email ?? "");

          if (data.avatar) {
            const base = API.replace("/api", "");
            setAvatarPreview(`${base}/uploads/${data.avatar}`);
          }
        }

        if (storyRes.ok) {
          setMyStory(await storyRes.json());
        }
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [token]);

  const createdLabel = useMemo(() => {
    if (!me?.created_at) return "—";
    return new Date(me.created_at).toLocaleDateString();
  }, [me]);

  if (loading) {
    return <div className="page myspace-page">Chargement…</div>;
  }

  async function saveProfile() {
    if (!token) return;

    setSavingProfile(true);

    try {
      const formData = new FormData();
      formData.append("username", username);
      formData.append("email", email);

      if (avatarFile) {
        formData.append("avatar", avatarFile);
      }

      const res = await fetch(`${API}/user/me`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data?.error || "Erreur sauvegarde profil");
        return;
      }

      setMe(data);
      alert("Profil mis à jour ");
    } finally {
      setSavingProfile(false);
    }
  }

  async function submitPassword() {
    if (!token) return;

    if (!oldPassword || !newPassword) {
      setPwError("Remplis les 2 champs.");
      return;
    }

    setPwSaving(true);
    setPwError(null);

    try {
      const res = await fetch(`${API}/user/me/password`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ oldPassword, newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setPwError(data?.error || "Erreur mot de passe");
        return;
      }

      setPwOpen(false);
      setOldPassword("");
      setNewPassword("");
      alert("Mot de passe modifié ");
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <div className="page myspace-page">
      <button className="back-button-global" onClick={() => navigate("/")}>
        ←
      </button>

      <header className="page-header">
        <h1>Mon espace</h1>
        <p>Profil personnel.</p>
      </header>

      <section className="block">
        <div className="block-head">
          <h2>Profil</h2>
          <button
            className="btn ghost"
            onClick={saveProfile}
            disabled={savingProfile}
          >
            {savingProfile ? "Sauvegarde..." : "Sauvegarder"}
          </button>
        </div>

        <div className="muted small">
          Inscrit le : {createdLabel}
        </div>

        <div className="avatar-section">
          <label className="avatar-upload">
            <img
              src={
                avatarPreview ||
                `https://ui-avatars.com/api/?name=${username || "U"}`
              }
              className="avatar-xl"
            />
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setAvatarFile(file);
                setAvatarPreview(URL.createObjectURL(file));
              }}
            />
            <span>Changer la photo</span>
          </label>
        </div>

        <div className="field">
          <label>Nom d’utilisateur</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        <div className="field">
          <label>Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <button className="btn primary" onClick={() => setPwOpen(true)}>
          Modifier le mot de passe
        </button>
      </section>

      <section className="block">
        <h2>Ton vécu</h2>
        {!myStory ? (
          <button
            className="btn primary"
            onClick={() => navigate("/story")}
          >
            Écrire mon histoire
          </button>
        ) : (
          <>
            <h3>{myStory.title}</h3>
            <p>{myStory.body}</p>
          </>
        )}
      </section>

      {pwOpen && (
        <div className="modal-backdrop" onClick={() => setPwOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Modifier le mot de passe</h3>

            {pwError && <div className="pay-error">{pwError}</div>}

            <input
              className="modern-input"
              type="password"
              placeholder="Ancien mot de passe"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
            />

            <input
              className="modern-input"
              type="password"
              placeholder="Nouveau mot de passe"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />

            <div className="modal-actions">
              <button
                className="btn primary"
                onClick={submitPassword}
                disabled={pwSaving}
              >
                {pwSaving ? "..." : "Sauvegarder"}
              </button>

              <button
                className="btn ghost"
                onClick={() => setPwOpen(false)}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}