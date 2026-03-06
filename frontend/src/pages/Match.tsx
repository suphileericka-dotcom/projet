import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../style/match.css";

/* =====================
   API BASE (SAFE)
===================== */
const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

/* =====================
   TYPES
===================== */
type MatchProfile = {
  id: string;
  summary: string;
  common_tags: string[];
  avatar?: string;
};

/* =====================
   COMPONENT
===================== */
export default function Match() {
  const navigate = useNavigate();
  const token = localStorage.getItem("authToken");

  const [matches, setMatches] = useState<MatchProfile[]>([]);
  const [payTarget, setPayTarget] = useState<MatchProfile | null>(null);
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  /* =====================
     LOAD MATCHES
  ===================== */
  useEffect(() => {
    if (!token) return;

    async function fetchMatches() {
      try {
        const res = await fetch(`${API}/api/match`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) throw new Error();

        const data = await res.json();
        setMatches(data);
      } catch {
        setMatches([]);
      }
    }

    fetchMatches();
  }, [token]);

  /* =====================
     OPEN PRIVATE CHAT
  ===================== */
  async function openPrivateChat(profile: MatchProfile) {
    if (!token) return;

    try {
      const accessRes = await fetch(
        `${API}/api/dm/access/${profile.id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!accessRes.ok) throw new Error();

      const access = await accessRes.json();

      if (access.allowed) {
        const threadRes = await fetch(`${API}/api/dm/threads`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ targetUserId: profile.id }),
        });

        if (!threadRes.ok) throw new Error();

        const { id } = await threadRes.json();
        navigate(`/private-chat?thread=${id}`);
        return;
      }

      setPayTarget(profile);
      setPayError(null);
    } catch {
      alert("Erreur d’accès DM");
    }
  }

  /* =====================
     STRIPE PAYMENT
  ===================== */
  async function payWithStripe() {
    if (!token || !payTarget) return;

    setPayLoading(true);
    setPayError(null);

    try {
      const res = await fetch(`${API}/api/payments/dm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ targetUserId: payTarget.id }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error);

      if (data.alreadyPaid) {
        const threadRes = await fetch(`${API}/api/dm/threads`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ targetUserId: payTarget.id }),
        });

        const { id } = await threadRes.json();
        navigate(`/private-chat?thread=${id}`);
        return;
      }

      window.location.href = data.url;
    } catch (e: any) {
      setPayError(e?.message || "Erreur paiement");
    } finally {
      setPayLoading(false);
    }
  }

  /* =====================
     RENDER
  ===================== */
  return (
    <div className="match-root">
      <header className="match-header">
        <button className="back-home" onClick={() => navigate("/")}>
          ←
        </button>
        <h1>Connexions humaines</h1>
        <p>Des personnes proches de ton vécu</p>
      </header>

      <main className="match-list">
        {matches.length === 0 && (
          <p className="empty">
            Aucun profil similaire pour l’instant.
          </p>
        )}

        {matches.map((m) => (
          <div key={m.id} className="match-card">
            <img
              src={m.avatar || "/avatar.png"}
              className="avatar-lg"
            />
            <p className="summary">“{m.summary}”</p>

            <div className="tags">
              {m.common_tags.map((t) => (
                <span key={t} className="tag">
                  #{t}
                </span>
              ))}
            </div>

            <div className="actions">
              <button onClick={() => openPrivateChat(m)}>
                💬 Message privé
              </button>

              <button
                className="ghost"
                onClick={() =>
                  navigate(`/chat/${m.common_tags[0]}`)
                }
              >
                Discussion liée
              </button>
            </div>
          </div>
        ))}
      </main>

      {/* PAYMENT MODAL */}
      {payTarget && (
        <div
          className="modal-backdrop"
          onClick={() => setPayTarget(null)}
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Débloquer message privé</h3>
            <p>
              Pour contacter cette personne en privé,
              il faut débloquer l’accès (4,99€).
              <br />
              Paiement sécurisé.
            </p>

            {payError && (
              <div className="pay-error">{payError}</div>
            )}

            <div className="pay-options">
              <button
                onClick={payWithStripe}
                disabled={payLoading}
              >
                {payLoading
                  ? "Redirection..."
                  : "Carte / Apple Pay (Stripe)"}
              </button>

              <button className="disabled" disabled>
                PayPal (bientôt)
              </button>
            </div>

            <button
              className="ghost"
              onClick={() => setPayTarget(null)}
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
