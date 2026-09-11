/** Opt-in live verification. Run only with the dedicated preview environment.
 * Uses server credentials in-process; prints no keys or signed URLs.
 * All created data belongs to a unique synthetic owner and is removed afterward.
 */
import assert from "node:assert/strict";
import { nanoid } from "nanoid";
import { configuration } from "../lib/config";
import { createBook, getUploadTarget, completeUpload, getPdfDelivery, getBook, deleteBook, recordEvent, getStats, saveAsset, readAssetBytes } from "../lib/store";
import { changeWorkspace, getWorkspace } from "../lib/workspace";
import type { StoredBook } from "../lib/types";
async function main() {
 if (process.env.VERCEL_ENV !== "preview" || !configuration().ready) throw new Error("Live verification requires the configured Vercel preview environment.");
 const id=nanoid(12), owner=`verification-${nanoid(12)}`, folder=nanoid(12);
 const objects=["<</Type/Catalog/Pages 2 0 R>>","<</Type/Pages/Count 1/Kids[3 0 R]>>","<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>","<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>"];
 const stream="BT /F1 18 Tf 30 100 Td (Flipbook storage verification) Tj ET" + (process.env.FLIPBOOK_VERIFY_LARGE === "1" ? " ".repeat(70 * 1024 * 1024) : "");
 objects.push(`<</Length ${stream.length}>>\nstream\n${stream}\nendstream`);
 let pdf="%PDF-1.4\n"; const offsets=[0];
 for(const [i,object] of objects.entries()) { offsets.push(pdf.length); pdf+=`${i+1} 0 obj\n${object}\nendobj\n`; }
 const xref=pdf.length;
 pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,"0")+" 00000 n \n").join("")}trailer\n<</Size 6/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
 const bytes=new TextEncoder().encode(pdf);
 const book:StoredBook={id,title:"Automated storage verification",fileName:"verification.pdf",size:bytes.length,createdAt:new Date().toISOString(),ownerId:owner,status:"pending",visibility:"private",hasPassword:false,passwordHash:null,branding:{},overlays:[]};
 let made=false, folderMade=false;
 try {
  await createBook(book); made=true;
  const target=await getUploadTarget(id);
  const upload=await fetch(target.url,{method:target.method,headers:{...target.headers,"Content-Type":"application/pdf"},body:bytes});
  if (!upload.ok) {
   const failure=await upload.json().catch(()=>({}));
   const sizeRejected=upload.status===413 || String(failure.statusCode)==="413" || /size|too.large|exceed/i.test(String(failure.message || failure.error || ""));
   throw new Error(`Signed upload failed (HTTP ${upload.status}); file-size rejection: ${sizeRejected}; PDF bytes: ${bytes.length}`);
  }
  console.log("LIVE CHECK: signed PDF upload passed");
  assert.equal((await completeUpload(book)).status,"ready");
  const delivery=await getPdfDelivery(id,false,book.fileName);
  assert.equal(delivery.kind,"redirect");
  if(delivery.kind === "redirect") {
   const response=await fetch(delivery.url); assert.equal(response.ok,true);
   assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);
  }
  console.log("LIVE CHECK: PDF verification, publishing, and private download passed");
  await recordEvent({bookId:id,type:"view",visitor:"verification-visitor",createdAt:new Date().toISOString()});
  assert.equal((await getStats(id,1)).totalViews,1);
  const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=","base64");
  await saveAsset(id,"logo",png,"image/png");
  assert.deepEqual(await readAssetBytes(id,"logo"),png);
  console.log("LIVE CHECK: analytics and private image storage passed");
  await changeWorkspace(owner,{action:"create",folder,label:"Verification folder"}); folderMade=true;
  await changeWorkspace(owner,{action:"move",folder,book:id});
  assert.equal((await getWorkspace(owner)).placements[id],folder);
  await assert.rejects(changeWorkspace("verification-other-owner",{action:"move",folder,book:id}));
  await changeWorkspace(owner,{action:"rename",folder,label:"Renamed verification folder"});
  assert.equal((await getWorkspace(owner)).folders[0].name,"Renamed verification folder");
  await changeWorkspace(owner,{action:"delete",folder}); folderMade=false;
  assert.equal((await getBook(id))?.status,"ready");
  console.log("LIVE CHECK: folder persistence, owner isolation, and non-destructive folder deletion passed");
 } finally {
  if(folderMade) await changeWorkspace(owner,{action:"delete",folder});
  if(made) { await deleteBook(id); assert.equal(await getBook(id),null); }
 }
 console.log("LIVE CHECK: cleanup passed; verification complete");
}
main().catch(error=>{console.error(error instanceof Error ? error.message : "Live verification failed"); process.exitCode=1;});
