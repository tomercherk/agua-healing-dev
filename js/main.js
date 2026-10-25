document.documentElement.classList.add('js');

// A browser that force-darkens the page (Samsung Internet in dark mode) recolors everything
// CSS paints and ignores color-scheme; only <canvas> pixels keep their colors. When the guard
// is on, each block of the page is drawn onto canvases laid over it: one still layer with the
// block's background, plus one piece per animated element so the entrance animations still
// play. The real DOM stays underneath for taps, links and screen readers.
if (document.documentElement.classList.contains('fd')) {
  const RENDERER = 'https://cdn.jsdelivr.net/npm/html2canvas-pro@2.5.1/dist/html2canvas-pro.min.js';
  const ANIMATED = '.reveal, .load';
  const LAYERS = '.fdshot, .fdpiece';
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  const tokens = getComputedStyle(document.documentElement);
  // The hero film is left uncovered: forced dark does not touch video, and a canvas over it would freeze it.
  const blocks = () => [...document.querySelectorAll('.hero__text, main > .section, .footer, .fab')];
  const layersOf = (block) => [...block.children].filter((el) => el.matches(LAYERS));

  const asShot = (canvas) => {
    canvas.className = 'fdshot';
    canvas.setAttribute('aria-hidden', 'true');
    return canvas;
  };

  // Inline SVGs are rendered through the browser's image pipeline, which forced dark also
  // recolors (dark strokes came out light, light fills grey). Redraw each one on a canvas
  // with the same geometry and computed colors, and let that stand in for it.
  document.querySelectorAll('svg').forEach((svg) => {
    const box = svg.getBoundingClientRect();
    const view = svg.viewBox.baseVal;
    if (!box.width || !box.height || !view.width || !view.height) return;
    const ratio = Math.max(scale, 2);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(box.width * ratio);
    canvas.height = Math.round(box.height * ratio);
    const ctx = canvas.getContext('2d');
    let sx = canvas.width / view.width;
    let sy = canvas.height / view.height;
    if (svg.getAttribute('preserveAspectRatio') !== 'none') {
      sx = sy = Math.min(sx, sy);
      ctx.translate((canvas.width - view.width * sx) / 2, (canvas.height - view.height * sy) / 2);
    }
    ctx.scale(sx, sy);
    ctx.translate(-view.x, -view.y);
    svg.querySelectorAll('path, circle, rect').forEach((node) => {
      const style = getComputedStyle(node);
      const num = (name) => parseFloat(node.getAttribute(name)) || 0;
      let shape;
      if (node.tagName === 'path') {
        shape = new Path2D(node.getAttribute('d'));
      } else if (node.tagName === 'circle') {
        shape = new Path2D();
        shape.arc(num('cx'), num('cy'), num('r'), 0, Math.PI * 2);
      } else {
        shape = new Path2D();
        if (shape.roundRect) shape.roundRect(num('x'), num('y'), num('width'), num('height'), num('rx'));
        else shape.rect(num('x'), num('y'), num('width'), num('height'));
      }
      if (style.fill !== 'none') {
        ctx.fillStyle = style.fill;
        ctx.fill(shape);
      }
      if (style.stroke !== 'none') {
        ctx.strokeStyle = style.stroke;
        ctx.lineWidth = parseFloat(style.strokeWidth) || 1;
        ctx.lineCap = style.strokeLinecap;
        ctx.lineJoin = style.strokeLinejoin;
        ctx.stroke(shape);
      }
    });
    // A classed SVG is sized and placed by its class; the rest keep the size they had.
    const classes = svg.getAttribute('class');
    if (classes) canvas.className = classes;
    else canvas.style.cssText = `width:${box.width}px;height:${box.height}px`;
    canvas.style.display = 'block';
    canvas.setAttribute('aria-hidden', 'true');
    svg.after(canvas);
    svg.style.display = 'none';
  });

  // Until the real render is ready, hide the recolored page behind plain covers.
  blocks().forEach((block) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 8;
    const own = getComputedStyle(block).backgroundColor;
    const fallback = tokens.getPropertyValue(block.matches('.section--photo') ? '--deep' : '--sand').trim();
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = /^(transparent|rgba\(.*,\s*0\))$/.test(own) ? fallback : own;
    ctx.fillRect(0, 0, 8, 8);
    block.append(asShot(canvas));
  });

  // Where an element sits inside its block when at rest (offsets ignore the entrance transform).
  const restBox = (el, block) => {
    let x = 0;
    let y = 0;
    for (let node = el; node && node !== block; node = node.offsetParent) {
      x += node.offsetLeft;
      y += node.offsetTop;
    }
    return { x, y, w: el.offsetWidth, h: el.offsetHeight };
  };

  // Cut one animated element out of the block's full render.
  const pieceOf = (full, el, block, animate) => {
    const pad = 8; // room for outlines
    const box = restBox(el, block);
    const x = Math.max(0, box.x - pad);
    const y = Math.max(0, box.y - pad);
    const w = Math.min(block.offsetWidth, box.x + box.w + pad) - x;
    const h = Math.min(block.offsetHeight, box.y + box.h + pad) - y;
    if (w <= 0 || h <= 0) return null;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext('2d').drawImage(full, Math.round(x * scale), Math.round(y * scale), canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    canvas.className = `fdpiece${el.classList.contains('load') ? ' fdpiece--load' : ''}${animate ? '' : ' is-visible'}`;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;--d:${getComputedStyle(el).getPropertyValue('--d').trim() || 0}`;
    return canvas;
  };

  const pieceObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      pieceObserver.unobserve(entry.target);
    });
  }, { threshold: 0.18, rootMargin: '0px 0px -8% 0px' });

  const loadRenderer = () => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = RENDERER;
    script.onload = () => {
      const lib = window.html2canvas;
      resolve(lib.default || lib.html2canvas || lib);
    };
    script.onerror = reject;
    document.head.append(script);
  });
  // Only the block being rendered waits for its own images, so the top of the page appears first.
  const imagesReady = (block) => Promise.all([...block.querySelectorAll('img')].map((img) => {
    img.loading = 'eager';
    return img.decode().catch(() => {});
  }));

  Promise.all([loadRenderer(), document.fonts.ready]).then(async ([render]) => {
    const shoot = async (block, animate) => {
      await imagesReady(block);
      const options = {
        scale,
        backgroundColor: null,
        logging: false,
        ignoreElements: (el) => el.matches(LAYERS),
      };
      const animated = block.matches('.fab')
        ? []
        : [...block.querySelectorAll(ANIMATED)].filter((el) => !el.parentElement.closest(ANIMATED));
      const full = await render(block, options);
      const previous = layersOf(block);
      if (!animated.length) {
        block.append(asShot(full));
        previous.forEach((el) => el.remove());
        return;
      }
      // The pieces go up as soon as the first render is done, over whatever cover is there;
      // the still layer needs a second render and slides in underneath them when it is ready.
      const pieces = animated.map((el) => pieceOf(full, el, block, animate)).filter(Boolean);
      block.append(...pieces);
      pieces.filter((piece) => !piece.matches('.is-visible')).forEach((piece) => {
        if (!piece.matches('.fdpiece--load')) return pieceObserver.observe(piece);
        requestAnimationFrame(() => requestAnimationFrame(() => piece.classList.add('is-visible')));
      });
      const still = await render(block, {
        ...options,
        onclone: (doc) => doc.documentElement.classList.add('fd-still'),
      });
      block.insertBefore(asShot(still), pieces[0] || null);
      previous.forEach((el) => el.remove());
    };
    const shootAll = async (animate) => { for (const block of blocks()) await shoot(block, animate); };
    await shootAll(true);

    document.querySelectorAll('details').forEach((details) => {
      details.addEventListener('toggle', () => shoot(details.closest('.section'), false));
    });
    let width = window.innerWidth;
    let timer;
    window.addEventListener('resize', () => {
      if (window.innerWidth === width) return;
      width = window.innerWidth;
      clearTimeout(timer);
      timer = setTimeout(() => shootAll(false), 250);
    });
  }).catch(() => {
    // Renderer unavailable: drop the covers and fall back to the browser's own rendering.
    document.querySelectorAll(LAYERS).forEach((el) => el.remove());
  });
}

// Phones in low power or data saver mode refuse to autoplay; give those visitors a play button
const film = document.querySelector('.hero video');
if (film) film.play().catch(() => { film.controls = true; });

// A review that does not fit its card gets a button that opens the full text
if (!document.documentElement.classList.contains('fd')) {
  document.querySelectorAll('.review').forEach((review) => {
    const text = review.querySelector('p');
    if (text.scrollHeight <= text.clientHeight + 2) return;
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'review__more';
    more.textContent = 'להמשך קריאה';
    more.addEventListener('click', () => {
      more.textContent = review.classList.toggle('is-open') ? 'הצגה מקוצרת' : 'להמשך קריאה';
    });
    text.after(more);
  });
}

// Galleries (reviews, photo strip): move to the next item every few seconds while on screen.
// A gallery waits while the visitor is touching or hovering it or has a review open, and stays still under
// the forced-dark guard (a canvas covers the section there) and for reduced motion.
if ('IntersectionObserver' in window
    && !document.documentElement.classList.contains('fd')
    && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.querySelectorAll('.reviews, .strip').forEach((gallery) => {
    let current = 0;
    let onScreen = false;
    let held = false;
    new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; }, { threshold: 0.6 }).observe(gallery);
    ['pointerenter', 'pointerdown', 'touchstart'].forEach((type) => gallery.addEventListener(type, () => { held = true; }, { passive: true }));
    ['pointerleave', 'pointerup', 'touchend'].forEach((type) => gallery.addEventListener(type, () => { held = false; }, { passive: true }));
    setInterval(() => {
      const cards = gallery.children;
      if (!onScreen || held || cards.length < 2 || gallery.querySelector('.is-open')) return;
      current = (current + 1) % cards.length;
      const card = cards[current];
      gallery.scrollTo({ left: card.offsetLeft - (gallery.clientWidth - card.offsetWidth) / 2, behavior: 'smooth' });
    }, gallery.matches('.strip') ? 3500 : 5000);
  });
}

// Reveal elements as they scroll into view
const revealables = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.18, rootMargin: '0px 0px -8% 0px' });
  revealables.forEach((el) => observer.observe(el));
} else {
  revealables.forEach((el) => el.classList.add('is-visible'));
}

// Buttons whose destination isn't wired up yet
const toast = document.querySelector('.toast');
let toastTimer;
document.querySelectorAll('[data-todo]').forEach((btn) => {
  btn.addEventListener('click', () => {
    toast.hidden = true;
    void toast.offsetWidth; // restart the animation
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 2400);
  });
});

// Treatment tiles: tap to zoom the photo to full screen with the details.
// A tile with data-gallery shows its photos one after another, on a timer and by swiping.
(() => {
  const zoom = document.querySelector('.zoom');
  if (!zoom) return;
  const slides = zoom.querySelector('.zoom__slides');
  const dots = zoom.querySelector('.zoom__dots');
  const text = zoom.querySelector('.zoom__text');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let opener = null;
  let closeTimer;
  let imgs = [];
  let at = 0;
  let autoTimer;

  const insetFrom = (r) => {
    const w = innerWidth, h = innerHeight;
    return `inset(${r.top}px ${w - r.right}px ${h - r.bottom}px ${r.left}px)`;
  };
  const show = (n) => {
    if (!imgs.length) return;
    at = (n + imgs.length) % imgs.length;
    imgs.forEach((im, i) => {
      im.classList.toggle('is-on', i === at);
      if (im.tagName === 'VIDEO' && i !== at) im.pause();
    });
    [...dots.children].forEach((d, i) => d.classList.toggle('is-on', i === at));
  };
  // A photo stays a few seconds; a video plays through to its end, then the gallery moves on.
  const rearm = () => {
    clearTimeout(autoTimer);
    const cur = imgs[at];
    if (imgs.length < 2 || still) return;
    if (cur && cur.tagName === 'VIDEO') {
      cur.currentTime = 0;
      cur.play().catch(() => { autoTimer = setTimeout(() => go(at + 1), 4500); });
    } else {
      autoTimer = setTimeout(() => go(at + 1), 4500);
    }
  };
  const go = (n) => { show(n); rearm(); };

  const close = () => {
    if (zoom.hidden) return;
    clearTimeout(autoTimer);
    imgs.forEach((im) => im.tagName === 'VIDEO' && im.pause());
    const rect = opener.getBoundingClientRect();
    zoom.classList.remove('is-open');
    zoom.style.clipPath = insetFrom(rect);
    document.body.style.overflow = '';
    const done = () => { zoom.hidden = true; zoom.style.clipPath = ''; opener.focus({ preventScroll: true }); };
    clearTimeout(closeTimer);
    closeTimer = setTimeout(done, still ? 0 : 560);
  };
  document.querySelectorAll('.tile').forEach((tile) => {
    tile.addEventListener('click', () => {
      opener = tile;
      clearTimeout(closeTimer);
      const first = tile.querySelector('img');
      const srcs = [first.currentSrc || first.src];
      (tile.dataset.gallery || '').split(' ').filter(Boolean).forEach((name) => srcs.push(name.endsWith('.mp4') ? `assets/video/${name}` : `assets/img/${name}.jpg`));
      slides.replaceChildren(...srcs.map((src, i) => {
        if (src.endsWith('.mp4')) {
          const v = document.createElement('video');
          v.muted = true;
          v.playsInline = true;
          v.preload = 'auto';
          v.poster = `assets/img/${src.split('/').pop().replace('.mp4', '')}-poster.jpg`;
          v.src = src;
          v.addEventListener('ended', () => { if (imgs[at] === v) go(at + 1); });
          return v;
        }
        const im = new Image();
        im.src = src;
        im.alt = i ? '' : first.alt;
        im.decoding = 'async';
        return im;
      }));
      imgs = [...slides.children];
      dots.replaceChildren(...imgs.map(() => document.createElement('i')));
      dots.hidden = imgs.length < 2;
      show(0);
      text.innerHTML = tile.querySelector('.tile__more').innerHTML;
      zoom.style.clipPath = insetFrom(tile.getBoundingClientRect());
      zoom.hidden = false;
      document.body.style.overflow = 'hidden';
      void zoom.offsetWidth;
      zoom.style.clipPath = 'inset(0)';
      zoom.classList.add('is-open');
      zoom.querySelector('.zoom__close').focus({ preventScroll: true });
      rearm();
    });
  });
  zoom.querySelector('.zoom__close').addEventListener('click', close);
  text.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    else if (!zoom.hidden && e.key === 'ArrowLeft') go(at + 1);
    else if (!zoom.hidden && e.key === 'ArrowRight') go(at - 1);
  });

  // Swipe: a horizontal drag changes the photo (left = next, right = previous)
  let x0 = null, y0 = 0;
  zoom.addEventListener('pointerdown', (e) => { x0 = e.clientX; y0 = e.clientY; });
  zoom.addEventListener('pointerup', (e) => {
    if (x0 === null) return;
    const dx = e.clientX - x0, dy = e.clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) go(at + (dx < 0 ? 1 : -1));
  });
  zoom.addEventListener('pointercancel', () => { x0 = null; });
})();
