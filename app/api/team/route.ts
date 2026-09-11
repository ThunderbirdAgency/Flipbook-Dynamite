import {NextRequest,NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {randomBytes} from 'node:crypto';
import {api,assertSameOrigin,readJson} from '@/lib/http';
import {requireUserId} from '@/lib/auth';
import {activeWorkspace,memberRole,teamSummary,changeTeam,teamCookie,tokenHash} from '@/lib/team';
import {enforceRateLimit} from '@/lib/store';
import {AppError} from '@/lib/errors';
import {configuration} from '@/lib/config';
export const runtime='nodejs';
async function selectWorkspace(ownerId:string){(await cookies()).set(teamCookie,ownerId,{httpOnly:true,secure:!configuration().localDemo,sameSite:'lax',path:'/',maxAge:30*86400});}
export async function GET(){return api(async()=>{const userId=await requireUserId();let ownerId=(await cookies()).get(teamCookie)?.value||userId;if(!await memberRole(ownerId,userId))ownerId=userId;return NextResponse.json(await teamSummary(userId,ownerId),{headers:{'Cache-Control':'private, no-store'}});});}
export async function POST(req:NextRequest){return api(async()=>{
 assertSameOrigin(req);const actor=await requireUserId();await enforceRateLimit(`team:${actor}`,30);const b=await readJson(req);
 if(b.action==='switch'){
  if(typeof b.ownerId!=='string'||!await memberRole(b.ownerId,actor))throw new AppError(403,'You do not belong to that workspace.');
  await selectWorkspace(b.ownerId);return NextResponse.json({ok:true});
 }
 if(b.action==='accept'){
  if(typeof b.token!=='string'||!/^[a-f0-9]{64}$/.test(b.token))throw new AppError(400,'Enter a valid invitation link.');
  let emails:string[]=[];
  if(!configuration().localDemo){const {currentUser}=await import('@clerk/nextjs/server');const user=await currentUser();emails=user?.emailAddresses.filter(e=>e.verification?.status==='verified').map(e=>e.emailAddress.toLowerCase())||[];}
  const result=await changeTeam(actor,'','accept',{hash:tokenHash(b.token),emails});if(result.ownerId)await selectWorkspace(result.ownerId);return NextResponse.json({ok:true});
 }
 const {ownerId}=await activeWorkspace('team',req);
 if(b.action==='invite'){
  const email=typeof b.email==='string'?b.email.trim().toLowerCase():'';
  if(email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!['admin','editor','viewer'].includes(b.role))throw new AppError(400,'Enter an email and choose a role.');
  const token=randomBytes(32).toString('hex');
  await changeTeam(actor,ownerId,'invite',{email,role:b.role,id:randomBytes(16).toString('hex'),hash:tokenHash(token)});
  // Fragment avoids sending the invitation secret to server logs and referrers.
  return NextResponse.json({inviteUrl:`${req.nextUrl.origin}/team/join#${token}`},{headers:{'Cache-Control':'no-store'}});
 }
 if(!['role','remove','revoke'].includes(b.action))throw new AppError(400,'Choose a team action.');
 if(b.action==='role'&&!['admin','editor','viewer'].includes(b.role))throw new AppError(400,'Choose a valid role.');
 await changeTeam(actor,ownerId,b.action,{id:b.id,userId:b.userId,role:b.role});return NextResponse.json({ok:true});
});}
