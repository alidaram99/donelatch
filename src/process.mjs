import { spawn, spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const LIMIT=128_000;
// Launch errors are reported by spawn. A missing persisted output (ENOENT) can
// be the outcome the contract is deliberately checking, not a setup failure.
const INFRASTRUCTURE=/(?:SyntaxError|IndentationError|ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|Cannot find module|command not found|not recognized as an internal)/i;
export async function execute(check, root) {
  const startedAt=new Date().toISOString();
  const start=performance.now();
  const command=check.command === 'node' ? process.execPath : check.command;
  return new Promise(resolve => {
    let stdout='',stderr='',timeout=false,spawnError=null,overflow=false,finished=false;
    const child=spawn(command,check.args,{cwd:root,shell:false,windowsHide:true,detached:process.platform !== 'win32',env:{...process.env,DONELATCH_CHECK_ID:check.id}});
    function killTree() {
      if(!child.pid) return;
      if(process.platform === 'win32') { spawnSync('taskkill',['/pid',String(child.pid),'/T','/F'],{windowsHide:true,timeout:1000,stdio:'ignore'}); child.kill('SIGKILL'); }
      else { try { process.kill(-child.pid,'SIGKILL'); } catch {} }
    }
    function append(kind, chunk) {
      if(kind==='stdout') stdout+=chunk.toString(); else stderr+=chunk.toString();
      if(stdout.length+stderr.length>LIMIT) { overflow=true; stdout=stdout.slice(0,LIMIT/2);stderr=stderr.slice(0,LIMIT/2);killTree(); }
    }
    child.stdout.on('data',chunk=>append('stdout',chunk));
    child.stderr.on('data',chunk=>append('stderr',chunk));
    const timer=setTimeout(()=>{timeout=true;killTree();},check.timeoutMs);
    const escapeTimer=setTimeout(()=>{timeout=true;killTree();finish(null,'TIMEOUT');},check.timeoutMs+6000);
    function finish(exitCode,signal) {
      if(finished) return; finished=true;clearTimeout(timer);clearTimeout(escapeTimer);
      const output=`${stdout}\n${stderr}`;
      const invalid=timeout||overflow||spawnError||signal||INFRASTRUCTURE.test(output);
      resolve({id:check.id,startedAt,finishedAt:new Date().toISOString(),durationMs:Math.round(performance.now()-start),exitCode,signal:signal??null,timedOut:timeout,spawnError,outputTruncated:overflow,stdout,stderr,status:invalid?'invalid':exitCode===0?'passed':'failed',assertionFailure:!invalid&&check.failureExitCodes.includes(exitCode)&&output.includes(check.failureMarker)});
    }
    child.on('error',error=>{spawnError=error.message;finish(null,null);});
    child.on('close',(code,signal)=>finish(code,signal));
  });
}
export async function executeChecks(checks,root) {
  const results=[];
  for(const check of checks) results.push(await execute(check,root));
  return results;
}
