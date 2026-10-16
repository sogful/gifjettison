const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const manifest = JSON.parse(read("manifest.json"));
const downloadurl = "https://github.com/sogful/gifjettison/releases/latest/download/gifjettison.user.js";

function asseturl(file, type) {
  const data = fs.readFileSync(path.join(root, file)).toString("base64");
  return "data:" + type + ";base64," + data;
}

const popupcss = read("src/css/popup.css")
  .replaceAll("../../assets/fonts/robotolatin.woff2", asseturl("assets/fonts/robotolatin.woff2", "font/woff2"));
let menu = read(".github/userscriptmenu.js").trim()
  .replace("replacepopupcss", JSON.stringify(popupcss));

for (const [token, file] of [
  ["replaceiconnormal", "assets/images/other/youtube.png"],
  ["replaceiconytgc", "assets/images/other/ytgifcomments.png"],
  ["replaceicongiftube", "assets/images/other/giftube.png"]
]) {
  menu = menu.replaceAll(token, asseturl(file, "image/png"));
}
const header = [
  "// ==UserScript==",
  "// @name         GifJettison",
  "// @namespace    https://github.com/sogful/gifjettison",
  "// @version      " + manifest.version,
  "// @description  hide gif comments under youtube videos!",
  "// @author       " + manifest.author,
  "// @match        https://www.youtube.com/*",
  "// @updateURL    " + downloadurl,
  "// @downloadURL  " + downloadurl,
  "// @grant        GM_addStyle",
  "// @grant        GM_addValueChangeListener",
  "// @grant        GM_getValue",
  "// @grant        GM_registerMenuCommand",
  "// @grant        GM_setValue",
  "// @run-at       document-start",
  "// @noframes",
  "// ==/UserScript=="
].join("\n");

const output = [
  header,
  "",
  "(function () {",
  '  "use strict";',
  "",
  "  GM_addStyle(" + JSON.stringify(read("src/css/content.css")) + ");",
  "",
  read("src/js/content.js").trim(),
  "",
  menu,
  "})();",
  ""
].join("\n");

const destination = path.join(__dirname, "gifjettison.user.js");
fs.writeFileSync(destination, output);
console.log("built " + path.relative(root, destination) + " for version " + manifest.version);
