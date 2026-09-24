import { butlerUiClientScript } from './butler-ui-client.generated.js';

export const butlerPageBackground = Object.freeze({ light: '#faf8f4', dark: '#1d1c1b' });

// Canonical approved monitor HOME palette. Other pages reference these semantics.
export const butlerUiStyles = `
:root{color-scheme:light dark;--butler-bg:${butlerPageBackground.light};--butler-card:#fffefa;--butler-ink:#282725;--butler-muted:#68645f;--butler-line:#e5e0d9;--butler-accent:#9f3935;--butler-green-bg:#e6f1e9;--butler-green:#285c3d;--butler-amber-bg:#fbefd5;--butler-amber:#795514;--butler-red-bg:#f9e5e1;--butler-red:#94352f;--butler-on-accent:#fffefa;--butler-gutter:20px;--butler-card-padding:20px;--butler-card-radius:20px;--butler-content-width:1280px;--butler-heading-size:clamp(23px,6vw,32px);--butler-safe-top:env(safe-area-inset-top,0px);--butler-safe-bottom:env(safe-area-inset-bottom,0px);--butler-nav-height:calc(65px + var(--butler-safe-bottom));--butler-header-height:calc(64px + var(--butler-safe-top));--butler-media-ink:#fffefa;--butler-font:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
@media(prefers-color-scheme:dark){:root{--butler-bg:${butlerPageBackground.dark};--butler-card:#282624;--butler-ink:#f4efe8;--butler-muted:#bdb5ab;--butler-line:#45403b;--butler-accent:#eeaaa1;--butler-green-bg:#243e2e;--butler-green:#afe0bc;--butler-amber-bg:#463a22;--butler-amber:#efcf91;--butler-red-bg:#4a2c29;--butler-red:#f2b0a8;--butler-on-accent:#282624}}
body[data-butler-shell]{font:16px/1.65 var(--butler-font);background:var(--butler-bg);color:var(--butler-ink);margin:0;padding-bottom:var(--butler-nav-height);overflow-wrap:anywhere}
body[data-butler-shell="home"]{padding-bottom:0}
body[data-butler-shell="chat"]{padding-bottom:0;top:var(--butler-viewport-top,0px);height:var(--butler-viewport-height,100dvh);bottom:auto}
:where([data-butler-shell]) :where(button,input,select,textarea){font:inherit;color:var(--butler-ink);accent-color:var(--butler-accent)}
:where([data-butler-shell]) :where(input:not([type=checkbox]),select,textarea){box-sizing:border-box;border:1px solid var(--butler-line);border-radius:12px;background:var(--butler-card);padding:10px 12px}
:where([data-butler-shell]) :where(button){border:1px solid var(--butler-line);border-radius:12px;background:var(--butler-card);padding:8px 12px;cursor:pointer}
[data-butler-shell] :where(button,input:not([type=checkbox]),select,summary,.button,.button-link){min-height:44px}
[data-butler-shell] :focus-visible{outline:2px solid var(--butler-accent);outline-offset:3px}
.butler-shell-header.butler-shell-header{box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:16px;height:var(--butler-header-height);max-width:var(--butler-content-width);margin:0 auto;padding:calc(8px + var(--butler-safe-top)) var(--butler-gutter) 8px;position:relative;z-index:40;font:14px/1.5 var(--butler-font)}
.butler-shell-brand.butler-shell-brand{display:flex;align-items:center;gap:10px;min-height:44px;color:var(--butler-accent);font-weight:750;letter-spacing:.19em;text-decoration:none}
.butler-shell-brand img{width:36px;height:36px;border-radius:10px}
.butler-shell-menu.butler-shell-menu{position:relative;border:0;padding:0;margin:0;background:transparent;color:var(--butler-ink);font:14px/1.5 var(--butler-font);border-radius:0}
.butler-shell-menu>summary{box-sizing:border-box;display:flex;align-items:center;justify-content:center;min-height:44px;padding:8px 12px;border:1px solid var(--butler-line);border-radius:12px;color:var(--butler-ink);background:var(--butler-card);cursor:pointer;list-style:none}
.butler-shell-menu>summary::-webkit-details-marker{display:none}
.butler-shell-menu-links{position:absolute;right:0;top:calc(100% + 8px);width:min(320px,calc(100vw - 40px));box-sizing:border-box;max-height:max(0px,min(var(--butler-menu-max-height,100dvh),calc(var(--butler-viewport-height,100dvh) - var(--butler-header-height) - var(--butler-nav-height) - 24px)));overflow:auto;overscroll-behavior:contain;padding:8px;border:1px solid var(--butler-line);border-radius:var(--butler-card-radius);background:var(--butler-card);box-shadow:0 8px 24px #0002}
.butler-shell-menu-links>a{display:flex;align-items:center;min-height:44px;padding:4px 12px;color:var(--butler-ink);text-decoration:none;border-radius:12px;font:14px/1.5 var(--butler-font)}
.butler-shell-menu-links>a[aria-current]{font-weight:700;background:var(--butler-red-bg);color:var(--butler-accent)}
.butler-shell-menu-links>a:hover{background:var(--butler-red-bg)}
.butler-shell-primary.butler-shell-primary{box-sizing:border-box;position:fixed;z-index:35;top:calc(var(--butler-viewport-top,0px) + var(--butler-viewport-height,100dvh) - var(--butler-nav-height));bottom:auto;left:0;right:0;height:var(--butler-nav-height);background:var(--butler-card);border-top:1px solid var(--butler-line);display:flex;justify-content:center;padding:8px 12px calc(8px + var(--butler-safe-bottom));gap:12px;margin:0}
.butler-shell-primary>a{display:flex;align-items:center;justify-content:center;min-height:48px;max-width:200px;flex:1;text-decoration:none;font:14px/1.5 var(--butler-font);color:var(--butler-muted);border-radius:12px}
.butler-shell-primary>a[aria-current]{background:var(--butler-red-bg);color:var(--butler-accent);font-weight:700}
[data-butler-shell="home"]>.butler-shell-header{max-width:760px;height:auto;padding:calc(40px + var(--butler-safe-top)) var(--butler-gutter) 0}
@media(prefers-reduced-motion:reduce){[data-butler-shell] *,[data-butler-shell] *::before,[data-butler-shell] *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
`;
export const butlerMenuItems = Object.freeze([
  ['ニュース','/dashboard/news'],['GitHub の状態','/dashboard/github'],['実行前の確認','/dashboard/preflight'],
  ['実行の進捗','/dashboard/progress'],['VPS 実行環境','/dashboard/vps-runner'],['記憶・運用記録','/dashboard/memory'],
  ['音声の引き継ぎ','/dashboard/handoff'],['接続機能の確認','/dashboard/self-parity'],['稼働状況','/status'],
  ['ヘルプ','/help'],['操作ガイド','/guide'],['セットアップ','/setup'],['セットアップの復旧','/setup/recovery'],
  ['最新のセットアップ','/setup/latest'],['確認済みセットアップ','/setup/known-good'],['セットアップ診断','/setup/diagnostics'],
  ['パスキー・操作確認','/v2/approval/passkey/operator'],['Dashboardログイン','/v2/approval/passkey/operator?mode=dashboard']
].map(item => Object.freeze(item)));
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function butlerActivePage(path = '') {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || /[\\\u0000-\u0020]/.test(path)) return '';
  const url = new URL(path, 'https://butler.invalid');
  if (url.pathname === '/dashboard/notifications') return 'notifications';
  if (['/dashboard/chat','/orchestrator'].includes(url.pathname)) return 'chat';
  if (url.pathname === '/dashboard') return ['threadId','thread_id','repository','repositoryInput','issueNumber'].some(k => url.searchParams.has(k)) ? 'chat' : 'home';
  return '';
}
export function butlerMenuCurrentHref(path = '') {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || /[\\\u0000-\u0020]/.test(path)) return '';
  const url = new URL(path, 'https://butler.invalid');
  const pathname = url.pathname.replace(/^\/mvp\/approval\/passkey\/operator$/, '/v2/approval/passkey/operator');
  const candidate = pathname + (pathname === '/v2/approval/passkey/operator' && url.searchParams.get('mode') === 'dashboard' ? '?mode=dashboard' : '');
  return butlerMenuItems.some(([, href]) => href === candidate) ? candidate : '';
}
export function renderButlerHeader(pagePath = '') {
  const current = butlerMenuCurrentHref(pagePath);
  return `<header class="butler-shell-header" data-butler-header><a class="butler-shell-brand" href="/dashboard" target="_top"><img src="/dashboard-icon.png" alt="">BUTLER</a><details class="butler-shell-menu" data-butler-menu><summary aria-controls="butler-shell-menu-links">メニュー</summary><div class="butler-shell-menu-links" id="butler-shell-menu-links">${butlerMenuItems.map(([label,href]) => `<a href="${escape(href)}" target="_top"${href === current ? ' aria-current="page"' : ''}>${escape(label)}</a>`).join('')}</div></details></header>`;
}
export function renderButlerPrimaryNav(active = '') {
  return `<nav class="butler-shell-primary" data-butler-primary-nav aria-label="メインナビゲーション">${[['home','/dashboard','ホーム'],['notifications','/dashboard/notifications','通知'],['chat','/dashboard/chat','チャット']].map(([key,href,label]) => `<a href="${href}"${key === active ? ' aria-current="page"' : ''} target="_top">${label}</a>`).join('')}</nav>`;
}
// Only renderer-owned HTML enters this function. Request strings never become markup.
export function renderButlerDocument(document, { active = '', layout = 'page', pagePath = '' } = {}) {
  const safeLayout = ['home','chat','page'].includes(layout) ? layout : 'page';
  // Metadata is owned by the shell. Preserve manifest/icon identity and all
  // request scope; only remove the existing viewport/theme-color meta tags.
  document = document.replace(/<head>([\s\S]*?)<\/head>/i, (_, head) => {
    const content = head.replace(/<meta\b[^>]*\bname\s*=\s*["'](?:viewport|theme-color)["'][^>]*>/gi, '');
    const metadata = `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="${butlerPageBackground.light}" media="(prefers-color-scheme: light)"><meta name="theme-color" content="${butlerPageBackground.dark}" media="(prefers-color-scheme: dark)">`;
    return `<head>${content.includes('<meta charset=') ? content.replace(/(<meta charset=[^>]+>)/i, '$1' + metadata) : metadata + content}</head>`;
  });
  const themed = document.includes('<style>')
    ? document.replace('<style>', `<style data-butler-theme>${butlerUiStyles}</style><style>`)
    : document.replace('</head>', `<style data-butler-theme>${butlerUiStyles}</style></head>`);
  return themed
    .replace('<body>', `<body data-butler-shell="${safeLayout}">${renderButlerHeader(pagePath)}`)
    .replace('</body>', `${renderButlerPrimaryNav(active)}<script data-butler-client>${butlerUiClientScript}</script></body>`);
}
