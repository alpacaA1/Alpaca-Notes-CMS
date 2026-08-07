(function () {
  'use strict';

  var stage = document.getElementById('stage');
  var sideBar = document.getElementById('side-bar');
  var mainContainer = document.getElementById('main-container');
  var backToTop = document.getElementById('back-to-top');
  var scrollTicking = false;
  var resizeTicking = false;

  function updateSidebar() {
    if (!stage || !sideBar) return;
    if (window.innerWidth <= 768 || window.innerHeight <= 600) {
      sideBar.style.width = stage.clientWidth + 'px';
      if (mainContainer) mainContainer.classList.remove('col-sm-9');
    } else {
      if (mainContainer) {
        var sidebarW = stage.clientWidth - mainContainer.offsetWidth +
          (window.innerWidth - stage.clientWidth) / 2;
        sideBar.style.width = sidebarW + 'px';
        mainContainer.classList.add('col-sm-9');
      }
    }
  }

  function updateBackToTop() {
    if (!backToTop) return;
    if (window.scrollY > 240) {
      backToTop.classList.add('is-visible');
    } else {
      backToTop.classList.remove('is-visible');
    }
  }

  function updateTocHighlight() {
    var headings = document.querySelectorAll('.post-content h1[id], .post-content h2[id], .post-content h3[id], .post-content h4[id], article h1[id], article h2[id], article h3[id]');
    var tocLinks = document.querySelectorAll('.toc a, .toc-link');
    if (!headings.length || !tocLinks.length) return;

    var scrollTop = window.scrollY || document.documentElement.scrollTop;
    var activeId = '';

    for (var i = 0; i < headings.length; i++) {
      var heading = headings[i];
      var top = heading.getBoundingClientRect().top + scrollTop;
      if (scrollTop >= top - 120) {
        activeId = heading.id;
      }
    }

    for (var j = 0; j < tocLinks.length; j++) {
      var link = tocLinks[j];
      var href = link.getAttribute('href') || '';
      if (activeId && href === '#' + activeId) {
        link.classList.add('is-active');
      } else {
        link.classList.remove('is-active');
      }
    }
  }

  function initImageLightbox() {
    var images = document.querySelectorAll('.post-content img, article img, .article-entry img');
    if (!images.length) return;

    var overlay = document.createElement('div');
    overlay.className = 'image-lightbox-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.85);display:none;align-items:center;justify-content:center;z-index:9999;cursor:zoom-out;backdrop-filter:blur(4px);transition:opacity 0.2s;';
    var imgEl = document.createElement('img');
    imgEl.style.cssText = 'max-width:92vw;max-height:92vh;object-fit:contain;box-shadow:0 8px 32px rgba(0,0,0,0.5);border-radius:6px;';
    overlay.appendChild(imgEl);
    document.body.appendChild(overlay);

    function closeLightbox() {
      overlay.style.display = 'none';
    }

    overlay.addEventListener('click', closeLightbox);
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeLightbox();
    });

    for (var i = 0; i < images.length; i++) {
      var img = images[i];
      img.style.cursor = 'zoom-in';
      img.addEventListener('click', function (e) {
        e.preventDefault();
        imgEl.src = this.src;
        imgEl.alt = this.alt || '';
        overlay.style.display = 'flex';
      });
    }
  }

  function onScroll() {
    if (scrollTicking) return;
    scrollTicking = true;
    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(function () {
        updateBackToTop();
        updateTocHighlight();
        scrollTicking = false;
      });
    } else {
      updateBackToTop();
      updateTocHighlight();
      scrollTicking = false;
    }
  }

  function initBackToTop() {
    if (!backToTop) return;
    var bodyColor = document.body.style.color ||
      window.getComputedStyle(document.body).color;
    if (bodyColor === 'rgb(255, 255, 255)') {
      backToTop.classList.add('back-to-top--inverse');
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    updateBackToTop();
    backToTop.addEventListener('click', function () {
      var reduced = window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) {
        window.scrollTo(0, 0);
        return;
      }
      var start = window.scrollY;
      var startTime = null;
      var duration = 240;
      function step(ts) {
        if (!startTime) startTime = ts;
        var p = Math.min((ts - startTime) / duration, 1);
        window.scrollTo(0, start * (1 - p));
        if (p < 1) window.requestAnimationFrame(step);
      }
      window.requestAnimationFrame(step);
    });
  }

  function onResize() {
    if (resizeTicking) return;
    resizeTicking = true;
    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(function () {
        updateSidebar();
        resizeTicking = false;
      });
    } else {
      updateSidebar();
      resizeTicking = false;
    }
  }

  function initSpeculationRules() {
    if (typeof HTMLScriptElement !== 'undefined' && HTMLScriptElement.supports && HTMLScriptElement.supports('speculationrules')) {
      var specScript = document.createElement('script');
      specScript.type = 'speculationrules';
      specScript.textContent = JSON.stringify({
        prerender: [
          {
            source: 'document',
            where: {
              and: [
                { href_matches: '/*' },
                { not: { href_matches: '/admin/*' } },
                { not: { href_matches: '/*#*' } }
              ]
            },
            eagerness: 'moderate'
          }
        ]
      });
      document.head.appendChild(specScript);
    }
  }

  function init() {
    updateSidebar();
    window.addEventListener('resize', onResize);
    initBackToTop();
    initImageLightbox();
    updateTocHighlight();
    initSpeculationRules();
    var siteTitle = document.querySelector('.site-title');
    if (siteTitle) {
      siteTitle.addEventListener('click', function (e) {
        var link = siteTitle.querySelector('a');
        if (link && e.target !== link) {
          link.click();
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();