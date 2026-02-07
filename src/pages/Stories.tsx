import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../style/stories.css";

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
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");

  /* =====================
     LOAD STORIES (SEARCH + TAG)
  ===================== */
  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.append("q", search);
    if (tagFilter) params.append("tag", tagFilter);

    fetch(`http://localhost:8000/api/stories?${params}`)
      .then((r) => r.json())
      .then(setStories);
  }, [search, tagFilter]);

  function likeStory(id: string) {
    if (!token) return;
    fetch(`http://localhost:8000/api/stories/${id}/like`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  return (
    <div className="page stories-page">
      <button className="back-button-global" onClick={() => navigate("/")}>←</button>

      <header className="page-header">
        <h1>Histoires</h1>
        <p>Des récits anonymes</p>
      </header>

      {/* SEARCH */}
      <div className="search-bar">
        <input
          placeholder="Rechercher par titre ou hashtag"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* TAG FILTER */}
      <div className="filters">
        {["burnout", "solitude", "rupture", "expatriation", "changement"].map(t => (
          <button
            key={t}
            className={tagFilter === t ? "active" : ""}
            onClick={() => setTagFilter(t)}
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
              className={`story-tile ${s.user_id === myUserId ? "mine" : ""}`}
              onClick={() => setActiveStory(s)}
            >
              <div className="tile-head">
                <img
                  src={s.author_avatar || "/avatar.png"}
                  className="avatar"
                />
                <strong>{s.title}</strong>
              </div>
              <div className="tile-tags">{s.tags.map(t => `#${t}`).join(" ")}</div>
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
                <button onClick={() => likeStory(activeStory.id)}>
                  🤍 Soutenir ({activeStory.likes})
                </button>

                <button
                  className="ghost"
                  onClick={() => navigate(`/chat/${activeStory.tags[0]}`)}
                >
                  Discussion liée
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
