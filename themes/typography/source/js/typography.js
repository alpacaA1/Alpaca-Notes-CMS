var stage;
var backToTopButton;
var scrollTicking = false;

function updateSidebar() {
    if (!stage || !stage.length) {
        return;
    }
    if (window.innerWidth <= 768 || window.innerHeight <= 600) {
        $('#side-bar').innerWidth($('#stage').width());
        $('#main-container').removeClass('col-sm-9');
    } else {
        var sidebarW =
            stage.width() - $('#main-container').outerWidth() + (window.innerWidth - stage.innerWidth()) / 2;
        $('#side-bar').outerWidth(sidebarW);
        $('#main-container').addClass('col-sm-9');
    }
}

function updateBackToTop() {
    if (!backToTopButton || !backToTopButton.length) {
        return;
    }

    if ($(window).scrollTop() > 240) {
        backToTopButton.addClass('is-visible');
    } else {
        backToTopButton.removeClass('is-visible');
    }
}

function onScroll() {
    if (scrollTicking) {
        return;
    }
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
    backToTopButton = $('#back-to-top');
    if (!backToTopButton.length) {
        return;
    }

    if ($('body').css('color') === 'rgb(255, 255, 255)') {
        backToTopButton.addClass('back-to-top--inverse');
    }

    $(window).on('scroll', onScroll);
    updateBackToTop();

    backToTopButton.on('click', function () {
        var prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        $('html, body').stop(true).animate({ scrollTop: 0 }, prefersReducedMotion ? 0 : 240);
    });
}

$(document).ready(function () {
    stage = $('#stage');
    var resizeTicking = false;
    $(window).resize(function () {
        if (resizeTicking) {
            return;
        }
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
    });
    updateSidebar();
    $('.site-title').click(function () {
        $('.site-title a')[0].click();
    });
    initBackToTop();
});
