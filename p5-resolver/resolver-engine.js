/* ============================================================================
 * Official ICPC Bottom-Up Resolver State Machine + Exam 3 69-Team Demo Simulator
 * 100% Compatible with XCPCIO /resolver-data/:id/{config,team,run}.json
 * ============================================================================ */

const NON_PENALTY_STATUSES = new Set([
  "compilation_error",
  "compile_error",
  "system_error",
  "pending",
  "undefined",
  "frozen",
]);

function isAcceptedStatus(st) {
  const s = String(st || "").toLowerCase();
  return s === "correct" || s === "accepted" || s === "ac";
}

function isNonPenaltyStatus(st) {
  return NON_PENALTY_STATUSES.has(String(st || "").toLowerCase());
}

const DEFAULT_BALLOONS = [
  { background_color: "rgba(211, 47, 47, 0.9)", color: "#fff" },
  { background_color: "rgba(244, 143, 177, 0.9)", color: "#000" },
  { background_color: "rgba(255, 255, 255, 0.95)", color: "#000" },
  { background_color: "rgba(46, 175, 70, 0.9)", color: "#fff" },
  { background_color: "rgba(245, 215, 20, 0.95)", color: "#000" },
  { background_color: "rgba(245, 110, 24, 0.9)", color: "#fff" },
  { background_color: "rgba(21, 101, 192, 0.9)", color: "#fff" },
  { background_color: "rgba(144, 164, 174, 0.9)", color: "#000" },
  { background_color: "rgba(0, 150, 136, 0.9)", color: "#fff" },
  { background_color: "rgba(156, 39, 176, 0.9)", color: "#fff" },
  { background_color: "rgba(0, 188, 212, 0.9)", color: "#000" },
  { background_color: "rgba(121, 85, 72, 0.9)", color: "#fff" },
  { background_color: "rgba(33, 33, 33, 0.95)", color: "#fff" },
  { background_color: "rgba(63, 81, 181, 0.9)", color: "#fff" },
  { background_color: "rgba(139, 195, 74, 0.9)", color: "#000" },
];

class ICPCResolverEngine {
  constructor() {
    this.config = null;
    this.problems = [];
    this.balloonColors = [];
    this.penaltyPerWrong = 20;
    this.teams = [];       // Sorted array of team state objects
    this.teamMap = new Map();
    this.firstBlood = [];  // Earliest revealed AC timestamp (sec) per problem
    this.totalFrozenCells = 0;
    this.revealedCells = 0;

    // Resolver cursor & suspense phase
    this.activeTeamId = null;
    this.targetProblemIdx = null; // Non-null when locked on a '?' cell awaiting reveal
    this.allFinalized = false;
    this.history = [];
    this.initialPayload = null;
  }

  loadData(config, teamsObj, runsArr) {
    this.initialPayload = { config, teamsObj, runsArr };
    this.config = config || {};
    this.problems = Array.isArray(config?.problem_id) && config.problem_id.length
      ? config.problem_id.map(String)
      : "ABCDEFGHIJKLMNO".split("");
    this.balloonColors = this.problems.map((_, idx) =>
      (config?.balloon_color && config.balloon_color[idx]) || DEFAULT_BALLOONS[idx % DEFAULT_BALLOONS.length]
    );

    const penSec = Number(config?.penalty ?? 1200);
    this.penaltyPerWrong = penSec >= 60 ? Math.round(penSec / 60) : Math.max(0, Math.round(penSec));

    const start = Number(config?.start_time || 0);
    const end = Number(config?.end_time || start + 18000);
    const contestLen = Math.max(1, end - start);
    const frozenDur = Math.max(0, Number(config?.frozen_time || Math.min(3600, contestLen)));
    const freezeOffset = Math.max(0, contestLen - frozenDur);

    const probCount = this.problems.length;
    this.teamMap = new Map();

    const teamEntries = Array.isArray(teamsObj)
      ? teamsObj.map((t) => [String(t.team_id || t.id), t])
      : Object.entries(teamsObj || {});

    for (const [tid, raw] of teamEntries) {
      const id = String(raw.team_id || tid);
      const isOfficial = raw.unofficial === 1 ? false : (raw.official === 0 ? false : true);
      const cells = Array.from({ length: probCount }, () => ({
        solved: false,
        acSec: null,
        acMin: null,
        wrongBeforeAc: 0,
        wrong: 0,
        frozenRuns: [],
        pendingCount: 0,
      }));
      this.teamMap.set(id, {
        id,
        name: String(raw.name || id),
        organization: String(raw.organization || (isOfficial ? "考核" : "打星")),
        official: isOfficial,
        cells,
        solved: 0,
        penalty: 0,
        lastAcSec: 0,
        finalized: false,
        rank: 0,
        medal: null,
      });
    }

    // Sort runs chronologically and apply pre-freeze vs queue post-freeze
    const sortedRuns = [...(runsArr || [])].sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
    for (const run of sortedRuns) {
      const tid = String(run.team_id);
      const team = this.teamMap.get(tid);
      if (!team) continue;
      let pIdx = Number(run.problem_id);
      if (!Number.isInteger(pIdx) || pIdx < 0 || pIdx >= probCount) {
        pIdx = this.problems.indexOf(String(run.problem_id));
      }
      if (pIdx < 0 || pIdx >= probCount) continue;

      let ts = Number(run.timestamp || 0);
      if (ts > contestLen * 100) ts = Math.floor(ts / 1000); // guard ms timestamps
      ts = Math.max(0, ts);

      const cell = team.cells[pIdx];
      if (cell.solved) continue; // ignore submissions after pre-freeze AC

      if (ts < freezeOffset) {
        if (isAcceptedStatus(run.status)) {
          cell.solved = true;
          cell.acSec = ts;
          cell.acMin = Math.floor(ts / 60);
          cell.wrongBeforeAc = cell.wrong;
        } else if (!isNonPenaltyStatus(run.status)) {
          cell.wrong += 1;
        }
      } else {
        // Post-freeze run queued for dramatic reveal!
        if (String(run.status || "").toLowerCase() !== "pending") {
          cell.frozenRuns.push({ timestamp: ts, status: run.status });
          cell.pendingCount = cell.frozenRuns.length;
        }
      }
    }

    // Count total frozen problem cells to reveal
    this.totalFrozenCells = 0;
    this.revealedCells = 0;
    for (const team of this.teamMap.values()) {
      for (const c of team.cells) {
        if (c.pendingCount > 0) this.totalFrozenCells += 1;
      }
      this._recomputeTeamTotals(team);
    }

    this.teams = [...this.teamMap.values()];
    this._recomputeStandings();
    this.history = [];
    this.targetProblemIdx = null;
    this.allFinalized = false;

    // Position initial cursor at bottom-most team
    this.activeTeamId = this.teams.length ? this.teams[this.teams.length - 1].id : null;
  }

  reset() {
    if (this.initialPayload) {
      this.loadData(this.initialPayload.config, this.initialPayload.teamsObj, this.initialPayload.runsArr);
    }
  }

  _recomputeTeamTotals(team) {
    let solved = 0;
    let penalty = 0;
    let lastAcSec = 0;
    for (const c of team.cells) {
      if (c.solved) {
        solved += 1;
        penalty += (c.acMin || 0) + (c.wrongBeforeAc || 0) * this.penaltyPerWrong;
        if ((c.acSec || 0) > lastAcSec) lastAcSec = c.acSec || 0;
      }
    }
    team.solved = solved;
    team.penalty = penalty;
    team.lastAcSec = lastAcSec;
  }

  _recomputeStandings() {
    this.teams.sort((a, b) => {
      if (b.solved !== a.solved) return b.solved - a.solved;
      if (a.penalty !== b.penalty) return a.penalty - b.penalty;
      if (a.lastAcSec !== b.lastAcSec) return a.lastAcSec - b.lastAcSec;
      return a.id.localeCompare(b.id);
    });

    // Official ranks strictly count official teams (unofficial ★ never steals a rank or medal)
    const officialCount = this.teams.filter((t) => t.official).length;
    const goldCut = Math.max(1, Math.ceil(officialCount * 0.10));
    const silverCut = Math.max(goldCut + 1, Math.ceil(officialCount * 0.30));
    const bronzeCut = Math.max(silverCut + 1, Math.ceil(officialCount * 0.60));

    let officialRank = 0;
    for (const team of this.teams) {
      if (team.official) {
        officialRank += 1;
        team.rank = officialRank;
        if (team.solved > 0) {
          if (officialRank <= goldCut) team.medal = "gold";
          else if (officialRank <= silverCut) team.medal = "silver";
          else if (officialRank <= bronzeCut) team.medal = "bronze";
          else team.medal = null;
        } else {
          team.medal = null;
        }
      } else {
        team.rank = 0;
        team.medal = null;
      }
    }

    // Recompute First-to-Solve across all currently revealed ACs
    const probCount = this.problems.length;
    const fb = Array(probCount).fill(Infinity);
    for (const team of this.teams) {
      for (let i = 0; i < probCount; i++) {
        const c = team.cells[i];
        if (c.solved && c.acSec !== null && c.acSec < fb[i]) {
          fb[i] = c.acSec;
        }
      }
    }
    this.firstBlood = fb;
  }

  getProblemAcCounts() {
    const counts = Array(this.problems.length).fill(0);
    for (const team of this.teams) {
      for (let i = 0; i < this.problems.length; i++) {
        if (team.cells[i].solved) counts[i] += 1;
      }
    }
    return counts;
  }

  _snapshot() {
    return {
      teams: this.teams.map((t) => ({
        ...t,
        cells: t.cells.map((c) => ({ ...c, frozenRuns: [...c.frozenRuns] })),
      })),
      revealedCells: this.revealedCells,
      activeTeamId: this.activeTeamId,
      targetProblemIdx: this.targetProblemIdx,
      allFinalized: this.allFinalized,
    };
  }

  _restore(snap) {
    this.teams = snap.teams.map((t) => ({
      ...t,
      cells: t.cells.map((c) => ({ ...c, frozenRuns: [...c.frozenRuns] })),
    }));
    this.teamMap = new Map(this.teams.map((t) => [t.id, t]));
    this.revealedCells = snap.revealedCells;
    this.activeTeamId = snap.activeTeamId;
    this.targetProblemIdx = snap.targetProblemIdx;
    this.allFinalized = snap.allFinalized;
    this._recomputeStandings();
  }

  undo() {
    if (!this.history.length) return false;
    const snap = this.history.pop();
    this._restore(snap);
    return true;
  }

  _findLowestUnfinalizedIndex() {
    for (let i = this.teams.length - 1; i >= 0; i--) {
      if (!this.teams[i].finalized) return i;
    }
    return -1;
  }

  _findNextPendingProblem(team) {
    for (let i = 0; i < team.cells.length; i++) {
      if (team.cells[i].pendingCount > 0) return i;
    }
    return -1;
  }

  /**
   * Perform ONE canonical step of the ICPC Resolver:
   * - Automatically glides past clean non-Top-10 teams with 0 frozen submissions
   * - Phase 1 ("lock"): Locks target on lowest unresolved team's leftmost '?' cell
   * - Phase 2 ("reveal"): Reveals verdict, recomputes rank, returns rich event metadata
   * - Returns { type: "lock" | "reveal" | "finalize" | "complete", ... }
   */
  step() {
    if (this.allFinalized) return { type: "complete" };
    this.history.push(this._snapshot());
    if (this.history.length > 400) this.history.shift();

    // Case A: Already locked on a '?' cell -> REVEAL IT!
    if (this.activeTeamId && this.targetProblemIdx !== null) {
      const team = this.teamMap.get(this.activeTeamId);
      const pIdx = this.targetProblemIdx;
      const cell = team.cells[pIdx];
      const oldIndex = this.teams.indexOf(team);
      const oldRank = team.rank;
      const prevLeaderId = this.teams.find((t) => t.official)?.id || null;

      let gotAc = false;
      let acSec = null;
      let wrongsAdded = 0;
      for (const r of cell.frozenRuns) {
        if (isAcceptedStatus(r.status)) {
          gotAc = true;
          acSec = r.timestamp;
          break;
        } else if (!isNonPenaltyStatus(r.status)) {
          wrongsAdded += 1;
        }
      }

      cell.frozenRuns = [];
      cell.pendingCount = 0;
      this.revealedCells += 1;

      let isFirstBlood = false;
      if (gotAc) {
        cell.solved = true;
        cell.acSec = acSec;
        cell.acMin = Math.floor(acSec / 60);
        cell.wrongBeforeAc = cell.wrong + wrongsAdded;
        cell.wrong = cell.wrongBeforeAc;
        isFirstBlood = acSec <= this.firstBlood[pIdx];
      } else {
        cell.wrong += wrongsAdded;
      }

      this._recomputeTeamTotals(team);
      this._recomputeStandings();

      const newIndex = this.teams.indexOf(team);
      const newRank = team.rank;
      const rankJump = oldIndex - newIndex;
      const newLeaderId = this.teams.find((t) => t.official)?.id || null;
      const tookFirst = gotAc && team.official && newRank === 1 && prevLeaderId !== team.id;
      const defendedFirst = gotAc && team.official && newRank === 1 && prevLeaderId === team.id;

      this.targetProblemIdx = null;
      // Advance cursor to current bottom-most unfinalized team
      const nextIdx = this._findLowestUnfinalizedIndex();
      this.activeTeamId = nextIdx >= 0 ? this.teams[nextIdx].id : null;

      return {
        type: "reveal",
        verdict: gotAc ? "AC" : "WA",
        team,
        problemIdx: pIdx,
        problemLabel: this.problems[pIdx],
        oldIndex,
        newIndex,
        oldRank,
        newRank,
        rankJump,
        isFirstBlood,
        tookFirst,
        defendedFirst,
      };
    }

    // Case B: Walk up from bottom-most unfinalized team
    while (true) {
      const idx = this._findLowestUnfinalizedIndex();
      if (idx < 0) {
        this.allFinalized = true;
        this.activeTeamId = null;
        this.targetProblemIdx = null;
        return { type: "complete" };
      }
      const team = this.teams[idx];
      const pIdx = this._findNextPendingProblem(team);
      if (pIdx >= 0) {
        this.activeTeamId = team.id;
        this.targetProblemIdx = pIdx;
        return {
          type: "lock",
          team,
          rowIndex: idx,
          problemIdx: pIdx,
          problemLabel: this.problems[pIdx],
        };
      }

      // Team has no remaining '?' submissions -> finalize it!
      team.finalized = true;
      const nextIdx = this._findLowestUnfinalizedIndex();
      if (nextIdx < 0) {
        this.allFinalized = true;
        this.activeTeamId = team.id;
        this.targetProblemIdx = null;
        return { type: "complete", lastTeam: team };
      }

      // Pause dramatically on Top 5 finalized teams even if they had 0 pending left;
      // otherwise swiftly skip clean lower-ranked rows straight to the next '?' suspense!
      if (idx < 5) {
        this.activeTeamId = this.teams[nextIdx].id;
        this.targetProblemIdx = null;
        return { type: "finalize", team, rowIndex: idx };
      }
    }
  }

  /** Fast-forward everything below Top K (default Top 15) in one clean undoable jump! */
  fastForwardToTop(keepTop = 15) {
    if (this.allFinalized) return 0;
    this.history.push(this._snapshot());
    if (this.history.length > 400) this.history.shift();
    this.targetProblemIdx = null;

    let resolvedNow = 0;
    let guard = 0;
    while (guard < 2000) {
      guard += 1;
      const idx = this._findLowestUnfinalizedIndex();
      if (idx < keepTop) break;
      const team = this.teams[idx];
      const pIdx = this._findNextPendingProblem(team);
      if (pIdx < 0) {
        team.finalized = true;
        continue;
      }
      const cell = team.cells[pIdx];
      let gotAc = false;
      let acSec = null;
      let wrongs = 0;
      for (const r of cell.frozenRuns) {
        if (isAcceptedStatus(r.status)) {
          gotAc = true;
          acSec = r.timestamp;
          break;
        } else if (!isNonPenaltyStatus(r.status)) {
          wrongs += 1;
        }
      }
      cell.frozenRuns = [];
      cell.pendingCount = 0;
      this.revealedCells += 1;
      resolvedNow += 1;
      if (gotAc) {
        cell.solved = true;
        cell.acSec = acSec;
        cell.acMin = Math.floor(acSec / 60);
        cell.wrongBeforeAc = cell.wrong + wrongs;
        cell.wrong = cell.wrongBeforeAc;
      } else {
        cell.wrong += wrongs;
      }
      this._recomputeTeamTotals(team);
      this._recomputeStandings();
    }

    const nextIdx = this._findLowestUnfinalizedIndex();
    this.activeTeamId = nextIdx >= 0 ? this.teams[nextIdx].id : null;
    if (nextIdx < 0) this.allFinalized = true;
    return resolvedNow;
  }

  getTopOfficialPodium() {
    return this.teams.filter((t) => t.official).slice(0, 3);
  }
}

/**
 * Built-in Realistic 69-Contestant SICNU ACM Exam 3 Simulation Generator
 * Uses REAL 69 names + 402/403 rooms + 8 starred wildcards so hosts can rehearse
 * the full Persona 5 rolling ceremony live before Sunday's contest!
 */
async function buildExam3DemoData() {
  let roster = [];
  try {
    const res = await fetch("../data/43/team.json", { cache: "no-store" });
    if (res.ok) {
      const obj = await res.json();
      roster = Object.values(obj || {}).map((t) => ({
        username: String(t.team_id || ""),
        name: t.name || t.team_id || "Unknown",
        organization: t.organization || "402考场",
        official: t.official === 1 || (!t.unofficial && String(t.team_id || "").toLowerCase().startsWith("kh")),
      }));
    }
  } catch { /* fallback below */ }

  if (!Array.isArray(roster) || roster.length === 0) {
    roster = [
      { username: "kh_01", name: "张烨", organization: "403考场", official: true },
      { username: "kh_02", name: "冯已稀", organization: "402考场", official: true },
      { username: "kh_03", name: "赵君浩", organization: "402考场", official: true },
      { username: "kh_04", name: "李伟恒", organization: "403考场", official: true },
      { username: "kh_05", name: "杨梓烨", organization: "402考场", official: true },
      { username: "kh_06", name: "于洋", organization: "402考场", official: true },
      { username: "kh_07", name: "刘栩辰", organization: "403考场", official: true },
      { username: "kh_08", name: "胡博靖", organization: "402考场", official: true },
      { username: "kh_09", name: "曾治诚", organization: "403考场", official: true },
      { username: "kh_10", name: "王浩鑫", organization: "402考场", official: true },
      { username: "dx_01", name: "神秘嘉宾", organization: "403考场", official: false },
    ];
  }

  // Deterministic PRNG so demo drama is consistently thrilling
  let seed = 20261129;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // Realistic skill tiers anchored to Exam 2 returning storylines
  const skillBoost = {
    "张烨": 11.2, "冯已稀": 10.6, "赵君浩": 10.4, "李伟恒": 9.8,
    "杨梓烨": 9.2, "于洋": 8.9, "刘栩辰": 8.7, "胡博靖": 8.3,
    "曾治诚": 8.2, "王浩鑫": 7.8, "任欧译": 7.6, "曾伟皓": 7.5,
    "徐一丹": 7.4, "邹知希": 7.0, "胡钊波": 6.9, "赵运生": 6.8,
    "舒慧琳": 6.6, "胡诗杰": 6.5, "黄锦锋": 6.4, "神秘嘉宾": 12.1,
  };

  const teamsObj = {};
  const runs = [];
  const start = Math.floor(new Date("2026-11-29T13:00:00+08:00").getTime() / 1000);
  const end = start + 18000; // 5h

  roster.forEach((m, idx) => {
    const tid = String(m.username);
    teamsObj[tid] = {
      team_id: tid,
      name: m.name,
      organization: m.organization || (m.official ? "402考场" : "403考场"),
      ...(m.official ? { official: 1 } : { unofficial: 1 }),
    };

    const baseSkill = skillBoost[m.name] ?? (2.2 + ((idx * 17) % 38) / 8.5 + rand() * 1.4);
    const probOrder = [0, 2, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
    const targetSolved = Math.min(14, Math.max(1, Math.round(baseSkill)));

    for (let k = 0; k < targetSolved; k++) {
      const pIdx = probOrder[k];
      // Put last 1–3 solves into the frozen last hour (14400..17940s) for intense rolling!
      const inFreeze =
        (baseSkill >= 7.0 && k >= targetSolved - 2) ||
        (baseSkill >= 9.5 && k >= targetSolved - 3) ||
        (k === targetSolved - 1 && rand() < 0.55);

      const ts = inFreeze
        ? Math.floor(14460 + rand() * 3420)
        : Math.floor(420 + (k / Math.max(1, targetSolved)) * 13400 + rand() * 750);

      const wrongs = rand() < 0.42 ? Math.floor(1 + rand() * 2) : 0;
      for (let w = 0; w < wrongs; w++) {
        runs.push({
          team_id: tid,
          problem_id: pIdx,
          timestamp: Math.max(120, ts - (wrongs - w) * 320),
          status: rand() < 0.7 ? "wrong_answer" : "time_limit_exceeded",
        });
      }
      runs.push({ team_id: tid, problem_id: pIdx, timestamp: ts, status: "correct" });
    }

    // Add 1–2 tense frozen WA attempts so NOT every '?' is an AC!
    const extraFrozenWa = baseSkill >= 6.5 ? 2 : (rand() < 0.55 ? 1 : 0);
    for (let e = 0; e < extraFrozenWa; e++) {
      const pIdx = probOrder[Math.min(14, targetSolved + e)];
      const tries = 1 + Math.floor(rand() * 2);
      for (let t = 0; t < tries; t++) {
        runs.push({
          team_id: tid,
          problem_id: pIdx,
          timestamp: Math.floor(14600 + rand() * 3200),
          status: rand() < 0.65 ? "wrong_answer" : "time_limit_exceeded",
        });
      }
    }
  });

  // Craft a thrilling Photo-Finish Top-3 battle in the frozen hour!
  const findId = (nm) => roster.find((x) => x.name === nm)?.username;
  const fyx = findId("冯已稀");
  const zy = findId("张烨");
  if (fyx && zy) {
    // Give 冯已稀 an extra clutch frozen AC on Problem L (11) at 291m, and 张烨 a clutch AC on Problem M (12) at 296m!
    runs.push({ team_id: fyx, problem_id: 11, timestamp: 17100, status: "wrong_answer" });
    runs.push({ team_id: fyx, problem_id: 11, timestamp: 17460, status: "correct" });
    runs.push({ team_id: zy, problem_id: 12, timestamp: 17340, status: "wrong_answer" });
    runs.push({ team_id: zy, problem_id: 12, timestamp: 17760, status: "correct" });
  }

  runs.sort((a, b) => a.timestamp - b.timestamp);

  const config = {
    contest_name: "SICNU ACM 第三次考核",
    start_time: start,
    end_time: end,
    frozen_time: 3600,
    problem_id: "ABCDEFGHIJKLMNO".split(""),
    group: { official: "考核", unofficial: "打星" },
    organization: "考场",
    penalty: 1200,
    balloon_color: DEFAULT_BALLOONS,
  };

  return { config, teamsObj, runs };
}

window.ICPCResolverEngine = ICPCResolverEngine;
window.buildExam3DemoData = buildExam3DemoData;
