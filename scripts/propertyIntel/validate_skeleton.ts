// Validate the skeleton identity path on 2 properties WITHOUT creating the durable job.
import fs from "node:fs";import path from "node:path"
;(()=>{const p=path.join(process.cwd(),".env.local");for(const l of fs.readFileSync(p,"utf8").split("\n")){const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,"")}})()
const MKT:Record<string,string[]>={Austin:["austin","round rock","cedar park","leander","georgetown","kyle","buda","san marcos","pflugerville"],Dallas:["dallas","fort worth","plano","irving","arlington","frisco","mckinney","richardson","garland","addison","carrollton","lewisville","denton","waxahachie","allen","the colony"],Houston:["houston","katy","sugar land","the woodlands","cypress","pearland","spring","conroe","humble","tomball"],"San Antonio":["san antonio","new braunfels","schertz","boerne","converse","universal city","selma","cibolo","helotes"]}
function mkt(a:string){a=(a||"").toLowerCase();for(const[k,v]of Object.entries(MKT))if(v.some(c=>a.includes(c)))return k;return null}
async function fetchText(url:string){try{const c=new AbortController();const t=setTimeout(()=>c.abort(),12000);const r=await fetch(url,{signal:c.signal,headers:{"User-Agent":"Mozilla/5.0 LB","Accept-Encoding":"identity"}});clearTimeout(t);if(!r.ok)return "";let h="";try{h=await r.text()}catch{return ""}return h.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim().slice(0,600)}catch{return ""}}
async function main(){
  const {supabaseAdmin}=await import("@/lib/supabase/admin")
  const {enrichProperty}=await import("@/lib/propertyEnrichment/writer")
  const {SupabaseEnrichmentStore}=await import("@/lib/propertyEnrichment/stores/supabaseStore")
  const store=new SupabaseEnrichmentStore()
  const key=process.env.GOOGLE_PLACES_API_KEY
  const {data}=await supabaseAdmin.from("property_catalog").select("place_id").is("property_name",null).not("website_url","is",null).limit(2)
  for(const row of data??[]){
    const pid=row.place_id as string
    const dr=await fetch(`https://places.googleapis.com/v1/places/${pid}`,{headers:{"X-Goog-Api-Key":key??"","X-Goog-FieldMask":"id,displayName,formattedAddress,location,rating,userRatingCount,websiteUri"}})
    const d=await dr.json()
    const market=mkt(d.formattedAddress??"")
    const idf=[["property_name",d.displayName?.text],["address",d.formattedAddress],["market",market],["latitude",d.location?.latitude],["longitude",d.location?.longitude],["google_rating",d.rating],["google_review_count",d.userRatingCount],["website_url",d.websiteUri]].filter(([,v])=>v!=null).map(([f,v])=>({field:f as string,value:v,sourceType:"google_places" as const,sourceReference:pid,verificationStatus:"verified" as const,checkedAt:new Date().toISOString()}))
    const res=await enrichProperty(store,{placeId:pid,jobId:"validate_skeleton",fields:idf})
    const txt=d.websiteUri?await fetchText(d.websiteUri):""
    console.log(`\n### ${d.displayName?.text} ###`)
    console.log(` market=${market} | rating=${d.rating}(${d.userRatingCount}) | site=${d.websiteUri}`)
    console.log(` identity fields written: ${res.results.filter(r=>r.outcome==="written").map(r=>r.field).join(", ")||"(none — already present)"}`)
    console.log(` website readable: ${txt.length>=300?"YES → normal enrichment":"NO → needs_rendered_web (skip)"}`)
  }
}
main().catch(e=>{console.error(e);process.exit(1)})
