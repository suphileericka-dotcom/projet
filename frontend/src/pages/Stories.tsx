import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import "../style/stories.css";
import { API } from "../config/api";

const STORIES_RENDER_BATCH = 12;
const STORIES_FETCH_LIMIT = 48;

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

type StoryWindowState = {
  key: string;
  count: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function readString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const normalized = value.trim();
    if (normalized) return normalized;
  }

  return null;
}

function readBoolean(...values: unknown[]): boolean | null {
  for (const value of values) {
    if (typeof value === "boolean") return value;
  }

  return null;
}

function readNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") continue;

    const normalized = Number(value);
    if (Number.isFinite(normalized)) return normalized;
  }

  return null;
}

function readTags(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

function getResponseMessage(payload: unknown, fallback: string) {
  const record = asRecord(payload);
  if (!record) return fallback;

  return (
    readString(record.message, record.error, record.detail, record.code) || fallback
  );
}

function normalizeStory(rawStory: unknown): Story | null {
  const record = asRecord(rawStory);
  if (!record) return null;

  const author = asRecord(record.author) ?? asRecord(record.user);
  const id = readString(record.id, record._id, record.storyId, record.story_id);
  const title = readString(record.title, record.name) || "";
  const body =
    readString(record.body, record.content, record.text, record.story) || "";
  const userId =
    readString(
      record.user_id,
      record.userId,
      record.author_id,
      record.authorId,
      author?.id,
      author?.user_id,
      author?.userId
    ) || "";

  if (!id) return null;

  return {
    id,
    title,
    body,
    tags:
      readTags(record.tags).length > 0
        ? readTags(record.tags)
        : readTags(record.hashtags),
    user_id: userId,
    author_avatar:
      readString(
        record.author_avatar,
        record.authorAvatar,
        record.avatar,
        author?.avatar,
        author?.avatar_url,
        author?.avatarUrl
      ) || undefined,
    likes: readNumber(record.likes, record.likeCount, record.like_count) ?? 0,
    liked_by_me:
      readBoolean(record.liked_by_me, record.likedByMe, record.liked) ?? false,
  };
}

function normalizeStoryList(payload: unknown) {
  const record = asRecord(payload);
  const nestedData = asRecord(record?.data);
  const rawStories = Array.isArray(payload)
    ? payload
    : Array.isArray(record?.items)
      ? record.items
      : Array.isArray(record?.stories)
        ? record.stories
        : Array.isArray(record?.results)
          ? record.results
          : Array.isArray(record?.data)
            ? record.data
            : Array.isArray(nestedData?.items)
              ? nestedData.items
              : Array.isArray(nestedData?.stories)
                ? nestedData.stories
                : [];

  return rawStories
    .map((entry) => normalizeStory(entry))
    .filter((story): story is Story => story !== null);
}

function mergeStories(current: Story[], incoming: Story[]) {
  const knownIds = new Set(current.map((story) => story.id));
  const appended = incoming.filter((story) => !knownIds.has(story.id));
  return {
    nextStories: [...current, ...appended],
    appendedCount: appended.length,
  };
}

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
  const [isLoadingStories, setIsLoadingStories] = useState(false);
  const [hasMoreStoryPages, setHasMoreStoryPages] = useState(false);
  const [loadedStoryPage, setLoadedStoryPage] = useState(1);
  const [storyWindow, setStoryWindow] = useState<StoryWindowState>({
    key: "",
    count: STORIES_RENDER_BATCH,
  });
  const [storyNotice, setStoryNotice] = useState<string | null>(null);

  const storiesQueryKey = `${authorFilterId}|${search}|${tagFilter}`;
  const visibleStoryCount =
    storyWindow.key === storiesQueryKey
      ? storyWindow.count
      : STORIES_RENDER_BATCH;

  const fetchStories = useCallback(
    async (pageToLoad: number, replace: boolean) => {
      setIsLoadingStories(true);

      try {
        const params = new URLSearchParams();
        if (search) params.append("q", search);
        if (tagFilter) params.append("tag", tagFilter);
        if (authorFilterId) params.append("author", authorFilterId);
        params.append("limit", String(STORIES_FETCH_LIMIT));
        params.append("page", String(pageToLoad));

        const res = await fetch(`${API}/stories?${params}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const payload = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(
            getResponseMessage(payload, "Impossible de charger les histoires.")
          );
        }

        const data = normalizeStoryList(payload);

        if (data.length === 0 && Array.isArray(payload) === false && payload !== null) {
          if (replace) {
            setStories([]);
            setHasMoreStoryPages(false);
            setLoadedStoryPage(1);
          }
          return 0;
        }

        let appendedCount = data.length;

        setStories((current) => {
          if (replace) {
            return data;
          }

          const merged = mergeStories(current, data);
          appendedCount = merged.appendedCount;
          return merged.nextStories;
        });

        setLoadedStoryPage(pageToLoad);
        setHasMoreStoryPages(
          data.length >= STORIES_FETCH_LIMIT && (replace || appendedCount > 0)
        );

        if (replace) {
          setStoryWindow({
            key: storiesQueryKey,
            count: STORIES_RENDER_BATCH,
          });
        }

        if (replace) {
          setStoryNotice(null);
        }

        return appendedCount;
      } catch (err) {
        console.error(err);
        if (replace) {
          setStoryNotice(
            err instanceof Error && err.message
              ? err.message
              : "Impossible de charger les histoires."
          );
        }
        if (replace) {
          setStories([]);
          setHasMoreStoryPages(false);
          setLoadedStoryPage(1);
        }
        return 0;
      } finally {
        setIsLoadingStories(false);
      }
    },
    [authorFilterId, search, storiesQueryKey, tagFilter, token]
  );

  useEffect(() => {
    void fetchStories(1, true);
  }, [fetchStories]);

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

  const filteredStories = useMemo(() => {
    if (!authorFilterId) return stories;
    return stories.filter((story) => story.user_id === authorFilterId);
  }, [authorFilterId, stories]);

  const displayedStories = useMemo(
    () => filteredStories.slice(0, visibleStoryCount),
    [filteredStories, visibleStoryCount]
  );

  const activeVisibleStory =
    activeStory && filteredStories.some((story) => story.id === activeStory.id)
      ? activeStory
      : null;

  const canLoadMoreVisibleStories = visibleStoryCount < filteredStories.length;
  const canLoadMoreStories = canLoadMoreVisibleStories || hasMoreStoryPages;

  const handleToggleLike = async (story: Story) => {
    if (!token) return;

    const isLiked = story.liked_by_me;
    const method = isLiked ? "DELETE" : "POST";
    const endpoint = isLiked ? "unlike" : "like";

    const newStories = stories.map((currentStory) =>
      currentStory.id === story.id
        ? {
            ...currentStory,
            liked_by_me: !isLiked,
            likes: isLiked ? currentStory.likes - 1 : currentStory.likes + 1,
          }
        : currentStory
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
    if (!token) {
      setStoryNotice("Reconnecte-toi pour supprimer cette histoire.");
      return;
    }

    if (!window.confirm("Supprimer cette histoire ?")) return;

    try {
      const res = await fetch(`${API}/stories/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setStoryNotice(
          getResponseMessage(payload, "La suppression de l'histoire a echoue.")
        );
        return;
      }

      setStories((current) => current.filter((story) => story.id !== id));
      setActiveStory(null);
      setStoryNotice("Histoire supprimee.");
    } catch (err) {
      console.error(err);
      setStoryNotice("La suppression de l'histoire a echoue.");
    }
  };

  async function handleLoadMoreStories() {
    if (canLoadMoreVisibleStories) {
      setStoryWindow({
        key: storiesQueryKey,
        count: visibleStoryCount + STORIES_RENDER_BATCH,
      });
      return;
    }

    if (!hasMoreStoryPages || isLoadingStories) return;

    const appendedCount = await fetchStories(loadedStoryPage + 1, false);
    if (appendedCount > 0) {
      setStoryWindow({
        key: storiesQueryKey,
        count: visibleStoryCount + STORIES_RENDER_BATCH,
      });
    }
  }

  return (
    <div className="page stories-page">
      <button className="back-button-global" onClick={() => navigate("/")}>
        {"<"}
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
              {filteredStories.length > 0
                ? `${filteredStories.length} histoire${
                    filteredStories.length > 1 ? "s" : ""
                  } trouvee${filteredStories.length > 1 ? "s" : ""}.`
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

      {storyNotice && (
        <div className="stories-notice" role="status">
          {storyNotice}
        </div>
      )}

      <div className="search-section">
        <div className="modern-search-bar">
          <input
            placeholder="Rechercher une histoire..."
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
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

      {filteredStories.length > 0 && (
        <div className="stories-results-bar">
          <span>
            {displayedStories.length} sur {filteredStories.length} histoire
            {filteredStories.length > 1 ? "s" : ""} affichee
            {filteredStories.length > 1 ? "s" : ""}
          </span>
        </div>
      )}

      <div className="stories-grid">
        {displayedStories.map((story) => (
          <div
            key={story.id}
            className="story-card"
            onClick={() => setActiveStory(story)}
          >
            <div className="card-header">
              <span className="card-tag">#{story.tags[0]}</span>
              <span className={story.liked_by_me ? "is-liked" : ""}>
                {story.liked_by_me ? "Aime" : "Soutien"} {story.likes}
              </span>
            </div>
            <h3>{story.title}</h3>
            <span className="btn-read">Lire l'histoire</span>
          </div>
        ))}
      </div>

      {canLoadMoreStories && (
        <div className="stories-load-more">
          <button
            type="button"
            onClick={() => void handleLoadMoreStories()}
            disabled={isLoadingStories}
          >
            {isLoadingStories ? "Chargement..." : "Voir plus d'histoires"}
          </button>
        </div>
      )}

      {filteredStories.length === 0 && !isLoadingStories && (
        <div className="stories-empty-state">
          {authorFilterId
            ? "Cette personne n'a pas encore publie d'histoire."
            : "Aucune histoire ne correspond a ta recherche."}
        </div>
      )}

      {activeVisibleStory && (
        <div className="modal-overlay" onClick={() => setActiveStory(null)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <button
              className="modal-close-btn"
              onClick={() => setActiveStory(null)}
            >
              X
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
                {activeVisibleStory.liked_by_me ? "Soutenu" : "Soutenir"} (
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
