// Private Notion gateway for Madame Lovely's R5 Command Center.
// DO NOT deploy without configuring Cloudflare Access and all required secrets.
// No API response is served without validating a Cloudflare Access JWT.
const NOTION="https://api.notion.com/v1";
const VERSION="2025-09-03";
const headers={"content-type":"application/json","cache-control":"no-store","x-content-type-options":"nosniff"};
function json(x,s=200){return new Response(JSON.stringify(x),{status:s,headers});}
const enc=s=>new TextEncoder().encode(s);
function decode64(s){const str=atob(s.replace(/-/g,"+").replace(/_/g,"/"));return Uint8Array.from(str,c=>c.charCodeAt(0));}
async function authenticate(request,env){
  if(!env.ACCESS_TEAM_DOMAIN||!env.ACCESS_AUD)throw Error("Cloudflare Access is not configured");
  const jwt=request.headers.get("Cf-Access-Jwt-Assertion");
  if(!jwt)throw Error("Sign in through Cloudflare Access");
  const parts=jwt.split(".");if(parts.length!==3)throw Error("Bad session");
  const header=JSON.parse(new TextDecoder().decode(decode64(parts[0])));
  const payload=JSON.parse(new TextDecoder().decode(decode64(parts[1])));
  if(header.alg!=="RS256"||!header.kid)throw Error("Unsupported session");
  const domain=env.ACCESS_TEAM_DOMAIN.replace(/^https?:\/\//,"").replace(/\/$/,"");
  if(!/^[a-z0-9.-]+\.cloudflareaccess\.com$/.test(domain))throw Error("Invalid Access domain");
  const jwksResponse=await fetch("https://"+domain+"/cdn-cgi/access/certs",{cf:{cacheTtl:300}});
  if(!jwksResponse.ok)throw Error("Unable to check login");
  const jwks=await jwksResponse.json();
  const key=jwks.keys?.find(k=>k.kid===header.kid&&k.kty==="RSA");
  if(!key)throw Error("Unrecognized session");
  const cryptoKey=await crypto.subtle.importKey("jwk",key,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
  const valid=await crypto.subtle.verify("RSASSA-PKCS1-v1_5",cryptoKey,decode64(parts[2]),enc(parts[0]+"."+parts[1]));
  const now=Math.floor(Date.now()/1000);
  const audience=Array.isArray(payload.aud)?payload.aud:[payload.aud];
  if(!valid||payload.iss!=="https://"+domain||!audience.includes(env.ACCESS_AUD)||typeof payload.exp!=="number"||payload.exp<=now||typeof payload.iat!=="number"||payload.iat>now+60)throw Error("Session validation failed");
  if(env.ALLOWED_EMAIL&&String(payload.email||"").toLowerCase()!==env.ALLOWED_EMAIL.toLowerCase())throw Error("Not an authorized account");
}
async function notion(env,path,method="GET",body){
 const r=await fetch(NOTION+path,{method,headers:{"Authorization":"Bearer "+env.NOTION_TOKEN,"Notion-Version":VERSION,"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});
 if(!r.ok){const t=await r.text();throw Error("Notion request failed ("+r.status+"): "+t.slice(0,200));}
 return r.json();
}
async function allRows(env,ds,max=400){
 const items=[];let cursor;
 do{const result=await notion(env,"/data_sources/"+encodeURIComponent(ds)+"/query","POST",{page_size:100,...(cursor?{start_cursor:cursor}:{})});items.push(...result.results);cursor=result.has_more?result.next_cursor:null;}while(cursor&&items.length<max);
 return items.slice(0,max);
}
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(!url.pathname.startsWith("/api/"))return env.ASSETS.fetch(request);
  if(!["GET","PATCH"].includes(request.method))return json({error:"Method not allowed"},405);
  try{
   if(!env.NOTION_TOKEN||!env.TASKS_DATA_SOURCE_ID||!env.HR_DATA_SOURCE_ID) return json({error:"Backend is not configured"},503);
   await authenticate(request,env);
   if(url.pathname==="/api/bootstrap"&&request.method==="GET"){
     const [tasks,cases]=await Promise.all([allRows(env,env.TASKS_DATA_SOURCE_ID),allRows(env,env.HR_DATA_SOURCE_ID)]);
     return json({tasks,cases});
   }
   const match=url.pathname.match(/^\/api\/tasks\/([0-9a-f-]{32,36})$/i);
   if(match&&request.method==="PATCH"){
    if(Number(request.headers.get("content-length"))>1000)return json({error:"Payload too large"},413);
    const data=await request.json();
    if(typeof data.done!=="boolean")return json({error:"Expected a checkbox value"},400);
    const id=match[1];
    const page=await notion(env,"/pages/"+encodeURIComponent(id));
    if(page.parent?.data_source_id!==env.TASKS_DATA_SOURCE_ID)return json({error:"Not an approved task"},403);
    const updated=await notion(env,"/pages/"+encodeURIComponent(id),"PATCH",{properties:{Status:{status:{name:data.done?"Done":"Inbox"}}}});
    return json({id:updated.id,status:data.done?"Done":"Inbox"});
   }
   return json({error:"Not found"},404);
  }catch(e){
    const authError=/session|login|Access|authorized/i.test(e.message);
    return json({error:authError?"Authentication required or denied.":e.message},authError?401:502);
  }
 }
};
