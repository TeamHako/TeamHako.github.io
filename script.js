// ============================================================
// THEME TOGGLE — persists in localStorage
// ============================================================
(function() {
  const STORAGE_KEY = "hako-theme";
  const root = document.documentElement;

  // Initialize from localStorage or default to light (washi)
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "dark" || stored === "light") {
    root.setAttribute("data-theme", stored);
  } else {
    // No preference saved — default to light (washi paper aesthetic)
    root.setAttribute("data-theme", "light");
  }

  // Theme toggle button
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
// FAQ ACCORDION
// ============================================================
(function() {
  const faqItems = document.querySelectorAll(".faq-item");
  faqItems.forEach((item) => {
    const button = item.querySelector(".faq-question");
    if (!button) return;
    button.addEventListener("click", () => {
      // Close other open items for a cleaner reading experience
      const wasActive = item.classList.contains("active");
      faqItems.forEach((other) => other.classList.remove("active"));
      if (!wasActive) item.classList.add("active");
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

  // Close on link click
  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => nav.classList.remove("active"));
  });

  // Close on outside click
  document.addEventListener("click", (e) => {
    if (!nav.contains(e.target) && !btn.contains(e.target)) {
      nav.classList.remove("active");
    }
  });

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") nav.classList.remove("active");
  });
})();

// ============================================================
// SCROLLED NAV STATE (optional subtle shadow when scrolled)
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
// NOTIFY FORM — placeholder behavior until backend is wired
// ============================================================
(function() {
  const form = document.querySelector(".notify-form");
  if (!form) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = form.querySelector("input[type='email']");
    if (!input || !input.value.trim()) return;
    // TODO: wire to actual backend (Buttondown, ConvertKit, Mailchimp, etc.)
    // For now, show a confirmation by replacing the form contents.
    const email = input.value.trim();
    const container = form.parentElement;
    form.style.display = "none";
    const confirm = document.createElement("p");
    confirm.style.cssText = "color: var(--accent); font-weight: 500; font-size: 17px; margin-top: 8px;";
    confirm.textContent = `Thanks — I'll write to ${email} when it drops.`;
    form.insertAdjacentElement("afterend", confirm);
  });
})();
