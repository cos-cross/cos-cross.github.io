/* ============================================================
   Cos-Cross Blog — 交互脚本
   无外部依赖,全部原生实现。
   ============================================================ */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  /* ---------- 1. 深浅色主题 ---------- */
  (function theme() {
    var KEY = 'cos-cross-theme';
    var saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) { saved = null; }

    function apply(mode) {
      root.setAttribute('data-theme', mode);
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', mode === 'light' ? '#f2f3fc' : '#06060e');
    }

    if (saved === 'light' || saved === 'dark') {
      apply(saved);
    } else {
      var prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
      apply(prefersLight ? 'light' : 'dark');
    }

    var btn = $('#theme-toggle');
    if (btn) {
      btn.addEventListener('click', function () {
        var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        apply(next);
        try { localStorage.setItem(KEY, next); } catch (e) { /* 忽略隐私模式报错 */ }
      });
    }
  })();

  /* ---------- 2. 导航 ---------- */
  (function nav() {
    var navEl = $('#site-nav');
    var burger = $('#nav-burger');
    var menu = $('#nav-menu');

    function onScroll() {
      if (!navEl) return;
      navEl.classList.toggle('is-stuck', window.scrollY > 12);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    if (burger && menu) {
      burger.addEventListener('click', function () {
        var open = menu.classList.toggle('is-open');
        burger.setAttribute('aria-expanded', String(open));
        document.body.classList.toggle('nav-open', open);
      });
      $$('.nav-link', menu).forEach(function (link) {
        link.addEventListener('click', function () {
          menu.classList.remove('is-open');
          burger.setAttribute('aria-expanded', 'false');
          document.body.classList.remove('nav-open');
        });
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && menu.classList.contains('is-open')) {
          menu.classList.remove('is-open');
          burger.setAttribute('aria-expanded', 'false');
          document.body.classList.remove('nav-open');
        }
      });
    }
  })();

  /* ---------- 3. 滚动淡入 ---------- */
  (function reveal() {
    var items = $$('.reveal');
    if (!items.length) return;

    if (reduceMotion || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry, i) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        setTimeout(function () { el.classList.add('is-visible'); }, Math.min(i * 70, 280));
        io.unobserve(el);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });

    items.forEach(function (el) { io.observe(el); });
  })();

  /* ---------- 4. 阅读进度 / 回到顶部 ---------- */
  (function progress() {
    var bar = $('#reading-progress');
    var toTop = $('#to-top');
    var ticking = false;

    function update() {
      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      var ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;

      if (bar) bar.style.width = (ratio * 100).toFixed(2) + '%';
      if (toTop) toTop.classList.toggle('is-on', window.scrollY > 520);

      var tocBar = $('#toc-progress-bar');
      if (tocBar) tocBar.style.width = (ratio * 100).toFixed(2) + '%';

      ticking = false;
    }

    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    }, { passive: true });

    update();

    if (toTop) {
      toTop.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
      });
    }
  })();

  /* ---------- 5. 目录高亮 ---------- */
  (function tocHighlight() {
    var tocEl = $('#post-toc');
    var content = $('#post-content');
    if (!tocEl || !content) return;

    var links = $$('.toc-link', tocEl);
    if (!links.length) { tocEl.style.display = 'none'; return; }

    var headings = links.map(function (link) {
      var id = decodeURIComponent((link.getAttribute('href') || '').replace(/^#/, ''));
      return id ? document.getElementById(id) : null;
    });

    function highlight() {
      var offset = window.scrollY + 130;
      var activeIndex = 0;
      for (var i = 0; i < headings.length; i++) {
        var h = headings[i];
        if (h && h.offsetTop <= offset) activeIndex = i;
      }
      links.forEach(function (link, i) { link.classList.toggle('is-active', i === activeIndex); });

      var active = links[activeIndex];
      if (active && tocEl.scrollHeight > tocEl.clientHeight) {
        var box = tocEl.querySelector('.toc-card');
        if (box) {
          var top = active.offsetTop - box.clientHeight / 2;
          if (top > 0) box.scrollTo({ top: top, behavior: 'smooth' });
        }
      }
    }

    highlight();
    window.addEventListener('scroll', function () { window.requestAnimationFrame(highlight); }, { passive: true });
  })();

  /* ---------- 6. 代码块复制 ---------- */
  (function codeCopy() {
    var blocks = $$('.post-content figure.highlight, .post-content > pre');
    blocks.forEach(function (block) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'code-copy';
      btn.textContent = '复制';

      btn.addEventListener('click', function () {
        var code = block.querySelector('code') || block.querySelector('pre');
        var text = code ? code.innerText : '';
        var done = function () {
          btn.textContent = '已复制!';
          setTimeout(function () { btn.textContent = '复制'; }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, function () { fallback(text, done); });
        } else {
          fallback(text, done);
        }
      });

      block.appendChild(btn);
    });

    function fallback(text, done) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { /* 忽略 */ }
      document.body.removeChild(ta);
    }
  })();

  /* ---------- 7. 复制文章链接 ---------- */
  (function share() {
    var btn = $('#share-btn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var url = window.location.href;
      var label = btn.querySelector('span') || btn;
      var original = btn.innerHTML;
      var ok = function () {
        btn.innerHTML = '链接已复制 ✓';
        setTimeout(function () { btn.innerHTML = original; }, 1800);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(ok, function () { window.prompt('复制这个链接:', url); });
      } else {
        window.prompt('复制这个链接:', url);
      }
    });
  })();

  /* ---------- 8. 站点运行天数 ---------- */
  (function siteDays() {
    var el = $('#site-days');
    var src = $('#site-since');
    if (!el || !src) return;
    var since = new Date(src.getAttribute('data-since') + 'T00:00:00');
    if (isNaN(since.getTime())) return;
    var days = Math.max(0, Math.floor((Date.now() - since.getTime()) / 86400000));
    var n = 0;
    var step = Math.max(1, Math.ceil(days / 40));
    var timer = setInterval(function () {
      n = Math.min(days, n + step);
      el.textContent = String(n);
      if (n >= days) clearInterval(timer);
    }, 26);
  })();

  /* ---------- 9. 连击 HUD(音游彩蛋) ---------- */
  (function combo() {
    var hud = $('#combo-hud');
    var numEl = $('#combo-num');
    if (!hud || !numEl || reduceMotion) return;

    var combo = 0;
    var lastY = window.scrollY;
    var lastJudge = 0;
    var judges = ['PERFECT', 'GREAT', 'COOL', 'PERFECT', 'GOOD'];

    window.addEventListener('scroll', function () {
      var y = window.scrollY;
      var delta = Math.abs(y - lastY);
      lastY = y;

      if (y < 60) {
        combo = 0;
      } else if (delta > 3) {
        combo += Math.min(4, Math.max(1, Math.round(delta / 42)));
      }

      numEl.textContent = String(combo);
      hud.classList.toggle('is-on', y > 90);

      var now = Date.now();
      if (combo > 0 && combo % 25 === 0 && now - lastJudge > 900) {
        lastJudge = now;
        var judge = $('.combo-judge', hud);
        if (judge) {
          judge.textContent = combo % 100 === 0 ? 'FULL COMBO!' : judges[(combo / 25) % judges.length | 0];
          hud.classList.remove('judge');
          void hud.offsetWidth;
          hud.classList.add('judge');
          setTimeout(function () { hud.classList.remove('judge'); }, 760);
        }
      }
    }, { passive: true });
  })();

  /* ---------- 10. 背景飘浮音符 ---------- */
  (function notes() {
    var canvas = $('#note-canvas');
    if (!canvas || reduceMotion) return;
    if (window.innerWidth < 760) { canvas.style.display = 'none'; return; }

    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var glyphs = ['♪', '♫', '♩', '♬', '◆'];
    var colors = ['#2ee6ff', '#9b7bff', '#ff5fd0', '#a6ff5c'];
    var particles = [];
    var dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function spawn(initial) {
      return {
        x: Math.random() * window.innerWidth,
        y: initial ? Math.random() * window.innerHeight : window.innerHeight + 30,
        size: 11 + Math.random() * 15,
        speed: 0.22 + Math.random() * 0.5,
        drift: (Math.random() - 0.5) * 0.28,
        alpha: 0.1 + Math.random() * 0.28,
        rot: (Math.random() - 0.5) * 0.5,
        rotSpeed: (Math.random() - 0.5) * 0.004,
        glyph: glyphs[(Math.random() * glyphs.length) | 0],
        color: colors[(Math.random() * colors.length) | 0]
      };
    }

    resize();
    var count = window.innerWidth > 1400 ? 22 : 15;
    for (var i = 0; i < count; i++) particles.push(spawn(true));

    window.addEventListener('resize', resize);

    (function loop() {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      particles.forEach(function (p) {
        p.y -= p.speed;
        p.x += p.drift;
        p.rot += p.rotSpeed;
        if (p.y < -40) { Object.assign(p, spawn(false)); }

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.font = p.size + 'px "Segoe UI Symbol", "Apple Symbols", serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.glyph, 0, 0);
        ctx.restore();
      });
      window.requestAnimationFrame(loop);
    })();
  })();

  /* ---------- 11. 数学公式(仅在文章声明 math: true 时) ---------- */
  (function math() {
    var content = $('#post-content');
    if (!content) return;

    function render() {
      if (typeof window.renderMathInElement !== 'function') return;
      try {
        window.renderMathInElement(content, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '\\[', right: '\\]', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\(', right: '\\)', display: false }
          ],
          throwOnError: false
        });
      } catch (e) { /* 公式报错不影响正文 */ }
    }

    // KaTeX 用 defer 加载,会晚于本脚本执行,所以要等 DOM 就绪后再渲染。
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', render);
    } else {
      render();
    }
    window.addEventListener('load', render);
  })();

  /* ---------- 12. 外部链接加标识 ---------- */
  (function external() {
    $$('.post-content a[href^="http"]').forEach(function (a) {
      if (a.hostname === window.location.hostname) return;
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    });
  })();
})();
