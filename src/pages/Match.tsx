import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../style/match.css";

type MatchProfile = {
  id: string;
  summary: string;
  common_tags: string[];
  avatar?: string;
};

export default function Match() {
  const navigate = useNavigate();
  const token = localStorage.getItem("authToken");

  const [matches, setMatches] = useState<MatchProfile[]>([]);
  const [payTarget, setPayTarget] = useState<MatchProfile | null>(null);
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  useEffect(() => {
    fetch("http://localhost:8000/api/match", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then(setMatches)
      .catch(() => setMatches([]));
  }, []);

  async function openPrivateChat(profile: MatchProfile) {
    if (!token) return;

    // 1) check access backend
    const accessRes = await fetch(`http://localhost:8000/api/dm/access/${profile.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!accessRes.ok) {
      alert("Erreur d’accès DM");
      return;
    }

    const access = await accessRes.json();

    if (access.allowed) {
      // create/get thread then go
      const threadRes = await fetch("http://localhost:8000/api/dm/threads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ targetUserId: profile.id }),
      });

      if (!threadRes.ok) {
        alert("Impossible d’ouvrir la conversation");
        return;
      }

      const { id } = await threadRes.json();
      navigate(`/private-chat?thread=${id}`);
      return;
    }

    // not allowed => payment modal
    setPayTarget(profile);
    setPayError(null);
  }

  async function payWithStripe() {
    if (!token || !payTarget) return;
    setPayLoading(true);
    setPayError(null);

    try {
      const res = await fetch("http://localhost:8000/api/payments/dm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ targetUserId: payTarget.id }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "paiement impossible");

      if (data.alreadyPaid) {
        // déjà payé => ouvrir thread
        const threadRes = await fetch("http://localhost:8000/api/dm/threads", {
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

      // redirect Stripe Checkout
      window.location.href = data.url;
    } catch (e: any) {
      setPayError(e.message || "Erreur paiement");
    } finally {
      setPayLoading(false);
    }
  }

  return (
    <div className="match-root">
      <header className="match-header">
        <button className="back-home" onClick={() => navigate("/")}>←</button>
        <h1>Connexions humaines</h1>
        <p>Des personnes proches de ton vécu</p>
      </header>

      <main className="match-list">
        {matches.length === 0 && (
          <p className="empty">Aucun profil similaire pour l’instant.</p>
        )}

        {matches.map((m) => (
          <div key={m.id} className="match-card">
            <img src={m.avatar || "/avatar.png"} className="avatar-lg" />
            <p className="summary">“{m.summary}”</p>

            <div className="tags">
              {m.common_tags.map((t) => (
                <span key={t} className="tag">#{t}</span>
              ))}
            </div>

            <div className="actions">
              <button onClick={() => openPrivateChat(m)}>💬 Message privé</button>
              <button className="ghost" onClick={() => navigate(`/chat/${m.common_tags[0]}`)}>
                Discussion liée
              </button>
            </div>
          </div>
        ))}
      </main>

      {/* MODAL PAIEMENT */}
      {payTarget && (
        <div className="modal-backdrop" onClick={() => setPayTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Débloquer message privé</h3>
            <p>
              Pour contacter cette personne en privé, il faut débloquer l’accès (4,99€).
              <br />
              Paiement sécurisé.
            </p>

            {payError && <div className="pay-error">{payError}</div>}

            <div className="pay-options">
              <button onClick={payWithStripe} disabled={payLoading}>
                {payLoading ? "Redirection..." : "Carte / Apple Pay (Stripe)"}
              </button>
              <button className="disabled" disabled>
                PayPal (bientôt)
              </button>
            </div>

            <button className="ghost" onClick={() => setPayTarget(null)}>
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
