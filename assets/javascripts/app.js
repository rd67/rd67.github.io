(function () {
  "use strict";

  var CONFIG_PATH = "config.json";
  var LOCALE_KEY = "portfolio-locale";

  var themeStrings = { light: "", dark: "" };
  var themeBtnRef;
  var themeMetaRef;
  var revealObserver = null;
  /** Latest `cfg.ui` for menu ARIA refresh (mobile nav closes without re-running applyChromeI18n). */
  var chromeUiRef = null;

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function deepMerge(target, source) {
    if (!source || typeof source !== "object") return target;
    Object.keys(source).forEach(function (k) {
      var sv = source[k];
      if (sv === undefined) return;
      if (Array.isArray(sv)) {
        target[k] = sv.slice();
      } else if (sv !== null && typeof sv === "object" && sv.constructor === Object) {
        if (!target[k] || typeof target[k] !== "object" || Array.isArray(target[k])) target[k] = {};
        deepMerge(target[k], sv);
      } else {
        target[k] = sv;
      }
    });
    return target;
  }

  function getHtmlLang(supported, localeId) {
    for (var i = 0; supported && i < supported.length; i++) {
      if (supported[i].id === localeId) return supported[i].htmlLang || localeId;
    }
    return localeId || "en";
  }

  function getOgLocale(supported, localeId) {
    for (var i = 0; supported && i < supported.length; i++) {
      if (supported[i].id === localeId) return supported[i].ogLocale || "en_GB";
    }
    return "en_GB";
  }

  function resolveLocale(i18n) {
    var def = (i18n && i18n.defaultLocale) || "en";
    var supported = i18n && i18n.supported;
    var ids = [];
    for (var i = 0; supported && i < supported.length; i++) ids.push(supported[i].id);
    if (!ids.length) ids.push("en");
    try {
      var saved = localStorage.getItem(LOCALE_KEY);
      if (saved && ids.indexOf(saved) !== -1) return saved;
    } catch (e) {}
    var nav = (navigator.language || "").toLowerCase();
    var short = nav.split("-")[0];
    if (ids.indexOf(short) !== -1) return short;
    return def;
  }

  function loadLocaleOverrides(localeId) {
    if (!localeId || localeId === "en") return Promise.resolve({});
    return fetch("locales/" + localeId + ".json", { cache: "no-store" })
      .then(function (r) {
        return r.ok ? r.json() : {};
      })
      .catch(function () {
        return {};
      });
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatInline(s) {
    return escapeHtml(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  }

  function absAsset(siteUrl, path) {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    var base = String(siteUrl || "").replace(/\/$/, "");
    return base + (path.charAt(0) === "/" ? path : "/" + path);
  }

  function applyResumeUrl(url) {
    if (!url || String(url).indexOf("REPLACE") !== -1) return;
    document.querySelectorAll("[data-resume-link]").forEach(function (a) {
      a.href = url;
    });
  }

  function applySiteMeta(site, person, i18n, activeLocaleId) {
    var base = String(site.url || "").replace(/\/$/, "");
    document.title = site.title || "";

    var setMeta = function (sel, key, val) {
      var el = document.querySelector(sel);
      if (el && val != null) el.setAttribute(key, val);
    };

    setMeta('meta[name="description"]', "content", site.description);
    setMeta('meta[name="keywords"]', "content", site.keywords);
    setMeta('link[rel="canonical"]', "href", base + "/");

    setMeta('meta[property="og:title"]', "content", site.ogTitle || site.title);
    setMeta('meta[property="og:description"]', "content", site.ogDescription || site.description);
    setMeta('meta[property="og:url"]', "content", base + "/");
    setMeta('meta[property="og:image"]', "content", absAsset(base, site.ogImage));
    setMeta('meta[property="og:image:width"]', "content", site.ogImageWidth);
    setMeta('meta[property="og:image:height"]', "content", site.ogImageHeight);
    setMeta('meta[property="og:image:alt"]', "content", site.ogImageAlt);

    var supported = (i18n && i18n.supported) || [];
    var ogLoc = getOgLocale(supported, activeLocaleId);
    setMeta('meta[property="og:locale"]', "content", ogLoc);
    document.querySelectorAll('meta[property="og:locale:alternate"]').forEach(function (m) {
      m.remove();
    });
    for (var a = 0; a < supported.length; a++) {
      if (supported[a].id === activeLocaleId) continue;
      var alt = supported[a].ogLocale;
      if (!alt) continue;
      var m = document.createElement("meta");
      m.setAttribute("property", "og:locale:alternate");
      m.setAttribute("content", alt);
      document.head.appendChild(m);
    }

    setMeta('meta[name="twitter:title"]', "content", site.twitterTitle || site.ogTitle || site.title);
    setMeta('meta[name="twitter:description"]', "content", site.twitterDescription || site.ogDescription);
    setMeta('meta[name="twitter:image"]', "content", absAsset(base, site.ogImage));
    setMeta('meta[name="twitter:image:alt"]', "content", site.ogImageAlt);

    var ldEl = document.getElementById("json-ld-person");
    if (ldEl) {
      var sameAs = [];
      for (var s = 0; person.social && s < person.social.length; s++) {
        var soc = person.social[s];
        if (soc.external && /^https?:\/\//i.test(soc.href)) sameAs.push(soc.href);
      }
      var graph = {
        "@context": "https://schema.org",
        "@type": "Person",
        name: person.name,
        url: base + "/",
        image: absAsset(base, person.photo && person.photo.src),
        email: person.email,
        jobTitle: person.jsonLd && person.jsonLd.jobTitle,
        worksFor: {
          "@type": "Organization",
          name: (person.jsonLd && person.jsonLd.worksFor) || "",
        },
        sameAs: sameAs,
        knowsAbout: (person.jsonLd && person.jsonLd.knowsAbout) || [],
      };
      ldEl.textContent = JSON.stringify(graph);
    }
  }

  function uiSections(cfg, key) {
    return (cfg.ui && cfg.ui.sections && cfg.ui.sections[key]) || key;
  }

  function buildHero(cfg) {
    var h = cfg.hero;
    var p = cfg.person;
    var uih = (cfg.ui && cfg.ui.hero) || {};
    var subj = encodeURIComponent(h.emailSubject || "Hello");
    var emailHref = "mailto:" + escapeHtml(p.email) + "?subject=" + subj;

    var lead = "";
    for (var i = 0; h.lead && i < h.lead.length; i++) {
      lead += '<p class="hero__lead hero__anim hero__anim--' + (4 + i) + '">' + formatInline(h.lead[i]) + "</p>";
    }

    var meta = "";
    for (var m = 0; h.meta && m < h.meta.length; m++) {
      var it = h.meta[m];
      meta +=
        '<div class="hero__meta-item">' +
        '<div class="hero__meta-term">' +
        escapeHtml(it.term) +
        "</div>" +
        '<div class="hero__meta-value">' +
        formatInline(it.value) +
        "</div></div>";
    }

    var social = "";
    for (var j = 0; p.social && j < p.social.length; j++) {
      var soc = p.social[j];
      var rel = soc.external ? ' target="_blank" rel="noopener noreferrer"' : "";
      var text = soc.display || soc.label;
      social +=
        "<li><a href=\"" +
        escapeHtml(soc.href) +
        '"' +
        rel +
        ">" +
        escapeHtml(text) +
        "</a></li>";
    }

    var ph = p.photo || {};
    var sumAria = escapeHtml(uih.summaryAria || "Summary");
    var socAria = escapeHtml(uih.socialAria || "Social profiles");
    return (
      '<div class="hero__copy">' +
      '<p class="eyebrow hero__anim hero__anim--1">' +
      escapeHtml(h.eyebrow) +
      "</p>" +
      '<h1 id="hero-heading" class="hero__title hero__anim hero__anim--2">' +
      formatInline(h.title) +
      "</h1>" +
      lead +
      '<div class="hero__cta hero__anim hero__anim--3">' +
      '<a class="btn btn--primary" href="' +
      emailHref +
      "\">" +
      escapeHtml(uih.emailMe || "Email me") +
      "</a>" +
      '<a class="btn btn--secondary resume-link" href="#" data-resume-link target="_blank" rel="noopener noreferrer">' +
      escapeHtml(uih.viewResume || "View résumé") +
      "</a>" +
      "</div>" +
      '<ul class="social hero__anim hero__anim--6" aria-label="' +
      socAria +
      '">' +
      social +
      "</ul></div>" +
      '<figure class="hero__figure hero__anim hero__anim--fig">' +
      '<div class="hero__photo-wrap">' +
      '<img class="hero__photo" src="' +
      escapeHtml(ph.src) +
      '" width="' +
      (ph.width || 480) +
      '" height="' +
      (ph.height || 480) +
      '" alt="' +
      escapeHtml(ph.alt) +
      '" decoding="async" fetchpriority="high" />' +
      "</div>" +
      '<figcaption class="hero__meta">' +
      '<div class="hero__meta-grid" role="group" aria-label="' +
      sumAria +
      '">' +
      meta +
      "</div></figcaption></figure>"
    );
  }

  function buildAbout(cfg) {
    var html = "";
    for (var i = 0; cfg.about.paragraphs && i < cfg.about.paragraphs.length; i++) {
      html += "<p>" + formatInline(cfg.about.paragraphs[i]) + "</p>";
    }
    var title = escapeHtml(uiSections(cfg, "about"));
    return (
      '<section class="section reveal" id="about" aria-labelledby="about-heading">' +
      '<h2 id="about-heading" class="section__title">' +
      title +
      "</h2>" +
      '<div class="prose">' +
      html +
      "</div></section>"
    );
  }

  function buildJobs(cfg) {
    var jobs = cfg.experience && cfg.experience.jobs;
    var jobCurrent = (cfg.ui && cfg.ui.jobCurrent) || "Current";
    var secTitle = escapeHtml(uiSections(cfg, "experience"));
    var out = "";
    for (var i = 0; jobs && i < jobs.length; i++) {
      var job = jobs[i];
      var delay = (i * 0.05).toFixed(2) + "s";
      var badge = job.current ? '<span class="job__badge">' + escapeHtml(jobCurrent) + "</span>" : "";
      var bullets = "";
      for (var b = 0; job.bullets && b < job.bullets.length; b++) {
        bullets += "<li>" + formatInline(job.bullets[b]) + "</li>";
      }
      out +=
        '<li class="job reveal reveal--stagger" style="--reveal-delay:' +
        delay +
        '">' +
        '<div class="job__meta">' +
        '<span class="job__role">' +
        escapeHtml(job.role) +
        "</span>" +
        badge +
        '<span class="job__org">' +
        escapeHtml(job.org) +
        "</span>" +
        '<span class="job__dates">' +
        escapeHtml(job.dates) +
        "</span></div>" +
        '<ul class="job__bullets">' +
        bullets +
        "</ul></li>";
    }
    return (
      '<section class="section reveal" id="experience" aria-labelledby="exp-heading">' +
      '<h2 id="exp-heading" class="section__title">' +
      secTitle +
      "</h2>" +
      '<ol class="jobs">' +
      out +
      "</ol></section>"
    );
  }

  function buildProjects(cfg) {
    var proj = cfg.projects;
    var tagsAria = escapeHtml((cfg.ui && cfg.ui.tagsAria) || "Technologies");
    var items = "";
    for (var i = 0; proj.items && i < proj.items.length; i++) {
      var p = proj.items[i];
      var delay = (i * 0.06).toFixed(2) + "s";
      var tags = "";
      for (var t = 0; p.tags && t < p.tags.length; t++) {
        tags += "<li>" + escapeHtml(p.tags[t]) + "</li>";
      }
      items +=
        '<li class="project reveal reveal--stagger" style="--reveal-delay:' +
        delay +
        '">' +
        '<h3 class="project__name">' +
        escapeHtml(p.name) +
        "</h3>" +
        '<p class="project__desc">' +
        formatInline(p.desc) +
        "</p>" +
        '<ul class="tags" aria-label="' +
        tagsAria +
        '">' +
        tags +
        "</ul></li>";
    }
    return (
      '<section class="section reveal" id="projects" aria-labelledby="proj-heading">' +
      '<h2 id="proj-heading" class="section__title">' +
      escapeHtml(proj.title || "Selected work") +
      "</h2>" +
      '<p class="section__lede">' +
      formatInline(proj.lede || "") +
      "</p>" +
      '<ul class="projects">' +
      items +
      "</ul></section>"
    );
  }

  function buildSkills(cfg) {
    var sk = cfg.skills;
    var sec = escapeHtml(uiSections(cfg, "skills"));
    var groups = "";
    for (var g = 0; sk.groups && g < sk.groups.length; g++) {
      var gr = sk.groups[g];
      var delay = (g * 0.05).toFixed(2) + "s";
      var tags = "";
      for (var t = 0; gr.tags && t < gr.tags.length; t++) {
        tags += "<li>" + escapeHtml(gr.tags[t]) + "</li>";
      }
      groups +=
        '<div class="skill-group reveal reveal--stagger" style="--reveal-delay:' +
        delay +
        '">' +
        '<h3 class="skill-group__label">' +
        escapeHtml(gr.label) +
        "</h3>" +
        '<ul class="tags">' +
        tags +
        "</ul></div>";
    }
    return (
      '<section class="section reveal" id="skills" aria-labelledby="skills-heading">' +
      '<h2 id="skills-heading" class="section__title">' +
      sec +
      "</h2>" +
      '<div class="skill-groups">' +
      groups +
      "</div></section>"
    );
  }

  function buildEducation(cfg) {
    var edu = cfg.education;
    var eduTitle = escapeHtml(uiSections(cfg, "education"));
    var intTitle = escapeHtml(uiSections(cfg, "interests"));
    var items = "";
    for (var i = 0; edu.items && i < edu.items.length; i++) {
      var e = edu.items[i];
      if (!e.degree && !e.school) continue;
      items +=
        "<li>" +
        '<span class="edu__degree">' +
        escapeHtml(e.degree) +
        "</span>" +
        '<span class="edu__school">' +
        escapeHtml(e.school) +
        "</span>" +
        '<span class="edu__year">' +
        escapeHtml(e.year) +
        "</span></li>";
    }
    var interests = "";
    for (var k = 0; edu.interests && k < edu.interests.length; k++) {
      interests += "<li>" + escapeHtml(edu.interests[k]) + "</li>";
    }
    return (
      '<section class="section section--two reveal" id="education" aria-labelledby="edu-heading">' +
      "<div>" +
      '<h2 id="edu-heading" class="section__title">' +
      eduTitle +
      "</h2>" +
      '<ul class="edu">' +
      items +
      "</ul></div><div>" +
      '<h2 class="section__title" id="interests-heading">' +
      intTitle +
      "</h2>" +
      '<ul class="tags tags--block" aria-labelledby="interests-heading">' +
      interests +
      "</ul></div></section>"
    );
  }

  function findSocial(social, label) {
    for (var i = 0; social && i < social.length; i++) {
      if (social[i].label === label) return social[i];
    }
    return null;
  }

  function buildContact(cfg) {
    var c = cfg.contact;
    var p = cfg.person;
    var ui = cfg.ui || {};
    var li = findSocial(p.social, "LinkedIn") || { href: "#" };
    var gh = findSocial(p.social, "GitHub") || { href: "#" };
    var ln = escapeHtml(ui.linkedin || "LinkedIn");
    var ghL = escapeHtml(ui.github || "GitHub");
    return (
      '<section class="section section--contact reveal" id="contact" aria-labelledby="contact-heading">' +
      '<div class="contact-card">' +
      '<h2 id="contact-heading" class="contact-card__title">' +
      escapeHtml(c.title) +
      "</h2>" +
      '<p class="contact-card__text">' +
      formatInline(c.text) +
      "</p>" +
      '<a class="btn btn--primary btn--lg" href="mailto:' +
      escapeHtml(p.email) +
      '">' +
      escapeHtml(p.email) +
      "</a>" +
      '<p class="contact-card__fine">' +
      '<a href="' +
      escapeHtml(li.href) +
      '" target="_blank" rel="noopener noreferrer">' +
      ln +
      "</a>" +
      " · " +
      '<a href="' +
      escapeHtml(gh.href) +
      '" target="_blank" rel="noopener noreferrer">' +
      ghL +
      "</a>" +
      " · " +
      '<a class="resume-link" href="#" data-resume-link target="_blank" rel="noopener noreferrer">' +
      escapeHtml(c.resumeLabel) +
      "</a></p></div></section>"
    );
  }

  function renderApp(cfg) {
    var root = document.getElementById("app-root");
    if (!root) return;

    root.innerHTML =
      '<div id="top" class="layout layout--hero" tabindex="-1">' +
      '<section class="hero" id="hero-section" aria-labelledby="hero-heading">' +
      buildHero(cfg) +
      "</section></div>" +
      '<div class="layout">' +
      buildAbout(cfg) +
      buildJobs(cfg) +
      buildProjects(cfg) +
      buildSkills(cfg) +
      buildEducation(cfg) +
      buildContact(cfg) +
      "</div>";

    applyResumeUrl(cfg.resumeUrl);
  }

  function syncThemeAria() {
    if (!themeBtnRef) return;
    themeBtnRef.setAttribute(
      "aria-label",
      document.documentElement.getAttribute("data-theme") === "dark"
        ? themeStrings.light
        : themeStrings.dark
    );
  }

  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }

  function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("theme", theme);
    } catch (e) {}
    if (themeMetaRef) {
      themeMetaRef.setAttribute("content", theme === "dark" ? "#0a0c10" : "#fafafa");
    }
    syncThemeAria();
  }

  function updateThemeStrings(ui) {
    themeStrings.light = (ui && ui.themeToggleLight) || "Switch to light mode";
    themeStrings.dark = (ui && ui.themeToggleDark) || "Switch to dark mode";
    syncThemeAria();
  }

  function ensureThemeInit(ui) {
    themeBtnRef = document.getElementById("theme-toggle");
    themeMetaRef = document.getElementById("meta-theme-color");
    updateThemeStrings(ui);
    if (themeBtnRef && !themeBtnRef.dataset.themeInit) {
      themeBtnRef.dataset.themeInit = "1";
      setTheme(currentTheme());
      themeBtnRef.addEventListener("click", function () {
        setTheme(currentTheme() === "dark" ? "light" : "dark");
      });
    } else {
      syncThemeAria();
    }
  }

  function refreshMenuAria(ui) {
    var menuBtn = document.getElementById("menu-toggle");
    var header = document.querySelector(".header");
    if (!menuBtn || !ui) return;
    var open = header && header.classList.contains("header--open");
    menuBtn.setAttribute("aria-label", open ? ui.menuClose : ui.menuOpen);
  }

  function ensureMobileNav(ui) {
    var header = document.querySelector(".header");
    var menuBtn = document.getElementById("menu-toggle");
    var nav = document.getElementById("nav");
    if (!menuBtn || !header || !nav || menuBtn.dataset.navInit) return;
    menuBtn.dataset.navInit = "1";

    menuBtn.addEventListener("click", function () {
      var open = header.classList.toggle("header--open");
      menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
      if (chromeUiRef) refreshMenuAria(chromeUiRef);
    });

    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        header.classList.remove("header--open");
        menuBtn.setAttribute("aria-expanded", "false");
        if (chromeUiRef) refreshMenuAria(chromeUiRef);
      });
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && header.classList.contains("header--open")) {
        header.classList.remove("header--open");
        menuBtn.setAttribute("aria-expanded", "false");
        if (chromeUiRef) refreshMenuAria(chromeUiRef);
        menuBtn.focus();
      }
    });
  }

  function applyChromeI18n(cfg) {
    var ui = cfg.ui || {};
    chromeUiRef = ui;

    var skip = document.querySelector(".skip-link");
    if (skip) skip.textContent = ui.skipToContent || "Skip to content";

    var nav = document.getElementById("nav");
    if (nav && ui.nav) {
      nav.setAttribute("aria-label", ui.navAria || "Primary navigation");
      nav.querySelectorAll("a[data-nav]").forEach(function (a) {
        var k = a.getAttribute("data-nav");
        if (ui.nav[k]) a.textContent = ui.nav[k];
      });
    }

    var resumeHeader = document.querySelector(".header__actions .resume-link");
    if (resumeHeader) resumeHeader.textContent = ui.resume || "Résumé";

    var langSel = document.getElementById("lang-select");
    if (langSel) langSel.setAttribute("aria-label", ui.langSelectAria || "Language");

    var scrollBtn = document.getElementById("scroll-top");
    if (scrollBtn) {
      scrollBtn.setAttribute("aria-label", ui.scrollTop || "Scroll to top");
      scrollBtn.setAttribute("title", ui.scrollTopTitle || ui.scrollTop || "Scroll to top");
    }

    updateThemeStrings(ui);
    refreshMenuAria(ui);

    var footerSuffix = document.getElementById("footer-rights");
    if (footerSuffix) footerSuffix.textContent = ui.rightsReserved || "All rights reserved";

    var err = document.getElementById("config-error");
    if (err && ui.configError) err.innerHTML = ui.configError;
  }

  function populateLangSelect(i18n, currentId) {
    var sel = document.getElementById("lang-select");
    if (!sel) return;
    var supported = (i18n && i18n.supported) || [];
    sel.innerHTML = "";
    for (var i = 0; i < supported.length; i++) {
      var L = supported[i];
      var o = document.createElement("option");
      o.value = L.id;
      o.textContent = L.label || L.id;
      sel.appendChild(o);
    }
    sel.value = currentId;
  }

  function setupRevealAnimations() {
    if (revealObserver) revealObserver.disconnect();

    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.body.classList.add(reduce ? "motion-reduce" : "motion-ok");

    if (reduce) {
      document.querySelectorAll(".reveal").forEach(function (el) {
        el.classList.add("is-visible");
      });
      return;
    }

    revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) e.target.classList.add("is-visible");
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.08 }
    );

    document.querySelectorAll(".reveal").forEach(function (el) {
      el.classList.remove("is-visible");
      revealObserver.observe(el);
    });
  }

  function triggerHeroMotion() {
    var hero = document.getElementById("hero-section");
    if (!hero || document.body.classList.contains("motion-reduce")) return;
    hero.classList.remove("hero--motion");
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        hero.classList.add("hero--motion");
      });
    });
  }

  function initScrollTop() {
    var btn = document.getElementById("scroll-top");
    if (!btn) return;

    var threshold = 480;
    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    function syncVisibility() {
      var y = window.scrollY || document.documentElement.scrollTop;
      var show = y > threshold;
      btn.hidden = !show;
      btn.setAttribute("aria-hidden", show ? "false" : "true");
    }

    var ticking = false;
    function onScroll() {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(function () {
          ticking = false;
          syncVisibility();
        });
      }
    }

    btn.addEventListener("click", function () {
      window.scrollTo({
        top: 0,
        behavior: reduceMotion.matches ? "auto" : "smooth",
      });
      var topEl = document.getElementById("top");
      if (topEl) {
        requestAnimationFrame(function () {
          try {
            topEl.focus({ preventScroll: true });
          } catch (e) {
            topEl.focus();
          }
        });
      }
    });

    syncVisibility();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", syncVisibility, { passive: true });
  }

  var scrollSpyBound = false;

  function initScrollSpy() {
    if (scrollSpyBound) return;
    scrollSpyBound = true;

    var header = document.querySelector(".header");
    var navLinks = document.querySelectorAll(".nav [data-nav]");
    if (!navLinks.length) return;

    var sectionIds = ["about", "experience", "projects", "skills", "education", "contact"];
    var scrollSpyTicking = false;

    function headerHeight() {
      return header && header.offsetHeight ? header.offsetHeight : 64;
    }

    /** Document Y of the “reading line” — scales with viewport so tall screens (iPad) don’t stay stuck on a long Skills block. */
    function readingLineDocY(scrollY) {
      var headerH = headerHeight();
      var vh = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 600);
      var visibleBelowHeader = Math.max(0, vh - headerH);
      var offset = headerH + Math.round(Math.max(visibleBelowHeader * 0.28, Math.min(180, headerH * 1.2)));
      return scrollY + offset;
    }

    function setNavActive(slug) {
      navLinks.forEach(function (a) {
        var on = a.getAttribute("data-nav") === slug;
        a.classList.toggle("nav__active", on);
        if (on) a.setAttribute("aria-current", "page");
        else a.removeAttribute("aria-current");
      });
    }

    function updateScrollSpy() {
      scrollSpyTicking = false;
      var y = window.scrollY || document.documentElement.scrollTop;
      var vh = window.innerHeight || document.documentElement.clientHeight || 0;
      var docEl = document.documentElement;
      var scrollH = docEl.scrollHeight || document.body.scrollHeight || 0;
      var maxY = Math.max(0, scrollH - vh);
      var active = "";

      if (vh > 0 && scrollH > vh + 40 && y >= maxY - 8) {
        active = "contact";
      } else {
        var lineY = readingLineDocY(y);
        for (var i = 0; i < sectionIds.length; i++) {
          var el = document.getElementById(sectionIds[i]);
          if (!el) continue;
          var top = el.getBoundingClientRect().top + y;
          if (lineY >= top) active = sectionIds[i];
        }
      }

      setNavActive(active);
    }

    function onScrollOrResize() {
      if (!scrollSpyTicking) {
        scrollSpyTicking = true;
        requestAnimationFrame(updateScrollSpy);
      }
    }

    updateScrollSpy();
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize, { passive: true });
  }

  function bindLangSwitch(base, i18n) {
    var sel = document.getElementById("lang-select");
    if (!sel || sel.dataset.bound) return;
    sel.dataset.bound = "1";
    sel.addEventListener("change", function () {
      var id = sel.value;
      try {
        localStorage.setItem(LOCALE_KEY, id);
      } catch (e) {}
      document.documentElement.lang = getHtmlLang(i18n.supported, id);
      loadLocaleOverrides(id).then(function (over) {
        var merged = clone(base);
        deepMerge(merged, over);
        applySiteMeta(merged.site, merged.person, i18n, id);
        renderApp(merged);
        applyChromeI18n(merged);
        sel.value = id;
        setupRevealAnimations();
        triggerHeroMotion();
      });
    });
  }

  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  initScrollTop();

  fetch(CONFIG_PATH, { cache: "no-store" })
    .then(function (r) {
      if (!r.ok) throw new Error("bad config");
      return r.json();
    })
    .then(function (base) {
      var i18n = base.i18n || {
        defaultLocale: "en",
        supported: [{ id: "en", label: "English", htmlLang: "en", ogLocale: "en_GB" }],
      };
      var locale = resolveLocale(i18n);
      document.documentElement.lang = getHtmlLang(i18n.supported, locale);
      return loadLocaleOverrides(locale).then(function (over) {
        var merged = clone(base);
        deepMerge(merged, over);
        return { base: base, merged: merged, locale: locale, i18n: i18n };
      });
    })
    .then(function (ctx) {
      applySiteMeta(ctx.merged.site, ctx.merged.person, ctx.i18n, ctx.locale);
      renderApp(ctx.merged);
      applyChromeI18n(ctx.merged);
      populateLangSelect(ctx.i18n, ctx.locale);
      bindLangSwitch(ctx.base, ctx.i18n);
      ensureThemeInit(ctx.merged.ui);
      ensureMobileNav(ctx.merged.ui);
      initScrollSpy();
      setupRevealAnimations();
      triggerHeroMotion();
    })
    .catch(function () {
      var err = document.getElementById("config-error");
      if (err) err.hidden = false;
    });
})();
