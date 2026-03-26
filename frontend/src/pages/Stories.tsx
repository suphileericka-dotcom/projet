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
  liked_by_me?: boolean; // Pour savoir si l'utilisateur actuel a déjà liké
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

  // Suggestion de recherche
  const searchSuggestions = searchInput.trim()
    ? stories
        .filter((s) => s.title.toLowerCase().includes(searchInput.toLowerCase()))
        .slice(0, 5)
    : [];

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
        console.error("Erreur fetch stories:", err);
      }
    }
    fetchStories();
  }, [search, tagFilter, token]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setSearch(searchInput.trim()), 200);
    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  // LOGIQUE TOGGLE LIKE (Liker / Enlever le like)
  async function handleLike(id: string) {
    if (!token) return;
    
    // Optimistic UI : on change l'état localement tout de suite
    setStories(prev => prev.map(s => {
        if (s.id === id) {
            const isLiked = s.liked_by_me;
            return { 
                ...s, 
                likes: isLiked ? s.likes - 1 : s.likes + 1, 
                liked_by_me: !isLiked 
            };
        }
        return s;
    }));

    try {
      await fetch(`${API}/stories/${id}/like`, {
        method: "POST", // ou PATCH selon ton API
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.error("Erreur like:", err);
    }
  }

  async function deleteStory(id: string) {
    if (!token || !confirm("Supprimer cette histoire ?")) return;
    try {
      await fetch(`${API}/stories/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setStories(prev => prev.filter(s => s.id !== id));
      setActiveStory(null);
    } catch (err) {
      console.error("Erreur suppression:", err);
    }
  }

  return (
    <div className="page stories-page">
      <button className="back-button-global" onClick={() => navigate("/")}>←</button>

      <header className="page-header">
        <h1>Histoires</h1>
        <p>Découvrez les récits de la communauté</p>
      </header>

      <div className="search-container">
        <div className="search-bar">
          <div className="search-field">
            <span className="search-icon">🔎</span>
            <input
              placeholder="Rechercher une histoire..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          {searchSuggestions.length > 0 && (
            <div className="search-suggestions">
              {searchSuggestions.map((s) => (
                <div key={s.id} className="suggestion-item" onClick={() => {setActiveStory(s); setSearchInput("")}}>
                  {s.title}
                </div>
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

      {/* GRILLE DES HISTOIRES */}
      <div className="stories-grid">
        {stories.map((s) => (
          <div key={s.id} className="story-card" onClick={() => setActiveStory(s)}>
            <div className="card-top">
                <img src={s.author_avatar || "/avatar.png"} className="avatar-card" alt="" />
                <span className="card-tag">#{s.tags[0]}</span>
            </div>
            <h3>{s.title}</h3>
            <div className="card-footer">
                <span>🤍 {s.likes}</span>
                <span className="read-more">Lire l'histoire →</span>
            </div>
          </div>
        ))}
      </div>

      {/* MODALE DE LECTURE */}
      {activeStory && (
        <div className="modal-overlay" onClick={() => setActiveStory(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-modal" onClick={() => setActiveStory(null)}>×</button>
            
            <div className="modal-header">
              <h2>{activeStory.title}</h2>
              <div className="modal-meta">
                {activeStory.tags.map(t => <span key={t} className="tag-pill">#{t}</span>)}
              </div>
            </div>

            <div className="modal-body">
              <p>{activeStory.body}</p>
            </div>

            <div className="modal-footer">
              <div className="actions-left">
                  <button 
                    className={`btn-action btn-like ${activeStory.liked_by_me ? 'is-liked' : ''}`}
                    onClick={() => handleLike(activeStory.id)}
                  >
                    {activeStory.liked_by_me ? "❤️" : "🤍"} {activeStory.likes}
                  </button>
                  <button className="btn-action btn-chat" onClick={() => navigate(`/chat/${activeStory.tags[0]}`)}>
                    Discussion
                  </button>
              </div>
              
              {activeStory.user_id === myUserId && (
                <button className="btn-danger" onClick={() => deleteStory(activeStory.id)}>
                  Supprimer
                </button>
              )}
            </div>

            {/* SECTION COMMENTAIRES */}
            <div className="comments-section">
                <h3>Commentaires</h3>
                <div className="comment-input-wrapper">
                    <textarea placeholder="Écrire un commentaire bienveillant..."></textarea>
                    <button className="btn-send">Envoyer</button>
                </div>
                <div className="comments-list">
                    <p className="no-comments">Aucun commentaire pour le moment.</p>
                </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}