/* A stand-in for lmk-api that behaves like rooms.js, in memory, so test-loop.js can walk two students through
   the whole classmates loop without writing a row to production D1. Same shapes as roomView(); same refusals
   (proof, not enrolled, self, already). Keep it in step with rooms.js when a route's shape changes.
   Spawned by test-loop.js; standalone: PORT=8902 node loop-worker.js */
const http=require('http');
const S={owners:{}, rooms:{}, members:{}, sessions:[], rsvps:[], referrals:{}, hits:[], hitKeys:[], calls:[]};
let nextId=1;
const key=(h,c)=>h+'|'+c;
const view=(h,c,sid)=>{
  const rows=(S.members[key(h,c)]||[]);
  const me=rows.find(r=>r.sid===sid);
  const out={ok:true, member:!!me, count:rows.length, course:'', chat:''};
  if(!me) return out;
  out.chat=(S.rooms[key(h,c)]||{}).chat||'';
  out.roster=rows.map(r=>({id:r.mid,name:r.name,handle:r.handle,joined:r.joined,me:r.sid===sid}));
  const ss=S.sessions.filter(s=>s.h===h&&s.c===c&&s.at>Date.now()-864e5);
  const pub=sid2=>{const r=rows.find(x=>x.sid===sid2);return r?{id:r.mid,name:r.name}:null};
  out.sessions=ss.map(s=>{const g=S.rsvps.filter(x=>x.id===s.id);return {id:s.id,at:s.at,place:s.place,note:s.note,aid:s.aid,by:pub(s.sid),mine:s.sid===sid,going:g.map(x=>pub(x.sid)).filter(Boolean),me:g.some(x=>x.sid===sid)}});
  return out;
};
const identity=b=>{ const sid=String(b.sid||''), sh=String(b.secret||''); if(sid.length<16||sh.length<16) return {err:'no',status:400};
  if(!S.owners[sid]) S.owners[sid]={sh,created:Date.now()}; else if(S.owners[sid].sh!==sh) return {err:'no',status:403};
  return {sid, host:String(b.host||'').toLowerCase()} };
const member=b=>{ const id=identity(b); if(id.err) return id; const c=String(b.cid||''); const k=key(id.host,c);
  const proof=String(b.proof||''); if(!proof) return {err:'proof',status:403};
  const room=S.rooms[k]; if(room&&room.proof&&room.proof!==proof){ S.members[k]=(S.members[k]||[]).filter(r=>r.sid!==id.sid); return {err:'not enrolled',status:403}; }
  return {...id, cid:c, k, proof, room} };
http.createServer((req,res)=>{
  let body=''; req.on('data',d=>body+=d); req.on('end',()=>{
    const send=(code,obj)=>{res.writeHead(code,{'content-type':'application/json','access-control-allow-origin':req.headers.origin||'*','access-control-allow-headers':'content-type, authorization','access-control-allow-methods':'POST, GET, OPTIONS'});res.end(JSON.stringify(obj))};
    if(req.method==='OPTIONS') return send(204,{});
    const u=new URL(req.url,'http://x'); let b={}; try{b=JSON.parse(body||'{}')}catch(_){}
    S.calls.push(u.pathname);
    if(u.pathname==='/config') return send(200,{ok:true,rooms:{on:true,days:14},plus:{tiers:{}},storeUrl:'',push:{key:''},announce:{on:false}});
    if(u.pathname==='/hit'){S.hits.push(b.ev); S.hitKeys.push(Object.keys(b).sort().join(',')); return send(200,{ok:true,counted:true})}   // hitKeys: the privacy check — an event name and a day, nothing else
    if(u.pathname==='/room/mine'){const id=identity(b); if(id.err) return send(id.status,{ok:false,error:id.err}); const rooms=[]; for(const k in S.members) if((S.members[k]||[]).some(r=>r.sid===id.sid)){const [host,cid]=k.split('|'); rooms.push({host,cid})} return send(200,{ok:true,rooms})}   // like rooms.js roomMine: the rooms this sid is in
    if(u.pathname==='/plus/status'){const id=identity(b); if(id.err) return send(id.status,{ok:false,error:id.err}); const rooms=[]; for(const k in S.members) if((S.members[k]||[]).some(r=>r.sid===id.sid)){const [host,cid]=k.split('|'); rooms.push({host,cid})} return send(200,{ok:true,rooms,tiers:{},plan:'free',level:'free'})}   // like worker.js: the rooms this sid is in, so a second device knows them at boot
    if(u.pathname==='/room/count'){const k=key(String(b.host||'').toLowerCase(),String(b.cid||''));return send(200,{ok:true,count:(S.members[k]||[]).length})}
    if(u.pathname==='/room/get'){const m=member(b); if(m.err) return send(m.status,{ok:false,error:m.err}); return send(200,view(m.host,m.cid,m.sid))}
    if(u.pathname==='/room/join'){const m=member(b); if(m.err) return send(m.status,{ok:false,error:m.err}); const name=String(b.name||'').trim().slice(0,40); if(!name) return send(400,{ok:false,error:'name'}); const hdl=String(b.handle||'').trim().slice(0,60); if(/^@/.test(hdl)&&!/^@[A-Za-z0-9._]{1,30}$/.test(hdl)) return send(400,{ok:false,error:'handle'});
      if(!S.rooms[m.k]) S.rooms[m.k]={chat:'',proof:m.proof,created:Date.now()}; if(!S.rooms[m.k].proof) S.rooms[m.k].proof=m.proof;
      const had=Object.values(S.members).some(rows=>rows.some(r=>r.sid===m.sid));   // like rooms.js: room_join counts a student once, on their first room
      const rows=S.members[m.k]=S.members[m.k]||[]; const ex=rows.find(r=>r.sid===m.sid); if(ex){ex.name=name;ex.handle=hdl} else rows.push({sid:m.sid,mid:'m'+(nextId++),name,handle:hdl,joined:Date.now()});
      if(!had) S.hits.push('room_join'); return send(200,view(m.host,m.cid,m.sid))}
    if(u.pathname==='/room/leave'){const id=identity(b); if(id.err) return send(id.status,{ok:false,error:id.err}); const k=key(id.host,String(b.cid||'')); S.members[k]=(S.members[k]||[]).filter(r=>r.sid!==id.sid); return send(200,{ok:true,member:false})}
    if(u.pathname==='/room/chat'){const m=member(b); if(m.err) return send(m.status,{ok:false,error:m.err}); if(!(S.members[m.k]||[]).some(r=>r.sid===m.sid)) return send(403,{ok:false,error:'not a member'});
      // rooms.js reads `url` and answers {ok, chat} — a first draft of this read `chat`, and the app toasted "Linked." over a link the worker never kept
      let url=String(b.url||'').trim().slice(0,200); if(url){ try{ const x=new URL(url); if(x.protocol!=='https:') return send(400,{ok:false,error:'https only'}); url=x.href; }catch(_){ return send(400,{ok:false,error:'bad url'}); } }
      (S.rooms[m.k]=S.rooms[m.k]||{chat:'',proof:m.proof}).chat=url; return send(200,{ok:true,chat:url})}
    if(u.pathname==='/room/session'){const m=member(b); if(m.err) return send(m.status,{ok:false,error:m.err}); const rows=S.members[m.k]||[]; if(!rows.some(r=>r.sid===m.sid)) return send(403,{ok:false,error:'not member'});
      if(b.action==='propose'){const id='s'+(nextId++); S.sessions.push({id,h:m.host,c:m.cid,sid:m.sid,at:+b.at,place:b.place,note:b.note,aid:b.aid}); S.rsvps.push({id,sid:m.sid})}
      else if(b.action==='in'){ if(!S.rsvps.some(x=>x.id===b.id&&x.sid===m.sid)) S.rsvps.push({id:b.id,sid:m.sid}) }
      else if(b.action==='out'){ S.rsvps=S.rsvps.filter(x=>!(x.id===b.id&&x.sid===m.sid)) }
      else if(b.action==='cancel'){ S.sessions=S.sessions.filter(s=>!(s.id===b.id&&s.sid===m.sid)); S.rsvps=S.rsvps.filter(x=>x.id!==b.id) }
      return send(200,view(m.host,m.cid,m.sid))}
    if(u.pathname==='/ref/claim'){const id=identity(b); if(id.err) return send(id.status,{ok:false,error:id.err}); return send(200,{ok:true,paid:false,reason:'off'})}   // retired: a share earns nothing; older app copies still call it
    if(u.pathname==='/__state') return send(200,{rooms:S.rooms,members:S.members,sessions:S.sessions,rsvps:S.rsvps,referrals:S.referrals,hits:S.hits,hitKeys:S.hitKeys,calls:S.calls.slice(-60)});
    if(u.pathname==='/__reset'){for(const k in S) S[k]=Array.isArray(S[k])?[]:{}; return send(200,{ok:true})}
    return send(404,{ok:false,error:'no route '+u.pathname});
  });
}).listen(+process.env.PORT||8902,()=>console.log('loop worker on :'+(+process.env.PORT||8902)));
