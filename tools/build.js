#!/usr/bin/env node
/* Builds dist/dashboard.html: the whole app (CSS, scripts, libraries) in ONE file that works when double-clicked
   (file://), offline, or on any static host. Usage: node tools/build.js */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'); const rd = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const safe = (t) => t.replace(/<\/(script)/gi, '<\\/$1');
let html = rd('index.html');
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, f) => `<style>${rd(f)}</style>`);
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, f) => `<script>${safe(rd(f))}</script>`);
const libs = `<script type="text/plain" id="lm-lib-pdf">${safe(rd('vendor/pdf.min.js'))}</script>\n<script type="text/plain" id="lm-lib-pdfworker">${safe(rd('vendor/pdf.worker.min.js'))}</script>\n`;
const at = html.lastIndexOf('</body>'); html = html.slice(0, at) + libs + html.slice(at); // lastIndexOf: the inlined scripts contain the text </body> too
fs.mkdirSync(path.join(root, 'dist'), { recursive: true }); fs.writeFileSync(path.join(root, 'dist/dashboard.html'), html);
console.log('dist/dashboard.html', (html.length / 1e6).toFixed(1) + ' MB');
