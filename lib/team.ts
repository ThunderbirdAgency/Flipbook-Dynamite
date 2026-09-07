import 'server-only';
import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { currentUserId, requireUserId, requireConfiguration } from './auth';
import { configuration } from './config';
import { AppError } from './errors';
import { canAssign, permits, type TeamRole, type TeamPermission } from './team-permissions';
export type Member = {owner_id:string;user_id:string;email:string;role:Exclude<TeamRole,'owner'>};
type Invite = {id:string;owner_id:string;email:string;role:Member['role'];token_hash:string;expires_at:string};
type State = {members:Member[];invites:Invite[]};
export const teamCookie = 'flipbook-workspace';
export const tokenHash = (token:string) => createHash('sha256').update(token).digest('hex');
const file=()=>path.join(process.env.FLIPBOOK_DATA_DIR||path.join(process.cwd(),'data'),'team.json');
async function read():Promise<State>{try{return JSON.parse(await fs.readFile(file(),'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {members:[],invites:[]};throw e;}}
let lock=Promise.resolve();
async function rest(route:string,body?:object){
 requireConfiguration();const key=process.env.SUPABASE_SERVICE_ROLE_KEY!;
 const r=await fetch(`${configuration().supabaseUrl}/rest/v1/${route}`,{method:body?'POST':'GET',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,cache:'no-store'});
 if(!r.ok){const e=await r.json().catch(()=>({}));if(String(e.message).includes('invite_invalid'))throw new AppError(403,'This invitation has expired, was used or revoked, or belongs to a different verified email.');if(String(e.message).includes('team_denied'))throw new AppError(403,'Your role does not allow that team change.');if(String(e.message).includes('team_limit'))throw new AppError(409,'This workspace has reached its 100-person invitation and membership limit.');throw new AppError(503,'Team access is temporarily unavailable. Please retry.');}return r.json();
}
export async function memberRole(ownerId:string, userId:string|null):Promise<TeamRole|null>{
 if(!userId)return null;if(ownerId===userId)return 'owner';
 const rows:Member[]=configuration().localDemo?(await read()).members:await rest(`flipbook_team_members?owner_id=eq.${encodeURIComponent(ownerId)}&user_id=eq.${encodeURIComponent(userId)}`);
 return rows.find(m=>m.owner_id===ownerId&&m.user_id===userId)?.role||null;
}
export async function hasPermission(ownerId:string|undefined,permission:TeamPermission){return Boolean(ownerId&&permits(await memberRole(ownerId,await currentUserId()),permission));}
export async function activeWorkspace(permission:TeamPermission='read',request?:NextRequest){
 const userId=await requireUserId();const selected=request?.cookies.get(teamCookie)?.value || (!request&&!configuration().localDemo?(await cookies()).get(teamCookie)?.value:undefined);const ownerId=selected||userId;
 const role=await memberRole(ownerId,userId);
 if(!permits(role,permission))throw new AppError(403,'Your role does not allow this action. Select your personal workspace if team access was removed.');
 return {ownerId,userId,role:role!};
}
export async function teamSummary(userId:string,ownerId:string){
 const memberships:Member[]=configuration().localDemo?(await read()).members.filter(m=>m.user_id===userId):await rest(`flipbook_team_members?user_id=eq.${encodeURIComponent(userId)}`);
 const role=await memberRole(ownerId,userId);
 if(!role)throw new AppError(403,'Team access was removed. Switch to your personal workspace.');
 const managed=permits(role,'team');
 const members:Member[]=!managed?[]:configuration().localDemo?(await read()).members.filter(m=>m.owner_id===ownerId):await rest(`flipbook_team_members?owner_id=eq.${encodeURIComponent(ownerId)}`);
 const invites:Invite[]=!managed?[]:configuration().localDemo?(await read()).invites.filter(i=>i.owner_id===ownerId):await rest(`flipbook_team_invites?owner_id=eq.${encodeURIComponent(ownerId)}&select=id,owner_id,email,role,expires_at`);
 return {ownerId,userId,role,members,invites:invites.map(({id,email,role,expires_at})=>({id,email,role,expires_at})),workspaces:[{ownerId:userId,label:'My workspace',role:'owner'},...memberships.map(m=>({ownerId:m.owner_id,label:`Shared workspace (${m.role}) · ${m.owner_id.slice(-6)}`,role:m.role}))]};
}
export async function changeTeam(actor:string,workspace:string,action:string,payload:Record<string,unknown>):Promise<{ownerId?:string}>{
 requireConfiguration();if(!configuration().localDemo)return rest('rpc/flipbook_team_change',{actor,workspace,action,payload});
 const prev=lock;let release!:()=>void;lock=new Promise<void>(r=>release=r);await prev;
 try{
  const state=await read();let result={};
  const role:TeamRole|null=actor===workspace?'owner':state.members.find(m=>m.owner_id===workspace&&m.user_id===actor)?.role||null;
  if(action==='accept'){
   const i=state.invites.find(i=>i.token_hash===payload.hash);
   if(!i||Date.parse(i.expires_at)<=Date.now()||!(payload.emails as string[]).includes(i.email)||i.owner_id===actor)throw new AppError(403,'Invitation unavailable for this verified email.');
   if(!state.members.some(m=>m.owner_id===i.owner_id&&m.user_id===actor))state.members.push({owner_id:i.owner_id,user_id:actor,email:i.email,role:i.role});
   state.invites=state.invites.filter(v=>v.id!==i.id);result={ownerId:i.owner_id};
  }else{
   if(!permits(role,'team'))throw new AppError(403,'Your role cannot manage people.');
   const next=payload.role as Member['role'];
   if(action==='invite'){
    if(!canAssign(role,null,next)||!['admin','editor','viewer'].includes(next))throw new AppError(403,'Role not allowed.');
    if(state.members.filter(m=>m.owner_id===workspace).length+state.invites.filter(i=>i.owner_id===workspace&&Date.parse(i.expires_at)>Date.now()).length>=100)throw new AppError(409,'Team limit reached.');
    state.invites.push({id:String(payload.id),owner_id:workspace,email:String(payload.email),role:next,token_hash:String(payload.hash),expires_at:new Date(Date.now()+7*86400000).toISOString()});
   }else if(action==='revoke'){
    const i=state.invites.find(i=>i.id===payload.id&&i.owner_id===workspace);if(!i||!canAssign(role,i.role,'viewer'))throw new AppError(403,'Role not allowed.');state.invites=state.invites.filter(v=>v!==i);
   }else if(action==='role'||action==='remove'){
    const m=state.members.find(m=>m.owner_id===workspace&&m.user_id===payload.userId);if(!m||!canAssign(role,m.role,action==='remove'?'viewer':next)||action==='role'&&!['admin','editor','viewer'].includes(next))throw new AppError(403,'Role not allowed.');
    if(action==='remove'){state.invites=state.invites.filter(i=>i.owner_id!==workspace||i.email!==m.email);state.members=state.members.filter(v=>v!==m);}else m.role=next;
   }else throw new AppError(400,'Unknown team action.');
  }
  await fs.mkdir(path.dirname(file()),{recursive:true});await fs.writeFile(file()+'.tmp',JSON.stringify(state));await fs.rename(file()+'.tmp',file());return result;
 }finally{release();}
}
