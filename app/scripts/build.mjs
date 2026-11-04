// Сборка Aussie Trainer без Vite: esbuild (TS/TSX) + Tailwind v4 (compile API) + свой service worker.
// Результат — плоская папка dist/: index.html (весь JS и CSS внутри), sw.js, manifest, иконки.
// Плоская структура нужна, чтобы сайт можно было загрузить на GitHub Pages даже с iPad.
//
//   node scripts/build.mjs         production-сборка в dist/
//   node scripts/build.mjs --dev   сборка + пересборка при изменениях + сервер http://localhost:5173

import { build, transform } from 'esbuild';
import { compile } from 'tailwindcss';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
const pub = path.join(root, 'public');
const dist = path.join(root, 'dist');
const dev = process.argv.includes('--dev');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const require = createRequire(import.meta.url);
const twDir = path.dirname(require.resolve('tailwindcss/package.json'));

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|html)$/.test(e.name)) out.push(p);
  }
  return out;
}

// Кандидаты для Tailwind: все «слова» из исходников. Лишние Tailwind просто игнорирует.
function scanCandidates() {
  const set = new Set();
  for (const f of walk(src)) {
    const text = fs.readFileSync(f, 'utf8');
    for (const m of text.matchAll(/[^\s"'`{}()<>;,\\]+/g)) {
      const t = m[0];
      if (t.length < 2 || t.length > 120) continue;
      set.add(t);
      if (t.endsWith(':')) set.add(t.slice(0, -1));
    }
  }
  return [...set];
}

async function buildCss() {
  const input = fs.readFileSync(path.join(src, 'styles.css'), 'utf8');
  const compiler = await compile(input, {
    base: src,
    async loadStylesheet(id) {
      const file = id === 'tailwindcss' ? path.join(twDir, 'index.css') : path.join(twDir, id.replace(/^tailwindcss\//, '') + (id.endsWith('.css') ? '' : '.css'));
      return { path: file, base: twDir, content: fs.readFileSync(file, 'utf8') };
    },
  });
  const raw = compiler.build(scanCandidates());
  // esbuild разворачивает CSS-вложенность и добавляет префиксы для Safari 15+.
  const out = await transform(raw, { loader: 'css', minify: !dev, charset: 'utf8', target: ['safari15', 'chrome100', 'firefox100'] });
  return out.code;
}

async function buildJs(buildId) {
  const r = await build({
    entryPoints: [path.join(src, 'main.tsx')],
    bundle: true,
    write: false,
    format: 'esm',
    minify: !dev,
    sourcemap: dev ? 'inline' : false,
    target: ['safari15', 'chrome100', 'firefox100'],
    jsx: 'automatic',
    legalComments: 'none',
    charset: 'utf8',
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __BUILD_ID__: JSON.stringify(buildId),
      'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production'),
    },
    logLevel: 'silent',
  });
  return r.outputFiles[0].text;
}

export async function runBuild() {
  const t0 = Date.now();
  const buildId = dev ? 'dev' : new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
  const [css, js] = await Promise.all([buildCss(), buildJs(buildId)]);
  const safeJs = js.replace(/<\/script/gi, '<\\/script');
  let html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
  html = html.replace('<!--STYLE-->', () => `<style>${css}</style>`).replace('<!--SCRIPT-->', () => `<script type="module">${safeJs}</script>`);

  fs.rmSync(dist, { recursive: true, force: true });
  fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(path.join(dist, 'index.html'), html);

  const assets = ['./', './index.html', './manifest.webmanifest'];
  for (const f of fs.readdirSync(pub)) {
    fs.copyFileSync(path.join(pub, f), path.join(dist, f));
    if (f !== 'manifest.webmanifest' && !f.startsWith('.')) assets.push('./' + f);
  }
  // Имя кеша зависит от всех файлов сайта: любое изменение → новая версия service worker → баннер «Обновить».
  const h = crypto.createHash('sha256').update(html).update(fs.readFileSync(path.join(src, 'sw.js')));
  for (const f of fs.readdirSync(pub).sort()) h.update(f).update(fs.readFileSync(path.join(pub, f)));
  const hash = h.digest('hex').slice(0, 10);
  const sw = fs.readFileSync(path.join(src, 'sw.js'), 'utf8')
    .replace('__CACHE__', `aussie-trainer-${pkg.version}-${hash}`)
    .replace('__ASSETS__', JSON.stringify(assets, null, 2));
  fs.writeFileSync(path.join(dist, 'sw.js'), sw);
  const kb = Math.round(Buffer.byteLength(html) / 1024);
  console.log(`✓ dist/ собран за ${Date.now() - t0} мс · index.html ${kb} КБ · кеш ${hash}`);
}

if (dev) {
  const { startServer } = await import('./serve.mjs');
  await runBuild().catch((e) => console.error(e.message));
  startServer(dist, 5173);
  let timer;
  fs.watch(src, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => runBuild().catch((e) => console.error('Ошибка сборки:', e.message)), 120);
  });
} else {
  await runBuild();
}
