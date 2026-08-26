import { useMemo, useState } from "react";

type OutlineItem = {
  line: number;
  title: string;
  level: number;
};

const SECTION_RE =
  /\\(part|chapter|section|subsection|subsubsection)\*?\{([^}]*)\}/;

const LEVEL: Record<string, number> = {
  part: 0,
  chapter: 0,
  section: 1,
  subsection: 2,
  subsubsection: 3,
};

function parseOutline(content: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  const lines = content.split("\n");
  lines.forEach((text, idx) => {
    const match = text.match(SECTION_RE);
    if (match) {
      items.push({
        line: idx + 1,
        title: match[2].trim() || "(untitled)",
        level: LEVEL[match[1]] ?? 1,
      });
    }
  });
  return items;
}

export default function OutlinePanel({
  content,
  onGoToLine,
}: {
  content: string;
  onGoToLine: (line: number) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const items = useMemo(() => parseOutline(content), [content]);

  return (
    <div className="outline-panel">
      <div
        className="outline-header"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="tree-caret">{expanded ? "▾" : "▸"}</span>
        <span>OUTLINE</span>
      </div>
      {expanded && (
        <div className="outline-body">
          {items.length === 0 && (
            <div className="outline-empty">No sections found</div>
          )}
          {items.map((item, idx) => (
            <div
              key={idx}
              className="outline-row"
              style={{ paddingLeft: 10 + item.level * 14 }}
              onClick={() => onGoToLine(item.line)}
              title={item.title}
            >
              {item.title}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
