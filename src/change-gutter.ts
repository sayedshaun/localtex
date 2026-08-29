import { gutter, GutterMarker, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { StateEffect, StateField, RangeSetBuilder, RangeSet } from "@codemirror/state";

export type ChangeKind = "added" | "modified" | "deleted";

/** One contiguous run of changed lines, in current-document line numbers. */
export type ChangedRange = {
  /** 1-based first line of the run. */
  fromLine: number;
  /** 1-based last line of the run (== fromLine for a deletion marker). */
  toLine: number;
  kind: ChangeKind;
};

/** Push a fresh baseline (the file's contents at HEAD) into the editor. */
export const setBaseline = StateEffect.define<string | null>();

/** Internal: publish a freshly computed diff. Dispatched off the hot path. */
const setRanges = StateEffect.define<ChangedRange[]>();

const baselineField = StateField.define<string | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setBaseline)) return e.value;
    return value;
  },
});

const rangesField = StateField.define<ChangedRange[]>({
  create: () => [],
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setRanges)) return e.value;
    // Deliberately not remapped through tr.changes: the ranges are line
    // numbers, and a recompute is already scheduled. They stay as-is for a
    // frame or two, which is invisible, and are clamped at render time.
    return value;
  },
});

/**
 * CodeMirror splits documents on this set, so the baseline has to be split the
 * same way. Using a plain "\n" leaves a trailing "\r" on every line of a
 * CRLF-committed file, which makes an unmodified file look entirely rewritten.
 */
const LINE_BREAK = /\r\n?|\n|\u2028|\u2029/;

function splitLines(text: string): string[] {
  // "" means an empty file: zero lines, not one empty line. Treating it as
  // [""] makes every line of a file that is empty at HEAD read as "modified"
  // instead of "added".
  if (text === "") return [];
  return text.split(LINE_BREAK);
}

/**
 * Above this many LCS cells we stop computing an exact diff and fall back to
 * marking the whole changed span. 4M cells is a 16MB Int32Array and a few tens
 * of milliseconds — and since the diff runs debounced and off the keystroke
 * path, that is only ever a background cost.
 */
const LCS_CELL_BUDGET = 4_000_000;

/**
 * Line diff against the baseline. Trims the common prefix/suffix first, then
 * runs LCS over what's left.
 *
 * The trim is what makes the common case free, but it only helps when every
 * difference is contiguous: with two edits at opposite ends of the file — the
 * normal state of a file being edited against HEAD — the "middle" is the whole
 * document. That case is why the cell budget and the debounce exist.
 */
function diffLines(before: string[], after: string[]): ChangedRange[] {
  const n = before.length;
  const m = after.length;

  let start = 0;
  while (start < n && start < m && before[start] === after[start]) start++;
  let endB = n;
  let endA = m;
  while (endB > start && endA > start && before[endB - 1] === after[endA - 1]) {
    endB--;
    endA--;
  }

  const bLen = endB - start;
  const aLen = endA - start;
  if (bLen === 0 && aLen === 0) return [];

  // Beyond the budget, fall back to a linear content-presence heuristic rather
  // than an exact diff. Marking the whole span instead would paint an entire
  // large file blue, which tells the user nothing.
  if (bLen * aLen > LCS_CELL_BUDGET) {
    return presenceDiff(before, after, start, endB, endA);
  }

  const b = before.slice(start, endB);
  const a = after.slice(start, endA);

  // Flat Int32Array rather than number[][]: one allocation of unboxed ints
  // instead of (bLen+1) arrays of boxed doubles, which was the memory driver.
  const width = aLen + 1;
  const lcs = new Int32Array((bLen + 1) * width);
  for (let i = bLen - 1; i >= 0; i--) {
    const row = i * width;
    const nextRow = row + width;
    for (let j = aLen - 1; j >= 0; j--) {
      lcs[row + j] =
        b[i] === a[j]
          ? lcs[nextRow + j + 1] + 1
          : Math.max(lcs[nextRow + j], lcs[row + j + 1]);
    }
  }

  type Op = { type: "same" | "add" | "del"; line: number };
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < bLen && j < aLen) {
    if (b[i] === a[j]) {
      ops.push({ type: "same", line: start + j });
      i++;
      j++;
    } else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) {
      ops.push({ type: "del", line: start + j });
      i++;
    } else {
      ops.push({ type: "add", line: start + j });
      j++;
    }
  }
  while (i < bLen) {
    ops.push({ type: "del", line: start + j });
    i++;
  }
  while (j < aLen) {
    ops.push({ type: "add", line: start + j });
    j++;
  }

  // Collapse runs: an add run touching a del run is a modification, which is
  // what makes the gutter read the way VS Code's does.
  const ranges: ChangedRange[] = [];
  let k = 0;
  while (k < ops.length) {
    if (ops[k].type === "same") {
      k++;
      continue;
    }
    const runStart = k;
    let hasAdd = false;
    let hasDel = false;
    while (k < ops.length && ops[k].type !== "same") {
      if (ops[k].type === "add") hasAdd = true;
      else hasDel = true;
      k++;
    }
    const adds = ops.slice(runStart, k).filter((o) => o.type === "add");
    const kind: ChangeKind = hasAdd && hasDel ? "modified" : hasAdd ? "added" : "deleted";

    if (kind === "deleted") {
      // Nothing remains on screen; mark the line the deletion sits before.
      const at = Math.min(ops[runStart].line, Math.max(0, m - 1));
      const line = at + 1;
      // Trailing deletions all clamp onto the last line, so a second run can
      // land on a line an earlier one already claimed. Merging keeps the
      // gutter from drawing two wedges in the same 3px slot.
      const last = ranges[ranges.length - 1];
      if (last && last.kind === "deleted" && last.fromLine === line) continue;
      ranges.push({ fromLine: line, toLine: line, kind });
    } else {
      ranges.push({
        fromLine: adds[0].line + 1,
        toLine: adds[adds.length - 1].line + 1,
        kind,
      });
    }
  }
  return ranges;
}

/**
 * O(n+m) fallback: a line that appears nowhere in the baseline is new, so mark
 * it. Imperfect for moved or duplicated lines — it can't tell an insertion from
 * a relocation — but it gives useful per-line marks on documents too large to
 * diff exactly, instead of a single blanket range.
 */
function presenceDiff(
  before: string[],
  after: string[],
  start: number,
  endB: number,
  endA: number,
): ChangedRange[] {
  const baselineLines = new Set<string>();
  for (let i = start; i < endB; i++) baselineLines.add(before[i]);

  const ranges: ChangedRange[] = [];
  let runStart = -1;
  for (let j = start; j < endA; j++) {
    const isNew = !baselineLines.has(after[j]);
    if (isNew && runStart === -1) runStart = j;
    if (!isNew && runStart !== -1) {
      ranges.push({ fromLine: runStart + 1, toLine: j, kind: "modified" });
      runStart = -1;
    }
  }
  if (runStart !== -1) {
    ranges.push({ fromLine: runStart + 1, toLine: endA, kind: "modified" });
  }

  // Pure deletion inside the span leaves nothing to mark; flag where it was.
  if (!ranges.length && endB > endA) {
    const at = Math.min(start, Math.max(0, after.length - 1));
    ranges.push({ fromLine: at + 1, toLine: at + 1, kind: "deleted" });
  }
  return ranges;
}

class ChangeMarker extends GutterMarker {
  constructor(readonly kind: ChangeKind) {
    super();
  }
  eq(other: ChangeMarker) {
    return other.kind === this.kind;
  }
  toDOM() {
    const el = document.createElement("div");
    el.className = `cm-change-marker cm-change-${this.kind}`;
    el.title =
      this.kind === "added"
        ? "Added since last commit"
        : this.kind === "modified"
          ? "Modified since last commit"
          : "Lines deleted here since last commit";
    return el;
  }
}

const MARKERS: Record<ChangeKind, ChangeMarker> = {
  added: new ChangeMarker("added"),
  modified: new ChangeMarker("modified"),
  deleted: new ChangeMarker("deleted"),
};

/** Build the gutter's marker set from the published ranges, clamped to the doc. */
function markersFor(view: EditorView): RangeSet<ChangeMarker> {
  const ranges = view.state.field(rangesField);
  if (!ranges.length) return RangeSet.empty;
  const doc = view.state.doc;
  const builder = new RangeSetBuilder<ChangeMarker>();
  let lastPos = -1;
  for (const r of ranges) {
    for (let line = r.fromLine; line <= r.toLine; line++) {
      if (line < 1 || line > doc.lines) continue;
      const pos = doc.line(line).from;
      // Ranges arrive sorted; skip any duplicate position so the builder never
      // sees the same point twice.
      if (pos <= lastPos) continue;
      builder.add(pos, pos, MARKERS[r.kind]);
      lastPos = pos;
    }
  }
  return builder.finish();
}

/**
 * Recomputes the diff off the keystroke path. Computing inside a StateField
 * meant every keypress paid a full LCS synchronously — ~120ms on a 3000-line
 * file once two edits were far enough apart to defeat the prefix/suffix trim.
 * Here typing only schedules work, and rapid typing coalesces into one run.
 */
const RECOMPUTE_DELAY = 200;

const diffComputer = ViewPlugin.fromClass(
  class {
    private timer: number | undefined;
    private idle: number | undefined;

    constructor(readonly view: EditorView) {
      this.schedule();
    }

    update(update: ViewUpdate) {
      const baselineChanged = update.transactions.some((tr) =>
        tr.effects.some((e) => e.is(setBaseline)),
      );
      if (update.docChanged || baselineChanged) this.schedule();
    }

    schedule() {
      this.cancel();
      this.timer = window.setTimeout(() => {
        this.timer = undefined;
        const run = () => {
          this.idle = undefined;
          this.compute();
        };
        // Yield to anything more urgent when the browser offers idle time.
        const ric = (window as unknown as {
          requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
        }).requestIdleCallback;
        if (ric) this.idle = ric(run, { timeout: 500 });
        else run();
      }, RECOMPUTE_DELAY);
    }

    compute() {
      const state = this.view.state;
      const baseline = state.field(baselineField);
      const next = baseline == null
        ? []
        : diffLines(splitLines(baseline), splitLines(state.doc.toString()));
      const current = state.field(rangesField);
      if (sameRanges(current, next)) return;
      this.view.dispatch({ effects: setRanges.of(next) });
    }

    cancel() {
      if (this.timer !== undefined) {
        window.clearTimeout(this.timer);
        this.timer = undefined;
      }
      if (this.idle !== undefined) {
        (window as unknown as { cancelIdleCallback?: (h: number) => void })
          .cancelIdleCallback?.(this.idle);
        this.idle = undefined;
      }
    }

    destroy() {
      this.cancel();
    }
  },
);

function sameRanges(a: ChangedRange[], b: ChangedRange[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].fromLine !== b[i].fromLine ||
      a[i].toLine !== b[i].toLine ||
      a[i].kind !== b[i].kind
    ) {
      return false;
    }
  }
  return true;
}

const changeGutterTheme = EditorView.baseTheme({
  ".cm-changeGutter": {
    width: "3px",
    padding: "0",
    marginLeft: "2px",
  },
  ".cm-change-marker": {
    width: "3px",
    height: "100%",
    borderRadius: "1px",
  },
  ".cm-change-added": { background: "#4a9c5d" },
  ".cm-change-modified": { background: "#3d7eff" },
  // A deletion has no lines left to colour, so it reads as a wedge.
  ".cm-change-deleted": {
    background: "transparent",
    borderTop: "3px solid transparent",
    borderBottom: "3px solid transparent",
    borderLeft: "4px solid #c96a6a",
    height: "0",
    borderRadius: "0",
  },
});

/** Gutter showing what changed since HEAD, like VS Code's dirty diff bar. */
export function changeGutter() {
  return [
    baselineField,
    rangesField,
    diffComputer,
    gutter({
      class: "cm-changeGutter",
      markers: markersFor,
      initialSpacer: () => MARKERS.modified,
    }),
    changeGutterTheme,
  ];
}

/** Exported for tests. */
export const __test = { diffLines, splitLines };
