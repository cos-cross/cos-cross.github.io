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
    // 可运行笔记单元格(nb-cell)自带 bar 上的复制按钮,这里要排除掉,
    // 免得同一个代码块上出现两个复制按钮。
    var blocks = $$('.post-content figure.highlight, .post-content > pre').filter(function (block) {
      return !(block.closest && block.closest('.nb-cell'));
    });
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

  /* ---------- 6.1 可运行笔记单元格:复制代码 ---------- */
  (function nbCopy() {
    $$('.nb-copy').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var cell = btn.closest('.nb-cell');
        var codeEl = cell && cell.querySelector('.highlight td.code, .highlight pre');
        if (!codeEl) return;
        var text = codeEl.innerText;

        var done = function () {
          var original = btn.textContent;
          btn.textContent = '已复制 ✓';
          setTimeout(function () { btn.textContent = original; }, 1600);
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, function () { window.prompt('复制这段代码:', text); });
        } else {
          window.prompt('复制这段代码:', text);
        }
      });
    });
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

  /* ---------- 10.1 媒体背景(视频壁纸) ---------- */
  (function mediaBackground() {
    var wrap = $('#bg-media');
    var video = $('#bg-video');
    if (!wrap) return;

    var toggle = $('#bg-toggle');
    var KEY = 'cos-cross-bg-paused';
    var mobile = wrap.getAttribute('data-mobile') || 'poster';

    function pausedPref() {
      try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; }
    }

    function savePaused(v) {
      try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) { /* 忽略 */ }
    }

    function markPaused(v) {
      wrap.classList.toggle('is-paused', v);
      if (toggle) {
        toggle.classList.toggle('is-paused', v);
        toggle.setAttribute('aria-label', v ? '播放背景动画' : '暂停背景动画');
      }
    }

    if (!video) {
      // 只有静态图:开关没有意义,直接隐藏按钮
      if (toggle) toggle.style.display = 'none';
      return;
    }

    // 手机端默认只显示封面图,省流量;data-mobile="video" 时才加载
    var allowVideo = mobile === 'video'
      || (mobile !== 'off' && window.innerWidth >= 760);

    // 用户开了「减少动态效果」就不自动播放,只显示封面
    if (reduceMotion) allowVideo = false;

    var loaded = false;
    function ensureLoaded() {
      if (loaded) return;
      loaded = true;
      video.src = video.getAttribute('data-src');
      video.load();
    }

    function play() {
      ensureLoaded();
      var p = video.play();
      if (p && typeof p.catch === 'function') p.catch(function () { /* 自动播放被拦截,保留封面 */ });
    }

    video.addEventListener('loadeddata', function () { video.classList.add('is-ready'); });

    var paused = pausedPref();
    markPaused(paused);

    if (allowVideo && !paused) {
      // 首屏优先渲染内容,背景视频晚一点再加载
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(play, { timeout: 2500 });
      } else {
        setTimeout(play, 400);
      }
    }

    if (toggle) {
      toggle.addEventListener('click', function () {
        paused = !paused;
        savePaused(paused);
        markPaused(paused);
        if (paused) {
          video.pause();
        } else if (allowVideo) {
          play();
        }
      });
    }

    // 切到后台就暂停,别白白烧电
    document.addEventListener('visibilitychange', function () {
      if (!loaded) return;
      if (document.hidden) video.pause();
      else if (!paused && allowVideo) play();
    });
  })();

  /* ---------- 11. 数学公式 ----------
     公式已经在构建期由 scripts/math.js 用 KaTeX 渲染成静态 HTML,
     前端不需要再做任何事(也因此省掉了 266 KB 的 KaTeX 脚本下载)。 */

  /* ---------- 12.1 资源下载页:文件名筛选 ---------- */
  (function fileFilter() {
    var input = $('#file-filter');
    var countEl = $('#file-count');
    var emptyEl = $('#file-empty');
    if (!input) return;

    var items = $$('.file-item');
    var groups = $$('[data-group]');

    function total() {
      return items.reduce(function (s, el) { return s + (el.hidden ? 0 : 1); }, 0);
    }

    function update() {
      var q = input.value.trim().toLowerCase();
      items.forEach(function (el) {
        var hit = !q || (el.getAttribute('data-name') || '').indexOf(q) !== -1;
        el.hidden = !hit;
      });
      // 整个分组都没命中就藏掉分组标题
      groups.forEach(function (g) {
        var visible = $$('.file-item', g).some(function (el) { return !el.hidden; });
        g.hidden = !visible;
      });
      var n = total();
      if (countEl) countEl.textContent = q ? `匹配 ${n} / ${items.length} 个` : `共 ${items.length} 个`;
      if (emptyEl) emptyEl.hidden = n !== 0;
    }

    input.addEventListener('input', update);
    // 按 Esc 清空
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { input.value = ''; update(); }
    });
    update();
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
