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
  liked_by_me?: boolean;
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

  useEffect(() => {
    async function fetchStories() {
      try {
        const params = new URLSearchParams();
        if (search) params.append("q", search);
        if (tagFilter) params.append("tag", tagFilter);
        const res = await fetch(`${API}/stories?${params}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        setStories(data);
      } catch (err) {
        console.error("Erreur stories:", err);
      }
    }
    fetchStories();
  }, [search, tagFilter, token]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setSearch(searchInput.trim()), 200);
    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  // LOGIQUE LIKE / DISLIKE (Toggle)
  async function handleLike(id: string) {
    if (!token) return;

    // Mise à jour locale immédiate (Optimistic UI)
    const updateState = (prev: Story[]) => prev.map(s => {
      if (s.id === id) {
        const isCurrentlyLiked = s.liked_by_me;
        return { 
          ...s, 
          likes: isCurrentlyLiked ? s.likes - 1 : s.likes + 1, 
          liked_by_me: !isCurrentlyLiked 
        };
      }
      return s;
    });

    setStories(updateState);
    if (activeStory?.id === id) {
        setActiveStory(prev => prev ? { 
            ...prev, 
            likes: prev.liked_by_me ? prev.likes - 1 : prev.likes + 1, 
            liked_by_me: !prev.liked_by_me 
        } : null);
    }

    try {
      await fetch(`${API}/stories/${id}/like`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.error("Erreur toggle like:", err);
    }
  }

  async function deleteStory(id: string) {
    if (!token || !confirm("Supprimer définitivement cette histoire ?")) return;
    try {
      await fetch(`${API}/stories/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setStories(prev => prev.filter(s => s.id !== id));
      setActiveStory(null);
    } catch (err) { console.error(err); }
  }

  return (
    <div className="page stories-page">
      <button className="back-button-global" onClick={() => navigate("/")}>←</button>

      <header className="page-header">
        <h1>Histoires</h1>
        <p>Découvrez les récits anonymes de la communauté</p>
      </header>

      <div className="search-section">
        <div className="modern-search-bar">
          <span className="search-emoji">🔎</span>
          <input
            placeholder="Rechercher par titre ou hashtag..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>

        <div className="tag-filters">
          {["burnout", "solitude", "rupture", "expatriation", "changement"].map((t) => (
            <button
              key={t}
              className={tagFilter === t ? "tag-btn active" : "tag-btn"}
              onClick={() => setTagFilter(tagFilter === t ? "" : t)}
            >
              #{t}
            </button>
          ))}
        </div>
      </div>

      <div className="stories-grid">
        {stories.map((s) => (
          <div key={s.id} className="story-card" onClick={() => setActiveStory(s)}>
            <div className="card-header">
              <img src={s.author_avatar || "/avatar.png"} className="card-avatar" alt="" />
              <span className="card-tag">#{s.tags[0]}</span>
            </div>
            <h3>{s.title}</h3>
            <div className="card-footer">
              <span className={`likes-badge ${s.liked_by_me ? 'is-liked' : ''}`}>
                {s.liked_by_me ? "❤️" : "🤍"} {s.likes}
              </span>
              <span className="btn-read">Lire l'histoire →</span>
            </div>
          </div>
        ))}
      </div>

      {activeStory && (
        <div className="modal-overlay" onClick={() => setActiveStory(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setActiveStory(null)}>✕</button>
            
            <div className="modal-content-scroll">
              <span className="modal-category">#{activeStory.tags.join(" #")}</span>
              <h2 className="modal-title">{activeStory.title}</h2>
              <div className="modal-divider"></div>
              <p className="modal-body-text">{activeStory.body}</p>
            </div>

            <div className="modal-actions-bar">
              <button 
                className={`action-pill like-pill ${activeStory.liked_by_me ? 'liked' : ''}`}
                onClick={() => handleLike(activeStory.id)}
              >
                {activeStory.liked_by_me ? "❤️" : "🤍"} {activeStory.liked_by_me ? "Aimé" : "Soutenir"} ({activeStory.likes})
              </button>
              
              <button className="action-pill chat-pill" onClick={() => navigate(`/chat/${activeStory.tags[0]}`)}>
                Discussion liée
              </button>

              {activeStory.user_id === myUserId && (
                <button className="delete-btn-modal" onClick={() => deleteStory(activeStory.id)}>
                  Supprimer
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}