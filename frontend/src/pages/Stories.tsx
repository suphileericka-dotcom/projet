import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
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

type StoriesLocationState = {
  publishedTitle?: string;
};

export default function Stories() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const token = localStorage.getItem("authToken");
  const myUserId = localStorage.getItem("userId");
  const publishTitle =
    (location.state as StoriesLocationState | null)?.publishedTitle ?? null;
  const authorFilterId = searchParams.get("author")?.trim() || "";
  const authorFilterName = searchParams.get("authorName")?.trim() || "";

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
        if (authorFilterId) params.append("author", authorFilterId);

        const res = await fetch(`${API}/stories?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (Array.isArray(data)) setStories(data);
      } catch (err) {
        console.error(err);
      }
    }

    fetchStories();
  }, [authorFilterId, search, tagFilter, token]);

  useEffect(() => {
    const timeoutId = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timeoutId);
  }, [searchInput]);

  useEffect(() => {
    if (!publishTitle) return;
    const timeoutId = window.setTimeout(() => {
      navigate(location.pathname, { replace: true, state: null });
    }, 5000);
    return () => clearTimeout(timeoutId);
  }, [location.pathname, navigate, publishTitle]);

  const visibleStories = useMemo(() => {
    if (!authorFilterId) return stories;
    return stories.filter((story) => story.user_id === authorFilterId);
  }, [authorFilterId, stories]);

  const activeVisibleStory =
    activeStory && visibleStories.some((story) => story.id === activeStory.id)
      ? activeStory
      : null;

  const handleToggleLike = async (story: Story) => {
    if (!token) return;

    const isLiked = story.liked_by_me;
    const method = isLiked ? "DELETE" : "POST";
    const endpoint = isLiked ? "unlike" : "like";

    const newStories = stories.map((s) =>
      s.id === story.id
        ? {
            ...s,
            liked_by_me: !isLiked,
            likes: isLiked ? s.likes - 1 : s.likes + 1,
          }
        : s,
    );
    setStories(newStories);

    if (activeVisibleStory?.id === story.id) {
      setActiveStory({
        ...activeVisibleStory,
        liked_by_me: !isLiked,
        likes: isLiked
          ? activeVisibleStory.likes - 1
          : activeVisibleStory.likes + 1,
      });
    }

    try {
      await fetch(`${API}/stories/${story.id}/${endpoint}`, {
        method,
        headers: { Authorization: `Bearer ${token}` },
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
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setStories(stories.filter((s) => s.id !== id));
        setActiveStory(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="page stories-page">
      <button className="back-button-global" onClick={() => navigate("/")}>
        ←
      </button>

      <header className="page-header">
        <h1>Histoires</h1>
        <p>Decouvre et soutiens les temoignages</p>
      </header>

      {authorFilterId && (
        <div className="author-filter-banner">
          <div>
            <strong>
              {authorFilterName
                ? `Histoires de ${authorFilterName}`
                : "Histoires de cette personne"}
            </strong>
            <p>
              {visibleStories.length > 0
                ? `${visibleStories.length} histoire${
                    visibleStories.length > 1 ? "s" : ""
                  } trouvee${visibleStories.length > 1 ? "s" : ""}.`
                : "Aucune histoire publiee pour le moment."}
            </p>
          </div>
          <button type="button" onClick={() => navigate("/stories")}>
            Voir toutes les histoires
          </button>
        </div>
      )}

      {publishTitle && (
        <div className="publish-banner" role="status">
          {`Ton histoire "${publishTitle}" est maintenant publiee.`}
        </div>
      )}

      <div className="search-section">
        <div className="modern-search-bar">
          <input
            placeholder="Rechercher une histoire..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div className="tag-filters">
          {["burnout", "solitude", "rupture", "expatriation"].map((tag) => (
            <button
              key={tag}
              className={`tag-btn ${tagFilter === tag ? "active" : ""}`}
              onClick={() => setTagFilter(tagFilter === tag ? "" : tag)}
            >
              #{tag}
            </button>
          ))}
        </div>
      </div>

      <div className="stories-grid">
        {visibleStories.map((story) => (
          <div
            key={story.id}
            className="story-card"
            onClick={() => setActiveStory(story)}
          >
            <div className="card-header">
              <span className="card-tag">#{story.tags[0]}</span>
              <span className={story.liked_by_me ? "is-liked" : ""}>
                {story.liked_by_me ? "❤️" : "🤍"} {story.likes}
              </span>
            </div>
            <h3>{story.title}</h3>
            <span className="btn-read">Lire l'histoire</span>
          </div>
        ))}
      </div>

      {visibleStories.length === 0 && (
        <div className="stories-empty-state">
          {authorFilterId
            ? "Cette personne n'a pas encore publie d'histoire."
            : "Aucune histoire ne correspond a ta recherche."}
        </div>
      )}

      {activeVisibleStory && (
        <div className="modal-overlay" onClick={() => setActiveStory(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close-btn"
              onClick={() => setActiveStory(null)}
            >
              ✕
            </button>
            <div className="modal-content-scroll">
              <h2 className="modal-title">{activeVisibleStory.title}</h2>
              <div className="modal-divider"></div>
              <p className="modal-body-text">{activeVisibleStory.body}</p>
            </div>
            <div className="modal-actions-bar">
              <button
                className={`action-pill ${
                  activeVisibleStory.liked_by_me ? "liked" : ""
                }`}
                onClick={() => handleToggleLike(activeVisibleStory)}
              >
                {activeVisibleStory.liked_by_me ? "❤️ Soutenu" : "🤍 Soutenir"} (
                {activeVisibleStory.likes})
              </button>
              <button
                className="action-pill chat-pill"
                onClick={() => navigate(`/chat/${activeVisibleStory.tags[0]}`)}
              >
                Chat
              </button>
              {activeVisibleStory.user_id === myUserId && (
                <button
                  className="delete-btn-modal"
                  onClick={() => handleDelete(activeVisibleStory.id)}
                >
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
