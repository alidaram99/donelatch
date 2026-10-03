import path from 'node:path';
import os from 'node:os';
import { mkdir, writeFile, readFile, lstat, readdir, copyFile, mkdtemp, rm, realpath, chmod } from 'node:fs/promises';
import { stringify } from 'yaml';
import { projectRoot, safePath, loadConfig, inside, pathKey } from './config.mjs';
import { snapshot, digest } from './state.mjs';
import { withLock, appendReceipt, readLog } from './log.mjs';
import { executeChecks } from './process.mjs';
import { assertTrustedConfiguration } from './trust.mjs';
export { trustProject, inspectConfiguration, approveReviewedConfiguration, userTrustDirectory } from './trust.mjs';

export async function initProject(root, options={}) {
  root=await projectRoot(root);
  const file=await safePath(root,options.configPath??'receipts.yml',{allowMissing:true});
  const config={version:1,checks:[{id:'acceptance',command:'node',args:['--test'],timeoutMs:30000,failureExitCodes:[1],failureMarker:'ASSERT_CONTRACT_FAILED'}],faults:[{id:'configured-fault',file:'src/example.js',find:'REPLACE_WITH_EXACT_ORIGINAL_CODE',replace:'REPLACE_WITH_FAULTY_CODE',checkIds:['acceptance']}],exclude:['runtime']};
  await writeFile(file,`# DoneLatch: configure a real outcome assertion and one unique literal mutation.\n# Commands run as your OS user; this file is executable policy, not untrusted data.\n${stringify(config)}`,{flag:'wx'});
  return {ok:true,configPath:path.relative(root,file),message:'Configure the acceptance check and fault, then have a human review them with donelatch trust before running checks.'};
}
function receiptData(kind, before, startedAt, extras={}) {
  return {kind,startedAt,finishedAt:new Date().toISOString(),subject:before,...extras};
}
export async function runChecks(root, options={}) {
  root=await projectRoot(root);
  return withLock(root,async()=>{
    const loaded=await loadConfig(root,options.configPath);
    await assertTrustedConfiguration(root,loaded,options);
    const before=await snapshot(root,loaded);
    const startedAt=new Date().toISOString();
    const results=await executeChecks(loaded.config.checks,root);
    const after=await snapshot(root,await loadConfig(root,options.configPath));
    const status=before.stateHash!==after.stateHash?'changed':results.some(r=>r.status==='invalid')?'invalid':results.every(r=>r.status==='passed')?'passed':'failed';
    return appendReceipt(root,receiptData('run',before,startedAt,{status,results,finalStateHash:after.stateHash}));
  });
}
async function copyProject(source,target,loaded) {
  let files=0,bytes=0;
  const ignored=['.git','.receipts',...loaded.config.exclude];
  const skip=p=>ignored.some(x=>pathKey(p)===pathKey(x)||pathKey(p).startsWith(`${pathKey(x)}/`));
  async function walk(directory,prefix='') {
    for(const entry of await readdir(directory,{withFileTypes:true})) {
      const relative=prefix?`${prefix}/${entry.name}`:entry.name;
      if(skip(relative)) continue;
      const origin=path.join(directory,entry.name),destination=path.join(target,relative);
      const stat=await lstat(origin);
      if(stat.isSymbolicLink()) throw new Error(`Temp copy does not support symlinks/junctions: ${relative}`);
      if(stat.isDirectory()) {await mkdir(destination,{recursive:true});await walk(origin,relative);}
      else if(stat.isFile()) {
        if(++files>30_000||(bytes+=stat.size)>250*1024*1024) throw new Error('Temp copy exceeds 30000 files or 250 MB; narrow project scope');
        await copyFile(origin,destination);await chmod(destination,stat.mode);
      } else throw new Error(`Temp copy does not support special files: ${relative}`);
    }
  }
  await mkdir(target,{recursive:true});await walk(source);
}
async function discardOwnedTemp(parent,target) {
  const canonicalParent=await realpath(parent);
  if(!path.basename(canonicalParent).startsWith('donelatch-')||!inside(canonicalParent,path.resolve(target))||path.resolve(target)===canonicalParent) throw new Error('Unsafe temporary cleanup target');
  await rm(target,{recursive:true,force:true});
}
export async function faultcheck(root,options={}) {
  root=await projectRoot(root);
  return withLock(root,async()=>{
    const loaded=await loadConfig(root,options.configPath);
    await assertTrustedConfiguration(root,loaded,options);
    const before=await snapshot(root,loaded);
    const startedAt=new Date().toISOString();
    // Hosted Windows runners may expose TEMP through an 8.3 alias (RUNNER~1).
    // Derive every child path from its canonical parent before containment checks.
    const temporary=await realpath(await mkdtemp(path.join(os.tmpdir(),'donelatch-')));
    const template=path.join(temporary,'template');
    const mutations=[];
    let error=null,status='passed';
    try {
      await copyProject(root,template,loaded);
      const captured=await snapshot(root,await loadConfig(root,options.configPath));
      if(captured.stateHash!==before.stateHash) throw new Error('Project changed while capturing temporary copy');
      for(const fault of loaded.config.faults) {
        const work=path.join(temporary,`case-${mutations.length}`);
        await copyProject(template,work,loaded);
        const baselineBefore=await snapshot(work,await loadConfig(work,options.configPath));
        const baseline=await executeChecks(loaded.config.checks,work);
        const baselineAfter=await snapshot(work,await loadConfig(work,options.configPath));
        if(baselineBefore.stateHash!==baselineAfter.stateHash||baseline.some(r=>r.status!=='passed'||`${r.stdout}\n${r.stderr}`.includes(loaded.config.checks.find(c=>c.id===r.id).failureMarker))) {
          mutations.push({id:fault.id,status:'invalid',baseline,results:[],reason:'Baseline in temp copy must pass without changing watched inputs or emitting an assertion-failure marker'});
          status='invalid';await discardOwnedTemp(temporary,work);continue;
        }
        // Reset all baseline-generated artifacts before injecting the fault at the same path.
        await discardOwnedTemp(temporary,work);await copyProject(template,work,loaded);
        const target=await safePath(work,fault.file,{ordinaryFile:true});
        const source=await readFile(target,'utf8');
        const occurrences=source.split(fault.find).length-1;
        if(occurrences!==1) {
          mutations.push({id:fault.id,status:'invalid',baseline,results:[],reason:`Literal find must match exactly once (found ${occurrences})`});
          status='invalid';await discardOwnedTemp(temporary,work);continue;
        }
        await writeFile(target,source.replace(fault.find,()=>fault.replace));
        const checks=loaded.config.checks.filter(c=>fault.checkIds.includes(c.id));
        const mutantBefore=await snapshot(work,await loadConfig(work,options.configPath));
        const results=await executeChecks(checks,work);
        const mutantAfter=await snapshot(work,await loadConfig(work,options.configPath));
        const detected=results.some(r=>r.assertionFailure);
        const caseStatus=mutantBefore.stateHash!==mutantAfter.stateHash||results.some(r=>r.status==='invalid')?'invalid':detected?'detected':results.every(r=>r.status==='passed')?'survived':'invalid';
        if(caseStatus==='invalid') status='invalid'; else if(caseStatus==='survived'&&status==='passed') status='weak';
        mutations.push({id:fault.id,status:caseStatus,baseline,results,reason:caseStatus==='survived'?'Checks too weak: configured fault survived':caseStatus==='invalid'?'Failure was not a declared outcome assertion; evidence inconclusive':null});
        await discardOwnedTemp(temporary,work);
      }
    } catch(e) {error=e.message;status='invalid';}
    finally {
      // Only paths within this exact mkdtemp directory are removed; never project paths.
      await discardOwnedTemp(temporary,template).catch(()=>{});
      for(let i=0;i<loaded.config.faults.length;i++) await discardOwnedTemp(temporary,path.join(temporary,`case-${i}`)).catch(()=>{});
      const tempBase=await realpath(os.tmpdir());
      if(inside(tempBase,path.resolve(temporary))&&path.basename(temporary).startsWith('donelatch-')) await rm(temporary,{recursive:true,force:true}).catch(()=>{});
    }
    const after=await snapshot(root,await loadConfig(root,options.configPath));
    if(before.stateHash!==after.stateHash) status='changed';
    return appendReceipt(root,receiptData('faultcheck',before,startedAt,{status,mutations,error,finalStateHash:after.stateHash}));
  });
}
export async function verifyDone(root,options={}) {
  root=await projectRoot(root);
  const reasons=[];
  let trustValidated=false;
  try {
    const loaded=await loadConfig(root,options.configPath);
    await assertTrustedConfiguration(root,loaded,options);
    trustValidated=true;
    const lock=await safePath(root,'.receipts/operation.lock',{allowMissing:true,ordinaryFile:true});
    try { await lstat(lock); return {ok:false,trustValidated,reasons:['An acceptance operation is running; wait for its current evidence']}; } catch(error) { if(error.code!=='ENOENT') throw error; }
    const current=await snapshot(root,loaded);
    const {receipts}=await readLog(root);
    const run=receipts.filter(r=>r.kind==='run').at(-1);
    const fault=receipts.filter(r=>r.kind==='faultcheck').at(-1);
    for(const [name,receipt] of [['acceptance run',run],['faultcheck',fault]]) {
      if(!receipt) {reasons.push(`No ${name} receipt`);continue;}
      if(receipt.status!=='passed') reasons.push(`Latest ${name} did not pass (${receipt.status})`);
      if(receipt.subject.stateHash!==current.stateHash||receipt.finalStateHash!==current.stateHash) reasons.push(`${name} is stale: watched files, git HEAD or acceptance config changed`);
      const started=Date.parse(receipt.startedAt),finished=Date.parse(receipt.finishedAt);
      if(!Number.isFinite(started)||!Number.isFinite(finished)||finished<started||started+2<current.maxMtimeMs||finished>Date.now()+2000) reasons.push(`${name} timestamp does not follow the last watched edit`);
    }
    if(run&&(!Array.isArray(run.results)||run.results.length!==loaded.config.checks.length||loaded.config.checks.some(c=>run.results.filter(r=>r.id===c.id&&r.status==='passed').length!==1))) reasons.push('Acceptance result set is incomplete');
    if(fault&&(!Array.isArray(fault.mutations)||fault.mutations.length!==loaded.config.faults.length||loaded.config.faults.some(f=>fault.mutations.filter(m=>m.id===f.id&&m.status==='detected').length!==1))) reasons.push('Fault sensitivity is incomplete');
    return {ok:reasons.length===0,trustValidated,reasons,stateHash:current.stateHash,runHash:run?.hash??null,faultHash:fault?.hash??null};
  } catch(error) {return {ok:false,trustValidated,trustRequired:!trustValidated,reasons:[`Cannot verify evidence: ${error.message}`]};}
}
