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
// ============================================================
// NOTIFY FORM — submits to Web3Forms via AJAX
// Each submission is emailed to you. Export CSV from Web3Forms dashboard.
// ============================================================
(function() {
  const form = document.getElementById("notifyForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const button = form.querySelector("button[type='submit']");
    const input = form.querySelector("input[type='email']");
    const email = input ? input.value.trim() : "";

    // Disable button + show pending state
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
