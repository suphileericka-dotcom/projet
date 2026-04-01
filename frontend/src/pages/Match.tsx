import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../style/match.css";
import { API } from "../config/api";
import { buildAvatarUrl } from "../lib/avatar";

type MatchProfile = {
  id: string;
  summary: string;
  common_tags: string[];
  avatar?: string;
  username?: string;
};

type MatchResponse = {
  match_date?: string;
  generated?: boolean;
  items?: MatchProfile[];
};

export default function Match() {
  const navigate = useNavigate();
  const token = localStorage.getItem("authToken");

  const [matches, setMatches] = useState<MatchProfile[]>([]);
  const [matchDate, setMatchDate] = useState<string | null>(null);
  const [generated, setGenerated] = useState<boolean | null>(null);
  const [payTarget, setPayTarget] = useState<MatchProfile | null>(null);
  const [payLoading, setPayLoading] = useState(false);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    async function fetchMatches() {
      try {
        const res = await fetch(`${API}/match`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) throw new Error();

        const data: MatchResponse | MatchProfile[] = await res.json();

        if (Array.isArray(data)) {
          setMatches(data);
          setMatchDate(null);
          setGenerated(null);
          return;
        }

        setMatches(data.items ?? []);
        setMatchDate(data.match_date ?? null);
        setGenerated(typeof data.generated === "boolean" ? data.generated : null);
      } catch {
        setMatches([]);
        setMatchDate(null);
        setGenerated(null);
      }
    }

    fetchMatches();
  }, [token]);

  async function openPrivateChat(profile: MatchProfile) {
    if (!token) return;

    try {
      const accessRes = await fetch(`${API}/dm/access/${profile.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!accessRes.ok) throw new Error();

      const access = await accessRes.json();

      if (access.allowed) {
        const threadRes = await fetch(`${API}/dm/threads`, {
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

  async function payOnce() {
    if (!token || !payTarget) return;

    setPayLoading(true);
    setPayError(null);

    try {
      const res = await fetch(`${API}/payments/dm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ targetUserId: payTarget.id }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error);

      if (data.url) {
        window.location.href = data.url;
        return;
      }

      if (data.alreadyPaid) {
        await openPrivateChat(payTarget);
      }
    } catch (e: any) {
      setPayError(e?.message || "Erreur paiement");
    } finally {
      setPayLoading(false);
    }
  }

  async function subscribeDm() {
    if (!token) return;

    setSubscriptionLoading(true);
    setPayError(null);

    try {
      const res = await fetch(`${API}/payments/dm/subscription`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error);

      if (data.url) {
        window.location.href = data.url;
        return;
      }

      if (payTarget) {
        await openPrivateChat(payTarget);
      }
    } catch (e: any) {
      setPayError(e?.message || "Erreur abonnement");
    } finally {
      setSubscriptionLoading(false);
    }
  }

  return (
    <div className="match-root">
      <header className="match-header">
        <button className="back-home" onClick={() => navigate("/")}>
          ←
        </button>
        <h1>Connexions humaines</h1>
        <p>Des personnes proches de ton vécu</p>
        <div className="match-meta">
          <span>Date des suggestions : {matchDate || "—"}</span>
          <span>
            {generated === null
              ? "Statut inconnu"
              : generated
                ? "Généré aujourd’hui"
                : "Suggestions déjà prêtes"}
          </span>
        </div>
      </header>

      <main className="match-list">
        {matches.length === 0 && (
          <p className="empty">Aucun profil similaire pour l’instant.</p>
        )}

        {matches.map((m) => (
          <div key={m.id} className="match-card">
            <img
              src={buildAvatarUrl({
                name: m.username || "Membre",
                avatarPath: m.avatar,
                seed: m.id,
                size: 128,
              })}
              className="avatar-lg"
              alt={m.username || "Profil"}
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
              <button onClick={() => openPrivateChat(m)}>Message privé</button>

              <button
                className="ghost"
                onClick={() => navigate(`/chat/${m.common_tags[0]}`)}
              >
                Discussion liée
              </button>
            </div>
          </div>
        ))}
      </main>

      {payTarget && (
        <div className="modal-backdrop" onClick={() => setPayTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Accès privé requis</h3>
            <p>
              Tu peux débloquer ce DM pour 4,99 € ou prendre l’abonnement DM à
              9,75 €.
            </p>

            {payError && <div className="pay-error">{payError}</div>}

            <div className="pay-options">
              <button onClick={payOnce} disabled={payLoading}>
                {payLoading ? "Redirection..." : "Paiement unique 4,99 €"}
              </button>

              <button
                className="ghost"
                onClick={subscribeDm}
                disabled={subscriptionLoading}
              >
                {subscriptionLoading ? "Redirection..." : "Abonnement 9,75 €"}
              </button>
            </div>

            <button className="ghost subtle" onClick={() => setPayTarget(null)}>
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
