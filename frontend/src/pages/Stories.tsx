import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import "../style/stories.css";
import { API } from "../config/api";

/* =====================
   TYPES
===================== */

type Story = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  user_id: string;
  author_avatar?: string;
  likes: number;
};

/* =====================
   COMPONENT
===================== */

export default function Stories() {
  const navigate = useNavigate();
  const token = localStorage.getItem("authToken");
  const myUserId = localStorage.getItem("userId");

  const [stories, setStories] = useState<Story[]>([]);
  const [activeStory, setActiveStory] = useState<Story | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");

  /* =====================
     LOAD STORIES
  ===================== */

  useEffect(() => {
    async function fetchStories() {
      try {
        const params = new URLSearchParams();

        if (search) params.append("q", search);
        if (tagFilter) params.append("tag", tagFilter);

        const res = await fetch(`${API}/stories?${params}`);

        if (!res.ok) {
          throw new Error("Erreur fetch stories");
        }

        const data = await res.json();
        setStories(data);

      } catch (err) {
        console.error("Erreur stories:", err);
      }
    }

    fetchStories();
  }, [search, tagFilter]);

  /* =====================
     LIKE
  ===================== */

  async function likeStory(id: string) {
    if (!token) return;

    try {
      await fetch(`${API}/stories/${id}/like`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      // 🔥 refresh local state
      setStories((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, likes: s.likes + 1 } : s
        )
      );

    } catch (err) {
      console.error("Erreur like:", err);
    }
  }

  async function deleteStory(id: string) {
    if (!token) return;
    if (!confirm("Supprimer cette histoire publiée ?")) return;

    try {
      const res = await fetch(`${API}/stories/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        alert("Erreur lors de la suppression");
        return;
      }

      setStories((prev) => prev.filter((s) => s.id !== id));
      setActiveStory((prev) => (prev?.id === id ? null : prev));
    } catch (err) {
      console.error("Erreur suppression story:", err);
      alert("Erreur lors de la suppression");
    }
  }

  function submitSearch(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setSearch(searchInput.trim());
  }

  /* =====================
     RENDER
   ===================== */

  return (
    <div className="page stories-page">

      <button
        className="back-button-global"
        onClick={() => navigate("/")}
      >
        ←
      </button>

      <header className="page-header">
        <h1>Histoires</h1>
        <p>Des récits anonymes</p>
      </header>

      {/* SEARCH */}
      <div className="search-bar">
        <form className="search-form" onSubmit={submitSearch}>
          <div className="search-field">
            <span className="search-icon" aria-hidden="true">
              🔎
            </span>
            <input
              placeholder="Rechercher par titre ou hashtag"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>

          <button type="submit" className="search-submit">
            Lancer la recherche
          </button>
        </form>
      </div>

      {/* TAG FILTER */}
      <div className="filters">
        {["burnout", "solitude", "rupture", "expatriation", "changement"].map((t) => (
          <button
            key={t}
            className={tagFilter === t ? "active" : ""}
            onClick={() =>
              setTagFilter(tagFilter === t ? "" : t)
            }
          >
            #{t}
          </button>
        ))}
      </div>

      <div className="layout">

        {/* LIST */}
        <div className="list">
          {stories.map((s) => (
            <div
              key={s.id}
              className={`story-tile ${
                s.user_id === myUserId ? "mine" : ""
              }`}
              onClick={() => setActiveStory(s)}
            >
              <div className="tile-head">
                <img
                  src={s.author_avatar || "/avatar.png"}
                  className="avatar"
                />
                <strong>{s.title}</strong>
              </div>

              <div className="tile-tags">
                {s.tags.map((t) => `#${t}`).join(" ")}
              </div>
            </div>
          ))}
        </div>

        {/* READER */}
        <div className="reader">
          {!activeStory ? (
            <p>Sélectionne une histoire.</p>
          ) : (
            <>
              <h2>{activeStory.title}</h2>
              <p>{activeStory.body}</p>

              <div className="reader-actions">
                <button
                  onClick={() => likeStory(activeStory.id)}
                >
                  🤍 Soutenir ({activeStory.likes})
                </button>

                <button
                  className="ghost"
                  onClick={() =>
                    navigate(`/chat/${activeStory.tags[0]}`)
                  }
                >
                  Discussion liée
                </button>

                {activeStory.user_id === myUserId && (
                  <button
                    className="danger"
                    onClick={() => deleteStory(activeStory.id)}
                  >
                    Supprimer
                  </button>
                )}

              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
