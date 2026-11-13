'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
function scriptOf(file){const html=fs.readFileSync(path.join(root,file),'utf8');const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]);assert.ok(scripts.length,'inline script found: '+file);return scripts.find(x=>x.includes('"use strict"'))||scripts[scripts.length-1]}
function contextFor(file,cut,els={}){const src=scriptOf(file);assert.ok(src.includes(cut),'script cut marker exists');const context=vm.createContext({document:{createElement:()=>({textContent:'',append(){},appendChild(){}}),getElementById:id=>els[id]||(els[id]={value:'',textContent:'',replaceChildren(){},append(){},appendChild(){}})},console,Number,Math,Array,TextDecoder,Blob});vm.runInContext(src.slice(0,src.indexOf(cut)),context,{timeout:2000});return context}
test('CSV parser accepts quoted comma, quoted newline and escaped quote',()=>{const c=contextFor('tools/csv-analyzer/index.html','$("file").onchange');const rows=vm.runInContext('parseCSV("a,b\\n\\\"x,y\\\",2\\n\\\"line1\\nline2\\\",\\\"a\\\"\\\"b\\\"")',c);assert.deepEqual(JSON.parse(JSON.stringify(rows)),[['a','b'],['x,y','2'],['line1\nline2','a"b']])});
test('CSV parser rejects unterminated quote',()=>{const c=contextFor('tools/csv-analyzer/index.html','$("file").onchange');assert.throws(()=>vm.runInContext('parseCSV("\\"abc")',c),/引用符/)});
test('CSV statistics: mean, median, missing and sample deviation',()=>{const c=contextFor('tools/csv-analyzer/index.html','$("file").onchange');const stats=vm.runInContext('analyze(["amount"],[["1"],["2"],["3"],[""],["4"]])',c);assert.equal(stats[0].n,4);assert.equal(stats[0].missing,1);assert.equal(stats[0].mean,2.5);assert.equal(stats[0].median,2.5);assert.ok(Math.abs(stats[0].sd-Math.sqrt(5/3))<1e-10)});
test('CSV statistics excludes mixed text and numbers',()=>{const c=contextFor('tools/csv-analyzer/index.html','$("file").onchange');assert.equal(vm.runInContext('analyze(["a"],[["3"],["bad"]]).length',c),0)});
test('Pearson correlation for paired rows',()=>{const c=contextFor('tools/csv-analyzer/index.html','$("file").onchange');vm.runInContext('state.rows=[["1","2"],["2","4"],["3","6"],["","8"]]',c);assert.ok(Math.abs(vm.runInContext('pearson({index:0},{index:1})',c)-1)<1e-10)});
test('Pricing calculator computes target price and profit',()=>{const ids={cost:400,fixed:20000,count:100,fee:10,flat:0,target:50000};const els={};for(const [k,v] of Object.entries(ids))els[k]={value:String(v)};els.result={textContent:''};els.comparison={replaceChildren(){},append(){}};const c=contextFor('tools/pricing-simulator/index.html','$("calculate").onclick',els);vm.runInContext('calculate()',c);assert.match(els.result.textContent,/1,223円/);assert.match(els.result.textContent,/50,070円/)});
test('Pricing calculator rejects impossible 100% fee',()=>{const ids={cost:400,fixed:20000,count:100,fee:100,flat:0,target:50000};const els={};for(const [k,v] of Object.entries(ids))els[k]={value:String(v)};els.result={textContent:''};els.comparison={replaceChildren(){},append(){}};const c=contextFor('tools/pricing-simulator/index.html','$("calculate").onclick',els);vm.runInContext('calculate()',c);assert.match(els.result.textContent,/100%/)});
test('Site navigation targets resolve to existing files',()=>{for(const p of ['index.html','tools/index.html','tools/csv-analyzer/index.html','tools/pricing-simulator/index.html','guides/csv-analysis-basics/index.html','guides/pricing-profit-basics/index.html'])assert.ok(fs.existsSync(path.join(root,p)),p)});

test('Pricing demo presets are available',()=>{const html=fs.readFileSync(path.join(root,'tools/pricing-simulator/index.html'),'utf8');assert.match(html,/id="example-digital"/);assert.match(html,/id="example-physical"/);assert.match(html,/function preset\(data\)/)});
test('CSV analyzer has first-time sample workflow',()=>{const html=fs.readFileSync(path.join(root,'tools/csv-analyzer/index.html'),'utf8');assert.match(html,/サンプルデータで試す/);assert.match(html,/初めての方は/)});

test('Tool structured metadata is valid and free',()=>{for(const p of ['tools/csv-analyzer/index.html','tools/pricing-simulator/index.html']){const html=fs.readFileSync(path.join(root,p),'utf8');const match=html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);assert.ok(match,p);const meta=JSON.parse(match[1]);assert.equal(meta['@type'],'WebApplication');assert.equal(meta.offers.price,'0');assert.ok(meta.url.startsWith('https://ogb-umalab.github.io/'))}});
test('Homepage links to both tools and guides',()=>{const html=fs.readFileSync(path.join(root,'index.html'),'utf8');for(const target of ['tools/csv-analyzer/','tools/pricing-simulator/','guides/csv-analysis-basics/','guides/pricing-profit-basics/'])assert.ok(html.includes('href="'+target+'"'),target)});

test('Internal links on key pages point to existing files',()=>{
 const pages=['index.html','tools/index.html','tools/csv-analyzer/index.html','tools/pricing-simulator/index.html','guides/csv-analysis-basics/index.html','guides/pricing-profit-basics/index.html'];
 for(const page of pages){
  const html=fs.readFileSync(path.join(root,page),'utf8');
  for(const match of html.matchAll(/href="([^"]+)"/g)){
   const href=match[1];
   if(/^(?:https?:|mailto:|tel:|#|javascript:|data:)/i.test(href))continue;
   const pathname=href.split(/[?#]/)[0];
   if(!pathname)continue;
   const resolved=path.resolve(root,path.dirname(page),decodeURIComponent(pathname));
   assert.ok(resolved.startsWith(root+path.sep)||resolved===root,'Link stays inside repository: '+page+' '+href);
   const file=fs.existsSync(resolved)&&fs.statSync(resolved).isDirectory()?path.join(resolved,'index.html'):resolved;
   assert.ok(fs.existsSync(file),'Broken link: '+page+' -> '+href);
  }
 }
});

test('Every public HTML page has exactly one correct GA4 tag',()=>{
 const pages=['404.html','about/index.html','approach/index.html','guides/csv-analysis-basics/index.html','guides/pricing-profit-basics/index.html','index.html','organization/index.html','research/blitz-index/index.html','research/index.html','tools/csv-analyzer/index.html','tools/index.html','tools/pricing-simulator/index.html'];
 for(const page of pages){const html=fs.readFileSync(path.join(root,page),'utf8');assert.equal((html.match(/gtag\('config','G-7KHMXV2NFC'\)/g)||[]).length,1,page);assert.ok(html.includes('googletagmanager.com/gtag/js?id=G-7KHMXV2NFC'),page)}
});
