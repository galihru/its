const fs = require("fs");
const path = require("path");
const { extractCanvaDeck } = require("./canva-importer.cjs");

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error("Usage: node functions/test-canva-import.cjs <canva-url> [out.json]");
    process.exit(1);
  }
  const out = process.argv[3] || "";
  const deck = await extractCanvaDeck(url);
  const summary = {
    title: deck.title,
    sourceUrl: deck.sourceUrl,
    resolvedUrl: deck.resolvedUrl,
    pageCount: deck.pageCount,
    importedSlides: deck.slides.length,
    signature: deck.signature,
    firstSlideBytes: Math.round((deck.slides[0]?.src.length || 0) * 0.75),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (out) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(deck, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
