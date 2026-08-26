import { useState } from "react";
import type { SearchMatch } from "../electron-api";

export default function SearchPanel({
  rootDir,
  onOpenMatch,
}: {
  rootDir: string;
  onOpenMatch: (path: string, line: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  async function runSearch(q: string) {
    setQuery(q);
    if (!q.trim()) {
      setMatches([]);
      setSearched(false);
      return;
    }
    setSearching(true);
    try {
      const results = await window.api.searchProject(rootDir, q);
      setMatches(results);
      setSearched(true);
    } finally {
      setSearching(false);
    }
  }

  const grouped = matches.reduce<Record<string, SearchMatch[]>>((acc, m) => {
    (acc[m.path] ??= []).push(m);
    return acc;
  }, {});

  return (
    <div className="search-panel">
      <div className="search-panel-header">
        <input
          className="search-panel-input"
          type="text"
          placeholder="Search in files…"
          value={query}
          onChange={(e) => runSearch(e.target.value)}
          autoFocus
        />
      </div>
      <div className="search-panel-body">
        {searching && <div className="search-panel-empty">Searching…</div>}
        {!searching && searched && matches.length === 0 && (
          <div className="search-panel-empty">No results</div>
        )}
        {!searching &&
          Object.entries(grouped).map(([path, fileMatches]) => (
            <div key={path} className="search-panel-group">
              <div className="search-panel-file">
                {path.slice(rootDir.length + 1)}
                <span className="search-panel-count">{fileMatches.length}</span>
              </div>
              {fileMatches.map((m, i) => (
                <div
                  key={i}
                  className="search-panel-match"
                  onClick={() => onOpenMatch(m.path, m.line)}
                  title={m.text}
                >
                  <span className="search-panel-line">{m.line}</span>
                  <span className="search-panel-text">{m.text}</span>
                </div>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}
