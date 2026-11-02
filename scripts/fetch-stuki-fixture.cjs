const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
module.exports=async function fetchStukiFixture() {
  const base='https://progalap.elte.hu/stuki/';
  const response=await fetch(base,{signal:AbortSignal.timeout(20000)});
  if(!response.ok) throw new Error('Could not fetch Stuki HTML: '+response.status);
  const html=await response.text();
  const source=[...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].find(match=>/\btype=["']module["']/i.test(match[0]))?.[1];
  if(!source) throw new Error('Stuki module URL was not found');
  const url=new URL(source,base);
  if(url.origin!==new URL(base).origin) throw new Error('Unexpected Stuki module origin');
  const bundle=await fetch(url,{signal:AbortSignal.timeout(20000)});
  if(!bundle.ok) throw new Error('Could not fetch Stuki module: '+bundle.status);
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'elte-extras-stuki-'));
  const destination=path.join(folder,'client.js');
  await fs.writeFile(destination,await bundle.text());
  return destination;
};
