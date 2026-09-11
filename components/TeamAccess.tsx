'use client';
import {useEffect,useState} from 'react';
import {canAssign,permits,roleDescriptions,type TeamRole} from '@/lib/team-permissions';
type Summary={ownerId:string;userId:string;role:TeamRole;members:{user_id:string;email:string;role:TeamRole}[];invites:{id:string;email:string;role:TeamRole;expires_at:string}[];workspaces:{ownerId:string;label:string;role:string}[]};
const field='rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white';
const button='rounded-lg border border-slate-600 px-3 py-2 text-sm text-white disabled:opacity-40 hover:bg-slate-800';
async function request(body?:object){const r=await fetch('/api/team',{method:body?'POST':'GET',cache:'no-store',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw new Error(data.error||'Team access unavailable.');return data;}
export default function TeamAccess(){
 const [now]=useState(()=>Date.now());
 const [team,setTeam]=useState<Summary|null>(null),[open,setOpen]=useState(false),[email,setEmail]=useState(''),[role,setRole]=useState<TeamRole>('editor'),[url,setUrl]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let alive=true;request().then(t=>{if(alive)setTeam(t);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[]);
 async function act(body:object){setBusy(true);setError('');setNotice('');try{const result=await request(body);setTeam(await request());return result;}catch(e){setError((e as Error).message);return null;}finally{setBusy(false);}}
 return <section className="mx-auto max-w-[1500px] px-4 pb-5 text-white sm:px-8" aria-label="Team access">
 <div className="flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-3 text-sm text-slate-400">Workspace<select aria-label="Active workspace" className={field} disabled={!team||busy} value={team?.ownerId||''} onChange={async e=>{if(await act({action:'switch',ownerId:e.target.value}))location.reload();}}>{team?.workspaces.map(w=><option key={w.ownerId} value={w.ownerId}>{w.label}</option>)}</select></label><button className={button} aria-expanded={open} onClick={()=>setOpen(!open)}>Team access{team?` · ${team.role}`:''}</button></div>
 {error&&<p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
 {open&&team&&<div className="mt-4 rounded-2xl border border-slate-700 bg-slate-900 p-5">
 <h2 className="text-xl font-semibold">People and permissions</h2><p className="mt-2 text-sm text-slate-400">Team members can access all books in this workspace, including private books. Your personal library stays separate when you join another workspace.</p>
 <div className="my-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(roleDescriptions).map(([r,d])=><div key={r} className="rounded-xl border border-slate-700 p-3"><h3 className="capitalize text-cyan-300">{r}</h3><p className="mt-2 text-sm text-slate-400">{d}</p></div>)}</div>
 {permits(team.role,'team')?<>
 <form className="flex flex-wrap items-end gap-3" onSubmit={async e=>{e.preventDefault();setUrl('');const result=await act({action:'invite',email,role});if(result){setUrl(result.inviteUrl);setEmail('');}}}>
 <label className="grid gap-2 text-sm">Teammate email<input className={field} required type="email" maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} placeholder="teammate@example.com"/></label>
 <label className="grid gap-2 text-sm">Access level<select className={field} value={role} onChange={e=>setRole(e.target.value as TeamRole)}>{(['admin','editor','viewer'] as const).filter(r=>canAssign(team.role,null,r)).map(r=><option key={r} value={r}>{r}</option>)}</select></label><button className={button} disabled={busy}>Create invitation link</button>
 </form><p className="mt-2 text-xs text-slate-400">Share the link yourself. It expires in 7 days and only works for the invited verified email. No email is sent automatically.</p>
 {url&&<div className="mt-4 rounded-lg border border-cyan-500/40 p-3"><label className="grid gap-2 text-sm">Invitation link<input readOnly className={field} value={url}/></label><button className={`${button} mt-2`} onClick={async()=>{try{await navigator.clipboard.writeText(url);setNotice('Invitation link copied.');}catch{setError('Select and copy the invitation link above.');}}}>Copy invitation link</button></div>}
 <h3 className="mb-2 mt-6 font-semibold">Members</h3><p className="text-sm text-slate-400">Workspace owner · permanent full access</p>
 {team.members.map(m=><div key={m.user_id} className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-700 pt-3"><span className="min-w-0 flex-1 break-words text-sm">{m.email}</span><select aria-label={`Role for ${m.email}`} className={field} value={m.role} disabled={busy||!canAssign(team.role,m.role,m.role)} onChange={e=>void act({action:'role',userId:m.user_id,role:e.target.value})}>{(['admin','editor','viewer'] as const).filter(r=>r===m.role||canAssign(team.role,m.role,r)).map(r=><option key={r}>{r}</option>)}</select><button className={button} disabled={busy||!canAssign(team.role,m.role,'viewer')} onClick={()=>{if(window.confirm(`Remove workspace access for ${m.email}?`))void act({action:'remove',userId:m.user_id});}}>Remove access</button></div>)}
 <h3 className="mb-2 mt-6 font-semibold">Invitations</h3>{!team.invites.length&&<p className="text-sm text-slate-400">No pending invitations.</p>}{team.invites.map(i=><div key={i.id} className="mt-2 flex flex-wrap items-center gap-3 text-sm"><span className="flex-1 break-words">{i.email} · {i.role} · {Date.parse(i.expires_at)>now?`expires ${new Date(i.expires_at).toLocaleDateString()}`:'expired'}</span><button className={button} disabled={busy||!canAssign(team.role,i.role,'viewer')} onClick={()=>{setUrl('');void act({action:'revoke',id:i.id});}}>Revoke</button></div>)}
 </>:<p className="text-sm text-slate-400">Ask your workspace owner or administrator to change team membership.</p>}
 {notice&&<p role="status" className="mt-3 text-cyan-300">{notice}</p>}
 </div>}
 </section>;
}
