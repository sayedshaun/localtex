import type { CompletionContext, CompletionResult, Completion } from "@codemirror/autocomplete";

// Commands worth suggesting, roughly in the order a document needs them.
// `apply` carries a "#" marker for where the cursor should land after insert.
const COMMANDS: Array<[string, string, string]> = [
  // [label, insert template, detail]
  ["\\section", "\\section{#}", "section heading"],
  ["\\subsection", "\\subsection{#}", "subsection heading"],
  ["\\subsubsection", "\\subsubsection{#}", "subsubsection heading"],
  ["\\paragraph", "\\paragraph{#}", "paragraph heading"],
  ["\\chapter", "\\chapter{#}", "chapter heading"],
  ["\\part", "\\part{#}", "part heading"],
  ["\\title", "\\title{#}", "document title"],
  ["\\author", "\\author{#}", "document author"],
  ["\\date", "\\date{#}", "document date"],
  ["\\maketitle", "\\maketitle", "render the title block"],
  ["\\tableofcontents", "\\tableofcontents", "insert table of contents"],

  ["\\textbf", "\\textbf{#}", "bold text"],
  ["\\textit", "\\textit{#}", "italic text"],
  ["\\texttt", "\\texttt{#}", "monospace text"],
  ["\\textsc", "\\textsc{#}", "small caps"],
  ["\\emph", "\\emph{#}", "emphasis"],
  ["\\underline", "\\underline{#}", "underline"],

  ["\\item", "\\item ", "list item"],
  ["\\label", "\\label{#}", "define a label"],
  ["\\ref", "\\ref{#}", "reference a label"],
  ["\\eqref", "\\eqref{#}", "reference an equation"],
  ["\\pageref", "\\pageref{#}", "reference a page"],
  ["\\cite", "\\cite{#}", "citation"],
  ["\\citep", "\\citep{#}", "parenthetical citation"],
  ["\\citet", "\\citet{#}", "textual citation"],
  ["\\footnote", "\\footnote{#}", "footnote"],

  ["\\usepackage", "\\usepackage{#}", "load a package"],
  ["\\documentclass", "\\documentclass{#}", "document class"],
  ["\\newcommand", "\\newcommand{\\#}[1]{}", "define a command"],
  ["\\renewcommand", "\\renewcommand{\\#}{}", "redefine a command"],
  ["\\input", "\\input{#}", "include a file (no page break)"],
  ["\\include", "\\include{#}", "include a file"],
  ["\\bibliography", "\\bibliography{#}", "bibliography file"],
  ["\\bibliographystyle", "\\bibliographystyle{#}", "bibliography style"],

  ["\\includegraphics", "\\includegraphics[width=\\linewidth]{#}", "insert an image"],
  ["\\caption", "\\caption{#}", "figure/table caption"],
  ["\\centering", "\\centering", "center the contents"],
  ["\\hline", "\\hline", "horizontal rule in a table"],
  ["\\toprule", "\\toprule", "booktabs top rule"],
  ["\\midrule", "\\midrule", "booktabs middle rule"],
  ["\\bottomrule", "\\bottomrule", "booktabs bottom rule"],
  ["\\multicolumn", "\\multicolumn{2}{c}{#}", "span table columns"],

  ["\\frac", "\\frac{#}{}", "fraction"],
  ["\\sqrt", "\\sqrt{#}", "square root"],
  ["\\sum", "\\sum_{#}^{}", "summation"],
  ["\\prod", "\\prod_{#}^{}", "product"],
  ["\\int", "\\int_{#}^{}", "integral"],
  ["\\lim", "\\lim_{#}", "limit"],
  ["\\left", "\\left(#\\right)", "auto-sized delimiters"],
  ["\\mathbb", "\\mathbb{#}", "blackboard bold"],
  ["\\mathcal", "\\mathcal{#}", "calligraphic"],
  ["\\mathbf", "\\mathbf{#}", "bold math"],
  ["\\mathrm", "\\mathrm{#}", "roman math"],
  ["\\text", "\\text{#}", "text inside math"],
  ["\\hat", "\\hat{#}", "hat accent"],
  ["\\bar", "\\bar{#}", "bar accent"],
  ["\\vec", "\\vec{#}", "vector accent"],
  ["\\tilde", "\\tilde{#}", "tilde accent"],

  ["\\alpha", "\\alpha", "α"],
  ["\\beta", "\\beta", "β"],
  ["\\gamma", "\\gamma", "γ"],
  ["\\delta", "\\delta", "δ"],
  ["\\epsilon", "\\epsilon", "ε"],
  ["\\varepsilon", "\\varepsilon", "ε (variant)"],
  ["\\zeta", "\\zeta", "ζ"],
  ["\\eta", "\\eta", "η"],
  ["\\theta", "\\theta", "θ"],
  ["\\iota", "\\iota", "ι"],
  ["\\kappa", "\\kappa", "κ"],
  ["\\lambda", "\\lambda", "λ"],
  ["\\mu", "\\mu", "μ"],
  ["\\nu", "\\nu", "ν"],
  ["\\xi", "\\xi", "ξ"],
  ["\\pi", "\\pi", "π"],
  ["\\rho", "\\rho", "ρ"],
  ["\\sigma", "\\sigma", "σ"],
  ["\\tau", "\\tau", "τ"],
  ["\\upsilon", "\\upsilon", "υ"],
  ["\\phi", "\\phi", "φ"],
  ["\\varphi", "\\varphi", "φ (variant)"],
  ["\\chi", "\\chi", "χ"],
  ["\\psi", "\\psi", "ψ"],
  ["\\omega", "\\omega", "ω"],
  ["\\Gamma", "\\Gamma", "Γ"],
  ["\\Delta", "\\Delta", "Δ"],
  ["\\Theta", "\\Theta", "Θ"],
  ["\\Lambda", "\\Lambda", "Λ"],
  ["\\Sigma", "\\Sigma", "Σ"],
  ["\\Phi", "\\Phi", "Φ"],
  ["\\Psi", "\\Psi", "Ψ"],
  ["\\Omega", "\\Omega", "Ω"],

  ["\\infty", "\\infty", "∞"],
  ["\\partial", "\\partial", "∂"],
  ["\\nabla", "\\nabla", "∇"],
  ["\\cdot", "\\cdot", "·"],
  ["\\times", "\\times", "×"],
  ["\\div", "\\div", "÷"],
  ["\\pm", "\\pm", "±"],
  ["\\leq", "\\leq", "≤"],
  ["\\geq", "\\geq", "≥"],
  ["\\neq", "\\neq", "≠"],
  ["\\approx", "\\approx", "≈"],
  ["\\equiv", "\\equiv", "≡"],
  ["\\sim", "\\sim", "∼"],
  ["\\propto", "\\propto", "∝"],
  ["\\in", "\\in", "∈"],
  ["\\notin", "\\notin", "∉"],
  ["\\subset", "\\subset", "⊂"],
  ["\\subseteq", "\\subseteq", "⊆"],
  ["\\cup", "\\cup", "∪"],
  ["\\cap", "\\cap", "∩"],
  ["\\forall", "\\forall", "∀"],
  ["\\exists", "\\exists", "∃"],
  ["\\rightarrow", "\\rightarrow", "→"],
  ["\\leftarrow", "\\leftarrow", "←"],
  ["\\Rightarrow", "\\Rightarrow", "⇒"],
  ["\\Leftarrow", "\\Leftarrow", "⇐"],
  ["\\leftrightarrow", "\\leftrightarrow", "↔"],
  ["\\ldots", "\\ldots", "…"],
  ["\\cdots", "\\cdots", "⋯"],

  ["\\newpage", "\\newpage", "force a page break"],
  ["\\clearpage", "\\clearpage", "flush floats and break page"],
  ["\\noindent", "\\noindent", "suppress paragraph indent"],
  ["\\vspace", "\\vspace{#}", "vertical space"],
  ["\\hspace", "\\hspace{#}", "horizontal space"],
  ["\\linewidth", "\\linewidth", "current line width"],
  ["\\textwidth", "\\textwidth", "text block width"],
  ["\\begin", "\\begin{#}", "open an environment"],
  ["\\end", "\\end{#}", "close an environment"],
];

// Environments offered after `\begin{`. The body template is what makes this
// feel like Overleaf: picking `figure` should scaffold the whole float.
const ENVIRONMENTS: Array<[string, string, string]> = [
  ["itemize", "\n  \\item #\n", "bulleted list"],
  ["enumerate", "\n  \\item #\n", "numbered list"],
  ["description", "\n  \\item[#] \n", "labelled list"],
  ["equation", "\n  #\n", "numbered equation"],
  ["equation*", "\n  #\n", "unnumbered equation"],
  ["align", "\n  #\n", "aligned equations"],
  ["align*", "\n  #\n", "aligned equations, unnumbered"],
  ["gather", "\n  #\n", "gathered equations"],
  ["split", "\n  #\n", "split a long equation"],
  ["cases", "\n  #\n", "case distinction"],
  ["matrix", "\n  #\n", "matrix, no delimiters"],
  ["pmatrix", "\n  #\n", "matrix in parentheses"],
  ["bmatrix", "\n  #\n", "matrix in brackets"],
  ["figure", "[h]\n  \\centering\n  \\includegraphics[width=\\linewidth]{#}\n  \\caption{}\n  \\label{fig:}\n", "float for an image"],
  ["table", "[h]\n  \\centering\n  \\caption{#}\n  \\label{tab:}\n  \\begin{tabular}{cc}\n  \\end{tabular}\n", "float for a table"],
  ["tabular", "{cc}\n  # & \\\\\n", "table body"],
  ["abstract", "\n  #\n", "abstract"],
  ["quote", "\n  #\n", "short quotation"],
  ["quotation", "\n  #\n", "long quotation"],
  ["verbatim", "\n#\n", "literal text"],
  ["lstlisting", "\n#\n", "source code listing"],
  ["center", "\n  #\n", "centered block"],
  ["flushleft", "\n  #\n", "left-aligned block"],
  ["flushright", "\n  #\n", "right-aligned block"],
  ["theorem", "\n  #\n", "theorem"],
  ["lemma", "\n  #\n", "lemma"],
  ["proof", "\n  #\n", "proof"],
  ["definition", "\n  #\n", "definition"],
  ["thebibliography", "{9}\n  \\bibitem{#}\n", "manual bibliography"],
];

// Packages commonly reached for; suggested inside \usepackage{}.
const PACKAGES = [
  "amsmath", "amssymb", "amsthm", "graphicx", "hyperref", "geometry",
  "booktabs", "natbib", "biblatex", "xcolor", "listings", "algorithm",
  "algorithmic", "algpseudocode", "subcaption", "float", "caption",
  "multirow", "array", "enumitem", "fancyhdr", "setspace", "microtype",
  "tikz", "pgfplots", "url", "cleveref", "siunitx", "babel", "inputenc",
  "fontenc", "polyglossia", "fontspec", "csquotes", "todonotes", "lipsum",
];

/** Turn a "#"-marked template into a CodeMirror apply function. */
function templateApply(template: string) {
  const caret = template.indexOf("#");
  const text = template.replace("#", "");
  return (view: any, _c: Completion, from: number, to: number) => {
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + (caret === -1 ? text.length : caret) },
    });
  };
}

const COMMAND_OPTIONS: Completion[] = COMMANDS.map(([label, template, detail]) => ({
  label,
  detail,
  type: "keyword",
  apply: template.includes("#") ? templateApply(template) : template,
}));

/**
 * `\begin{foo}` should also write the matching `\end{foo}` — that pairing is
 * the whole reason to complete an environment rather than type it.
 */
function environmentApply(name: string, body: string) {
  return (view: any, _c: Completion, from: number, to: number) => {
    // `from` sits just after `\begin{`; swallow a `}` the editor auto-closed.
    const after = view.state.sliceDoc(to, to + 1);
    const end = after === "}" ? to + 1 : to;

    const lineStart = view.state.doc.lineAt(from).from;
    const indent = /^[ \t]*/.exec(view.state.sliceDoc(lineStart, from))![0];

    const caret = body.indexOf("#");
    const clean = body.replace("#", "");
    // Re-indent the body to match the `\begin` line. Every template ends in a
    // newline, so after this the last line is already `indent` — which is
    // exactly where `\end` belongs. Adding `indent` again would double it.
    const indented = clean.replace(/\n/g, `\n${indent}`);
    const head = `${name}}`;
    const insert = `${head}${indented}\\end{${name}}`;

    // Caret offset has to account for the re-indentation: every newline before
    // the marker grew by `indent.length` characters.
    let anchor: number;
    if (caret === -1) {
      anchor = from + head.length + indented.length;
    } else {
      const beforeCaret = clean.slice(0, caret);
      const newlines = (beforeCaret.match(/\n/g) ?? []).length;
      anchor =
        from + head.length + beforeCaret.length + newlines * indent.length;
    }

    view.dispatch({ changes: { from, to: end, insert }, selection: { anchor } });
  };
}

/** Collect `\label{...}` keys from the document, for \ref completion. */
function labelsIn(doc: string): string[] {
  return [...doc.matchAll(/\\label\{([^}]*)\}/g)].map((m) => m[1]).filter(Boolean);
}

/** Collect `\bibitem{...}` keys from the document, for \cite completion. */
function citeKeysIn(doc: string): string[] {
  return [...doc.matchAll(/\\bibitem(?:\[[^\]]*\])?\{([^}]*)\}/g)]
    .map((m) => m[1])
    .filter(Boolean);
}

function uniqueOptions(keys: string[], type: string, detail: string): Completion[] {
  return [...new Set(keys)].map((label) => ({ label, type, detail }));
}

export function latexCompletions(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos);
  const before = context.state.sliceDoc(line.from, context.pos);

  // Inside `\begin{` / `\end{` -> environment names.
  const envMatch = /\\(begin|end)\{([A-Za-z*]*)$/.exec(before);
  if (envMatch) {
    const isBegin = envMatch[1] === "begin";
    return {
      from: context.pos - envMatch[2].length,
      options: ENVIRONMENTS.map(([name, body, detail]) => ({
        label: name,
        detail,
        type: "class",
        apply: isBegin ? environmentApply(name, body) : name,
      })),
      validFor: /^[A-Za-z*]*$/,
    };
  }

  // Inside `\usepackage{` / `\RequirePackage{` -> package names.
  const pkgMatch =
    /\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\{([A-Za-z0-9,\-\s]*)$/.exec(before);
  if (pkgMatch) {
    // Support the comma-separated form: complete only the last entry. The class
    // allows whitespace so `{amsmath, geo` still matches; trimStart then keeps
    // the user's space instead of replacing it.
    const typed = pkgMatch[1].split(",").pop()!.trimStart();
    return {
      from: context.pos - typed.length,
      options: PACKAGES.map((label) => ({ label, type: "namespace", detail: "package" })),
      validFor: /^[A-Za-z0-9\-]*$/,
    };
  }

  // Inside a `\ref`-family brace -> labels defined in this document.
  const refMatch = /\\(?:eq|page|c|C|auto|name)?ref\*?\{([^}]*)$/.exec(before);
  if (refMatch) {
    const options = uniqueOptions(labelsIn(context.state.doc.toString()), "variable", "label");
    if (!options.length) return null;
    // `\cref` accepts a comma list, so replace only the final entry — otherwise
    // accepting an option deletes the keys already typed.
    const typed = refMatch[1].split(",").pop()!;
    return {
      from: context.pos - typed.trimStart().length,
      options,
      validFor: /^[^},]*$/,
    };
  }

  // Inside a `\cite`-family brace -> bibliography keys found in this document.
  const citeMatch = /\\(?:cite|citep|citet|citeauthor|citeyear|parencite|textcite)\*?(?:\[[^\]]*\])?\{([^}]*)$/.exec(before);
  if (citeMatch) {
    // trimStart so the conventional `{a, b}` spelling keeps its space.
    const typed = citeMatch[1].split(",").pop()!.trimStart();
    const options = uniqueOptions(citeKeysIn(context.state.doc.toString()), "variable", "bib key");
    if (!options.length) return null;
    return { from: context.pos - typed.length, options, validFor: /^[^},]*$/ };
  }

  // A backslash command. At least one letter is required: a bare `\` must not
  // open the panel, because `\\` is LaTeX's line break and the panel would
  // then steal the Enter that ends a `tabular` or `align` row — turning
  // "  a & b \\" + Enter into "  a & b \\section{}".
  const cmdMatch = /\\([A-Za-z@]+)$/.exec(before);
  if (cmdMatch) {
    return {
      from: context.pos - cmdMatch[1].length - 1,
      options: COMMAND_OPTIONS,
      validFor: /^\\[A-Za-z@]*$/,
    };
  }

  // Ctrl-Space asked for something explicitly, and this is the only source, so
  // offer the full command list rather than nothing.
  if (context.explicit) {
    const partial = /([A-Za-z@]*)$/.exec(before)![1];
    return {
      from: context.pos - partial.length,
      options: COMMAND_OPTIONS,
    };
  }

  return null;
}
