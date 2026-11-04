// Genera los iconos de la PWA. Uso: node scripts/generate-icons.mjs
import { mkdirSync } from "node:fs";
import sharp from "sharp";

// Hoja de presupuesto con renglones y un tilde. `safe` achica el dibujo para la zona
// segura de los iconos maskable, que Android recorta en círculo.
const icon = (radius, scale) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${radius}" fill="#C2410C"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <path d="M140 72h172l60 60v308H140z" fill="#FAF8F5"/>
    <path d="M312 72v60h60z" fill="#FDBA74"/>
    <rect x="182" y="176" width="96" height="22" rx="11" fill="#C2410C"/>
    <rect x="182" y="226" width="148" height="16" rx="8" fill="#A8A29E"/>
    <rect x="182" y="264" width="148" height="16" rx="8" fill="#A8A29E"/>
    <path d="M198 362l40 38 76-84" fill="none" stroke="#C2410C" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;

mkdirSync("public/icons", { recursive: true });
const standard = Buffer.from(icon(96, 1));
const fullBleed = Buffer.from(icon(0, 0.72));
await sharp(standard).resize(192).png().toFile("public/icons/icon-192.png");
await sharp(standard).resize(512).png().toFile("public/icons/icon-512.png");
await sharp(fullBleed).resize(512).png().toFile("public/icons/icon-maskable-512.png");
await sharp(fullBleed).resize(180).png().toFile("public/icons/apple-touch-icon.png");
await sharp(standard).resize(48).png().toFile("src/app/icon.png");
