import fs from "node:fs";import path from "node:path"
;(()=>{const p=path.join(process.cwd(),".env.local");for(const l of fs.readFileSync(p,"utf8").split("\n")){const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,"")}})()
async function fetchText(url:string){try{const c=new AbortController();const t=setTimeout(()=>c.abort(),15000);const r=await fetch(url,{signal:c.signal,headers:{"User-Agent":"Mozilla/5.0 LB","Accept-Encoding":"identity"}});clearTimeout(t);if(!r.ok)return "";let h="";try{h=await r.text()}catch{return ""}return h.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim().slice(0,12000)}catch{return ""}}
function safeParse(t:string){t=t.replace(/```json/gi,"").replace(/```/g,"").trim();const s=t.indexOf("{"),e=t.lastIndexOf("}");try{return JSON.parse(s>=0&&e>s?t.slice(s,e+1):t)}catch{return null}}
async function main(){
  const {supabaseAdmin}=await import("@/lib/supabase/admin")
  const {enrichProperty}=await import("@/lib/propertyEnrichment/writer")
  const {SupabaseEnrichmentStore}=await import("@/lib/propertyEnrichment/stores/supabaseStore")
  const store=new SupabaseEnrichmentStore()
  const Anthropic=(await import("@anthropic-ai/sdk")).default
  const anthropic=new Anthropic({apiKey:process.env.ANTHROPIC_API_KEY})
  const ids=fs.readFileSync("/tmp/val5.txt","utf8").split("\n").filter(Boolean)
  const SYS=`Extract apartment intelligence from official website text. RAW JSON only. Only what the text CLEARLY states; NEVER infer "no" from absence; omit/"unknown" otherwise. No pricing/commission/credit-policy.
Return {"offerings":{"furnished_units_available","furniture_package_available","corporate_housing_available","washer_dryer_included","washer_dryer_connections" (each Yes|No|Select Units|Specific Floor Plans|Unknown)},"pet":{"pets_allowed":Yes|No|Cats Only|Dogs Only|Unknown,"breed_restrictions":Yes|No|Unknown,"pet_weight_limit":int|null,"pet_fee":int|null,"monthly_pet_rent":int|null},"utilities":{"all_bills_paid":Yes|No|Partial|Unknown,"water_included","electric_included","gas_included","trash_included" (Yes|No|Unknown)},"internet":{"internet_included":Yes|No|Unknown,"fiber_available":Yes|No|Unknown,"internet_provider":string|null}}`
  for(const placeId of ids){
    const c=(await supabaseAdmin.from("property_catalog").select("property_name,website_url,pets_allowed,all_bills_paid,internet_included,furnished_units_available").eq("place_id",placeId).maybeSingle()).data as Record<string,unknown>
    let text=await fetchText(c.website_url as string)
    for(const s of ["/amenities","/floorplans"]){const x=await fetchText(new URL(s,c.website_url as string).toString());if(x)text+="\n"+x}
    if(text.length<300){console.log(`\n### ${c.property_name} — site returned no text (js-only) ###`);continue}
    const msg=await anthropic.messages.create({model:"claude-haiku-4-5-20251001",max_tokens:1200,system:SYS,messages:[{role:"user",content:`Property ${c.property_name}. Text:\n${text}`}]})
    const b=msg.content.find((x:{type:string})=>x.type==="text") as {text:string}
    const ex=safeParse(b?.text||"")||{}
    console.log(`\n### ${c.property_name} ###`)
    console.log(" offerings:",JSON.stringify(ex.offerings||{}))
    console.log(" pet:",JSON.stringify(ex.pet||{}))
    console.log(" utilities:",JSON.stringify(ex.utilities||{}))
    console.log(" internet:",JSON.stringify(ex.internet||{}))
    // route through safe writer (idempotent check + fills)
    const skip=(v:unknown)=>v==null||v===""||String(v).toLowerCase()==="unknown"
    const cands:{field:string;value:unknown}[]=[]
    for(const[obj,fs2]of Object.entries({offerings:["furnished_units_available","furniture_package_available","corporate_housing_available","washer_dryer_included","washer_dryer_connections"],pet:["pets_allowed","breed_restrictions","pet_weight_limit","pet_fee","monthly_pet_rent"],utilities:["all_bills_paid","water_included","electric_included","gas_included","trash_included"],internet:["internet_included","fiber_available","internet_provider"]})){
      const src=(ex[obj]||{}) as Record<string,unknown>; for(const f of fs2)if(!skip(src[f]))cands.push({field:f,value:src[f]})}
    const r=await enrichProperty(store,{placeId,jobId:"validate_domains",fields:cands.map(x=>({...x,sourceType:"official_property_site" as const,sourceReference:c.website_url as string,verificationStatus:"verified" as const,checkedAt:new Date().toISOString()}))})
    const w=r.results.filter(x=>x.outcome==="written").map(x=>x.field), s=r.results.filter(x=>x.outcome==="skipped").map(x=>`${x.field}:${x.reason}`)
    console.log("  WROTE:",w.join(",")||"(none)"); console.log("  SKIPPED:",s.join(", ")||"(none)")
  }
}
main().catch(e=>{console.error(e);process.exit(1)})
