/* Shared data handling, also exercised by the offline tests. */
(function (scope) {
  "use strict";
  function normalize(payload) {
    const rows = Array.isArray(payload) ? payload :
      [payload?.structograms, payload?.items, payload?.data].find(Array.isArray);
    if (!rows) throw new Error("Az API válaszának formátuma nem támogatott (nem mentéslista).");
    const seen = new Set();
    return rows.filter(row => {
      if (!row || typeof row.uuid !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(row.uuid) || seen.has(row.uuid)) return false;
      seen.add(row.uuid);
      return true;
    }).map(row => ({...row, id: row.id == null ? row.uuid : String(row.id),
      prev_id: row.prev_id == null ? null : String(row.prev_id)}));
  }
  function title(row) {
    if (typeof row.name === "string" && row.name.trim()) return row.name.trim();
    let data = row.data;
    if (typeof data === "string") { try { data = JSON.parse(data); } catch { data = null; } }
    const names = Array.isArray(data?.structograms) ? data.structograms.map(item => item?.name).filter(value => typeof value === "string" && value.trim()) : [];
    return names?.join(" · ") || "Main";
  }
  function groups(rows) {
    const byId = new Map(rows.map(row => [row.id, row]));
    const referenced = new Set(rows.map(row => row.prev_id).filter(Boolean));
    const covered = new Set();
    const result = [];
    function add(tip) {
      const versions = [], chain = new Set();
      for (let row = tip; row && !chain.has(row.id); row = byId.get(row.prev_id)) {
        chain.add(row.id); covered.add(row.id); versions.push(row);
      }
      result.push({tip, versions});
    }
    rows.filter(row => !referenced.has(row.id)).forEach(add);
    rows.filter(row => !covered.has(row.id)).forEach(row => { if (!covered.has(row.id)) add(row); });
    return result.sort((a,b) => (Date.parse(b.tip.created_at) || 0) - (Date.parse(a.tip.created_at) || 0));
  }
  function link(row) { return "https://progalap.elte.hu/stuki/?uuid=" + encodeURIComponent(row.uuid); }
  const api = {normalize, title, groups, link};
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else scope.StukiHistoryModel = api;
})(globalThis);
