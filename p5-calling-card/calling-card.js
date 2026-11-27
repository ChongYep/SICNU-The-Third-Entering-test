/* ============================================================================
 * Persona 5 Calling Card Pre-Contest Overlay Controller
 * Syncs live with /data/{contestId}/config.json & team.json.
 * Automatically tears away the instant Date.now() >= start_time * 1000!
 * ============================================================================ */

(function () {
  if (!/(?:^|\/)board(?:\/|$)/.test(location.pathname)) return;

  const params = new URLSearchParams(location.search);
  if (params.get("no-card") === "1") return;
  const forcePreview = params.get("preview-card") === "1";

  const baseRoot = (window.BASE_URL || "/").replace(/\/+$/, "");
  const ccAssetBase = `${baseRoot}/p5-calling-card`;
  const isStaticSite = String(window.DATA_HOST || "").startsWith("..");

  const defaultDs = window.DEFAULT_CONTEST_DS || "/43/";
  let ds = params.get("data-source") || defaultDs;
  if (ds === "/board/" || ds === "board" || ds === "/data/") ds = defaultDs;
  const cleanDs = ds.replace(/^\/+|\/+$/g, "");
  const dataHost = (window.DATA_HOST || "/data/").replace(/\/+$/, "");
  const baseUrl = `${dataHost}/${cleanDs}`;
  const resolverHref = isStaticSite
    ? `${baseRoot}/p5-resolver/?demo=1`
    : `${baseRoot}/resolver/?data-source=/${cleanDs}/`;

  let overlayEl = null;
  let reopenBtn = null;
  let manuallyHidden = false;
  let dismissedOnStart = false;
  let clockTimer = null;
  let syncTimer = null;
  let teamCount = 69;
  let currentConfig = null;
  let renderedSignature = "";

  // Build authentic Persona 5 Ransom-Note Cutout nodes
  function renderRansomNodes(container, text, { accentChars = new Set(), seedOffset = 0 } = {}) {
    container.innerHTML = "";
    const words = String(text || "").trim().split(/\s+/);
    let idx = seedOffset;
    words.forEach((word, wIdx) => {
      if (wIdx > 0) {
        const sp = document.createElement("span");
        sp.className = "p5cc-rspace";
        container.appendChild(sp);
      }
      const wSpan = document.createElement("span");
      wSpan.className = "p5cc-rword";
      for (const ch of Array.from(word)) {
        const span = document.createElement("span");
        const variant = accentChars.has(ch) ? "accent" : `v${idx % 4}`;
        span.className = `p5cc-rch ${variant}`;
        const rot = (((idx * 31 + 7) % 11) - 5) * 1.15;
        const dy = (((idx * 17 + 3) % 5) - 2) * 1.2;
        span.style.transform = `rotate(${rot.toFixed(1)}deg) translateY(${dy.toFixed(1)}px)`;
        span.textContent = ch;
        wSpan.appendChild(span);
        idx += 1;
      }
      container.appendChild(wSpan);
    });
  }

  function pad2(n) {
    return String(Math.max(0, Math.floor(n))).padStart(2, "0");
  }

  function formatTimestamp(sec) {
    if (!Number.isFinite(sec) || sec <= 0) return "";
    const d = new Date(sec * 1000);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function formatTimeOnly(sec) {
    if (!Number.isFinite(sec) || sec <= 0) return "";
    const d = new Date(sec * 1000);
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function formatCountdown(remSec) {
    const s = Math.max(0, Math.floor(remSec));
    const days = Math.floor(s / 86400);
    const hrs = Math.floor((s % 86400) / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (days > 0) {
      return `${days}天 ${pad2(hrs)}:${pad2(mins)}:${pad2(secs)}`;
    }
    return `${pad2(hrs)}:${pad2(mins)}:${pad2(secs)}`;
  }

  function parseContestLabel(title) {
    const raw = String(title || "SICNU ACM 第三次考核").trim();
    return raw.replace(/^SICNU\s*ACM\s*/i, "SICNU ACM ").replace(/\s+/g, " ");
  }

  function triggerStabAnimation() {
    if (!overlayEl) return;
    const dagger = overlayEl.querySelector(".p5cc-dagger-img");
    const cluster = overlayEl.querySelector(".p5cc-card-cluster");
    const flash = overlayEl.querySelector(".p5cc-stab-flash");
    if (!dagger || !cluster || !flash) return;

    dagger.classList.remove("is-stabbing");
    cluster.classList.remove("is-impact");
    flash.classList.remove("is-burst");
    void dagger.offsetWidth;

    dagger.classList.add("is-stabbing");
    setTimeout(() => {
      if (!overlayEl) return;
      cluster.classList.add("is-impact");
      flash.classList.add("is-burst");
    }, 220);
  }

  function removeReopenBtn() {
    if (reopenBtn) {
      reopenBtn.remove();
      reopenBtn = null;
    }
  }

  function showReopenBtn() {
    if (reopenBtn) return;
    reopenBtn = document.createElement("button");
    reopenBtn.id = "p5ccReopenBtn";
    reopenBtn.type = "button";
    reopenBtn.innerHTML = "<span>★ 展开怪盗预告信</span>";
    reopenBtn.addEventListener("click", () => {
      manuallyHidden = false;
      removeReopenBtn();
      if (currentConfig) ensureOverlay(currentConfig);
    });
    document.body.appendChild(reopenBtn);
  }

  function dismissOverlay(manual) {
    if (!overlayEl) return;
    const el = overlayEl;
    overlayEl = null;
    document.documentElement.classList.remove("p5cc-lock");
    document.body.classList.remove("p5cc-lock");
    el.classList.add("is-dismissing");
    setTimeout(() => el.remove(), 560);
    if (manual) {
      manuallyHidden = true;
      showReopenBtn();
    } else {
      dismissedOnStart = true;
      removeReopenBtn();
      if (clockTimer) clearInterval(clockTimer);
      if (syncTimer) clearInterval(syncTimer);
      clockTimer = null;
      syncTimer = null;
    }
  }

  function buildOverlayDOM(cfg) {
    const el = document.createElement("div");
    el.id = "p5CallingCardOverlay";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "SICNU ACM 怪盗团开赛预告信");

    const probCount = Array.isArray(cfg.problem_id) && cfg.problem_id.length > 0 ? cfg.problem_id.length : 15;
    const firstProb = Array.isArray(cfg.problem_id) && cfg.problem_id.length > 0 ? cfg.problem_id[0] : "A";
    const lastProb = Array.isArray(cfg.problem_id) && cfg.problem_id.length > 0 ? cfg.problem_id[cfg.problem_id.length - 1] : "O";

    el.innerHTML = `
      <div class="p5cc-backdrop" aria-hidden="true">
        <div class="p5cc-wall"></div>
        <div class="p5cc-halftone"></div>
        <div class="p5cc-slash-a"></div>
        <div class="p5cc-slash-b"></div>
        <div class="p5cc-corner-frame"></div>
        <div class="p5cc-star s1">★</div>
        <div class="p5cc-star s2">★</div>
        <div class="p5cc-star s3">★</div>
        <div class="p5cc-star s4">★</div>
      </div>

      <div class="p5cc-stage">
        <div class="p5cc-card-cluster">
          <!-- Back Card: Official Persona 5 Phantom Thieves Flaming Top-Hat Emblem -->
          <div class="p5cc-back-card" aria-hidden="true">
            <img class="p5cc-pt-logo" src="${ccAssetBase}/pt_logo.png" alt="Phantom Thieves" />
          </div>

          <!-- Front Calling Card: Concentric Red/Black Rings + Ransom Cutouts + Live Countdown -->
          <article class="p5cc-front-card">
            <div class="p5cc-card-body">
              <div class="p5cc-salutation" id="p5ccSalutation"></div>
              <h1 class="p5cc-headline" id="p5ccHeadline"></h1>

              <div class="p5cc-manifesto">
                <div class="p5cc-mline" id="p5ccLine1"></div>
                <div class="p5cc-mline" id="p5ccLine2"></div>
                <div class="p5cc-mline" id="p5ccLine3"></div>
              </div>

              <div class="p5cc-countdown-box" id="p5ccCountdownBox">
                <div class="p5cc-cd-label">
                  <span class="p5cc-cd-dot"></span>
                  <span>DISTANCE TO START · 距开赛倒计时</span>
                </div>
                <div class="p5cc-cd-clock" id="p5ccClock">--:--:--</div>
                <div class="p5cc-cd-meta" id="p5ccMeta"></div>
              </div>
            </div>

            <div class="p5cc-footer">
              <div class="p5cc-contest-pill">
                <span>CONTEST #${cleanDs} · ${probCount} 题 ${firstProb}–${lastProb} · ${teamCount} 人出战</span>
              </div>
              <div class="p5cc-signature" id="p5ccSignature"></div>
            </div>
          </article>

          <!-- Iconic Joker's Rebel Knife (Dagger) Stabbed Straight Through the Calling Card! -->
          <div class="p5cc-dagger-assembly" title="点击重放匕首穿刺动效">
            <div class="p5cc-dagger-shadow"></div>

            <!-- Jagged dark torn paper puncture wound behind blade -->
            <svg class="p5cc-puncture-slit" viewBox="0 0 82 44" fill="none" aria-hidden="true">
              <path d="M8 22 L28 11 L48 16 L74 8 L58 27 L34 33 L14 29 Z" fill="#050507" />
              <path d="M12 23 L30 14 L52 19 L70 11" stroke="#f8f6f0" stroke-width="1.6" stroke-opacity="0.72" />
            </svg>

            <!-- Clipped Dagger so bottom ~28% blade tip is genuinely buried behind the paper slit! -->
            <div class="p5cc-dagger-clip">
              <img class="p5cc-dagger-img" src="${ccAssetBase}/joker_dagger.png" alt="Joker's Rebel Knife" />
            </div>

            <!-- Curled torn crimson/white paper lip overlapping the entry line for 3D depth -->
            <svg class="p5cc-paper-lip" viewBox="0 0 74 32" fill="none" aria-hidden="true">
              <path d="M8 18 L27 25 L48 19 L62 12 L52 25 L26 30 L10 23 Z" fill="#b8000e" stroke="#f8f6f0" stroke-width="1.3" />
            </svg>

            <div class="p5cc-stab-flash"></div>
          </div>
        </div>
      </div>

      <div class="p5cc-controls">
        <div class="p5cc-sync-pill">
          <span class="p5cc-sync-dot"></span>
          <span id="p5ccSyncText">已实时同步赛场时间 · 开赛自动揭榜</span>
        </div>
        <div class="p5cc-action-group">
          <button type="button" class="p5cc-mini-btn" id="p5ccBtnPeek"><span>查看原外榜</span></button>
          <a class="p5cc-mini-btn" href="${resolverHref}"><span>${isStaticSite ? "★ P5 滚榜演练" : "★ P5 滚榜"}</span></a>
        </div>
      </div>
    `;

    // Render authentic Persona 5 Calling Card Ransom-Note Cutouts
    // Exact original P5 structure: [Contest epithet] -> [Recipients + 阁下]
    renderRansomNodes(
      el.querySelector("#p5ccSalutation"),
      `致 ${parseContestLabel(cfg.contest_name)}`,
      { accentChars: new Set(["致", "三"]), seedOffset: 1 }
    );
    renderRansomNodes(
      el.querySelector("#p5ccHeadline"),
      `${teamCount} 位算法挑战者 阁下`,
      { accentChars: new Set(["挑", "阁", "下"]), seedOffset: 3 }
    );
    renderRansomNodes(
      el.querySelector("#p5ccLine1"),
      `402/403 考场 ${probCount} 道秘宝（${firstProb}–${lastProb}）机关已设`,
      { accentChars: new Set(["秘", "宝"]), seedOffset: 5 }
    );
    renderRansomNodes(
      el.querySelector("#p5ccLine2"),
      "倒计时归零之际  试炼殿堂大门将正式敞开",
      { accentChars: new Set(["归", "零"]), seedOffset: 9 }
    );
    renderRansomNodes(
      el.querySelector("#p5ccLine3"),
      "请握紧你的代码利刃  夺取首杀与王座！",
      { accentChars: new Set(["首", "杀", "王", "座"]), seedOffset: 2 }
    );
    renderRansomNodes(
      el.querySelector("#p5ccSignature"),
      "— SICNU ACM 怪盗团 敬上",
      { accentChars: new Set(["怪", "盗", "团"]), seedOffset: 4 }
    );

    el.querySelector("#p5ccBtnPeek").addEventListener("click", () => dismissOverlay(true));
    el.querySelector(".p5cc-dagger-img").addEventListener("click", triggerStabAnimation);

    return el;
  }

  function updateClockUI() {
    if (!overlayEl || !currentConfig) return;
    const startSec = Number(currentConfig.start_time || 0);
    const endSec = Number(currentConfig.end_time || 0);
    const nowSec = Date.now() / 1000;
    const remSec = startSec - nowSec;

    if (!forcePreview && startSec > 0 && remSec <= 0) {
      dismissOverlay(false);
      return;
    }

    const clockEl = overlayEl.querySelector("#p5ccClock");
    const boxEl = overlayEl.querySelector("#p5ccCountdownBox");
    const metaEl = overlayEl.querySelector("#p5ccMeta");

    if (clockEl) {
      const displayRem = remSec > 0 ? remSec : 3599;
      clockEl.textContent = formatCountdown(displayRem);
    }
    if (boxEl) {
      boxEl.classList.toggle("is-final-minute", remSec > 0 && remSec <= 60);
    }
    if (metaEl) {
      const timeRange = startSec > 0 && endSec > 0
        ? `${formatTimestamp(startSec)} — ${formatTimeOnly(endSec)}`
        : "等待赛程同步";
      metaEl.textContent = forcePreview && remSec <= 0
        ? `预告信预览模式  ·  ${timeRange}`
        : `开赛时间：${timeRange}  ·  开赛瞬间自动撕去预告信进入实时外榜`;
    }
  }

  function ensureOverlay(cfg) {
    if (manuallyHidden) return;
    const sig = `${cfg.contest_name}|${(cfg.problem_id || []).length}|${teamCount}`;
    if (!overlayEl) {
      overlayEl = buildOverlayDOM(cfg);
      renderedSignature = sig;
      document.documentElement.classList.add("p5cc-lock");
      document.body.classList.add("p5cc-lock");
      document.body.appendChild(overlayEl);
      updateClockUI();
      requestAnimationFrame(triggerStabAnimation);
    } else if (sig !== renderedSignature) {
      const old = overlayEl;
      overlayEl = buildOverlayDOM(cfg);
      renderedSignature = sig;
      old.replaceWith(overlayEl);
      updateClockUI();
    } else {
      updateClockUI();
    }
  }

  async function fetchTeamCountOnce() {
    try {
      const res = await fetch(`${baseUrl}/team.json`, { cache: "no-store" });
      if (!res.ok) return;
      const obj = await res.json();
      const cnt = obj && typeof obj === "object" ? Object.keys(obj).length : 0;
      if (cnt > 0 && cnt !== teamCount) {
        teamCount = cnt;
        if (overlayEl && currentConfig) ensureOverlay(currentConfig);
      }
    } catch { /* keep default 69 */ }
  }

  async function syncContestState() {
    if (dismissedOnStart && !forcePreview) return;
    try {
      const res = await fetch(`${baseUrl}/config.json`, { cache: "no-store" });
      if (!res.ok) return;
      const cfg = await res.json();
      currentConfig = cfg;

      const disablePending = Boolean(cfg?.options?.disable_pending_page || cfg?.options?.disablePendingPage);
      const startMs = Number(cfg.start_time || 0) * 1000;
      const isPending = startMs > Date.now();

      if (forcePreview || (!disablePending && isPending)) {
        ensureOverlay(cfg);
      } else if (overlayEl) {
        dismissOverlay(false);
      }
    } catch {
      /* ignore transient fetch errors while OJ bridge initializes */
    }
  }

  function init() {
    fetchTeamCountOnce();
    syncContestState();
    clockTimer = setInterval(updateClockUI, 250);
    syncTimer = setInterval(syncContestState, 3000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
