export function renderVtddHelpGuidePage(input = {}) {
  const runtimeOrigin = normalizeOrigin(input.runtimeOrigin);
  const mcpPath = normalizePath(input.mcpPath || "/mcp");
  const directory = buildVtddCloudflarePageDirectory({ runtimeOrigin });
  const setupLatestHref = "/setup/latest";
  const setupKnownGoodHref = "/setup/known-good";
  const passkeyOperatorHref = "/v2/approval/passkey/operator";

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>VTDD help guide</title>
  <style>
    :root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: Canvas; color: CanvasText; }
    main { width: min(100% - 24px, 1120px); margin: 0 auto; padding: 24px 0 56px; }
    h1 { font-size: 1.7rem; line-height: 1.2; margin: 0 0 10px; }
    h2 { font-size: 1.08rem; margin: 30px 0 10px; }
    h3 { font-size: .96rem; margin: 18px 0 8px; }
    p, li { line-height: 1.6; }
    a { color: LinkText; }
    code { font: .92em ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .lede { max-width: 860px; opacity: .9; }
    .nav, .notice, .panel, .route { border: 1px solid color-mix(in srgb, CanvasText 16%, transparent); border-radius: 8px; }
    .nav { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 12px; margin: 18px 0 22px; }
    .nav strong { margin-right: auto; }
    .nav a, .button { display: inline-flex; align-items: center; min-height: 36px; padding: 0 10px; border: 1px solid color-mix(in srgb, CanvasText 20%, transparent); border-radius: 6px; background: ButtonFace; color: ButtonText; text-decoration: none; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(245px, 1fr)); gap: 10px; }
    .panel, .notice { padding: 14px; }
    .panel strong { display: block; margin-bottom: 4px; }
    .notice { background: color-mix(in srgb, CanvasText 4%, Canvas); margin: 14px 0; }
    .route { padding: 12px; margin: 10px 0; overflow-wrap: anywhere; }
    .route strong { display: block; margin-bottom: 4px; }
    .flow { display: grid; gap: 8px; margin: 12px 0; }
    .flow div { padding: 10px 12px; border-left: 4px solid color-mix(in srgb, CanvasText 32%, transparent); background: color-mix(in srgb, CanvasText 5%, Canvas); }
    .small { font-size: .88rem; opacity: .82; }
  </style>
</head>
<body>
  <main>
    <h1>VTDD help guide</h1>
    <p class="lede">VTDD は Butler の自然言語 intent を、Worker の runtime truth と policy gate を通して GitHub / runner / reviewer へ接続するための public core です。このページは操作の入口、動く経路、権限境界、よくある使い方を確認するための読み取り専用ガイドです。</p>

    <section class="nav" aria-label="Guide navigation">
      <strong>Runtime: ${escapeHtml(runtimeOrigin)}</strong>
      <a href="#features">機能</a>
      <a href="#paths">経路</a>
      <a href="#usage">使い方</a>
      <a href="#authority">権限</a>
      <a href="#setup">setup/recovery</a>
      <a href="#forks">fork利用</a>
    </section>

    <section class="notice">
      <strong>Safety boundary</strong>
      <p>No secret values, tokens, approval grants, owner-specific runtime URLs, or operator bootstrap values are displayed here. Custom domains such as an owner-operated VTDD domain are deployment choices, not public/core defaults.</p>
      <p class="small">Butler に「今 Cloudflare にあるページを一覧して」と頼むと、<code>vtddRetrieveCloudflarePages</code> でこの runtime のページ索引を取得できます。</p>
    </section>

    <section id="features">
      <h2>主要機能</h2>
      <div class="grid">
        <div class="panel"><strong>Butler judgment</strong>会話の意図を constitution、runtime truth、Issue context、現在の依頼の順に評価します。</div>
        <div class="panel"><strong>Repository resolution</strong>alias / nickname / GitHub App repository index で対象を解決します。default repository はありません。</div>
        <div class="panel"><strong>GitHub read plane</strong>repository、Issue、PR、review、checks、workflow runs、branch state を Butler が読める runtime truth として返します。</div>
        <div class="panel"><strong>GitHub write plane</strong>コメント、PR更新、runner queue など通常 write を approval boundary に沿って実行します。</div>
        <div class="panel"><strong>High-risk authority plane</strong>merge、Issue close、secret sync、deploy など高リスク操作は GO + passkey または明示的な禁止境界を通ります。</div>
        <div class="panel"><strong>Runner / reviewer loop</strong>Butler -> Codex runner -> PR -> reviewer -> Butler summary の GitHub-visible loop を扱います。</div>
        <div class="panel"><strong>Memory / retrieval</strong>constitution、decision log、proposal log、operational memory を読んで判断の前提を復元します。</div>
        <div class="panel"><strong>MCP read surface</strong>Mac Codex / VPS Codex CLI は <code>${escapeHtml(mcpPath)}</code> を通じて Butler と同じ runtime truth / review truth / memory recall を読みます。</div>
        <div class="panel"><strong>Setup recovery</strong>Action Schema / Instructions が壊れた時にブラウザから復旧 bundle をコピーできます。</div>
      </div>
    </section>

    <section id="paths">
      <h2>動く経路</h2>
      <div class="flow">
        <div><strong>1. Human -> Butler</strong>人間は通常、自然言語で「どの repo / Issue / PR に何をしたいか」を伝えます。</div>
        <div><strong>2. Butler -> Worker</strong>Butler は Action Schema の operationId を使って Worker の <code>/v2/*</code> route を呼びます。</div>
        <div><strong>3. Worker -> policy / runtime truth</strong>Worker は対象解決、Issue traceability、approval boundary、current GitHub state を確認します。</div>
        <div><strong>4. Worker -> GitHub / runner / reviewer</strong>許可された read/write/runner/reviewer operation だけが外部へ出ます。</div>
        <div><strong>5. GitHub-visible evidence -> Butler</strong>結果は status、before/after state、PR/Issue/comment/workflow state として Butler が再読込できます。</div>
      </div>
      <div class="route"><strong>Machine path</strong><code>${escapeHtml(mcpPath)}</code> は人間向けページではなく、Mac Codex / VPS Codex CLI が VTDD MCP tool catalog を読むための machine endpoint です。</div>
    </section>

    <section id="usage">
      <h2>こういう時はこう使う</h2>
      <div class="grid">
        <div class="panel"><strong>今の状態を知りたい</strong>Butler に repo / Issue / PR を自然言語で指定し、runtime truth の読み取りを依頼します。</div>
        <div class="panel"><strong>実装を始めたい</strong>対象 Issue と Success Criteria を固定し、Butler が bounded execution contract を作ってから runner に渡します。</div>
        <div class="panel"><strong>PRを直したい</strong>Butler が reviewer comment と PR state を読み、revise_pr として runner に渡せるか確認します。</div>
        <div class="panel"><strong>mergeしたい</strong>Butler が checks、reviewer signal、mergeability、Issue evidence を確認し、必要な approval boundary を提示します。</div>
        <div class="panel"><strong>Action Schema が壊れた</strong>この runtime の setup/recovery page を直接開き、known-good または latest bundle をコピーします。</div>
        <div class="panel"><strong>deployやsecret更新をしたい</strong>GO + passkey と対象 scope が必要です。Worker は secret 値をこのページに表示しません。</div>
      </div>
    </section>

    <section id="authority">
      <h2>権限境界</h2>
      <div class="route"><strong>Allowed without GO</strong>読み取り、状態確認、説明、proposal、低リスクな案内。実行能力とは区別します。</div>
      <div class="route"><strong>GO required</strong>bounded implementation dispatch、通常 write、PR review/comment など、Issue scope と runtime truth に接続された操作。</div>
      <div class="route"><strong>GO + passkey required</strong>deploy、credential mutation、permission mutation、high-risk GitHub operation、destructive/high-blast-radius operation。</div>
      <div class="route"><strong>Forbidden / stop</strong>対象 repo 未解決、Issue traceability 不足、owner-specific runtime 依存、secret 表示、scope conflict、reviewer objection の楽観的な無視。</div>
    </section>

    <section id="setup">
      <h2>setup/recovery と通常 operation の違い</h2>
      <p>setup/recovery は Butler Action が壊れてもブラウザから直接開ける復旧導線です。通常 operation の default repository 化、merge/deploy authority 緩和、secret 表示は行いません。</p>
      <p>
        <a class="button" href="${escapeAttribute(setupLatestHref)}">setup/latest</a>
        <a class="button" href="${escapeAttribute(setupKnownGoodHref)}">setup/known-good</a>
        <a class="button" href="${escapeAttribute(passkeyOperatorHref)}">passkey operator</a>
      </p>
      <p class="small">Custom GPT Action Schema / Instructions の copy-ready bundle は setup pages にあります。この help guide は説明用であり、setup bundle の代替ではありません。</p>
    </section>

    <section id="pages">
      <h2>Cloudflare 上のページ一覧</h2>
      <p>この一覧は Cloudflare アカウント全体ではなく、この VTDD Worker runtime が公開している人間向けページです。</p>
      <div class="grid">
        ${directory.pages
          .map(
            (page) => `<div class="panel"><strong>${escapeHtml(page.label)}</strong><a href="${escapeAttribute(page.path)}">${escapeHtml(page.path)}</a><p>${escapeHtml(page.description)}</p><p class="small">Authority: ${escapeHtml(page.authority)}</p></div>`
          )
          .join("")}
      </div>
    </section>

    <section id="forks">
      <h2>fork / clone して使う場合</h2>
      <p>この repository は public canonical core であり、shared hosted runtime ではありません。利用者は自分の GitHub、Cloudflare、ChatGPT/Codex、reviewer provider、secrets、runtime domain を用意します。</p>
      <div class="grid">
        <div class="panel"><strong>GitHub</strong>自分の repository / GitHub App / Actions / branch protection を使います。</div>
        <div class="panel"><strong>Cloudflare</strong>自分の Worker、D1/R2/Vectorize bindings、custom domain を使います。</div>
        <div class="panel"><strong>Butler surface</strong>自分の Custom GPT または将来の Butler surface を自分の runtime に接続します。</div>
        <div class="panel"><strong>Reviewer / runner</strong>自分の reviewer provider と trusted runner capacity を選びます。</div>
      </div>
    </section>
  </main>
</body>
</html>`;
}

export function buildVtddCloudflarePageDirectory(input = {}) {
  const runtimeOrigin = normalizeOrigin(input.runtimeOrigin);
  const pages = [
    {
      id: "help",
      label: "Help guide",
      path: "/help",
      url: buildRuntimeUrl(runtimeOrigin, "/help"),
      description: "VTDD の機能、経路、使い方、権限境界、fork 利用境界を読むための入口です。",
      audience: ["owner", "operator", "fork_user"],
      authority: "read_only"
    },
    {
      id: "guide",
      label: "Guide alias",
      path: "/guide",
      url: buildRuntimeUrl(runtimeOrigin, "/guide"),
      description: "/help と同じガイドを開く別名です。",
      audience: ["owner", "operator", "fork_user"],
      authority: "read_only"
    },
    {
      id: "setup_recovery",
      label: "Setup recovery",
      path: "/setup/recovery",
      url: buildRuntimeUrl(runtimeOrigin, "/setup/recovery"),
      description: "Action Schema / Instructions が壊れた時に復旧導線へ入るページです。",
      audience: ["owner", "operator"],
      authority: "read_only_recovery"
    },
    {
      id: "setup_latest",
      label: "Latest setup bundle",
      path: "/setup/latest",
      url: buildRuntimeUrl(runtimeOrigin, "/setup/latest"),
      description: "現在の repository source of truth から copy-ready setup bundle を表示します。",
      audience: ["owner", "operator"],
      authority: "read_only_recovery"
    },
    {
      id: "setup_known_good",
      label: "Known-good setup bundle",
      path: "/setup/known-good",
      url: buildRuntimeUrl(runtimeOrigin, "/setup/known-good"),
      description: "最後に安定確認された known-good setup bundle を表示します。",
      audience: ["owner", "operator"],
      authority: "read_only_recovery"
    },
    {
      id: "setup_diagnostics",
      label: "Setup diagnostics",
      path: "/setup/diagnostics",
      url: buildRuntimeUrl(runtimeOrigin, "/setup/diagnostics"),
      description: "Action Schema / Instructions / Action auth / Cloudflare deploy の原因切り分けを読む browser-direct 診断ページです。",
      audience: ["owner", "operator"],
      authority: "read_only_recovery"
    },
    {
      id: "passkey_operator",
      label: "Passkey operator",
      path: "/v2/approval/passkey/operator",
      url: buildRuntimeUrl(runtimeOrigin, "/v2/approval/passkey/operator"),
      description: "GO + passkey が必要な deploy、merge、secret sync などの operator helper です。",
      audience: ["owner", "operator"],
      authority: "go_plus_passkey_required_for_execution"
    },
    {
      id: "deploy_operator",
      label: "Deploy operator view",
      path: "/v2/approval/passkey/operator?repositoryInput=marushu%2Fvtdd-v2-p&mode=deploy&actionType=deploy_production&highRiskKind=deploy_production&phase=execution",
      url: buildRuntimeUrl(
        runtimeOrigin,
        "/v2/approval/passkey/operator?repositoryInput=marushu%2Fvtdd-v2-p&mode=deploy&actionType=deploy_production&highRiskKind=deploy_production&phase=execution"
      ),
      description: "production deploy approval を発行・実行するための operator view です。",
      audience: ["owner", "operator"],
      authority: "go_plus_passkey_required"
    }
  ];

  return {
    ok: true,
    runtimeOrigin,
    listMeaning: "worker_hosted_human_pages",
    notIncluded: [
      "Cloudflare account-wide Pages projects",
      "secrets",
      "tokens",
      "approval grant values",
      "owner-specific runtime defaults"
    ],
    naturalLanguageIntent: "今 Cloudflare にあるページを一覧して",
    pages
  };
}

function normalizeOrigin(value) {
  const text = normalizeText(value);
  if (!text) {
    return "this runtime";
  }

  try {
    return new URL(text).origin;
  } catch {
    return text;
  }
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function buildRuntimeUrl(origin, path) {
  try {
    return new URL(path, `${origin}/`).href;
  } catch {
    return path;
  }
}

function normalizePath(value) {
  const text = normalizeText(value);
  if (!text) {
    return "/mcp";
  }
  return text.startsWith("/") ? text : `/${text}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
