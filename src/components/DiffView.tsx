type Line = { kind: "add" | "del" | "ctx" | "hunk" | "meta"; text: string };

function classify(text: string): Line["kind"] {
  if (text.startsWith("@@")) return "hunk";
  if (
    text.startsWith("diff ") ||
    text.startsWith("index ") ||
    text.startsWith("--- ") ||
    text.startsWith("+++ ") ||
    text.startsWith("new file") ||
    text.startsWith("deleted file") ||
    text.startsWith("similarity ") ||
    text.startsWith("rename ") ||
    text.startsWith("old mode") ||
    text.startsWith("new mode")
  )
    return "meta";
  if (text.startsWith("+")) return "add";
  if (text.startsWith("-")) return "del";
  return "ctx";
}

export default function DiffView({
  filePath,
  diff,
  staged,
  onClose,
}: {
  filePath: string;
  diff: string;
  staged: boolean;
  onClose: () => void;
}) {
  const lines: Line[] = diff
    .replace(/\n$/, "")
    .split("\n")
    .map((text) => ({ kind: classify(text), text }));

  const added = lines.filter((l) => l.kind === "add").length;
  const removed = lines.filter((l) => l.kind === "del").length;

  return (
    <div className="diff-view">
      <div className="diff-view-header">
        <span className="diff-view-title">{filePath}</span>
        <span className="diff-view-tag">{staged ? "staged" : "working tree"}</span>
        <span className="diff-view-stat diff-view-stat-add">+{added}</span>
        <span className="diff-view-stat diff-view-stat-del">−{removed}</span>
        <button className="diff-view-close" onClick={onClose} title="Close diff">
          ✕
        </button>
      </div>
      {diff.trim() === "" ? (
        <div className="diff-view-empty">No textual changes to show.</div>
      ) : (
        <div className="diff-view-body">
          {lines.map((l, i) => (
            <div key={i} className={`diff-line diff-line-${l.kind}`}>
              <span className="diff-line-text">{l.text === "" ? " " : l.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
