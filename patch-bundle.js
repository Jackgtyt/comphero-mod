// Injects a "Cut last 5s" button into CompHero's Trim view header (left of Export).
// For every clip except the last one on the timeline, sets the out point to
// (source duration - 5s), snapped to the timeline frame grid. Goes through the
// app's own undo history, so Ctrl+Z reverts it. Clicking again is a no-op.
const fs = require("fs");
const path = require("path");

const file = process.argv[2];
let src = fs.readFileSync(file, "utf8");

if (src.includes("__cut5")) {
  console.log("already patched");
  process.exit(0);
}

const anchor =
  'a.jsx("div",{className:"flex-1"}),a.jsxs(Ae,{ref:p,variant:"primary",className:"py-1.5",disabled:s.length===0,onClick:()=>n("compile")';
const count = src.split(anchor).length - 1;
if (count !== 1) {
  console.error(`expected 1 anchor match, found ${count}; CompHero version changed?`);
  process.exit(1);
}

// Variables available in scope (from the Trim view component b3):
//   s  = downloaded clips in timeline order   i  = ref to current project
//   re = applyWithHistory                     Vt = timeline fps
//   Le = snap to frame grid   Ze/rt = current in/out   Jo = current gap after
//   le/Ne = playing ref / pause   Z/ye = re-park playhead   Ce = toast
const button =
  'a.jsxs(Ae,{variant:"secondary",className:"py-1.5",disabled:s.length<2,title:"Cut the last 5 seconds off every clip except the last one",onClick:()=>{' +
  'const __cut5=s;if(__cut5.length<2)return;le.current&&Ne();' +
  'const U5=Vt(__cut5),X5=1/U5,last5=__cut5[__cut5.length-1].id,ids5=new Set(__cut5.map(c=>c.id));let n5=0;' +
  'const next5=i.current.videos.map(v=>{if(v.id===last5||!ids5.has(v.id))return v;' +
  'const ce=Le(Ze(v),U5),fe=Le(rt(v),U5),out=Math.max(ce+X5,Le((v.durationSec||0)-5,U5));' +
  'if(out>=fe-1e-9)return v;n5++;' +
  'return{...v,outPoint:out,gapAfterSec:Le(Jo(v,U5)+(fe-out),U5),userTrimmed:!0}});' +
  'if(n5===0){Ce("Every clip already ends 5s early","info");return}' +
  're(next5,{persist:!0}),Z(ye.current,!1),Ce(`Cut 5s from ${n5} clip${n5===1?"":"s"}`,"good")' +
  '},children:[a.jsx(Wl,{size:14}),"Cut last 5s"]}),';

src = src.replace(anchor, anchor.replace('a.jsxs(Ae,{ref:p', button + "a.jsxs(Ae,{ref:p"));
fs.writeFileSync(file, src);
console.log("patched", path.basename(file));
