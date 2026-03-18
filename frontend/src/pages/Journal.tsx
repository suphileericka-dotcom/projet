import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../style/journal.css";
import { API } from "../config/api";

type JournalEntry = {
  id: string;
  body?: string | null;
  mood?: string | null;
  insight?: string | null;
  created_at?: number | string | null;
};

function formatDateTime(value?: number | string | null) {
  if (!value) return "—";

  const date =
    typeof value === "number" ? new Date(value) : new Date(String(value));

  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

export default function Journal() {
  const navigate = useNavigate();
  const token = localStorage.getItem("authToken");

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [body, setBody] = useState("");
  const [mood, setMood] = useState("calme");
  const [insight, setInsight] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [insightLoading, setInsightLoading] = useState(false);

  async function loadEntries() {
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API}/journal`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        setEntries([]);
        return;
      }

      const data = await res.json();
      setEntries(Array.isArray(data) ? data : data.items ?? []);
    } catch (err) {
      console.error("Erreur journal:", err);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEntries();
  }, [token]);

  async function saveEntry() {
    if (!token) return;
    if (!body.trim()) {
      alert("Écris quelque chose avant d’enregistrer.");
      return;
    }

    setSaving(true);

    try {
      const res = await fetch(`${API}/journal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ body, mood }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        alert(data?.error || "Impossible d’enregistrer l’entrée");
        return;
      }

      setBody("");
      setInsight("");
      await loadEntries();
    } finally {
      setSaving(false);
    }
  }

  async function generateInsight() {
    if (!token) return;

    const sourceText = body.trim() || entries[0]?.body?.trim() || "";
    if (!sourceText) {
      alert("Ajoute du contenu au journal pour générer un insight.");
      return;
    }

    setInsightLoading(true);

    try {
      const res = await fetch(`${API}/journal/insight`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ body: sourceText }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        alert(data?.error || "Impossible de générer l’insight");
        return;
      }

      setInsight(data?.insight || data?.message || "");
    } finally {
      setInsightLoading(false);
    }
  }

  return (
    <div className="journal-page">
      <button className="journal-back" onClick={() => navigate("/")}>
        ←
      </button>

      <header className="journal-hero">
        <h1>Journal guidé</h1>
        <p>Écris, garde une trace, et demande un éclairage ponctuel à l’IA.</p>
      </header>

      <div className="journal-layout">
        <section className="journal-editor">
          <div className="editor-top">
            <h2>Nouvelle entrée</h2>
            <select value={mood} onChange={(e) => setMood(e.target.value)}>
              <option value="calme">Calme</option>
              <option value="fatigue">Fatigue</option>
              <option value="stress">Stress</option>
              <option value="tristesse">Tristesse</option>
              <option value="espoir">Espoir</option>
            </select>
          </div>

          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Dépose ici ce que tu traverses aujourd’hui…"
          />

          <div className="journal-actions">
            <button className="primary" onClick={saveEntry} disabled={saving}>
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
            <button
              className="ghost"
              onClick={generateInsight}
              disabled={insightLoading}
            >
              {insightLoading ? "Analyse..." : "Insight IA"}
            </button>
          </div>

          {insight && (
            <div className="journal-insight">
              <strong>Insight</strong>
              <p>{insight}</p>
            </div>
          )}
        </section>

        <section className="journal-feed">
          <div className="editor-top">
            <h2>Entrées récentes</h2>
            <span>{entries.length}</span>
          </div>

          {loading && <p className="journal-empty">Chargement…</p>}
          {!loading && entries.length === 0 && (
            <p className="journal-empty">Aucune entrée pour l’instant.</p>
          )}

          {entries.map((entry) => (
            <article key={entry.id} className="journal-card">
              <div className="journal-card-top">
                <strong>{entry.mood || "Entrée"}</strong>
                <small>{formatDateTime(entry.created_at)}</small>
              </div>
              <p>{entry.body || "Sans contenu"}</p>
              {entry.insight && <div className="journal-chip">{entry.insight}</div>}
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
