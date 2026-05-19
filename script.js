// =========================
// LOADER
// =========================

window.addEventListener("load", () => {
  const loader = document.querySelector(".loader");

  if (loader) {
    loader.classList.add("hidden");
  }
});

// =========================
// REVEAL ANIMATIONS
// =========================

const reveals = document.querySelectorAll(".reveal");

const observer = new IntersectionObserver(
  entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("active");
      }
    });
  },
  {
    threshold: 0.1
  }
);

reveals.forEach(el => observer.observe(el));

// =========================
// FAQ
// =========================

const faqItems = document.querySelectorAll(".faq-item");

faqItems.forEach(item => {

  const button = item.querySelector(".faq-question");

  button.addEventListener("click", () => {
    item.classList.toggle("active");
  });

});

// =========================
// CURSOR GLOW
// =========================

const glow = document.querySelector(".cursor-glow");

window.addEventListener("mousemove", e => {

  if (!glow) return;

  glow.style.left = `${e.clientX}px`;
  glow.style.top = `${e.clientY}px`;

});

// =========================
// MOBILE MENU
// =========================

const mobileBtn = document.querySelector(".mobile-menu-btn");
const mobileNav = document.querySelector(".mobile-nav");

if (mobileBtn && mobileNav) {

  mobileBtn.addEventListener("click", () => {
    mobileNav.classList.toggle("active");
  });

  // CLOSE MENU WHEN LINK CLICKED

  const mobileLinks = mobileNav.querySelectorAll("a");

  mobileLinks.forEach(link => {

    link.addEventListener("click", () => {
      mobileNav.classList.remove("active");
    });

  });

}