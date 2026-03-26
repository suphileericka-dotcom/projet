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
  liked_by_me: boolean;
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
        if (Array.isArray(data)) setStories(data);
      } catch (err) { console.error(err); }
    }
    fetchStories();
  }, [search, tagFilter, token]);

  useEffect(() => {
    const timeoutId = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timeoutId);
  }, [searchInput]);

  const handleToggleLike = async (story: Story) => {
    if (!token) return;

    const isLiked = story.liked_by_me;
    const method = isLiked ? "DELETE" : "POST";
    const endpoint = isLiked ? "unlike" : "like";

    // Mise à jour UI Optimiste
    const newStories = stories.map(s => 
      s.id === story.id 
      ? { ...s, liked_by_me: !isLiked, likes: isLiked ? s.likes - 1 : s.likes + 1 } 
      : s
    );
    setStories(newStories);
    if (activeStory?.id === story.id) {
        setActiveStory({ ...activeStory, liked_by_me: !isLiked, likes: isLiked ? activeStory.likes - 1 : activeStory.likes + 1 });
    }

    try {
      await fetch(`${API}/stories/${story.id}/${endpoint}`, {
        method: method,
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err) {
      console.error("Erreur like:", err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer cette histoire ?")) return;
    try {
      const res = await fetch(`${API}/stories/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setStories(stories.filter(s => s.id !== id));
        setActiveStory(null);
      }
    } catch (err) { console.error(err); }
  };

  return (
    <div className="page stories-page">
      <button className="back-button-global" onClick={() => navigate("/")}>←</button>

      <header className="page-header">
        <h1>Histoires</h1>
        <p>Découvrez et soutenez les témoignages</p>
      </header>

      <div className="search-section">
        <div className="modern-search-bar">
          <input 
            placeholder="Rechercher une histoire..." 
            value={searchInput} 
            onChange={(e) => setSearchInput(e.target.value)} 
          />
        </div>
        <div className="tag-filters">
          {["burnout", "solitude", "rupture", "expatriation"].map(t => (
            <button key={t} className={`tag-btn ${tagFilter === t ? 'active' : ''}`} onClick={() => setTagFilter(tagFilter === t ? "" : t)}>#{t}</button>
          ))}
        </div>
      </div>

      <div className="stories-grid">
        {stories.map(s => (
          <div key={s.id} className="story-card" onClick={() => setActiveStory(s)}>
            <div className="card-header">
              <span className="card-tag">#{s.tags[0]}</span>
              <span className={s.liked_by_me ? "is-liked" : ""}>{s.liked_by_me ? "❤️" : "🤍"} {s.likes}</span>
            </div>
            <h3>{s.title}</h3>
            <span className="btn-read">Lire l'histoire</span>
          </div>
        ))}
      </div>

      {activeStory && (
        <div className="modal-overlay" onClick={() => setActiveStory(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setActiveStory(null)}>✕</button>
            <div className="modal-content-scroll">
              <h2 className="modal-title">{activeStory.title}</h2>
              <div className="modal-divider"></div>
              <p className="modal-body-text">{activeStory.body}</p>
            </div>
            <div className="modal-actions-bar">
              <button 
                className={`action-pill ${activeStory.liked_by_me ? 'liked' : ''}`} 
                onClick={() => handleToggleLike(activeStory)}
              >
                {activeStory.liked_by_me ? "❤️ Soutenu" : "🤍 Soutenir"} ({activeStory.likes})
              </button>
              <button className="action-pill chat-pill" onClick={() => navigate(`/chat/${activeStory.tags[0]}`)}>Chat</button>
              {activeStory.user_id === myUserId && (
                <button className="delete-btn-modal" onClick={() => handleDelete(activeStory.id)}>Supprimer</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}