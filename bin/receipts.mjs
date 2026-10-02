#!/usr/bin/env node
import { initProject, runChecks, faultcheck, verifyDone } from '../bundle/core.mjs';

const help=`DoneLatch v0.1.0 — fresh acceptance evidence and fault-sensitive completion checks.
Usage: donelatch <init|run|faultcheck|verify-done> [--root PATH] [--config PATH] [--json]
Alias: receipts
Configure trusted executable+args checks in receipts.yml, and explicit literal faults.
run + faultcheck must both pass for the same watched state before verify-done passes.
This is a cooperative guardrail, not a sandbox or an independent security attestation.`;
try {
  const args=process.argv.slice(2);
  if(args.length===0||args[0]==='--help'||args[0]==='-h') {console.log(help);process.exit(0);}
  if(args[0]==='--version') {console.log('0.1.0');process.exit(0);}
  const command=args.shift();
  const actions={init:initProject,run:runChecks,faultcheck,'verify-done':verifyDone};
  if(!Object.hasOwn(actions,command)) throw new Error(`Unknown command: ${command}`);
  let root=process.cwd(),configPath='receipts.yml',json=false;
  const seen=new Set();
  while(args.length) {
    const flag=args.shift();
    if(seen.has(flag)) throw new Error(`Repeated option: ${flag}`);seen.add(flag);
    if(flag==='--json') json=true;
    else if(flag==='--root'||flag==='--config') {
      const value=args.shift();if(!value||value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
      if(flag==='--root') root=value;else configPath=value;
    } else throw new Error(`Unknown option: ${flag}`);
  }
  const result=await actions[command](root,{configPath});
  if(json) console.log(JSON.stringify(result));
  else if(command==='verify-done') console.log(result.ok?'VERIFIED — current baseline and configured fault evidence pass':`UNVERIFIED — ${result.reasons.join('; ')}`);
  else if(command==='init') console.log(result.message);
  else console.log(`${command}: ${result.status.toUpperCase()}${result.status==='weak'?' — checks too weak':''}${result.error?` — ${result.error}`:''}\nReceipt: ${result.hash}`);
  process.exitCode=result.ok===true||result.status==='passed'?0:result.status==='invalid'?2:1;
} catch(error) {
  const json=process.argv.includes('--json');
  const result={ok:false,error:error.message,reasons:[error.message]};
  if(json) console.log(JSON.stringify(result));else console.error(`DoneLatch: ${error.message}`);
  process.exitCode=2;
}
