// Writes platform identity pages, sitemap.xml, robots.txt and llms.txt
// from site/identity.json. No network. Run: node scripts/write-identity.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(readFileSync(resolve(root, "site/identity.json"), "utf8"));
const origin = data.origin;
const org = data.organization;

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pageUrl(slug) {
  return `${origin}/${slug}/`;
}

function addressNode() {
  return {
    "@type": "PostalAddress",
    addressLocality: org.address.addressLocality,
    addressRegion: org.address.addressRegion,
    postalCode: org.address.postalCode,
    addressCountry: org.address.addressCountry,
  };
}

function organizationNode() {
  return {
    "@type": "Organization",
    "@id": `${origin}/#organization`,
    name: org.name,
    legalName: org.legalName,
    alternateName: org.alternateName,
    url: org.url,
    logo: org.logo,
    image: org.image,
    email: org.email,
    foundingDate: org.foundingDate,
    taxID: org.abn,
    address: addressNode(),
    foundingLocation: { "@type": "Place", address: addressNode() },
    contactPoint: {
      "@type": "ContactPoint",
      email: org.email,
      contactType: "customer support",
      areaServed: "AU",
      availableLanguage: "English",
    },
    founder: org.founders.map((f) => ({
      "@type": "Person",
      name: f.name,
      jobTitle: f.jobTitle,
      ...(f.sameAs ? { sameAs: f.sameAs } : {}),
    })),
    ...(org.sameAs?.length ? { sameAs: org.sameAs } : {}),
    knowsAbout: [
      "Human technology",
      "Human state intelligence",
      "Identity and likeness infrastructure",
      "Mediated intelligence",
      "Neurodevelopmental intelligence",
      "Adaptive mental health",
      "Workforce health infrastructure",
      "Living systems technology",
    ],
    hasPart: data.platforms.map((p) => ({ "@id": `${pageUrl(p.slug)}#platform` })),
  };
}

function websiteNode() {
  return {
    "@type": "WebSite",
    "@id": `${origin}/#website`,
    name: "ILSA Labs",
    alternateName: "ILSA",
    url: `${origin}/`,
    publisher: { "@id": `${origin}/#organization` },
    inLanguage: "en-AU",
  };
}

function platformNode(p) {
  return {
    "@type": "SoftwareApplication",
    "@id": `${pageUrl(p.slug)}#platform`,
    name: p.name,
    alternateName: p.display || undefined,
    applicationCategory: p.category,
    description: p.description,
    url: pageUrl(p.slug),
    isPartOf: { "@id": `${origin}/#organization` },
    publisher: { "@id": `${origin}/#organization` },
    ...(p.sameAs?.length ? { sameAs: p.sameAs } : {}),
  };
}

export function homepageGraph() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      organizationNode(),
      websiteNode(),
      {
        "@type": "ItemList",
        name: "ILSA Labs platforms",
        itemListElement: data.platforms.map((p, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: p.name,
          url: pageUrl(p.slug),
        })),
      },
    ],
  };
}

function pageHtml(p) {
  const canonical = pageUrl(p.slug);
  const labHref = p.hash ? `${origin}/#${p.hash}` : `${origin}/`;
  const outbound = p.sameAs?.[0];
  const ld = {
    "@context": "https://schema.org",
    "@graph": [organizationNode(), platformNode(p)],
  };
  const links = [
    outbound ? `<a href="${esc(outbound)}" rel="noopener">Enter platform</a>` : "",
    p.hash ? `<a href="${esc(labHref)}">See it in the lab</a>` : `<a href="${esc(origin)}/">ILSA Labs</a>`,
  ].filter(Boolean).join(" · ");

  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="ILSA Labs">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:image" content="${esc(org.image)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(p.title)}">
<meta name="twitter:description" content="${esc(p.description)}">
<meta name="twitter:image" content="${esc(org.image)}">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;600&display=swap" rel="stylesheet">
<script type="application/ld+json">
${JSON.stringify(ld, null, 2)}
</script>
<style>
  :root { --ink:#3A4048; --grey:#4F555C; --paper:#EEF0F3; }
  html,body { margin:0; background:var(--paper); color:var(--ink);
    font-family:'Manrope',system-ui,sans-serif; -webkit-font-smoothing:antialiased; }
  body { max-width:42rem; margin:0 auto; padding:48px 24px 80px; }
  a.wordmark { font-weight:600; letter-spacing:.42em; text-transform:uppercase;
    font-size:13px; color:inherit; text-decoration:none; }
  .cat { margin-top:28px; font-size:11px; letter-spacing:.18em; text-transform:uppercase; color:var(--grey); }
  h1 { margin:8px 0 0; font-weight:600; font-size:clamp(28px,6vw,42px); letter-spacing:-.02em; }
  p { margin:18px 0 0; font-weight:300; font-size:17px; line-height:1.6; }
  nav { margin-top:32px; font-size:14px; }
  nav a { color:var(--ink); }
</style>
</head>
<body>
  <a class="wordmark" href="/">Ilsa Labs</a>
  <div class="cat">${esc(p.category)}</div>
  <h1>${esc(p.display || p.name)}</h1>
  <p>${esc(p.description)}</p>
  <nav>${links}</nav>
</body>
</html>
`;
}

function sitemap() {
  const urls = [`${origin}/`, ...data.platforms.map((p) => pageUrl(p.slug))];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}
</urlset>
`;
}

function robots() {
  return `User-agent: *
Allow: /
Disallow: /api/

User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Applebot-Extended
Allow: /

Sitemap: ${origin}/sitemap.xml
`;
}

function llms() {
  const lines = [
    "# ILSA Labs",
    `> ${data.home.description}`,
    "",
    `- Name: ${org.name}`,
    `- Legal name: ${org.legalName}`,
    `- Alternate name: ILSA`,
    `- URL: ${org.url}`,
    `- Location: Perth, Western Australia, Australia`,
    `- Founded: ${org.foundingDate}`,
    `- Contact: ${org.email}`,
    "",
    "## Platforms",
    ...data.platforms.map((p) => `- [${p.name}](${pageUrl(p.slug)}): ${p.category}. ${p.description}`),
  ];
  return lines.join("\n") + "\n";
}

for (const p of data.platforms) {
  const dir = resolve(root, p.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "index.html"), pageHtml(p));
}
function patchHomepage() {
  const path = resolve(root, "index.html");
  let html = readFileSync(path, "utf8");
  const ld = JSON.stringify(homepageGraph(), null, 2);
  const next = html.replace(
    /<script type="application\/ld\+json" id="ilsa-identity">[\s\S]*?<\/script>/,
    `<script type="application/ld+json" id="ilsa-identity">\n${ld}\n</script>`
  );
  if (!/<script type="application\/ld\+json" id="ilsa-identity">/.test(html)) {
    throw new Error("homepage JSON-LD marker missing");
  }
  if (next !== html) writeFileSync(path, next);
}

writeFileSync(resolve(root, "sitemap.xml"), sitemap());
writeFileSync(resolve(root, "robots.txt"), robots());
writeFileSync(resolve(root, "llms.txt"), llms());
writeFileSync(resolve(root, "site/identity-graph.json"), JSON.stringify(homepageGraph(), null, 2) + "\n");
patchHomepage();
console.log(`wrote ${data.platforms.length} platform pages, sitemap.xml, robots.txt, llms.txt, homepage JSON-LD`);
