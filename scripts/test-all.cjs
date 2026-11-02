const {spawnSync}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const root=path.resolve(__dirname,'..');
(async()=>{
  const env={...process.env};
  const downloaded=!env.STUKI_BUNDLE_PATH;
  if(downloaded) env.STUKI_BUNDLE_PATH=await require('./fetch-stuki-fixture.cjs')();
  try {
  const tests=['model','output-diff','site-settings','site-favicon','progenv','progenv-interactions','spec-resize','save-dialog','output-hints','firefox-extension'];
  let failures=0;
  for(const test of tests) {
    const result=spawnSync(process.execPath,[path.join(root,'tests',test+'.test.cjs')],{cwd:root,env,stdio:'inherit'});
    if(result.error) console.error(result.error.message);
    if(result.status!==0) failures++;
  }
  const python=env.PYTHON || (process.platform==='win32'?'python':'python3');
  const feed=spawnSync(python,[path.join(root,'tests/firefox-updates.test.py')],{cwd:root,env,stdio:'inherit'});
  if(feed.error) console.error(feed.error.message);
  if(feed.status!==0) failures++;
  if(failures) throw new Error(failures+' test suite(s) failed');
  console.log('PASS: all 11 test suites');
  } finally {
    if(downloaded) {
      const folder=path.dirname(path.resolve(env.STUKI_BUNDLE_PATH));
      if(path.dirname(folder)!==path.resolve(os.tmpdir()) || !path.basename(folder).startsWith('elte-extras-stuki-')) throw new Error('Unexpected fixture cleanup path');
      fs.rmSync(folder,{recursive:true,force:true});
    }
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
