import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const base=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const designs=await import(pathToFileURL(resolve(base,'lib/designs.ts')).href);
const {newDraft,draftFromProperty,designSize,exportFilename,templates}=designs;
test('post formats are native 1080-pixel outputs',()=>{
 assert.deepEqual([designSize('square').width,designSize('square').height],[1080,1080]);
 assert.deepEqual([designSize('portrait').width,designSize('portrait').height],[1080,1350]);
 assert.deepEqual([designSize('story').width,designSize('story').height],[1080,1920]);
 assert.deepEqual([designSize('bogus').width,designSize('bogus').height],[1080,1080]);
});
test('legacy draft template indexes remain stable',()=>{
 assert.equal(templates[0].name,'The Modern Listing');assert.equal(templates[2].name,'A Beautiful Next Chapter');
 assert.ok(templates.length>=22);
});
test('sample template photos are preview-only, sold templates hide price by default',()=>{
 assert.equal(newDraft(0).photoSource,'sample');assert.equal(newDraft(0).format,'square');
 assert.equal(newDraft(2).showPrice,false);assert.equal(newDraft(14).showPrice,false);
});
test('agent property selection copies photo gallery and price details',()=>{
 const d=draftFromProperty(newDraft(2),'p1',{address:'11883 River Rd',city:'Surrey',price:'1650000',beds:'4',baths:'3',area:'2700',photos:['data:image/jpeg;base64,abc','data:image/jpeg;base64,def']});
 assert.equal(d.photoSource,'property');assert.equal(d.photoGallery?.length,2);
 assert.equal(d.listingPrice,'$1,650,000');assert.match(d.caption,/#JustSold/);
});
test('download filename safe and formatted',()=>{
 const d={...newDraft(0),listingAddress:'123 Main St / Surrey?',format:'portrait'};
 assert.equal(exportFilename(d),'realvolt-123-main-st-surrey-portrait.png');
});
test('editor has file upload, branding, crop sizes, photo guards and maintains agent role controls',()=>{
 const page=readFileSync(resolve(base,'app/page.tsx'),'utf8');
 const css=readFileSync(resolve(base,'app/globals.css'),'utf8');
 const canvas=readFileSync(resolve(base,'app/design-canvas.tsx'),'utf8');
 for(const token of ['uploadDesignAsset','designFormats','photoGallery','photoSource','agentPhoto','brokerageLogo','exportFilename','showAgent','showPrice','copyCaption']) assert.ok(page.includes(token),`Missing ${token}`);
 assert.ok(page.includes('isBrokerageAdmin'));
 assert.ok(page.includes('if(p===\'Back Office\'&&!isBrokerageAdmin)'));
 assert.ok(canvas.includes('canvas.width=W;canvas.height=H;'));
 assert.ok(css.includes('@media(max-width:540px)'));
 assert.ok(page.includes("photoSource==='upload'||editor.photoSource==='property'"));
});
