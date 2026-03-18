import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../style/myStory.css";
import { API } from "../config/api";

const TAGS = [
  "burnout",
  "solitude",
  "rupture",
  "expatriation",
  "changement",
] as const;

type Tag = (typeof TAGS)[number];

const TAG_LABELS: Record<Tag, string> = {
  burnout: "burnout",
  solitude: "solitude",
  rupture: "rupture",
  expatriation: "expatriation",
  changement: "changement de vie",
};

type Draft = {
  id: string;
  title: string;
  body: string;
  tags: Tag[];
};

const MYSTORY_API = `${API}/mystory`;

export default function MyStory() {
  const navigate = useNavigate();
  const token = localStorage.getItem("authToken");

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [showDrafts, setShowDrafts] = useState(false);

  function toggleTag(tag: Tag) {
    setSelectedTags((prev) =>
      prev.includes(tag)
        ? prev.filter((t) => t !== tag)
        : [...prev, tag]
    );
  }

  async function openDrafts() {
    if (!token) return;

    try {
      const headers = {
        Authorization: `Bearer ${token}`,
      };

      let res = await fetch(`${MYSTORY_API}/drafts`, { headers });

      if (res.status === 404) {
        console.warn("Fallback vers /me");
        res = await fetch(`${MYSTORY_API}/me`, { headers });
      }

      if (!res.ok) {
        throw new Error("Erreur fetch drafts");
      }

      const data = await res.json();
      setDrafts(data);
      setShowDrafts(true);
    } catch (err) {
      console.error("Erreur fetch drafts", err);
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

    await fetch(`${MYSTORY_API}/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    setDrafts((current) => current.filter((draft) => draft.id !== id));

    if (currentDraftId === id) {
      clearEditor();
    }
  }

  async function saveDraft() {
    if (!token) return;

    if (!title.trim()) {
      alert("Le titre est obligatoire");
      return;
    }

    if (selectedTags.length === 0) {
      alert("Ajoute au moins un tag");
      return;
    }

    if (body.trim().length < 30) {
      alert("Écris encore un peu.");
      return;
    }

    const res = await fetch(MYSTORY_API, {
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

  async function publish() {
    if (!token || !currentDraftId) {
      alert("Sélectionne ou enregistre un brouillon d’abord.");
      return;
    }

    if (!title.trim()) {
      alert("Le titre est obligatoire");
      return;
    }

    if (selectedTags.length === 0) {
      alert("Ajoute au moins un tag");
      return;
    }

    const res = await fetch(`${MYSTORY_API}/${currentDraftId}/publish`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      alert("Erreur lors de la publication");
      return;
    }

    navigate("/story");
  }

  return (
    <div className="story-editor-page">
      <button className="back-btn" onClick={() => navigate("/")}>
        ←
      </button>

      <div className="editor-card">
        <header className="editor-header">
          <div>
            <h1>Mon histoire</h1>
            <p className="editor-intro">
              Prépare ton brouillon ici, puis publie-le quand il est prêt.
            </p>
          </div>

          <button className="drafts-btn" onClick={openDrafts}>
            Mes brouillons
          </button>
        </header>

        <input
          className="title-input"
          placeholder="Titre (obligatoire)"
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
              className={`tag tag-${tag} ${
                selectedTags.includes(tag) ? "on" : ""
              }`}
              onClick={() => toggleTag(tag)}
            >
              {TAG_LABELS[tag]}
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

      {showDrafts && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Mes brouillons</h3>

            {drafts.length === 0 && <p>Aucun brouillon</p>}

            {drafts.map((draft) => (
              <div key={draft.id} className="draft-row">
                <button
                  className="draft-title"
                  onClick={() => selectDraft(draft)}
                >
                  {draft.title || "Sans titre"}
                </button>

                <button
                  className="draft-delete"
                  onClick={() => deleteDraft(draft.id)}
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
