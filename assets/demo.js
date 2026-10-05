// ============================================================
// hako interactive demo
//
// Draws the real panel output (frames rendered by the device's own code,
// deploy/build-web-demo.py in the hako repo) as glowing LEDs, lets visitors
// turn the knob, and runs a tiny Anki review session that drives the panel:
// every card you review updates "due today", the pet's mood and so on.
//
// Markup:
//   <div class="hako-display" data-hako-display data-autoplay>   (any number)
//   <div class="anki" data-hako-anki>                            (one)
// ============================================================
(function () {
  "use strict";

  // Frames live next to this script, so the /ja/ and /de/ pages find them too
  const BASE = new URL("demo/", document.currentScript ? document.currentScript.src : location.href).href;
  const SCREEN_SECONDS = 6; // autoplay: time per screen
  const RESUME_AFTER = 20; // autoplay resumes this long after the last touch

  const STRINGS = {
    en: {
      screens: ["Today", "Card health", "Six-week heatmap", "Study pet", "Your cards", "Retention"],
      knob: "Turn the knob to change screens",
      hint: "Turn the knob · swipe · ← →",
      show: "Show answer",
      again: "Again", hard: "Hard", good: "Good", easy: "Easy",
      done: "Congratulations! You have finished this deck for now.",
      restart: "Start over",
      left: (n) => `${n} left today`,
      decks: "Sample deck",
    },
    ja: {
      screens: ["今日", "カードの状態", "6週間の記録", "ペット", "カード", "定着率"],
      knob: "ノブを回して画面を切り替え",
      hint: "ノブを回す・スワイプ・← →",
      show: "答えを表示",
      again: "もう一度", hard: "難しい", good: "正解", easy: "簡単",
      done: "おめでとうございます！ このデッキは今のところ終了です。",
      restart: "最初から",
      left: (n) => `今日の残り ${n} 枚`,
      decks: "サンプルデッキ",
    },
    de: {
      screens: ["Heute", "Kartenzustand", "Sechs Wochen", "Lern-Haustier", "Deine Karten", "Behalten"],
      knob: "Drehknopf: Bildschirm wechseln",
      hint: "Knopf drehen · wischen · ← →",
      show: "Antwort zeigen",
      again: "Nochmal", hard: "Schwer", good: "Gut", easy: "Einfach",
      done: "Glückwunsch! Du hast diesen Stapel für heute geschafft.",
      restart: "Von vorn",
      left: (n) => `Heute noch ${n}`,
      decks: "Beispielstapel",
    },
  };
  const INTERVALS = { again: "<1m", hard: "6m", good: "10m", easy: "4d" };

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------------------------------------------------------------- state
  const state = {
    data: null, // demo.json
    lang: "en",
    sheet: null, // Image of the current language's frames
    remaining: 18,
    deck: null,
    listeners: new Set(),
  };
  function emit() {
    state.listeners.forEach((fn) => fn());
  }
  function panel() {
    return state.data.panels[state.lang] || state.data.panels.en;
  }
  function strings() {
    return STRINGS[state.lang] || STRINGS.en;
  }
  function pageLang() {
    const l = (document.documentElement.lang || "en").slice(0, 2);
    return STRINGS[l] ? l : "en";
  }

  function loadSheet(lang) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = BASE + state.data.panels[lang].sheet;
    });
  }

  // -------------------------------------------------------------- the LEDs
  class Panel {
    constructor(screenEl) {
      this.dots = document.createElement("canvas");
      this.dots.className = "hako-led";
      this.glow = document.createElement("canvas");
      this.glow.className = "hako-glow";
      this.glow.width = this.glow.height = 64;
      screenEl.append(this.dots, this.glow);
      this.frame = document.createElement("canvas");
      this.frame.width = this.frame.height = 64;
      this.fctx = this.frame.getContext("2d", { willReadFrequently: true });
      this.key = "";
      this.resize();
      new ResizeObserver(() => this.resize()).observe(screenEl);
    }

    resize() {
      const px = Math.round(this.dots.clientWidth * Math.min(window.devicePixelRatio || 1, 2));
      if (!px || px === this.size) return;
      this.size = this.dots.width = this.dots.height = px;
      // Unlit LEDs, drawn once
      this.off = document.createElement("canvas");
      this.off.width = this.off.height = px;
      const c = this.off.getContext("2d");
      const pitch = px / 64;
      c.fillStyle = "#0a0908";
      c.fillRect(0, 0, px, px);
      c.fillStyle = "#1b1915";
      c.beginPath();
      for (let y = 0; y < 64; y++) {
        for (let x = 0; x < 64; x++) {
          c.moveTo((x + 0.5) * pitch + pitch * 0.34, (y + 0.5) * pitch);
          c.arc((x + 0.5) * pitch, (y + 0.5) * pitch, pitch * 0.34, 0, Math.PI * 2);
        }
      }
      c.fill();
      this.key = ""; // force a redraw
    }

    draw(frame, overlay) {
      const key = `${frame}/${overlay}/${this.size}/${state.lang}`;
      if (key === this.key || !state.sheet) return;
      this.key = key;
      const cols = panel().cols;
      const f = this.fctx;
      f.drawImage(state.sheet, (frame % cols) * 64, Math.floor(frame / cols) * 64, 64, 64, 0, 0, 64, 64);
      if (overlay != null) {
        const [y0, y1] = panel().countRows;
        f.drawImage(state.sheet, (overlay % cols) * 64, Math.floor(overlay / cols) * 64 + y0,
          64, y1 - y0, 0, y0, 64, y1 - y0);
      }
      const img = f.getImageData(0, 0, 64, 64);
      this.glow.getContext("2d").putImageData(img, 0, 0);

      const ctx = this.dots.getContext("2d");
      const pitch = this.size / 64;
      const r = pitch * 0.4;
      ctx.drawImage(this.off, 0, 0);
      const byColor = new Map();
      const d = img.data;
      for (let i = 0; i < 4096; i++) {
        const R = d[i * 4], G = d[i * 4 + 1], B = d[i * 4 + 2];
        if (R + G + B < 24) continue;
        const k = (R << 16) | (G << 8) | B;
        let list = byColor.get(k);
        if (!list) byColor.set(k, (list = []));
        list.push(i);
      }
      byColor.forEach((list, k) => {
        ctx.fillStyle = `rgb(${k >> 16},${(k >> 8) & 255},${k & 255})`;
        ctx.beginPath();
        for (const i of list) {
          const cx = ((i & 63) + 0.5) * pitch;
          const cy = ((i >> 6) + 0.5) * pitch;
          ctx.moveTo(cx + r, cy);
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
        }
        ctx.fill();
      });
    }
  }

  // ------------------------------------------------------------ a display
  class Display {
    constructor(el) {
      this.el = el;
      this.autoplay = el.hasAttribute("data-autoplay") && !reduceMotion;
      this.screen = 0;
      this.lastTouch = -Infinity;
      this.shownSince = performance.now();
      this.angle = 0;

      el.innerHTML = `
        <div class="hako-box">
          <div class="hako-screen"></div>
          <button class="hako-knob" type="button"><span class="hako-knob-notch"></span></button>
        </div>
        <div class="hako-caption">
          <span class="hako-screen-name"></span>
          <span class="hako-dots"></span>
        </div>
        <p class="hako-hint"></p>`;
      this.panel = new Panel(el.querySelector(".hako-screen"));
      this.knob = el.querySelector(".hako-knob");
      this.nameEl = el.querySelector(".hako-screen-name");
      this.dotsEl = el.querySelector(".hako-dots");
      this.hintEl = el.querySelector(".hako-hint");
      this.dotsEl.innerHTML = panel().screens
        .map((_, i) => `<button type="button" data-i="${i}"></button>`).join("");
      this.dotsEl.addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (b) this.go(Number(b.dataset.i), true);
      });
      this.bindKnob();
      this.bindSwipe(el.querySelector(".hako-screen"));
      this.label();
      state.listeners.add(() => this.label());
    }

    label() {
      const s = strings();
      this.nameEl.textContent = s.screens[this.screen];
      this.knob.setAttribute("aria-label", s.knob);
      this.hintEl.textContent = s.hint;
      [...this.dotsEl.children].forEach((b, i) => {
        b.classList.toggle("on", i === this.screen);
        b.setAttribute("aria-label", s.screens[i]);
      });
    }

    go(i, byUser) {
      const n = panel().screens.length;
      this.screen = ((i % n) + n) % n;
      this.shownSince = performance.now();
      if (byUser) this.lastTouch = performance.now();
      this.label();
    }

    turn(step) {
      this.angle += step * 30;
      this.knob.style.setProperty("--angle", `${this.angle}deg`);
      this.go(this.screen + step, true);
    }

    show(name) {
      this.go(panel().screens.indexOf(name), true);
    }

    bindKnob() {
      const k = this.knob;
      // Click: right half turns right, left half turns left
      let dragged = false;
      k.addEventListener("click", (e) => {
        if (dragged) return;
        const rect = k.getBoundingClientRect();
        this.turn(e.clientX < rect.left + rect.width / 2 ? -1 : 1);
      });
      // Drag to rotate, one screen per 40 degrees
      let start = null, acc = 0;
      const angleAt = (e) => {
        const r = k.getBoundingClientRect();
        return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
      };
      k.addEventListener("pointerdown", (e) => {
        start = angleAt(e);
        acc = 0;
        dragged = false;
        k.setPointerCapture(e.pointerId);
      });
      k.addEventListener("pointermove", (e) => {
        if (start == null) return;
        const a = angleAt(e);
        let delta = a - start;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        start = a;
        acc += delta;
        if (Math.abs(acc) > 8) dragged = true;
        while (Math.abs(acc) >= 40) {
          const step = Math.sign(acc);
          this.turn(step);
          acc -= step * 40;
        }
      });
      const end = () => {
        start = null;
        setTimeout(() => (dragged = false), 0);
      };
      k.addEventListener("pointerup", end);
      k.addEventListener("pointercancel", end);
      k.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowUp") { this.turn(1); e.preventDefault(); }
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") { this.turn(-1); e.preventDefault(); }
      });
      // Scroll wheel over the knob
      let wheel = 0;
      k.addEventListener("wheel", (e) => {
        e.preventDefault();
        wheel += e.deltaY;
        if (Math.abs(wheel) > 60) {
          this.turn(Math.sign(wheel));
          wheel = 0;
        }
      }, { passive: false });
    }

    bindSwipe(target) {
      let x0 = null;
      target.addEventListener("pointerdown", (e) => { x0 = e.clientX; });
      target.addEventListener("pointerup", (e) => {
        if (x0 == null) return;
        const dx = e.clientX - x0;
        x0 = null;
        if (Math.abs(dx) > 30) this.turn(dx < 0 ? 1 : -1);
      });
      target.style.touchAction = "pan-y";
    }

    tick(now, t) {
      if (this.autoplay && now - this.lastTouch > RESUME_AFTER * 1000 &&
          now - this.shownSince > SCREEN_SECONDS * 1000) {
        this.go(this.screen + 1, false);
      }
      const p = panel();
      const r = state.remaining;
      const fps = p.fps;
      const tickN = Math.floor(t * fps);
      let frame, overlay = null;
      switch (p.screens[this.screen]) {
        case "today": frame = p.today[r]; break;
        case "heatmap": frame = p.heatmap[r]; break;
        case "health": frame = p.health; break;
        case "retention": frame = p.retention; break;
        case "pet": {
          const anim = p.pet.anim[p.pet.mood[r]];
          frame = anim[tickN % anim.length];
          overlay = p.pet.count[r];
          break;
        }
        case "cards": {
          const loop = p.cards[state.deck] || Object.values(p.cards)[0];
          // restart the loop whenever the screen is shown, so it begins at card 1
          const local = Math.floor(((now - this.shownSince) / 1000) * fps);
          frame = loop[local % loop.length];
          break;
        }
      }
      this.panel.draw(frame, overlay);
    }
  }

  // --------------------------------------------------------- the Anki card
  class AnkiCard {
    constructor(el, displays) {
      this.el = el;
      this.displays = displays;
      el.innerHTML = `
        <div class="anki-decks" role="tablist"></div>
        <div class="anki-window">
          <div class="anki-bar">
            <span class="anki-deck-name"></span>
            <span class="anki-counts"><b class="n">0</b><b class="l">0</b><b class="d">0</b></span>
          </div>
          <div class="anki-face">
            <div class="anki-front"></div>
            <div class="anki-back" hidden></div>
            <div class="anki-done" hidden></div>
          </div>
          <div class="anki-actions">
            <button type="button" class="anki-show"></button>
            <div class="anki-grades" hidden>
              ${["again", "hard", "good", "easy"].map((g, i) => `
                <button type="button" class="anki-grade ${g}" data-grade="${g}">
                  <small>${INTERVALS[g]}</small><span></span><kbd>${i + 1}</kbd>
                </button>`).join("")}
            </div>
            <button type="button" class="anki-restart" hidden></button>
          </div>
        </div>`;
      this.q = (s) => el.querySelector(s);
      this.q(".anki-show").addEventListener("click", () => this.reveal());
      this.q(".anki-grades").addEventListener("click", (e) => {
        const b = e.target.closest("[data-grade]");
        if (b) this.answer(b.dataset.grade);
      });
      this.q(".anki-restart").addEventListener("click", () => this.restart());
      this.q(".anki-decks").addEventListener("click", (e) => {
        const b = e.target.closest("[data-deck]");
        if (b) this.pickDeck(b.dataset.deck);
      });
      this.inView = false;
      new IntersectionObserver((es) => { this.inView = es[0].isIntersecting; }).observe(el);
      window.addEventListener("keydown", (e) => this.key(e));
      state.listeners.add(() => this.render());
      this.pickDeck(panel().decks[0]);
    }

    key(e) {
      if (!this.inView || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "")) return;
      if (e.key === " " || e.key === "Enter") {
        if (document.activeElement?.closest?.(".hako-display, .anki-decks, .anki-restart")) return;
        e.preventDefault();
        this.showing ? this.answer("good") : this.reveal();
      } else if (this.showing && "1234".includes(e.key)) {
        this.answer(["again", "hard", "good", "easy"][Number(e.key) - 1]);
      }
    }

    pickDeck(deck) {
      state.deck = deck;
      this.queue = state.data.decks[deck].cards.map((_, i) => i);
      for (let i = this.queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
      }
      this.showing = false;
      this.displays.forEach((d) => d.label());
      this.render();
      emit();
    }

    reveal() {
      if (state.remaining === 0) return;
      this.showing = true;
      this.render();
      this.q(".anki-grade.good").focus({ preventScroll: true });
    }

    answer(grade) {
      if (!this.showing) return;
      const card = this.queue.shift();
      this.queue.push(card); // the sample deck is small: cards come round again
      if (grade !== "again") state.remaining = Math.max(0, state.remaining - 1);
      this.showing = false;
      // show the effect on the panel
      this.displays.forEach((d) => {
        if (!d.autoplay) d.show(state.remaining === 0 ? "pet" : "today");
      });
      this.el.classList.remove("pulse");
      void this.el.offsetWidth;
      this.el.classList.add("pulse");
      emit();
      if (state.remaining === 0) this.q(".anki-restart").focus({ preventScroll: true });
      else this.q(".anki-show").focus({ preventScroll: true });
    }

    restart() {
      state.remaining = panel().remainingStart;
      this.pickDeck(state.deck);
    }

    render() {
      const s = strings();
      const lang = state.lang;
      const decks = panel().decks;
      if (!decks.includes(state.deck)) { this.pickDeck(decks[0]); return; }
      this.q(".anki-decks").innerHTML = decks.map((k) =>
        `<button type="button" role="tab" data-deck="${k}" aria-selected="${k === state.deck}">${state.data.decks[k].name[lang] || state.data.decks[k].name.en}</button>`
      ).join("");
      this.q(".anki-decks").setAttribute("aria-label", s.decks);
      const deck = state.data.decks[state.deck];
      const card = deck.cards[this.queue[0]];
      const finished = state.remaining === 0;
      this.q(".anki-deck-name").textContent = deck.name[lang] || deck.name.en;
      this.q(".anki-counts .d").textContent = state.remaining;
      this.q(".anki-counts").setAttribute("aria-label", s.left(state.remaining));
      this.q(".anki-front").textContent = finished ? "" : card.front;
      this.q(".anki-front").hidden = finished;
      this.q(".anki-front").classList.toggle("cjk", /[　-鿿]/.test(card.front));
      this.q(".anki-back").textContent = card.back[lang] || card.back.en;
      this.q(".anki-back").hidden = finished || !this.showing;
      this.q(".anki-done").textContent = s.done;
      this.q(".anki-done").hidden = !finished;
      this.q(".anki-show").textContent = s.show;
      this.q(".anki-show").hidden = finished || this.showing;
      this.q(".anki-grades").hidden = finished || !this.showing;
      for (const g of ["again", "hard", "good", "easy"]) {
        this.q(`.anki-grade.${g} span`).textContent = s[g];
      }
      this.q(".anki-restart").textContent = s.restart;
      this.q(".anki-restart").hidden = !finished;
    }
  }

  // ----------------------------------------------------------------- boot
  async function setLanguage(lang) {
    if (!state.data.panels[lang]) lang = "en";
    const sheet = await loadSheet(lang);
    state.lang = lang;
    state.sheet = sheet;
    emit();
  }

  async function boot() {
    const displayEls = document.querySelectorAll("[data-hako-display]");
    const ankiEl = document.querySelector("[data-hako-anki]");
    if (!displayEls.length) return;
    try {
      state.data = await (await fetch(BASE + "demo.json")).json();
      state.lang = pageLang();
      state.remaining = state.data.panels.en.remainingStart;
      state.sheet = await loadSheet(state.lang);
    } catch (e) {
      console.error("hako demo:", e);
      return;
    }
    const displays = [...displayEls].map((el) => new Display(el));
    if (ankiEl) new AnkiCard(ankiEl, displays);
    document.documentElement.classList.add("hako-demo-ready");

    const t0 = performance.now();
    let visible = true;
    document.addEventListener("visibilitychange", () => { visible = !document.hidden; });
    (function loop(now) {
      if (visible) {
        const t = (now - t0) / 1000;
        displays.forEach((d) => d.tick(now, t));
      }
      requestAnimationFrame(loop);
    })(t0);

    // The site's language switcher announces changes
    document.addEventListener("hako:lang", (e) => setLanguage(e.detail));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
