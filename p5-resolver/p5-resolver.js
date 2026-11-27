/* ============================================================================
 * Persona 5 Royal Live Resolver Controller
 * 60fps FLIP Rank-Climb Animator · Eye Cut-In Director · Original All-Out Attack Finale
 * ============================================================================ */

(function () {
  const CUTIN_CAST = [
    { img: "./assets/joker_cutin.png", name: "JOKER" },
    { img: "./assets/skull_cutin.png", name: "SKULL" },
    { img: "./assets/panther_cutin.png", name: "PANTHER" },
    { img: "./assets/queen_cutin.png", name: "QUEEN" },
    { img: "./assets/fox_cutin.png", name: "FOX" },
    { img: "./assets/morgana_cutin.png", name: "MONA" },
  ];

  const engine = new window.ICPCResolverEngine();
  const audio = new window.P5AudioEngine();

  // DOM References
  const elTitle = document.getElementById("contestTitle");
  const elModeBadge = document.getElementById("dataModeBadge");
  const elStatusText = document.getElementById("statusText");
  const elPendingCounter = document.getElementById("pendingCounter");
  const elProgressFill = document.getElementById("progressFill");
  const elProblemHeaders = document.getElementById("problemHeaders");
  const elBoardViewport = document.getElementById("boardViewport");
  const elBoardList = document.getElementById("boardList");
  const elEmptyState = document.getElementById("emptyState");
  const elEmptyDesc = document.getElementById("emptyDesc");
  const elFutabaText = document.getElementById("futabaText");

  const elCutinOverlay = document.getElementById("cutinOverlay");
  const elCutinImg = document.getElementById("cutinImg");
  const elCutinTag = document.getElementById("cutinTag");
  const elCutinMain = document.getElementById("cutinMain");
  const elCutinSub = document.getElementById("cutinSub");

  const elVerdictFlash = document.getElementById("verdictFlash");
  const elVerdictBadge = document.getElementById("verdictBadge");

  const elCoronation = document.getElementById("coronationOverlay");
  const elAoaVideo = document.getElementById("aoaVideo");
  const elBtnSkipAoa = document.getElementById("btnSkipAoa");
  const elPodiumStage = document.getElementById("podiumStage");
  const elChampTitleRansom = document.getElementById("champTitleRansom");
  const elChampName = document.getElementById("champName");
  const elChampMeta = document.getElementById("champMeta");
  const elRunner2Name = document.getElementById("runner2Name");
  const elRunner2Meta = document.getElementById("runner2Meta");
  const elRunner3Name = document.getElementById("runner3Name");
  const elRunner3Meta = document.getElementById("runner3Meta");

  // Controls
  const btnStep = document.getElementById("btnStep");
  const btnAuto = document.getElementById("btnAuto");
  const autoLabel = document.getElementById("autoLabel");
  const speedSelect = document.getElementById("speedSelect");
  const btnFastTop = document.getElementById("btnFastTop");
  const btnUndo = document.getElementById("btnUndo");
  const btnReset = document.getElementById("btnReset");
  const btnGroup = document.getElementById("btnGroup");
  const groupLabel = document.getElementById("groupLabel");
  const btnBgm = document.getElementById("btnBgm");
  const bgmLabel = document.getElementById("bgmLabel");
  const btnDemo = document.getElementById("btnDemo");
  const demoLabel = document.getElementById("demoLabel");
  const btnEmptyDemo = document.getElementById("btnEmptyDemo");
  const btnCoronation = document.getElementById("btnCoronation");
  const btnFullscreen = document.getElementById("btnFullscreen");
  const classicLink = document.getElementById("classicLink");

  let isDemoMode = false;
  let groupFilter = "all"; // all | official | unofficial
  let autoTimer = null;
  let cutinTimer = null;
  let verdictTimer = null;
  let cutinIndex = 0;
  let rowElements = new Map(); // teamId -> DOM row element
  let isBusyAnimating = false;

  // Render authentic Persona 5 Ransom-Note Cutout text (grouped by word so words never split mid-word!)
  function renderRansomText(container, text) {
    container.innerHTML = "";
    const words = String(text || "").trim().split(/\s+/);
    let globalIdx = 0;
    words.forEach((word, wIdx) => {
      if (wIdx > 0) {
        const sp = document.createElement("span");
        sp.className = "ransom-space";
        container.appendChild(sp);
      }
      const wSpan = document.createElement("span");
      wSpan.className = "ransom-word";
      for (const ch of Array.from(word)) {
        const span = document.createElement("span");
        span.className = `ransom-ch t${globalIdx % 4}`;
        const deg = (((globalIdx * 37 + 11) % 11) - 5) * 1.1;
        span.style.transform = `rotate(${deg.toFixed(1)}deg)`;
        span.textContent = ch;
        wSpan.appendChild(span);
        globalIdx += 1;
      }
      container.appendChild(wSpan);
    });
  }

  function setFutaba(htmlText) {
    elFutabaText.innerHTML = htmlText;
  }

  function getDataSourcePath() {
    const params = new URLSearchParams(window.location.search);
    const ds = params.get("data-source") || window.DEFAULT_CONTEST_DS || "/43/";
    const clean = ds.replace(/^\/+|\/+$/g, "");
    const host = (window.DATA_HOST || "/resolver-data/").replace(/\/+$/, "");
    if (classicLink) {
      classicLink.href = window.STATIC_PUBLIC_SITE
        ? `../board/?data-source=/${clean}/`
        : (isDemoMode
          ? "/resolver/?classic=1&data-source=/demo/"
          : `/resolver/?classic=1&data-source=/${clean}/`);
    }
    return { clean, baseUrl: `${host}/${clean}` };
  }

  async function loadLiveContest() {
    stopAuto();
    isDemoMode = false;
    const { clean, baseUrl } = getDataSourcePath();
    elModeBadge.textContent = `LIVE #${clean}`;
    elModeBadge.className = "p5-mode-pill live";
    demoLabel.textContent = "演练模式";
    elStatusText.textContent = "正在同步实况终榜数据...";

    try {
      const [cfgRes, teamRes, runRes] = await Promise.all([
        fetch(`${baseUrl}/config.json`, { cache: "no-store" }),
        fetch(`${baseUrl}/team.json`, { cache: "no-store" }),
        fetch(`${baseUrl}/run.json`, { cache: "no-store" }),
      ]);
      if (!cfgRes.ok || !teamRes.ok || !runRes.ok) {
        throw new Error(`HTTP ${cfgRes.status}/${teamRes.status}/${runRes.status}`);
      }
      const [cfg, teamsObj, runs] = await Promise.all([cfgRes.json(), teamRes.json(), runRes.json()]);
      engine.loadData(cfg, teamsObj, runs);
      initBoardDOM();

      if (engine.totalFrozenCells === 0) {
        setFutaba(`已接入实况赛题 <b>#${clean}</b>（${engine.teams.length} 人）。当前暂无封榜待揭示提交，可按 <b>D</b> 启动 69 人仿真演练预览完整动画！`);
        elStatusText.textContent = `实况 #${clean} 就绪（0 条封榜提交）`;
      } else {
        setFutaba(`实况数据接入完成！共 <b>${engine.teams.length}</b> 名选手、<b>${engine.totalFrozenCells}</b> 格封榜悬念待揭晓，按 <b>Space</b> 开始！`);
        elStatusText.textContent = `实况 #${clean} 封榜就绪 · 准备滚榜`;
      }
    } catch (err) {
      elStatusText.textContent = "实况数据读取失败，可切换演练模式";
      elEmptyState.classList.remove("hidden");
      elEmptyDesc.textContent = `连接 ${baseUrl} 失败（${err.message}）。点击下方按钮可直接体验 69 人完整 Persona 5 滚榜动画！`;
      setFutaba(`无法连接实况接口，按 <b>D</b> 可立即体验 69 人完整演练！`);
    }
  }

  async function loadDemoContest() {
    stopAuto();
    isDemoMode = true;
    if (classicLink) {
      classicLink.href = window.STATIC_PUBLIC_SITE
        ? "../board/?data-source=/43/"
        : "/resolver/?classic=1&data-source=/demo/";
    }
    elModeBadge.textContent = "DEMO 69人演练";
    elModeBadge.className = "p5-mode-pill demo";
    demoLabel.textContent = "切回实况";
    elStatusText.textContent = "正在生成 69 人仿真封榜数据...";

    const demo = await window.buildExam3DemoData();
    engine.loadData(demo.config, demo.teamsObj, demo.runs);
    initBoardDOM();
    setFutaba(`<b>69 人仿真演练</b>就绪！全员真实姓名已加载，共有 <b>${engine.totalFrozenCells}</b> 个封榜「?」待破解，按 <b>Space</b> 或 <b>A</b> 开演！`);
    elStatusText.textContent = "69 人演练就绪 · 准备揭晓终榜";
  }

  function initBoardDOM() {
    renderRansomText(elTitle, engine.config?.contest_name || "SICNU ACM 第三次考核");
    document.documentElement.style.setProperty("--prob-count", String(engine.problems.length));

    // Render sticky balloon problem headers
    elProblemHeaders.innerHTML = "";
    const acCounts = engine.getProblemAcCounts();
    engine.problems.forEach((lbl, idx) => {
      const bc = engine.balloonColors[idx] || { background_color: "#e60012", color: "#fff" };
      const div = document.createElement("div");
      div.className = "prob-hdr-cell";
      div.dataset.probIdx = String(idx);
      div.innerHTML = `
        <div class="prob-hdr-top">
          <span class="prob-balloon-dot" style="background:${bc.background_color}"></span>
          <span class="prob-hdr-letter">${lbl}</span>
        </div>
        <div class="prob-hdr-count" id="probCount_${idx}">${acCounts[idx]}</div>
      `;
      elProblemHeaders.appendChild(div);
    });

    // Rebuild team row DOM nodes once (reused for butter-smooth FLIP transitions!)
    elBoardList.innerHTML = "";
    rowElements.clear();
    if (engine.teams.length === 0) {
      elEmptyState.classList.remove("hidden");
      return;
    }
    elEmptyState.classList.add("hidden");

    for (const team of engine.teams) {
      const row = createTeamRowElement(team);
      rowElements.set(team.id, row);
      elBoardList.appendChild(row);
    }
    syncAllRows(null);
    updateHeaderStats();
    scrollToActive(true);
  }

  function createTeamRowElement(team) {
    const row = document.createElement("div");
    row.className = "team-row";
    row.dataset.teamId = team.id;

    const roomCls = team.organization.includes("402")
      ? "r402"
      : team.organization.includes("403")
      ? "r403"
      : "rother";

    const probHtml = engine.problems
      .map((lbl, idx) => `<div class="prob-cell st-empty" data-p="${idx}"><span class="cell-main">·</span></div>`)
      .join("");

    row.innerHTML = `
      <div class="rank-cell">
        <div class="rank-badge"><span class="rank-num">—</span></div>
      </div>
      <div class="team-cell">
        <div class="team-name-line">
          ${team.official ? "" : '<span class="team-star">★</span>'}
          <span class="team-name">${escapeHtml(team.name)}</span>
          <span class="fb-hunter-badge hidden"></span>
        </div>
        <div class="team-meta-line">
          <span class="room-tag ${roomCls}">${escapeHtml(team.organization)}</span>
          <span class="final-tag hidden">LOCKED</span>
        </div>
      </div>
      <div class="solved-cell">0</div>
      <div class="penalty-cell">0</div>
      <div class="col-problems">${probHtml}</div>
    `;
    return row;
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[ch]));
  }

  function syncRowContent(row, team, highlightEvent) {
    // Visibility by group filter
    const visible =
      groupFilter === "all" ||
      (groupFilter === "official" && team.official) ||
      (groupFilter === "unofficial" && !team.official);
    row.classList.toggle("hidden", !visible);

    row.classList.toggle("is-unofficial", !team.official);
    row.classList.toggle("is-finalized", team.finalized);
    row.classList.toggle("is-active", engine.activeTeamId === team.id && !engine.allFinalized);

    row.classList.remove("medal-gold", "medal-silver", "medal-bronze", "rank-1", "rank-2", "rank-3");
    if (team.medal) row.classList.add(`medal-${team.medal}`);
    if (team.official && team.rank >= 1 && team.rank <= 3) {
      row.classList.add(`rank-${team.rank}`);
    }

    const rankNum = row.querySelector(".rank-num");
    rankNum.textContent = team.official ? String(team.rank) : "★";

    const finalTag = row.querySelector(".final-tag");
    finalTag.classList.toggle("hidden", !team.finalized);

    row.querySelector(".solved-cell").textContent = String(team.solved);
    row.querySelector(".penalty-cell").textContent = String(team.penalty);

    const probCells = row.querySelectorAll(".prob-cell");
    const fbLabels = [];
    for (let i = 0; i < team.cells.length; i++) {
      const c = team.cells[i];
      const cellEl = probCells[i];
      if (!cellEl) continue;

      const isTarget = engine.activeTeamId === team.id && engine.targetProblemIdx === i;
      const justRevealed =
        highlightEvent &&
        highlightEvent.type === "reveal" &&
        highlightEvent.team.id === team.id &&
        highlightEvent.problemIdx === i;

      let cls = "prob-cell";
      let html = `<span class="cell-main">·</span>`;

      if (c.solved) {
        const isFb = c.acSec !== null && c.acSec <= engine.firstBlood[i];
        if (isFb) fbLabels.push(engine.problems[i]);
        cls += isFb ? " st-fb" : " st-ac";
        const tries = c.wrongBeforeAc > 0 ? `+${c.wrongBeforeAc}` : "+";
        html = isFb
          ? `<span class="fb-foil" aria-hidden="true"></span><span class="cell-main">${tries}</span><span class="cell-sub">${c.acMin}m</span>`
          : `<span class="cell-main">${tries}</span><span class="cell-sub">${c.acMin}m</span>`;
      } else if (c.pendingCount > 0) {
        cls += " st-pending";
        const pre = c.wrong > 0 ? `${c.wrong}+` : "";
        html = `<span class="cell-main">?</span><span class="cell-sub">${pre}${c.pendingCount}?</span>`;
      } else if (c.wrong > 0) {
        cls += " st-wa";
        html = `<span class="cell-main">-${c.wrong}</span>`;
      } else {
        cls += " st-empty";
      }

      if (isTarget) cls += " is-target";
      if (justRevealed) cls += highlightEvent.verdict === "AC" ? " just-ac" : " just-wa";

      cellEl.className = cls;
      cellEl.innerHTML = html;
    }

    const fbBadge = row.querySelector(".fb-hunter-badge");
    if (fbBadge) {
      if (fbLabels.length === 0) {
        fbBadge.classList.add("hidden");
        fbBadge.innerHTML = "";
        fbBadge.removeAttribute("title");
      } else {
        fbBadge.classList.remove("hidden");
        const tagTxt = fbLabels.length > 3 ? `★1ST×${fbLabels.length}` : "★1ST";
        const probTxt = fbLabels.length > 3 ? `${fbLabels.slice(0, 2).join("·")}…` : fbLabels.join("·");
        fbBadge.innerHTML = `<span class="fb-h-tag">${tagTxt}</span><span class="fb-h-probs">${escapeHtml(probTxt)}</span>`;
        fbBadge.title = `全场一血：${fbLabels.join("、")} 题`;
      }
    }
  }

  /**
   * 60fps FLIP (First -> Last -> Invert -> Play) Row Reorder Animator!
   * Smoothly animates climbing rows and displaced rows without jank.
   */
  function syncAllRows(highlightEvent) {
    // 1) FIRST: capture previous Y of every visible row
    const firstRects = new Map();
    for (const [id, row] of rowElements.entries()) {
      if (!row.classList.contains("hidden")) {
        firstRects.set(id, row.getBoundingClientRect().top);
      }
    }

    // 2) Update content & reorder DOM strictly to engine.teams order
    const frag = document.createDocumentFragment();
    for (const team of engine.teams) {
      const row = rowElements.get(team.id);
      if (!row) continue;
      syncRowContent(row, team, highlightEvent);
      frag.appendChild(row);
    }
    elBoardList.appendChild(frag);

    // Update header AC counts
    const counts = engine.getProblemAcCounts();
    counts.forEach((cnt, idx) => {
      const cEl = document.getElementById(`probCount_${idx}`);
      if (cEl) cEl.textContent = String(cnt);
    });

    // 3) LAST & INVERT -> PLAY smooth spring climb!
    const movedTeamId =
      highlightEvent && highlightEvent.type === "reveal" && highlightEvent.verdict === "AC" && highlightEvent.rankJump > 0
        ? highlightEvent.team.id
        : null;

    for (const [id, row] of rowElements.entries()) {
      const oldTop = firstRects.get(id);
      if (oldTop === undefined || row.classList.contains("hidden")) continue;
      const newTop = row.getBoundingClientRect().top;
      const dy = oldTop - newTop;
      if (Math.abs(dy) < 1) continue;

      row.style.transition = "none";
      row.style.transform = `translate3d(0, ${dy}px, 0) skewX(-4deg)`;

      if (id === movedTeamId) {
        row.classList.add("is-climbing");
        // Show floating +Δ rank jump pill!
        const rankCell = row.querySelector(".rank-cell");
        const oldPill = rankCell.querySelector(".rank-delta-pill");
        if (oldPill) oldPill.remove();
        const pill = document.createElement("span");
        pill.className = "rank-delta-pill";
        pill.textContent = `▲+${highlightEvent.rankJump}`;
        rankCell.appendChild(pill);
        setTimeout(() => {
          row.classList.remove("is-climbing");
          pill.remove();
        }, 1400);
      }
    }

    // Force layout flush then animate smoothly to natural position
    void elBoardList.offsetHeight;

    requestAnimationFrame(() => {
      for (const [id, row] of rowElements.entries()) {
        if (!row.style.transform) continue;
        const isHero = id === movedTeamId;
        row.style.transition = isHero
          ? "transform 0.68s cubic-bezier(0.22, 1.12, 0.36, 1)"
          : "transform 0.56s cubic-bezier(0.25, 0.9, 0.3, 1)";
        row.style.transform = "";
      }
    });

    // WA recoil shake on failed cell
    if (highlightEvent && highlightEvent.type === "reveal" && highlightEvent.verdict === "WA") {
      const wRow = rowElements.get(highlightEvent.team.id);
      if (wRow) {
        wRow.classList.remove("is-shake");
        void wRow.offsetWidth;
        wRow.classList.add("is-shake");
        setTimeout(() => wRow.classList.remove("is-shake"), 460);
      }
    }
  }

  function updateHeaderStats() {
    const remaining = Math.max(0, engine.totalFrozenCells - engine.revealedCells);
    elPendingCounter.innerHTML = `待揭示 <b>${remaining}</b> / ${engine.totalFrozenCells}`;
    const pct = engine.totalFrozenCells > 0
      ? Math.min(100, (engine.revealedCells / engine.totalFrozenCells) * 100)
      : (engine.allFinalized ? 100 : 0);
    elProgressFill.style.width = `${pct.toFixed(1)}%`;
  }

  function scrollToActive(instant = false) {
    if (!engine.activeTeamId) return;
    const row = rowElements.get(engine.activeTeamId);
    if (!row || row.classList.contains("hidden")) return;
    const vpH = elBoardViewport.clientHeight;
    const targetTop = Math.max(0, row.offsetTop - vpH * 0.44);
    elBoardViewport.scrollTo({
      top: targetTop,
      behavior: instant ? "auto" : "smooth",
    });
  }

  // Quick center verdict burst (AC!! / FIRST BLOOD! / MISS!)
  function showVerdictFlash(text, kind) {
    clearTimeout(verdictTimer);
    elVerdictFlash.classList.remove("hidden");
    elVerdictBadge.className = `verdict-badge ${kind}`;
    elVerdictBadge.textContent = text;
    // Restart animation cleanly
    elVerdictBadge.style.animation = "none";
    void elVerdictBadge.offsetWidth;
    elVerdictBadge.style.animation = "";
    verdictTimer = setTimeout(() => {
      elVerdictFlash.classList.add("hidden");
    }, 560);
  }

  // Dramatic Persona 5 Character Eye Cut-In Slash!
  function showCutIn({ tag, main, sub, isThrone = false }) {
    clearTimeout(cutinTimer);
    const cast = isThrone ? CUTIN_CAST[0] : CUTIN_CAST[cutinIndex % CUTIN_CAST.length];
    cutinIndex += 1;

    elCutinImg.src = cast.img;
    elCutinTag.textContent = tag;
    elCutinMain.textContent = main;
    elCutinSub.textContent = sub;

    elCutinOverlay.classList.remove("hidden", "throne");
    if (isThrone) elCutinOverlay.classList.add("throne");
    // Restart animation cleanly
    elCutinOverlay.style.animation = "none";
    void elCutinOverlay.offsetWidth;
    elCutinOverlay.style.animation = "";

    audio.playCutIn();
    const dur = isThrone ? 1450 : 940;
    cutinTimer = setTimeout(() => {
      elCutinOverlay.classList.add("hidden");
    }, dur);
    return dur;
  }

  // Grand Finale: Original Persona 5 All-Out Attack Video -> 4K Joker Champion Coronation!
  function launchCoronation() {
    stopAuto();
    const podium = engine.getTopOfficialPodium();
    const champ = podium[0] || engine.teams[0];
    const r2 = podium[1];
    const r3 = podium[2];

    renderRansomText(elChampTitleRansom, "ALL OUT CHAMPION!");
    if (champ) {
      elChampName.textContent = champ.name;
      elChampMeta.textContent = `${champ.organization}  ·  ${champ.solved} 题 AC  ·  罚时 ${champ.penalty}`;
    }
    elRunner2Name.textContent = r2 ? r2.name : "—";
    elRunner2Meta.textContent = r2 ? `${r2.organization} · ${r2.solved} 题 · 罚时 ${r2.penalty}` : "";
    elRunner3Name.textContent = r3 ? r3.name : "—";
    elRunner3Meta.textContent = r3 ? `${r3.organization} · ${r3.solved} 题 · 罚时 ${r3.penalty}` : "";

    elCoronation.classList.remove("hidden");
    elPodiumStage.classList.add("hidden");
    elAoaVideo.classList.remove("hidden");
    elBtnSkipAoa.classList.remove("hidden");

    audio.playCutIn();
    elAoaVideo.currentTime = 0;

    const showPodium = () => {
      elAoaVideo.pause();
      elAoaVideo.classList.add("hidden");
      elBtnSkipAoa.classList.add("hidden");
      elPodiumStage.classList.remove("hidden");
      audio.playChampion();
    };

    elAoaVideo.onended = showPodium;
    elAoaVideo.play().catch(() => {
      // Fallback if autoplay blocked
      showPodium();
    });
  }

  function closeCoronation() {
    elAoaVideo.pause();
    elCoronation.classList.add("hidden");
    elPodiumStage.classList.add("hidden");
    elBoardViewport.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Execute one interactive step & drive all visual/audio choreography
  function doStep() {
    if (isBusyAnimating) return;
    const ev = engine.step();
    syncAllRows(ev);
    updateHeaderStats();

    if (ev.type === "lock") {
      audio.playLock();
      const rkStr = ev.team.official ? `#${ev.team.rank}` : "★打星";
      elStatusText.textContent = `锁定 ${ev.team.name} (${rkStr}) · 题 ${ev.problemLabel}`;
      setFutaba(`锁定目标！<b>${escapeHtml(ev.team.name)}</b>（${escapeHtml(ev.team.organization)}）的 <b>${ev.problemLabel}</b> 题封榜解封中...`);
      scrollToActive(false);
    } else if (ev.type === "reveal") {
      const pLbl = ev.problemLabel;
      if (ev.verdict === "AC") {
        const bigJump = ev.rankJump >= 4 || (ev.team.official && ev.oldRank > 10 && ev.newRank <= 10);
        audio.playAC(bigJump, ev.isFirstBlood);

        if (ev.tookFirst) {
          showCutIn({
            tag: "NEW #1!! 王座易主!!",
            main: `${ev.team.name} 登顶榜首!`,
            sub: `${ev.team.organization} · 题 ${pLbl} AC · ${ev.team.solved} 题（罚时 ${ev.team.penalty}）`,
            isThrone: true,
          });
          setFutaba(`<b>王座易主！！</b> <b>${escapeHtml(ev.team.name)}</b> 凭借 <b>${pLbl}</b> 题绝杀反超登顶 #1！！`);
        } else if (ev.defendedFirst) {
          showCutIn({
            tag: "THRONE LOCKED!! 稳守王座!!",
            main: `${ev.team.name} 扩大领先!`,
            sub: `${ev.team.organization} · 题 ${pLbl} AC · 稳居 #1（${ev.team.solved} 题）`,
            isThrone: true,
          });
          setFutaba(`霸气稳守！<b>${escapeHtml(ev.team.name)}</b> 再下一城 <b>${pLbl}</b> 题，强势捍卫榜首！`);
        } else if (bigJump) {
          const rkLabel = ev.team.official ? `跃升至 #${ev.newRank}` : `打星强势攀升`;
          showCutIn({
            tag: ev.isFirstBlood ? "FIRST BLOOD!! 1 MORE!!" : `1 MORE!! RANK UP +${ev.rankJump}`,
            main: `${ev.team.name} 连超 ${ev.rankJump} 名!`,
            sub: `${ev.team.organization} · 题 ${pLbl} AC · ${rkLabel}`,
          });
          setFutaba(`漂亮！！<b>${escapeHtml(ev.team.name)}</b> 破解 <b>${pLbl}</b> 题，一口气连超 <b>${ev.rankJump}</b> 名！`);
        } else {
          showVerdictFlash(ev.isFirstBlood ? `FIRST BLOOD! ${pLbl}` : `AC!! ${pLbl}`, ev.isFirstBlood ? "fb" : "ac");
          const jumpTxt = ev.rankJump > 0 ? `，上升 ${ev.rankJump} 名！` : "！";
          setFutaba(`<b>AC 通过！</b> <b>${escapeHtml(ev.team.name)}</b> 成功拿下 <b>${pLbl}</b> 题${jumpTxt}`);
        }
        elStatusText.textContent = `${ev.team.name} · 题 ${pLbl} AC（${ev.team.solved} 题）`;
      } else {
        audio.playWA();
        showVerdictFlash(`MISS · ${pLbl}`, "wa");
        elStatusText.textContent = `${ev.team.name} · 题 ${pLbl} 未通过`;
        setFutaba(`差一点！<b>${escapeHtml(ev.team.name)}</b> 的 <b>${pLbl}</b> 题未能通过，继续推进下一格！`);
      }

      // Briefly scroll to follow climbing Top-10 heroes, then keep active cursor visible
      const activeIdx = engine.teams.findIndex((t) => t.id === engine.activeTeamId);
      if (activeIdx >= 0 && activeIdx < 12) {
        elBoardViewport.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        scrollToActive(false);
      }

      // Automatically slow down Auto-Roll when reaching Top 10 drama zone!
      if (autoTimer && activeIdx >= 0 && activeIdx < 10 && speedSelect.value === "fast") {
        speedSelect.value = "normal";
        restartAutoTimer();
        setFutaba(`进入 <b>前十终极悬念区</b>！已自动切换为标准悬念节奏，屏息见证冠军诞生！`);
      }
    } else if (ev.type === "finalize") {
      const rkStr = ev.team.official ? `#${ev.team.rank}` : "★打星";
      elStatusText.textContent = `最终定格：${rkStr} ${ev.team.name}（${ev.team.solved} 题）`;
      setFutaba(`名次锁定！祝贺 <b>${escapeHtml(ev.team.name)}</b> 以 <b>${ev.team.solved}</b> 题定格 <b>${rkStr}</b>！`);
      elBoardViewport.scrollTo({ top: 0, behavior: "smooth" });
    } else if (ev.type === "complete") {
      stopAuto();
      elStatusText.textContent = "终榜全员揭晓完毕 · 冠军加冕！";
      const champ = engine.getTopOfficialPodium()[0];
      setFutaba(`全员终榜揭晓完毕！！祝贺 <b>${escapeHtml(champ?.name || "冠军")}</b> 荣膺本届考核冠军！`);
      elBoardViewport.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => launchCoronation(), 550);
    }
  }

  function getAutoDelayMs() {
    const mode = speedSelect.value;
    const isLocked = engine.targetProblemIdx !== null;
    if (mode === "slow") return isLocked ? 1100 : 850;
    if (mode === "fast") return isLocked ? 220 : 180;
    return isLocked ? 650 : 480;
  }

  function restartAutoTimer() {
    if (!autoTimer) return;
    clearTimeout(autoTimer);
    const tick = () => {
      if (!autoTimer) return;
      if (engine.allFinalized) {
        stopAuto();
        return;
      }
      doStep();
      if (autoTimer) {
        // Extra pause after dramatic Cut-In so audience can cheer!
        const extra = elCutinOverlay.classList.contains("hidden") ? 0 : 950;
        autoTimer = setTimeout(tick, getAutoDelayMs() + extra);
      }
    };
    autoTimer = setTimeout(tick, getAutoDelayMs());
  }

  function startAuto() {
    if (engine.allFinalized) return;
    btnAuto.classList.add("active");
    autoLabel.textContent = "暂停";
    autoTimer = setTimeout(() => {}, 1);
    restartAutoTimer();
  }

  function stopAuto() {
    if (autoTimer) {
      clearTimeout(autoTimer);
      autoTimer = null;
    }
    btnAuto.classList.remove("active");
    autoLabel.textContent = "自动";
  }

  // Event Bindings
  btnStep.addEventListener("click", () => {
    stopAuto();
    doStep();
  });

  btnAuto.addEventListener("click", () => {
    if (autoTimer) stopAuto();
    else startAuto();
  });

  speedSelect.addEventListener("change", () => {
    if (autoTimer) restartAutoTimer();
  });

  btnFastTop.addEventListener("click", () => {
    stopAuto();
    const n = engine.fastForwardToTop(15);
    syncAllRows(null);
    updateHeaderStats();
    scrollToActive(false);
    audio.playCutIn();
    setFutaba(`已疾速跳过后排 <b>${n}</b> 个封榜提交！现在正式进入 <b>前 15 名高能决战阶段</b>！`);
    elStatusText.textContent = "已快进至前 15 名决战区";
  });

  btnUndo.addEventListener("click", () => {
    stopAuto();
    if (engine.undo()) {
      syncAllRows(null);
      updateHeaderStats();
      scrollToActive(false);
      elStatusText.textContent = "已撤销上一步操作";
      setFutaba("已回退至上一步状态，随时可重新揭示！");
    }
  });

  btnReset.addEventListener("click", () => {
    stopAuto();
    closeCoronation();
    engine.reset();
    syncAllRows(null);
    updateHeaderStats();
    scrollToActive(true);
    elStatusText.textContent = "已重置至封榜初始状态";
    setFutaba("榜单已重置回封榜瞬间！准备开启新一轮滚榜！");
  });

  btnGroup.addEventListener("click", () => {
    const order = ["all", "official", "unofficial"];
    const labels = { all: "全员", official: "仅考核", unofficial: "仅打星" };
    groupFilter = order[(order.indexOf(groupFilter) + 1) % order.length];
    groupLabel.textContent = labels[groupFilter];
    syncAllRows(null);
  });

  btnBgm.addEventListener("click", () => {
    const playing = audio.toggleBgm();
    btnBgm.classList.toggle("active", playing);
    bgmLabel.textContent = playing ? "♫ 播放中" : "♪ BGM";
  });

  btnDemo.addEventListener("click", () => {
    if (isDemoMode) loadLiveContest();
    else loadDemoContest();
  });
  btnEmptyDemo.addEventListener("click", () => loadDemoContest());

  btnCoronation.addEventListener("click", () => launchCoronation());
  elBtnSkipAoa.addEventListener("click", () => {
    elAoaVideo.pause();
    elAoaVideo.classList.add("hidden");
    elBtnSkipAoa.classList.add("hidden");
    elPodiumStage.classList.remove("hidden");
    audio.playChampion();
  });
  document.getElementById("btnReplayAoa").addEventListener("click", () => launchCoronation());
  document.getElementById("btnCloseCoronation").addEventListener("click", () => closeCoronation());

  btnFullscreen.addEventListener("click", () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  });

  // Global Stage Operator Keyboard Shortcuts
  window.addEventListener("keydown", (e) => {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT")) return;
    if (!elCoronation.classList.contains("hidden")) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeCoronation();
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (!elAoaVideo.classList.contains("hidden")) {
          elBtnSkipAoa.click();
        } else {
          closeCoronation();
        }
      }
      return;
    }

    if (e.code === "Space" || e.key === "ArrowRight" || e.key === "Enter") {
      e.preventDefault();
      stopAuto();
      doStep();
    } else if (e.key === "ArrowLeft" || e.key === "Backspace") {
      e.preventDefault();
      btnUndo.click();
    } else if (e.key === "a" || e.key === "A") {
      e.preventDefault();
      btnAuto.click();
    } else if (e.key === "s" || e.key === "S") {
      e.preventDefault();
      btnFastTop.click();
    } else if (e.key === "r" || e.key === "R") {
      e.preventDefault();
      btnReset.click();
    } else if (e.key === "g" || e.key === "G") {
      e.preventDefault();
      btnGroup.click();
    } else if (e.key === "m" || e.key === "M") {
      e.preventDefault();
      btnBgm.click();
    } else if (e.key === "d" || e.key === "D") {
      e.preventDefault();
      btnDemo.click();
    } else if (e.key === "c" || e.key === "C") {
      e.preventDefault();
      btnCoronation.click();
    } else if (e.key === "f" || e.key === "F") {
      e.preventDefault();
      btnFullscreen.click();
    }
  });

  // Boot! Support ?demo=1 URL param (or default to demo on static public preview site)
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") === "1" || (window.STATIC_PUBLIC_SITE && params.get("live") !== "1")) {
    loadDemoContest();
  } else {
    loadLiveContest();
  }
})();
