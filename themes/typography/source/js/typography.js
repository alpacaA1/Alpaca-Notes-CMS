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

  function onScroll() {
    if (scrollTicking) return;
    scrollTicking = true;
    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(function () {
        updateBackToTop();
        scrollTicking = false;
      });
    } else {
      updateBackToTop();
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

  function init() {
    updateSidebar();
    window.addEventListener('resize', onResize);
    initBackToTop();
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