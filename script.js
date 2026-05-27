// ============================================================
// THEME TOGGLE — persists in localStorage
// ============================================================
(function() {
  const STORAGE_KEY = "hako-theme";
  const root = document.documentElement;

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "dark" || stored === "light") {
    root.setAttribute("data-theme", stored);
  } else {
    root.setAttribute("data-theme", "light");
  }

  const toggle = document.querySelector(".theme-toggle");
  if (toggle) {
    toggle.addEventListener("click", () => {
      const current = root.getAttribute("data-theme");
      const next = current === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      localStorage.setItem(STORAGE_KEY, next);
    });
  }
})();

// ============================================================
// REVEAL ON SCROLL
// ============================================================
(function() {
  const reveals = document.querySelectorAll(".reveal");
  if (!reveals.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("active");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: "0px 0px -60px 0px" }
  );

  reveals.forEach((el) => observer.observe(el));
})();

// ============================================================
// FAQ ACCORDION — keeps click-to-toggle behavior + ARIA
// ============================================================
(function() {
  const faqItems = document.querySelectorAll(".faq-item");
  faqItems.forEach((item) => {
    const button = item.querySelector(".faq-question");
    if (!button) return;
    button.addEventListener("click", () => {
      const wasActive = item.classList.contains("active");
      faqItems.forEach((other) => {
        other.classList.remove("active");
        const btn = other.querySelector(".faq-question");
        if (btn) btn.setAttribute("aria-expanded", "false");
      });
      if (!wasActive) {
        item.classList.add("active");
        button.setAttribute("aria-expanded", "true");
      }
    });
  });
})();

// ============================================================
// MOBILE NAV
// ============================================================
(function() {
  const btn = document.querySelector(".mobile-menu-btn");
  const nav = document.querySelector(".mobile-nav");
  if (!btn || !nav) return;

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    nav.classList.toggle("active");
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => nav.classList.remove("active"));
  });

  document.addEventListener("click", (e) => {
    if (!nav.contains(e.target) && !btn.contains(e.target)) {
      nav.classList.remove("active");
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") nav.classList.remove("active");
  });
})();

// ============================================================
// SCROLLED NAV STATE
// ============================================================
(function() {
  const nav = document.querySelector(".navbar");
  if (!nav) return;

  const onScroll = () => {
    if (window.scrollY > 12) {
      nav.classList.add("scrolled");
    } else {
      nav.classList.remove("scrolled");
    }
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
})();

// ============================================================
// NOTIFY FORM
// ============================================================
(function() {
  const form = document.getElementById("notifyForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const button = form.querySelector("button[type='submit']");
    const input = form.querySelector("input[type='email']");
    const email = input ? input.value.trim() : "";

    if (button) {
      button.disabled = true;
      button.textContent = "Sending…";
    }

    const formData = new FormData(form);
    const payload = Object.fromEntries(formData);

    try {
      const response = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.success) {
        showConfirmation(form, email);
      } else {
        showError(form, button, "Something went wrong. Please try again.");
      }
    } catch (err) {
      showError(form, button, "Couldn't reach the server. Please try again later.");
      console.error("Web3Forms error:", err);
    }
  });

  function showConfirmation(form, email) {
    form.style.display = "none";
    const message = document.createElement("p");
    message.style.cssText =
      "color: var(--accent); font-weight: 500; font-size: 17px; margin-top: 8px; line-height: 1.6;";
    message.textContent = email
      ? `You're on the list. I'll write to ${email} when it drops.`
      : "You're on the list. I'll write to you when it drops.";
    form.insertAdjacentElement("afterend", message);
  }

  function showError(form, button, msg) {
    if (button) {
      button.disabled = false;
      button.textContent = "Notify me";
    }
    const existing = form.parentElement.querySelector(".notify-error");
    if (existing) existing.remove();
    const err = document.createElement("p");
    err.className = "notify-error";
    err.style.cssText =
      "color: var(--accent); font-size: 13px; margin-top: 12px;";
    err.textContent = msg;
    form.insertAdjacentElement("afterend", err);
  }
})();

// ============================================================
// SIGNUP COUNTER
// Animates 0 → SIGNUP_COUNT when scrolled into view, with an
// ease-in-out curve. Hidden until the count crosses MIN_TO_SHOW
// to avoid showing anti-social proof at low numbers.
// ============================================================
(function() {
  const counter = document.getElementById("signupCounter");
  const numberEl = document.getElementById("counterNumber");
  if (!counter || !numberEl) return;

  const target = window.SIGNUP_COUNT || 0;
  const minToShow = window.MIN_TO_SHOW || 0;

  // Hide entirely until we have impressive numbers
  if (target < minToShow) {
    counter.style.display = "none";
    return;
  }

  // Reveal the counter to layout (it's visible but the number is still 0)
  counter.style.display = "";
  counter.setAttribute("aria-hidden", "false");

  // Respect users who don't want motion — just show the final number
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) {
    numberEl.textContent = target.toLocaleString();
    counter.classList.add("active");
    return;
  }

  // Cubic ease-in-out for a satisfying acceleration/deceleration curve
  function easeInOut(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function runCounter() {
    const duration = 1800;          // ms — slow enough to register, fast enough to not bore
    const start = performance.now();

    function frame(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeInOut(progress);
      const value = Math.round(eased * target);
      numberEl.textContent = value.toLocaleString();
      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        numberEl.textContent = target.toLocaleString();
      }
    }
    requestAnimationFrame(frame);
  }

  // Only start the count when the user can actually see it
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          counter.classList.add("active");
          runCounter();
          observer.unobserve(counter);
        }
      });
    },
    { threshold: 0.5 }
  );
  observer.observe(counter);
})();
