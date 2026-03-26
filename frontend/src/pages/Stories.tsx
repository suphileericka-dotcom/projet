import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../style/stories.css";
import { API } from "../config/api";

type Story = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  user_id: string;
  author_avatar?: string;
  likes: number;
};

export default function Stories() {
  const navigate = useNavigate();
  const token = localStorage.getItem("authToken");
  const myUserId = localStorage.getItem("userId");

  const [stories, setStories] = useState<Story[]>([]);
  const [activeStory, setActiveStory] = useState<Story | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");

  const searchSuggestions = searchInput.trim()
    ? stories
        .filter((story) =>
          story.title.toLowerCase().includes(searchInput.trim().toLowerCase())
        )
        .slice(0, 5)
    : [];

  useEffect(() => {
    async function fetchStories() {
      try {
        const params = new URLSearchParams();
        if (search) params.append("q", search);
        if (tagFilter) params.append("tag", tagFilter);

        const res = await fetch(`${API}/stories?${params}`);
        if (!res.ok) throw new Error("Erreur fetch stories");
        const data = await res.json();
        setStories(data);
      } catch (err) {
        console.error("Erreur stories:", err);
      }
    }
    fetchStories();
  }, [search, tagFilter]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearch(searchInput.trim());
    }, 180);
    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  async function likeStory(id: string) {
    if (!token) return;
    try {
      await fetch(`${API}/stories/${id}/like`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStories((prev) =>
        prev.map((s) => (s.id === id ? { ...s, likes: s.likes + 1 } : s))
      );
      if (activeStory?.id === id) {
        setActiveStory({ ...activeStory, likes: activeStory.likes + 1 });
      }
    } catch (err) {
      console.error("Erreur like:", err);
    }
  }

  async function deleteStory(id: string) {
    if (!token || !confirm("Supprimer cette histoire ?")) return;
    try {
      const res = await fetch(`${API}/stories/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      setStories((prev) => prev.filter((s) => s.id !== id));
      setActiveStory(null);
    } catch (err) {
      console.error("Erreur suppression:", err);
    }
  }

  const clearSearch = () => {
    setSearchInput("");
    setSearch("");
  };

  const chooseSuggestion = (story: Story) => {
    setSearchInput(story.title);
    setSearch(story.title);
    setActiveStory(story);
  };

  return (
    <div className="page stories-page">
      <button className="back-button-global" onClick={() => navigate("/")}>
        ←
      </button>

      <header className="page-header">
        <h1>Histoires</h1>
        <p>Découvrez les récits de la communauté</p>
      </header>

      <div className="search-container">
        <div className="search-bar">
          <div className="search-field">
            <span className="search-icon">🔎</span>
            <input
              placeholder={!activeStory ? "Sélectionnez une histoire ou recherchez..." : "Rechercher une autre histoire..."}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            {searchInput && (
              <button className="search-clear" onClick={clearSearch}>×</button>
            )}
          </div>

          {searchSuggestions.length > 0 && (
            <div className="search-suggestions">
              {searchSuggestions.map((story) => (
                <button key={story.id} className="search-suggestion" onClick={() => chooseSuggestion(story)}>
                  <span>{story.title}</span>
                  <small>#{story.tags[0]}</small>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="filters">
          {["burnout", "solitude", "rupture", "expatriation", "changement"].map((t) => (
            <button
              key={t}
              className={tagFilter === t ? "active" : ""}
              onClick={() => setTagFilter(tagFilter === t ? "" : t)}
            >
              #{t}
            </button>
          ))}
        </div>
      </div>

      <div className="layout">
        <div className="list">
          {stories.map((s) => (
            <div
              key={s.id}
              className={`story-card ${activeStory?.id === s.id ? "active-card" : ""}`}
              onClick={() => setActiveStory(s)}
            >
              <div className="card-content">
                <img src={s.author_avatar || "/avatar.png"} className="avatar-small" alt="" />
                <div className="card-text">
                  <strong>{s.title}</strong>
                  <span className="card-tag">#{s.tags[0]}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="reader-container">
          {!activeStory ? (
            <div className="empty-state-hint">
              <p>Cliquez sur une histoire pour commencer la lecture</p>
            </div>
          ) : (
            <div className="reader">
              <div className="reader-header">
                <h2>{activeStory.title}</h2>
                <div className="reader-meta">
                  {activeStory.tags.map(t => <span key={t} className="tag-pill">#{t}</span>)}
                </div>
              </div>
              
              <div className="reader-body">
                <p>{activeStory.body}</p>
              </div>

              <div className="reader-actions">
                <button className="btn-like" onClick={() => likeStory(activeStory.id)}>
                  🤍 Soutenir ({activeStory.likes})
                </button>
                <button className="btn-chat" onClick={() => navigate(`/chat/${activeStory.tags[0]}`)}>
                  Discussion
                </button>
                {activeStory.user_id === myUserId && (
                  <button className="btn-delete" onClick={() => deleteStory(activeStory.id)}>
                    Supprimer
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}