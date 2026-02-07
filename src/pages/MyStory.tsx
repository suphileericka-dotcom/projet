import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../style/myStory.css";

const TAGS = [
  "burnout",
  "solitude",
  "rupture",
  "expatriation",
  "changement",
] as const;

type Tag = (typeof TAGS)[number];

type Draft = {
  id: string;
  title: string;
  body: string;
  tags: Tag[];
};

const API = "http://localhost:8000/api/Mystory";

export default function MyStory() {
  const navigate = useNavigate();
  const token = localStorage.getItem("authToken");

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [showDrafts, setShowDrafts] = useState(false);

  /* =====================
     TAGS
  ===================== */

  function toggleTag(tag: Tag) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  /* =====================
     DRAFT MODAL
  ===================== */

  async function openDrafts() {
    if (!token) return;

    const res = await fetch(`${API}/drafts`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      setDrafts(await res.json());
      setShowDrafts(true);
    }
  }

  function selectDraft(draft: Draft) {
    setCurrentDraftId(draft.id);
    setTitle(draft.title);
    setBody(draft.body);
    setSelectedTags(draft.tags);
    setShowDrafts(false);
  }

  async function deleteDraft(id: string) {
    if (!token) return;
    if (!confirm("Supprimer ce brouillon ?")) return;

    await fetch(`${API}/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    setDrafts((d) => d.filter((x) => x.id !== id));

    if (currentDraftId === id) {
      clearEditor();
    }
  }

  /* =====================
     SAVE
  ===================== */

  async function saveDraft() {
    if (!token) return;

    if (body.trim().length < 30) {
      alert("Écris encore un peu.");
      return;
    }

    const res = await fetch(API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        id: currentDraftId,
        title,
        body,
        tags: selectedTags,
      }),
    });

    if (!res.ok) {
      alert("Erreur lors de l’enregistrement");
      return;
    }

    clearEditor();
    alert("Brouillon enregistré");
  }

  function clearEditor() {
    setCurrentDraftId(null);
    setTitle("");
    setBody("");
    setSelectedTags([]);
  }

  /* =====================
     PUBLISH
  ===================== */

  async function publish() {
    if (!token || !currentDraftId) {
      alert("Sélectionne ou enregistre un brouillon d’abord.");
      return;
    }

    const res = await fetch(`${API}/${currentDraftId}/publish`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      alert("Erreur lors de la publication");
      return;
    }

    navigate("/story");
  }

  /* =====================
     RENDER
  ===================== */

  return (
    <div className="story-editor-page">
      <button className="back-btn" onClick={() => navigate("/")}>←</button>

      <div className="editor-card">
        <header className="editor-header">
          <h1>Mon histoire</h1>
          <button className="drafts-btn" onClick={openDrafts}>
            Mes brouillons
          </button>
        </header>

        <input
          className="title-input"
          placeholder="Titre (optionnel)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <textarea
          className="body-textarea"
          placeholder="Écris ton histoire…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />

        <div className="tags">
          {TAGS.map((tag) => (
            <button
              key={tag}
              className={`tag ${selectedTags.includes(tag) ? "on" : ""}`}
              onClick={() => toggleTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>

        <div className="actions">
          <button className="btn ghost" onClick={saveDraft}>
            Enregistrer
          </button>
          <button className="btn primary" onClick={publish}>
            Publier
          </button>
        </div>
      </div>

      {/* MODAL BROUILLONS */}
      {showDrafts && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Mes brouillons</h3>

            {drafts.length === 0 && <p>Aucun brouillon</p>}

            {drafts.map((d) => (
              <div key={d.id} className="draft-row">
                <button
                  className="draft-title"
                  onClick={() => selectDraft(d)}
                >
                  {d.title || "Sans titre"}
                </button>

                <button
                  className="draft-delete"
                  onClick={() => deleteDraft(d.id)}
                >
                  Supprimer
                </button>
              </div>
            ))}

            <button className="close" onClick={() => setShowDrafts(false)}>
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
