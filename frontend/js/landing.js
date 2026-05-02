(function () {
  function onReady(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback);
      return;
    }
    callback();
  }

  function bindScrolledNav() {
    var nav = document.getElementById("landingNav");
    if (!nav) {
      return;
    }

    function syncScrolledState() {
      nav.classList.toggle("scrolled", window.scrollY > 12);
    }

    syncScrolledState();
    window.addEventListener("scroll", syncScrolledState, { passive: true });
  }

  function bindSmoothAnchors() {
    var anchorLinks = Array.prototype.slice.call(document.querySelectorAll('a[href^="#"]'));
    anchorLinks.forEach(function (link) {
      link.addEventListener("click", function (event) {
        var href = link.getAttribute("href");
        if (!href || href === "#") {
          event.preventDefault();
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }

        var target = document.querySelector(href);
        if (!target) {
          return;
        }

        event.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function bindRevealSections() {
    var items = Array.prototype.slice.call(document.querySelectorAll(".reveal-section, .reveal-item"));
    if (!items.length) {
      return;
    }

    if (!("IntersectionObserver" in window)) {
      items.forEach(function (item) {
        item.classList.add("visible");
      });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) {
          return;
        }
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      });
    }, {
      threshold: 0.18,
      rootMargin: "0px 0px -10% 0px"
    });

    items.forEach(function (item) {
      observer.observe(item);
    });
  }

  onReady(function () {
    bindScrolledNav();
    bindSmoothAnchors();
    bindRevealSections();
  });
})();
