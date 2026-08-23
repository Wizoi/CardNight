"use strict";

// Renders a "table person" avatar spec (see personas/players/table/*.md for the
// source content these specs come from). Each spec's `svg` field holds a
// pre-fetched DiceBear "micah" illustration (generated once offline from the
// spec's skinTone/hairStyle/hairColor/facialHair/accessory/expression/accentColor
// and embedded as a static string in table-people-data.js — no runtime network
// call), which render() resizes and returns as-is. Specs without an `svg` field
// fall back to the original hand-built flat-color icon below.
const Avatar = (function () {
  const SKIN_TONES = {
    porcelain: "#F7DCC6",
    light: "#F0C8A0",
    tan: "#D9A066",
    olive: "#C68A52",
    brown: "#9C6B3E",
    "deep-brown": "#6E4423",
    dark: "#4A2E1A",
  };

  const HAIR_COLORS = {
    black: "#1A1A1A",
    "dark-brown": "#3B2417",
    brown: "#5C3A21",
    auburn: "#7B3F24",
    blonde: "#D9B26A",
    "platinum-blonde": "#E8DCC4",
    red: "#B34A2C",
    gray: "#9B9B9B",
    white: "#EDEDED",
    silver: "#C7C9CC",
    blue: "#3E6E9E",
    purple: "#7A5EA8",
    pink: "#E087A8",
    green: "#5E9E6E",
  };

  function colorFor(map, key, fallback) {
    return map[key] || fallback;
  }

  // Hair is drawn as a base "cap" shape behind/around the head, with a small
  // set of per-style additions (tail, bun, strip, braids, etc.) layered on top.
  function hairMarkup(spec) {
    if (spec.hairStyle === "bald") return "";
    const color =
      spec.hairStyle === "cap-covered" || spec.hairStyle === "headscarf"
        ? spec.coveringColor || "#8B3A3A"
        : colorFor(HAIR_COLORS, spec.hairColor, "#3B2417");

    const capByStyle = {
      buzzcut: `<path d="M25 40 Q50 8 75 40 L75 32 Q50 14 25 32 Z" fill="${color}"/>`,
      "short-crop": `<path d="M22 42 Q50 4 78 42 L76 30 Q50 10 24 30 Z" fill="${color}"/>`,
      "medium-part": `<path d="M20 44 Q48 2 80 44 L77 26 Q50 6 23 26 Z" fill="${color}"/>`,
      "long-straight": `<path d="M18 46 Q50 2 82 46 L82 78 L72 78 L72 40 Q50 16 28 40 L28 78 L18 78 Z" fill="${color}"/>`,
      "long-wavy": `<path d="M16 46 Q50 0 84 46 Q86 66 78 80 Q80 60 70 42 Q50 18 30 42 Q20 60 22 80 Q14 66 16 46 Z" fill="${color}"/>`,
      ponytail: `<path d="M22 42 Q50 4 78 42 L76 28 Q50 8 24 28 Z" fill="${color}"/><path d="M78 36 Q94 44 88 68 Q84 54 74 44 Z" fill="${color}"/>`,
      bun: `<path d="M22 42 Q50 4 78 42 L76 28 Q50 8 24 28 Z" fill="${color}"/><circle cx="50" cy="10" r="10" fill="${color}"/>`,
      afro: `<circle cx="50" cy="34" r="34" fill="${color}"/>`,
      "curly-short": `<circle cx="30" cy="30" r="10" fill="${color}"/><circle cx="45" cy="18" r="11" fill="${color}"/><circle cx="60" cy="18" r="11" fill="${color}"/><circle cx="74" cy="30" r="10" fill="${color}"/>`,
      "curly-long": `<circle cx="26" cy="34" r="11" fill="${color}"/><circle cx="42" cy="16" r="12" fill="${color}"/><circle cx="58" cy="16" r="12" fill="${color}"/><circle cx="76" cy="34" r="11" fill="${color}"/><rect x="20" y="34" width="10" height="40" rx="5" fill="${color}"/><rect x="70" y="34" width="10" height="40" rx="5" fill="${color}"/>`,
      bob: `<path d="M18 46 Q50 2 82 46 L80 66 Q50 78 20 66 Z" fill="${color}"/>`,
      pixie: `<path d="M24 44 Q46 4 78 34 Q70 20 46 18 Q26 20 24 44 Z" fill="${color}"/>`,
      mohawk: `<rect x="44" y="2" width="12" height="46" rx="6" fill="${color}"/>`,
      "shaved-sides": `<rect x="42" y="2" width="16" height="46" rx="6" fill="${color}"/>`,
      "slicked-back": `<path d="M20 40 Q50 6 80 40 L80 24 Q50 2 20 24 Z" fill="${color}"/>`,
      braids: `<path d="M22 42 Q50 4 78 42 L76 28 Q50 8 24 28 Z" fill="${color}"/><rect x="18" y="40" width="7" height="42" rx="3.5" fill="${color}"/><rect x="75" y="40" width="7" height="42" rx="3.5" fill="${color}"/>`,
      "cap-covered": `<path d="M14 40 Q50 -6 86 40 L86 30 Q50 -14 14 30 Z" fill="${color}"/><rect x="14" y="30" width="72" height="8" fill="${color}"/>`,
      headscarf: `<path d="M14 42 Q50 -4 86 42 L84 60 Q50 46 16 60 Z" fill="${color}"/>`,
    };
    return capByStyle[spec.hairStyle] || "";
  }

  function facialHairMarkup(spec) {
    const color = colorFor(HAIR_COLORS, spec.hairColor, "#3B2417");
    const byStyle = {
      stubble: `<rect x="34" y="58" width="32" height="16" rx="8" fill="${color}" opacity="0.25"/>`,
      mustache: `<path d="M36 62 Q50 68 64 62 Q58 66 50 65 Q42 66 36 62 Z" fill="${color}"/>`,
      goatee: `<path d="M40 66 Q50 80 60 66 Q58 74 50 76 Q42 74 40 66 Z" fill="${color}"/>`,
      "full-beard": `<path d="M28 52 Q28 82 50 86 Q72 82 72 52 L66 52 Q66 74 50 78 Q34 74 34 52 Z" fill="${color}"/>`,
      "soul-patch": `<rect x="47" y="70" width="6" height="8" rx="3" fill="${color}"/>`,
    };
    return byStyle[spec.facialHair] || "";
  }

  function accessoryMarkup(spec) {
    const ink = "#1B1B1B";
    const byAccessory = {
      "round-glasses": `<circle cx="38" cy="46" r="9" fill="none" stroke="${ink}" stroke-width="2.5"/><circle cx="62" cy="46" r="9" fill="none" stroke="${ink}" stroke-width="2.5"/><line x1="47" y1="46" x2="53" y2="46" stroke="${ink}" stroke-width="2.5"/>`,
      "square-glasses": `<rect x="30" y="39" width="16" height="14" rx="2" fill="none" stroke="${ink}" stroke-width="2.5"/><rect x="54" y="39" width="16" height="14" rx="2" fill="none" stroke="${ink}" stroke-width="2.5"/><line x1="46" y1="46" x2="54" y2="46" stroke="${ink}" stroke-width="2.5"/>`,
      sunglasses: `<rect x="29" y="40" width="18" height="12" rx="4" fill="${ink}"/><rect x="53" y="40" width="18" height="12" rx="4" fill="${ink}"/><line x1="47" y1="45" x2="53" y2="45" stroke="${ink}" stroke-width="2.5"/>`,
      aviators: `<path d="M28 40 h20 v9 a10 8 0 0 1 -20 0 Z" fill="${ink}" opacity="0.85"/><path d="M52 40 h20 v9 a10 8 0 0 1 -20 0 Z" fill="${ink}" opacity="0.85"/><line x1="48" y1="43" x2="52" y2="43" stroke="${ink}" stroke-width="2.5"/>`,
      headphones: `<path d="M22 46 Q22 12 50 12 Q78 12 78 46" fill="none" stroke="${ink}" stroke-width="4"/><rect x="16" y="42" width="10" height="16" rx="4" fill="${ink}"/><rect x="74" y="42" width="10" height="16" rx="4" fill="${ink}"/>`,
      cigar: `<rect x="60" y="66" width="22" height="6" rx="3" fill="#7A5230" transform="rotate(20 60 66)"/>`,
      toothpick: `<line x1="58" y1="68" x2="78" y2="64" stroke="#D9C9A6" stroke-width="2"/>`,
      earrings: `<circle cx="24" cy="56" r="2.5" fill="#D4AF37"/><circle cx="76" cy="56" r="2.5" fill="#D4AF37"/>`,
      bandana: `<path d="M16 32 Q50 8 84 32 L84 20 Q50 -4 16 20 Z" fill="#8B3A3A"/>`,
      visor: `<path d="M16 34 Q50 24 84 34 L84 22 Q50 12 16 22 Z" fill="#2E7D6B"/>`,
      cap: `<path d="M14 34 Q50 2 86 34 L86 22 Q50 -8 14 22 Z" fill="#2E4057"/><ellipse cx="50" cy="34" rx="34" ry="6" fill="#2E4057"/>`,
      beanie: `<path d="M18 36 Q50 4 82 36 L82 22 Q50 4 18 22 Z" fill="#4C6E5D"/><rect x="18" y="30" width="64" height="8" fill="#3D5A4C"/>`,
      scarf: `<rect x="30" y="70" width="40" height="12" rx="4" fill="#8B3A3A"/>`,
      bowtie: `<path d="M42 78 L50 74 L58 78 L58 84 L50 80 L42 84 Z" fill="#7A2E38"/>`,
      "pocket-square": `<rect x="60" y="80" width="10" height="8" fill="#D97706"/>`,
      "hair-flower": `<circle cx="70" cy="24" r="5" fill="#E087A8"/><circle cx="66" cy="20" r="4" fill="#E087A8"/><circle cx="74" cy="20" r="4" fill="#E087A8"/>`,
      "nose-ring": `<circle cx="50" cy="60" r="2" fill="none" stroke="${ink}" stroke-width="1.5"/>`,
    };
    return byAccessory[spec.accessory] || "";
  }

  // Eyebrows/eyes/mouth vary by expression — kept simple and distinct rather
  // than anatomically precise.
  function expressionMarkup(spec) {
    const ink = "#1B1B1B";
    const eyesDefault = `<circle cx="38" cy="46" r="2.6" fill="${ink}"/><circle cx="62" cy="46" r="2.6" fill="${ink}"/>`;
    const byExpression = {
      neutral: { eyes: eyesDefault, brows: `<line x1="32" y1="38" x2="44" y2="38" stroke="${ink}" stroke-width="2"/><line x1="56" y1="38" x2="68" y2="38" stroke="${ink}" stroke-width="2"/>`, mouth: `<line x1="42" y1="62" x2="58" y2="62" stroke="${ink}" stroke-width="2.5"/>` },
      smirk: { eyes: eyesDefault, brows: `<line x1="32" y1="38" x2="44" y2="36" stroke="${ink}" stroke-width="2"/><line x1="56" y1="36" x2="68" y2="38" stroke="${ink}" stroke-width="2"/>`, mouth: `<path d="M42 62 Q54 68 60 60" fill="none" stroke="${ink}" stroke-width="2.5"/>` },
      "intense-stare": { eyes: `<ellipse cx="38" cy="46" rx="3.6" ry="2.6" fill="${ink}"/><ellipse cx="62" cy="46" rx="3.6" ry="2.6" fill="${ink}"/>`, brows: `<line x1="30" y1="36" x2="44" y2="40" stroke="${ink}" stroke-width="2.5"/><line x1="56" y1="40" x2="70" y2="36" stroke="${ink}" stroke-width="2.5"/>`, mouth: `<line x1="44" y1="63" x2="56" y2="63" stroke="${ink}" stroke-width="2.5"/>` },
      "wide-grin": { eyes: eyesDefault, brows: `<line x1="32" y1="37" x2="44" y2="37" stroke="${ink}" stroke-width="2"/><line x1="56" y1="37" x2="68" y2="37" stroke="${ink}" stroke-width="2"/>`, mouth: `<path d="M38 60 Q50 74 62 60 Z" fill="${ink}"/>` },
      "poker-face": { eyes: eyesDefault, brows: `<line x1="32" y1="39" x2="44" y2="39" stroke="${ink}" stroke-width="2"/><line x1="56" y1="39" x2="68" y2="39" stroke="${ink}" stroke-width="2"/>`, mouth: `<line x1="40" y1="63" x2="60" y2="63" stroke="${ink}" stroke-width="2.5"/>` },
      "raised-eyebrow": { eyes: eyesDefault, brows: `<line x1="32" y1="40" x2="44" y2="40" stroke="${ink}" stroke-width="2"/><line x1="56" y1="30" x2="68" y2="34" stroke="${ink}" stroke-width="2.5"/>`, mouth: `<line x1="42" y1="62" x2="58" y2="62" stroke="${ink}" stroke-width="2"/>` },
      squint: { eyes: `<line x1="34" y1="46" x2="42" y2="46" stroke="${ink}" stroke-width="3"/><line x1="58" y1="46" x2="66" y2="46" stroke="${ink}" stroke-width="3"/>`, brows: `<line x1="32" y1="40" x2="44" y2="42" stroke="${ink}" stroke-width="2"/><line x1="56" y1="42" x2="68" y2="40" stroke="${ink}" stroke-width="2"/>`, mouth: `<line x1="42" y1="63" x2="58" y2="63" stroke="${ink}" stroke-width="2"/>` },
      smug: { eyes: eyesDefault, brows: `<line x1="32" y1="38" x2="44" y2="36" stroke="${ink}" stroke-width="2"/><line x1="56" y1="38" x2="68" y2="38" stroke="${ink}" stroke-width="2"/>`, mouth: `<path d="M42 61 Q50 60 58 65" fill="none" stroke="${ink}" stroke-width="2.5"/>` },
      "warm-smile": { eyes: eyesDefault, brows: `<line x1="32" y1="39" x2="44" y2="38" stroke="${ink}" stroke-width="2"/><line x1="56" y1="38" x2="68" y2="39" stroke="${ink}" stroke-width="2"/>`, mouth: `<path d="M40 60 Q50 70 60 60" fill="none" stroke="${ink}" stroke-width="2.5"/>` },
      "narrowed-eyes": { eyes: `<path d="M34 46 Q38 42 42 46" fill="none" stroke="${ink}" stroke-width="2.5"/><path d="M58 46 Q62 42 66 46" fill="none" stroke="${ink}" stroke-width="2.5"/>`, brows: `<line x1="30" y1="38" x2="44" y2="41" stroke="${ink}" stroke-width="2.5"/><line x1="56" y1="41" x2="70" y2="38" stroke="${ink}" stroke-width="2.5"/>`, mouth: `<line x1="42" y1="63" x2="58" y2="63" stroke="${ink}" stroke-width="2"/>` },
    };
    const chosen = byExpression[spec.expression] || byExpression.neutral;
    return `${chosen.brows}${chosen.eyes}${chosen.mouth}`;
  }

  // DiceBear's micah SVGs don't put width/height on the root <svg> tag by
  // default (only a viewBox), so a blind string replace risks resizing the
  // first inner element with a width/height attribute instead. Match only
  // the root tag explicitly.
  function injectSize(svgString, size) {
    return svgString.replace(/<svg([^>]*)>/, (match, attrs) => {
      const cleaned = attrs.replace(/\s(width|height)="[^"]*"/g, "");
      return `<svg${cleaned} width="${size}" height="${size}" class="avatar-svg">`;
    });
  }

  // Returns an inline <svg> string. size is the rendered CSS pixel size
  // (square); the internal viewBox is always 0 0 100 100.
  function render(spec, size) {
    size = size || 56;
    if (spec.svg) return injectSize(spec.svg, size);
    const skin = colorFor(SKIN_TONES, spec.skinTone, "#D9A066");
    const accent = spec.accentColor || "#12746B";
    return `
      <svg viewBox="0 0 100 100" width="${size}" height="${size}" class="avatar-svg" role="img" aria-label="player avatar">
        <circle cx="50" cy="50" r="49" fill="${accent}"/>
        <circle cx="50" cy="54" r="30" fill="${skin}"/>
        ${accessoryMarkup(spec)}
        ${expressionMarkup(spec)}
        ${hairMarkup(spec)}
        ${facialHairMarkup(spec)}
      </svg>
    `;
  }

  return { render, SKIN_TONES, HAIR_COLORS };
})();
