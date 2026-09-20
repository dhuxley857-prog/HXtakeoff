"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, LockKeyhole, Upload } from "lucide-react";
import PdfCanvas, {
  type BoqDraft,
  type PackManifest,
  type SourceDocument,
} from "./components/PdfCanvas";

const register: [string, string, string, BoqDraft["unit"]][] = [
  ["PRELIMS", "Project wide", "Preliminaries / general requirements", "item"],
  ["SUBSTRUCTURE", "Project wide", "Foundations / substructure", "m³"],
  ["GROUNDWORKS", "External / substructure", "Excavation and earthworks", "m³"],
  ["DPC", "Ground floor", "DPC / membranes / waterproofing", "m²"],
  ["GFLOOR", "Ground floor", "Ground-floor construction", "m²"],
  ["EXTWALL", "Elevations", "External wall construction", "m²"],
  ["BRICK", "Elevations", "Facing brickwork / masonry finishes", "m²"],
  ["INTWALL", "All floors", "Internal partitions / wall construction", "m²"],
  ["LINING", "All floors", "Wall linings / plasterboard", "m²"],
  ["ROOF", "Roof", "Roof structure and coverings", "m²"],
  ["INSUL", "Project wide", "Thermal / acoustic insulation", "m²"],
  ["WINDOW", "Elevations", "Windows", "nr"],
  ["EXTDOOR", "Elevations", "External doors", "nr"],
  ["INTDOOR", "All floors", "Internal doors / frames / ironmongery", "nr"],
  ["STAIR", "Internal", "Staircase / balustrades / handrails", "item"],
  ["FLOORFIN", "All rooms", "Floor finishes", "m²"],
  ["WALLFIN", "All rooms", "Wall finishes / decorations", "m²"],
  ["CEILING", "All rooms", "Ceilings / soffits / decorations", "m²"],
  ["SKIRT", "All rooms", "Skirtings / trims", "m"],
  ["JOINERY", "Internal", "Joinery / fitted items", "item"],
  ["KITCHEN", "Kitchen", "Kitchen fittings / worktops", "item"],
  ["SANITARY", "Bathrooms / WC", "Sanitaryware / bathroom fittings", "nr"],
  ["TILING", "Bathrooms / kitchen", "Wall and floor tiling", "m²"],
  ["PLUMB", "Project wide", "Plumbing / above-ground drainage", "item"],
  ["HEATING", "Project wide", "Heating installation", "item"],
  ["VENT", "Project wide", "Ventilation / extract", "item"],
  ["ELECT", "Project wide", "Electrical installation", "item"],
  ["LIGHT", "Project wide", "Lighting / accessories", "nr"],
  ["FIRE", "Project wide", "Fire stopping / protection", "item"],
  ["DRAIN", "External", "Below-ground drainage", "m"],
  ["EXTWORK", "External", "External works / paving / landscaping", "m²"],
  ["RAIN", "External / roof", "Rainwater goods", "m"],
  ["DECOR", "Project wide", "Decorations", "m²"],
];
const seed: BoqDraft[] = register.map(([id, room, item, unit]) => ({
  id: `T001-${id}`,
  page: 0,
  room,
  item,
  unit,
  qty: 0,
  scope:
    "Unmeasured until supported by coordinated drawing, schedule or specification evidence.",
  evidence: "TEST 001 · evidence pending · no quantity assumed",
  status: "UNMEASURED",
}));
type Baseline = {
  boq: Record<string, { qty: number; scope: string; evidence: string }>;
  manifest: PackManifest | null;
  gifa: Record<string, number>;
};
const nrmElements = [
  "Facilitating works",
  "Substructure",
  "Superstructure",
  "Internal finishes",
  "Fittings, furnishings and equipment",
  "Services",
  "External works",
  "Main contractor preliminaries",
  "Overheads and profit",
  "Risk allowances",
  "Inflation",
];

export default function Home() {
  const [view, setView] = useState<"drawing" | "boq" | "nrm" | "revision">(
      "drawing",
    ),
    [boq, setBoq] = useState<BoqDraft[]>(seed),
    [sources, setSources] = useState<SourceDocument[]>([
      {
        name: "DH415BB-3 Construction Drawing Pack",
        url: "/api/test001",
        revision: "Construction Issue",
      },
    ]);
  const [manifest, setManifest] = useState<PackManifest | null>(null),
    [revision, setRevision] = useState(1),
    [lockedRev, setLockedRev] = useState<number | null>(null),
    [baseline, setBaseline] = useState<Baseline | null>(null),
    [focusMarkup, setFocusMarkup] = useState(""),
    [approved, setApproved] = useState<Record<string, boolean>>({}),
    [search, setSearch] = useState(""),
    [changesOnly, setChangesOnly] = useState(false),
    [gifaByFloor, setGifaByFloor] = useState<Record<string, number>>({}),
    [rates, setRates] = useState<Record<string, number>>({});
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("hx-takeoff-test001");
      if (saved) {
        const state = JSON.parse(saved);
        if (Array.isArray(state.boq)) setBoq(state.boq);
        if (Number.isFinite(state.revision)) setRevision(state.revision);
        if (state.lockedRev === null || Number.isFinite(state.lockedRev))
          setLockedRev(state.lockedRev);
        if (state.baseline) setBaseline(state.baseline);
        if (state.gifaByFloor) setGifaByFloor(state.gifaByFloor);
        if (state.approved) setApproved(state.approved);
        if (state.rates) setRates(state.rates);
      }
    } catch {
      // A corrupt local checkpoint must never create or alter quantities.
    } finally {
      setHydrated(true);
    }
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(
      "hx-takeoff-test001",
      JSON.stringify({
        boq,
        revision,
        lockedRev,
        baseline,
        gifaByFloor,
        approved,
        rates,
      }),
    );
  }, [
    hydrated,
    boq,
    revision,
    lockedRev,
    baseline,
    gifaByFloor,
    approved,
    rates,
  ]);
  const mergeBoq = (row: BoqDraft) =>
    setBoq((v) =>
      [
        ...v.filter(
          (x) =>
            x.id !== row.id &&
            !(
              x.qty === 0 &&
              x.item
                .toLowerCase()
                .includes(row.item.split(" /")[0].toLowerCase())
            ),
        ),
        row,
      ].sort(
        (a, b) =>
          a.page - b.page ||
          a.room.localeCompare(b.room) ||
          a.item.localeCompare(b.item),
      ),
    );
  const handleManifest = (next: PackManifest) => {
    setManifest(next);
    const windows = next.openingRows.filter((r) => r.kind === "window"),
      doors = next.openingRows.filter((r) => r.kind === "door"),
      scheduled = new Set(next.openingRows.map((r) => r.tag)),
      planDoorTags = Array.from(
        new Set(
          next.documents.flatMap((d) =>
            d.sheets
              .filter((s) => s.kind === "PLAN")
              .flatMap((s) =>
                s.openingRefs.filter((tag) => tag.startsWith("D")),
              ),
          ),
        ),
      ),
      externalCandidates = planDoorTags.filter((tag) => !scheduled.has(tag));
    if (windows.length)
      mergeBoq({
        id: "PACK-WINDOW-SCHEDULE",
        page: windows[0].page,
        room: "All elevations",
        item: "Windows coordinated to window schedule",
        unit: "nr",
        qty: windows.length,
        scope: `${windows.length} unique scheduled window types/instances indexed with opening sizes and room associations.`,
        sourcePages: [...new Set(windows.map((r) => r.page))],
        evidence: `P${String(windows[0].page).padStart(2, "0")}-S01 · ${windows[0].document || "Schedule"} P${windows[0].page} · window schedule rows ${windows.map((r) => `${r.tag} → ${r.room}`).join(", ")}`,
        markupRef: `P${String(windows[0].page).padStart(2, "0")}-S01`,
        status: "REVIEW",
      });
    if (doors.length)
      mergeBoq({
        id: "PACK-INTERNAL-DOOR-SCHEDULE",
        page: doors[0].page,
        room: "All rooms",
        item: "Internal doors coordinated to door schedule",
        unit: "nr",
        qty: doors.length,
        scope: `${doors.length} scheduled doors indexed with leaf widths, room and wall type.`,
        sourcePages: [...new Set(doors.map((r) => r.page))],
        evidence: `P${String(doors[0].page).padStart(2, "0")}-S02 · ${doors[0].document || "Schedule"} P${doors[0].page} · door schedule rows ${doors.map((r) => `${r.tag} → ${r.room}`).join(", ")}`,
        markupRef: `P${String(doors[0].page).padStart(2, "0")}-S02`,
        status: "REVIEW",
      });
    if (externalCandidates.length)
      mergeBoq({
        id: "PACK-EXTERNAL-DOOR-TAGS",
        page: 3,
        room: "External envelope",
        item: "External door tags requiring elevation reconciliation",
        unit: "nr",
        qty: externalCandidates.length,
        scope:
          "Explicit plan door tags not present in the internal door schedule; retain for elevation and external-door schedule review.",
        evidence: `P03-S03 · plan tag index ${externalCandidates.join(", ")} · schedule exception`,
        markupRef: "P03-S03",
        status: "REVIEW",
      });
  };
  const changed = (row: BoqDraft) => {
    const b = baseline?.boq[row.id];
    return (
      !!baseline &&
      (!b ||
        Math.abs(b.qty - row.qty) > 0.005 ||
        b.scope !== row.scope ||
        b.evidence !== row.evidence)
    );
  };
  const docChanges = useMemo(() => {
    if (!baseline?.manifest || !manifest) return [];
    const old = new Map(baseline.manifest.documents.map((d) => [d.name, d])),
      now = new Map(manifest.documents.map((d) => [d.name, d])),
      names = new Set([...old.keys(), ...now.keys()]);
    return [...names].flatMap((name) => {
      const a = old.get(name),
        b = now.get(name);
      if (!a)
        return [{ name, state: "ADDED", detail: `${b?.pages || 0} pages` }];
      if (!b)
        return [{ name, state: "REMOVED", detail: `was ${a.pages} pages` }];
      if (a.fingerprint !== b.fingerprint || a.pages !== b.pages) {
        const oldSheets = new Map(a.sheets.map((s) => [s.page, s])),
          newSheets = new Map(b.sheets.map((s) => [s.page, s])),
          pages = new Set([...oldSheets.keys(), ...newSheets.keys()]),
          sheetChanges = [...pages].flatMap((page) => {
            const before = oldSheets.get(page),
              after = newSheets.get(page);
            if (!before) return [`P${page} added`];
            if (!after) return [`P${page} removed`];
            const kinds: string[] = [];
            if (before.fingerprint !== after.fingerprint)
              kinds.push("drawing/text");
            if (before.dimensions.join(",") !== after.dimensions.join(","))
              kinds.push("dimensions");
            if (before.openingRefs.join(",") !== after.openingRefs.join(","))
              kinds.push("door/window schedule refs");
            if (before.clauseFingerprint !== after.clauseFingerprint)
              kinds.push("specification clauses");
            return kinds.length ? [`P${page}: ${kinds.join(", ")}`] : [];
          });
        return [
          {
            name,
            state: "CHANGED",
            detail:
              sheetChanges.slice(0, 8).join(" · ") ||
              `${a.pages} → ${b.pages} pages`,
          },
        ];
      }
      return [];
    });
  }, [baseline, manifest]);
  const measured = boq.filter((r) => r.qty > 0),
    unmeasured = boq.filter((r) => !r.qty),
    gifa = Object.values(gifaByFloor).reduce((a, b) => a + b, 0),
    approvedCount = Object.values(approved).filter(Boolean).length;
  const ref = (r: BoqDraft) =>
    r.markupRef || r.evidence.match(/\bP\d{2}-[A-Z]\d{2}\b/)?.[0] || "";
  const lock = () => {
    setLockedRev(revision);
    setBaseline({
      boq: Object.fromEntries(
        boq.map((r) => [
          r.id,
          { qty: r.qty, scope: r.scope, evidence: r.evidence },
        ]),
      ),
      manifest,
      gifa: { ...gifaByFloor },
    });
  };
  const newRevision = () => {
    if (!lockedRev) return;
    setRevision((v) => v + 1);
    setApproved({});
    setView("revision");
  };
  const upload = (files: File[]) => {
    sources
      .filter((s) => s.url.startsWith("blob:"))
      .forEach((s) => URL.revokeObjectURL(s.url));
    setSources(
      files.map((f) => ({
        name: f.name,
        url: URL.createObjectURL(f),
        revision: `Rev ${revision}`,
      })),
    );
    setManifest(null);
    setView("drawing");
  };
  const exportBoq = () => {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`,
      rows = [
        [
          "Ref",
          "Markup",
          "Location",
          "Description",
          "Scope",
          "Qty",
          "Unit",
          "Evidence",
          "Status",
        ],
        ...boq.map((r, i) => [
          String(i + 1).padStart(3, "0"),
          ref(r),
          r.room,
          r.item,
          r.scope,
          r.qty || "",
          r.unit,
          r.evidence,
          approved[r.id] ? "APPROVED" : r.status,
        ]),
      ],
      blob = new Blob([rows.map((row) => row.map(esc).join(",")).join("\n")], {
        type: "text/csv",
      }),
      a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `HX-Takeoff-Test-001-Rev-${revision}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const elementRows = nrmElements.map((name) => {
    const rows = boq.filter((r) => {
      const t = r.item.toLowerCase();
      if (name === "Substructure")
        return /(foundation|substructure|excavat|ground-floor|membrane)/.test(
          t,
        );
      if (name === "Superstructure")
        return /(external wall|partition|roof|window|door|stair|insulation)/.test(
          t,
        );
      if (name === "Internal finishes")
        return /(finish|ceiling|skirting|decor|lining|tiling)/.test(t);
      if (name === "Services")
        return /(plumb|heating|vent|elect|light|fire|drain|rainwater)/.test(t);
      if (name === "External works")
        return /external works|paving|landscap/.test(t);
      return false;
    });
    const quantity = rows.reduce((a, r) => a + r.qty, 0),
      rate = rates[name] || 0;
    return { name, rows, quantity, rate, cost: quantity * rate };
  });
  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand">
          <i>HX</i>
          <span>TAKEOFF</span>
        </div>
        <div>
          <strong>TEST 001</strong>
          <span>DH415BB-3 · coordinated construction take-off</span>
        </div>
        <em>DH</em>
      </header>
      <div className="revision-bar">
        <strong>REV {revision}</strong>
        {lockedRev === revision ? (
          <span className="lock-state">
            <LockKeyhole size={14} /> LOCKED BASELINE
          </span>
        ) : (
          <button onClick={lock}>
            <LockKeyhole size={14} /> LOCK REV {revision}
          </button>
        )}
        <button onClick={newRevision} disabled={!lockedRev}>
          ＋ NEW REVISION PACK
        </button>
        <span>
          {measured.length} measured · {unmeasured.length} unresolved ·{" "}
          {approvedCount} approved
        </span>
      </div>
      <nav className="app-nav">
        {(["drawing", "boq", "nrm", "revision"] as const).map((x) => (
          <button
            key={x}
            onClick={() => setView(x)}
            className={view === x ? "active" : ""}
          >
            {x === "nrm" ? "NRM1 COST PLAN" : x.toUpperCase()}
          </button>
        ))}
      </nav>
      {view === "drawing" && (
        <section className="workspace-layout">
          <aside className="pack-panel">
            <h3>INFORMATION PACK</h3>
            <button
              className="primary"
              onClick={() => {
                setSources([
                  {
                    name: "DH415BB-3 Construction Drawing Pack",
                    url: "/api/test001",
                    revision: "Construction Issue",
                  },
                ]);
                setManifest(null);
              }}
            >
              LOAD TEST 001
            </button>
            <label className="file-drop">
              <Upload size={18} />
              <span>Drop or select the complete pack</span>
              <small>
                Plans, elevations, details, schedules and specification PDFs are
                indexed together.
              </small>
              <input
                type="file"
                accept="application/pdf"
                multiple
                onChange={(e) => upload(Array.from(e.target.files || []))}
              />
            </label>
            <div className="pack-list">
              {sources.map((s) => (
                <div key={s.name}>
                  <FileText size={15} />
                  <span>
                    {s.name}
                    <small>{s.revision}</small>
                  </span>
                </div>
              ))}
            </div>
            <h3>PACK STATUS</h3>
            <dl>
              <div>
                <dt>Documents</dt>
                <dd>{sources.length}</dd>
              </div>
              <div>
                <dt>Indexed openings</dt>
                <dd>{manifest?.openingRows.length || 0}</dd>
              </div>
              <div>
                <dt>Measured lines</dt>
                <dd>{measured.length}</dd>
              </div>
              <div>
                <dt>GIFA</dt>
                <dd>{gifa ? `${gifa.toFixed(2)} m²` : "Unmeasured"}</dd>
              </div>
            </dl>
            <p className="guardrail">
              HX records a quantity only where geometry and calibration evidence
              are retained. Unsupported work stays explicitly unmeasured.
            </p>
          </aside>
          <div className="drawing-panel">
            <PdfCanvas
              sources={sources}
              onBoq={mergeBoq}
              onManifest={handleManifest}
              onGifa={(floor, area) =>
                setGifaByFloor((v) => ({ ...v, [floor]: area }))
              }
              focusMarkup={focusMarkup}
              readOnly={lockedRev === revision}
            />
          </div>
          <aside className="review-panel">
            <div className="review-panel-head">
              <h3>LIVE BOQ REVIEW</h3>
              <button onClick={() => setView("boq")}>OPEN FULL BOQ</button>
            </div>
            <p>
              Select a measured line to return to its drawing evidence. Approve
              only after reviewing the retained markup.
            </p>
            {measured.length ? (
              measured
                .slice(-12)
                .reverse()
                .map((row) => (
                  <article
                    key={row.id}
                    className={
                      changed(row) ? "review-card changed" : "review-card"
                    }
                  >
                    <button
                      className="link-button"
                      onClick={() => setFocusMarkup(ref(row))}
                    >
                      {ref(row) || `P${row.page}`}
                    </button>
                    <strong>{row.item}</strong>
                    <span>{row.room}</span>
                    <b>
                      {row.qty.toFixed(2)} {row.unit}
                    </b>
                    <button
                      className="approve"
                      onClick={() =>
                        setApproved((v) => ({ ...v, [row.id]: !v[row.id] }))
                      }
                    >
                      {approved[row.id] ? "APPROVED ✓" : "APPROVE LINE"}
                    </button>
                  </article>
                ))
            ) : (
              <div className="empty-review">
                No measured lines yet. Select a room label or choose a take-off
                tool on the drawing.
              </div>
            )}
          </aside>
        </section>
      )}
      {view === "boq" && (
        <section className="table-page">
          <div className="section-head">
            <div>
              <h2>Evidence-linked BOQ</h2>
              <p>
                Every measured line opens its retained drawing markup. Zero
                quantities are unresolved, not estimates.
              </p>
            </div>
            <div>
              <button onClick={() => setChangesOnly((v) => !v)}>
                {changesOnly ? "SHOW ALL" : "CHANGES ONLY"}
              </button>
              <button onClick={exportBoq}>EXPORT CSV</button>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter room, item or scope"
              />
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {[
                    "Ref",
                    "Markup",
                    "Location",
                    "Description",
                    "Scope / coordination",
                    "Qty",
                    "Unit",
                    "Evidence",
                    "Status",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {boq
                  .filter(
                    (r) =>
                      (!changesOnly || changed(r)) &&
                      (!search ||
                        `${r.room} ${r.item} ${r.scope}`
                          .toLowerCase()
                          .includes(search.toLowerCase())),
                  )
                  .map((r, i) => (
                    <tr key={r.id} className={changed(r) ? "changed" : ""}>
                      <td>{String(i + 1).padStart(3, "0")}</td>
                      <td>
                        {ref(r) ? (
                          <button
                            className="link-button"
                            onClick={() => {
                              setFocusMarkup(ref(r));
                              setView("drawing");
                            }}
                          >
                            {ref(r)}
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{r.room}</td>
                      <td>
                        <strong>{r.item}</strong>
                        {changed(r) && (
                          <small>REVISION CHANGE · review required</small>
                        )}
                      </td>
                      <td>{r.scope}</td>
                      <td className="number">
                        {r.qty ? r.qty.toFixed(2) : "—"}
                      </td>
                      <td>{r.unit}</td>
                      <td>{r.evidence}</td>
                      <td>
                        <span
                          className={`status ${approved[r.id] ? "approved" : r.qty ? "review" : "unmeasured"}`}
                        >
                          {approved[r.id]
                            ? "APPROVED"
                            : r.qty
                              ? "REVIEW"
                              : "UNMEASURED"}
                        </span>
                        {r.qty > 0 && (
                          <button
                            className="approve"
                            onClick={() =>
                              setApproved((v) => ({ ...v, [r.id]: !v[r.id] }))
                            }
                          >
                            {approved[r.id] ? "Undo" : "Approve"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {view === "nrm" && (
        <section className="table-page">
          <div className="section-head">
            <div>
              <h2>NRM1 elemental cost plan</h2>
              <p>GIFA is sourced only from reviewed external-face polygons.</p>
            </div>
            <strong className="gifa-total">
              GIFA {gifa ? `${gifa.toFixed(2)} m²` : "UNMEASURED"}
            </strong>
          </div>
          <div className="gifa-grid">
            {Object.entries(gifaByFloor).map(([floor, area]) => (
              <div key={floor}>
                <span>{floor}</span>
                <strong>{area.toFixed(2)} m²</strong>
              </div>
            ))}
          </div>
          <table>
            <thead>
              <tr>
                {[
                  "NRM1 element",
                  "Evidence-linked BOQ lines",
                  "Quantity",
                  "Rate",
                  "Cost",
                  "£/m² GIFA",
                  "Status",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {elementRows.map((x) => (
                <tr key={x.name}>
                  <td>
                    <strong>{x.name}</strong>
                  </td>
                  <td>{x.rows.length || "—"}</td>
                  <td>{x.quantity ? x.quantity.toFixed(2) : "—"}</td>
                  <td>
                    <input
                      type="number"
                      value={x.rate || ""}
                      onChange={(e) =>
                        setRates((v) => ({
                          ...v,
                          [x.name]: Number(e.target.value),
                        }))
                      }
                      placeholder="£ rate"
                    />
                  </td>
                  <td>
                    {x.cost
                      ? `£${x.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                      : "—"}
                  </td>
                  <td>
                    {x.cost && gifa ? `£${(x.cost / gifa).toFixed(2)}` : "—"}
                  </td>
                  <td>
                    <span
                      className={`status ${x.quantity && x.rate ? "approved" : "unmeasured"}`}
                    >
                      {x.quantity && x.rate ? "COSTED" : "UNRESOLVED"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {view === "revision" && (
        <section className="revision-page">
          <div className="section-head">
            <div>
              <h2>Revision comparison</h2>
              <p>
                Document, geometry, scope, evidence and quantity changes remain
                review-controlled.
              </p>
            </div>
            <strong>
              {baseline
                ? `REV ${lockedRev} → REV ${revision}`
                : "NO LOCKED BASELINE"}
            </strong>
          </div>
          <div className="revision-columns">
            <article>
              <h3>DOCUMENT CHANGES</h3>
              {docChanges.length ? (
                docChanges.map((x) => (
                  <div className="change-card" key={x.name}>
                    <span>{x.state}</span>
                    <strong>{x.name}</strong>
                    <p>{x.detail}</p>
                  </div>
                ))
              ) : (
                <p>No document-level differences detected.</p>
              )}
            </article>
            <article>
              <h3>AFFECTED BOQ LINES</h3>
              {boq.filter(changed).length ? (
                boq.filter(changed).map((r) => (
                  <button
                    className="change-card"
                    key={r.id}
                    onClick={() => {
                      setSearch(r.item);
                      setChangesOnly(true);
                      setView("boq");
                    }}
                  >
                    <span>REVIEW</span>
                    <strong>
                      {r.room} · {r.item}
                    </strong>
                    <p>
                      {baseline?.boq[r.id]
                        ? `${baseline.boq[r.id].qty || "unmeasured"} → ${r.qty || "unmeasured"} ${r.unit}`
                        : "New evidence-linked line"}
                    </p>
                  </button>
                ))
              ) : (
                <p>No affected BOQ lines detected.</p>
              )}
            </article>
          </div>
        </section>
      )}
    </main>
  );
}
