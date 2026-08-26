type ToolbarItem = {
  label: string;
  title: string;
  text: string;
};

const ITEMS: ToolbarItem[] = [
  { label: "B", title: "Bold", text: "\\textbf{}" },
  { label: "I", title: "Italic", text: "\\textit{}" },
  { label: "U", title: "Underline", text: "\\underline{}" },
];

const STRUCTURE: ToolbarItem[] = [
  { label: "§", title: "Section", text: "\\section{}" },
  { label: "§§", title: "Subsection", text: "\\subsection{}" },
];

const LISTS: ToolbarItem[] = [
  {
    label: "•",
    title: "Bulleted list",
    text: "\\begin{itemize}\n  \\item \n\\end{itemize}",
  },
  {
    label: "1.",
    title: "Numbered list",
    text: "\\begin{enumerate}\n  \\item \n\\end{enumerate}",
  },
];

const MATH: ToolbarItem[] = [
  { label: "𝑥", title: "Inline math", text: "$$" },
  {
    label: "∑",
    title: "Display equation",
    text: "\\begin{equation}\n  \n\\end{equation}",
  },
];

const REFS: ToolbarItem[] = [
  { label: "🔗", title: "Reference", text: "\\ref{}" },
  { label: "❝", title: "Citation", text: "\\cite{}" },
];

function Group({
  items,
  onInsert,
}: {
  items: ToolbarItem[];
  onInsert: (text: string) => void;
}) {
  return (
    <div className="symbol-toolbar-group">
      {items.map((item) => (
        <button
          key={item.title}
          className="symbol-toolbar-btn"
          title={item.title}
          onClick={() => onInsert(item.text)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export default function SymbolToolbar({
  onInsert,
}: {
  onInsert: (text: string) => void;
}) {
  return (
    <div className="symbol-toolbar">
      <Group items={ITEMS} onInsert={onInsert} />
      <div className="symbol-toolbar-sep" />
      <Group items={STRUCTURE} onInsert={onInsert} />
      <div className="symbol-toolbar-sep" />
      <Group items={LISTS} onInsert={onInsert} />
      <div className="symbol-toolbar-sep" />
      <Group items={MATH} onInsert={onInsert} />
      <div className="symbol-toolbar-sep" />
      <Group items={REFS} onInsert={onInsert} />
    </div>
  );
}
