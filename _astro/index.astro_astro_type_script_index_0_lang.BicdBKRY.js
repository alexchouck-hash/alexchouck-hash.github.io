const n=document.getElementById("global-component-search"),l=document.getElementById("comp-search-clear"),E=document.getElementById("btn-comp-ai-search"),H=document.querySelectorAll(".comp-chip"),r=document.getElementById("search-results-panel"),C=document.getElementById("comp-results-grid"),f=document.getElementById("comp-results-count"),b=document.getElementById("comp-results-headline"),P=document.getElementById("comp-results-close"),v=document.getElementById("btn-toggle-ai-key"),h=document.getElementById("ai-key-drawer"),k=document.getElementById("gemini-api-key-input"),T=document.getElementById("btn-save-ai-key"),y=document.getElementById("ai-key-status"),S=document.getElementById("ai-callout-message"),$=document.getElementById("btn-run-gemini-search"),p=document.getElementById("ai-loading"),m=document.getElementById("ai-result-card");let w="",I=null;function U(){localStorage.getItem("10x_gemini_api_key")&&y&&v&&(y.style.display="block",y.innerHTML="✓ Active API key saved (••••••••)",v.textContent="⚙️ Gemini Key (Saved)")}v&&h&&v.addEventListener("click",()=>{const e=h.style.display==="none";h.style.display=e?"block":"none",e&&k&&k.focus()});T&&k&&T.addEventListener("click",()=>{const e=k.value.trim();e?(localStorage.setItem("10x_gemini_api_key",e),y.style.display="block",y.innerHTML="✓ Key saved to browser storage!",v.textContent="⚙️ Gemini Key (Saved)",setTimeout(()=>{h.style.display="none"},1200)):(localStorage.removeItem("10x_gemini_api_key"),y.style.display="block",y.innerHTML="API key removed. Using built-in medical synthesis.",v.textContent="⚙️ Gemini API Key (Free)")});H.forEach(e=>{e.addEventListener("click",()=>{const i=e.getAttribute("data-query")||e.textContent.trim();n&&(n.value=i,l&&(l.style.display="block"),A(i),n.focus())})});l&&n&&l.addEventListener("click",()=>{n.value="",l.style.display="none",r&&(r.style.display="none"),w="",n.focus()});P&&r&&P.addEventListener("click",()=>{r.style.display="none"});n&&(n.addEventListener("input",()=>{const e=n.value.trim();l&&(l.style.display=e?"block":"none"),clearTimeout(I),I=setTimeout(()=>{A(e)},150)}),n.addEventListener("keydown",e=>{e.key==="Enter"?(clearTimeout(I),A(n.value.trim())):e.key==="Escape"&&(n.value="",l&&(l.style.display="none"),r&&(r.style.display="none"))}));E&&n&&E.addEventListener("click",()=>{const e=n.value.trim();if(!e){n.focus();return}r&&(r.style.display="block"),N(e)});$&&$.addEventListener("click",()=>{const e=w||(n?n.value.trim():"")||"Medical Device Component";N(e)});function A(e){const i=e.toLowerCase().trim();if(w=i,!i){r&&(r.style.display="none");return}r&&(r.style.display="block");const t=(window.__ALL_COMPONENTS||[]).filter(c=>{const d=c.name.toLowerCase().includes(i),o=c.teaser.toLowerCase().includes(i),a=c.whatItIs.toLowerCase().includes(i),u=c.filterGlyphs.some(g=>g.toLowerCase().includes(i)),q=c.devices.some(g=>g.name.toLowerCase().includes(i)),x=c.suppliers.some(g=>g.name.toLowerCase().includes(i)||g.focus&&g.focus.toLowerCase().includes(i));return d||o||a||u||q||x});t.length>0?(b&&(b.textContent=`Component Matches for "${e}"`),f&&(f.textContent=`${t.length} ${t.length===1?"Match":"Matches"}`,f.className="comp-results-badge comp-results-badge--found mono"),O(t),S&&(S.textContent=`Looking for a custom spec or unlisted component variation of "${e}"? Search global medical device specs, materials, and contract manufacturers with Gemini AI.`),m&&(m.style.display="none"),p&&(p.style.display="none")):(b&&(b.textContent=`No Directory Match for "${e}"`),f&&(f.textContent="0 in Directory",f.className="comp-results-badge comp-results-badge--empty mono"),C&&(C.innerHTML=`
          <div class="comp-empty-state">
            <p class="comp-empty-msg">
              <strong>"${e}"</strong> is not currently in our 110 canonical catalog categories.
            </p>
            <p class="comp-empty-hint">
              Use Gemini AI below to instantly search global medical device standards, biocompatible materials, standard tolerances, and reputable contract manufacturers.
            </p>
          </div>
        `),S&&(S.innerHTML=`<strong>Search with Gemini AI:</strong> Find engineering specifications, standard materials, dimensions, and top 3 vetted medical suppliers for <strong>"${e}"</strong>.`),m&&(m.style.display="none"),p&&(p.style.display="none"))}function O(e){C&&(C.innerHTML=e.map(i=>{const s=i.devices[0]?.id||"catheters",t=i.devices.map(o=>`<a href="/components/${o.id}#row-${i.id}" class="comp-card-dev-badge mono">${o.name}</a>`).join(" "),c=i.suppliers[0],d=i.suppliers.slice(0,3).map(o=>`
        <li class="comp-card-sup-item">
          <span class="comp-sup-name">${o.name}</span>
          <span class="comp-sup-rating mono">★ ${o.rating}</span>
          <span class="comp-sup-offering mono">${o.offeringType||"Supplier"}</span>
        </li>
      `).join("");return`
        <div class="comp-card">
          <div class="comp-card-header">
            <div>
              <div class="comp-card-devices">${t}</div>
              <h4 class="comp-card-name">
                <a href="/components/${s}#row-${i.id}">${i.name}</a>
              </h4>
            </div>
            <span class="comp-card-teaser mono">${i.teaser}</span>
          </div>

          <p class="comp-card-desc">${i.whatItIs}</p>

          <div class="comp-card-suppliers">
            <span class="comp-sup-label mono">Top Vetted Suppliers:</span>
            <ul class="comp-sup-list">${d}</ul>
          </div>

          <div class="comp-card-actions">
            <a href="/components/${s}#row-${i.id}" class="btn btn-secondary btn-sm">
              View in Catalog &rsaquo;
            </a>
            <a href="/rfq?cat=${i.id}&vendor=${encodeURIComponent(c?.name||"")}" class="btn btn-primary btn-sm">
              Request RFQ &rsaquo;
            </a>
          </div>
        </div>
      `}).join(""))}async function N(e){if(!e)return;p&&(p.style.display="flex"),m&&(m.style.display="none",m.innerHTML="");const i=localStorage.getItem("10x_gemini_api_key");try{let s=null;if(i){const t=`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(i)}`,c=`You are a senior medical device sourcing and manufacturing engineer. A user is looking for a medical device component: "${e}".
Provide a complete engineering specification, materials breakdown, tolerances, and top 3 reputable medical device contract manufacturers/suppliers in strict JSON format without markdown ticks.
JSON schema:
{
  "componentName": "Exact technical component name",
  "deviceClass": "Medical device application (e.g. Cardiovascular, Orthopedics, Endoscopy)",
  "overview": "Clear engineering explanation of what this component does and how it operates in medical devices.",
  "materials": ["2 to 4 biocompatible materials, e.g. 316L SS, Nitinol, PEEK-OPTIMA, Medical Grade Silicone"],
  "keyDimensions": "Typical dimensional ranges, wall thickness, or tolerances (e.g. OD 0.014″ - 0.038″, tolerances ±0.0005″)",
  "regulatoryStandards": ["ISO 10993", "ASTM F2063", "ISO 13485"],
  "recommendedSuppliers": [
    { "name": "Vetted Supplier 1", "location": "City, State / Country", "specialty": "Key manufacturing specialty", "rating": 4.9 },
    { "name": "Vetted Supplier 2", "location": "City, State / Country", "specialty": "Key manufacturing specialty", "rating": 4.8 },
    { "name": "Vetted Supplier 3", "location": "City, State / Country", "specialty": "Key manufacturing specialty", "rating": 4.7 }
  ],
  "manufacturingProcesses": "Summary of manufacturing processes (e.g. Swiss turning, laser ablation, cleanroom molding)",
  "rfqAdvice": "Practical advice for specifying this part in an RFQ to avoid tooling delays."
}`,d=await fetch(t,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{parts:[{text:c}]}],generationConfig:{temperature:.2,responseMimeType:"application/json"}})});if(d.ok){let a=(await d.json()).candidates?.[0]?.content?.parts?.[0]?.text;a&&(a=a.replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/```\s*$/i,"").trim(),s=JSON.parse(a))}}s||(s=L(e)),D(s,!!i)}catch(s){console.warn("Gemini live call error, using medical device synthesis fallback:",s);const t=L(e);D(t,!1)}finally{p&&(p.style.display="none")}}function L(e){const i=e.toLowerCase();if(i.includes("stent")||i.includes("bioabsorbable")||i.includes("scaffold"))return{componentName:"Bioabsorbable Vascular Scaffold / Stent",deviceClass:"Cardiovascular & Peripheral Vascular Interventions",overview:"Temporary resorbable luminal endoprosthesis designed to provide mechanical vessel scaffolding during vascular remodeling, fully metabolizing into water and carbon dioxide over 24–36 months.",materials:["Poly-L-lactic acid (PLLA)","Poly(lactic-co-glycolic acid) (PLGA)","Magnesium Alloy (WE43)","Tyrosine-derived Polycarbonate"],keyDimensions:"Strut thickness 80–120 µm, expanded OD 2.5–4.0 mm, crimped profile < 1.4 mm, length 12–28 mm",regulatoryStandards:["ISO 25539-2 (Vascular Stents)","ISO 10993-1 (Biocompatibility)","ASTM F2129 (Corrosion Resistance)","ASTM F3036 (Absorbable Implants)"],recommendedSuppliers:[{name:"Resonetics",location:"Nashua, NH, USA",specialty:"Femtosecond laser micromachining of bioresorbable polymers with zero heat-affected zone",rating:4.9},{name:"Norman Noble, Inc.",location:"Cleveland, OH, USA",specialty:"Synova laser microjet cutting of absorbable magnesium and bioresorbable polymers",rating:4.9},{name:"MeKo Laser Material Processing",location:"Sarstedt, Germany",specialty:"Stent laser cutting, bioabsorbable scaffold finishing, and electro-polishing",rating:4.8}],manufacturingProcesses:"Ultra-fast pulsed femtosecond laser micromachining, cryogenic strut de-burring, cleanroom spray coating, controlled crimping",rfqAdvice:"Provide exact strut thickness limits, crimp profile target, radial resistive force (RRF) requirement, and shelf-life packaging specification."};if(i.includes("piezo")||i.includes("ultrasonic")||i.includes("transducer")||i.includes("phaco"))return{componentName:"Piezoelectric Ultrasonic Transducer Sub-Assembly",deviceClass:"Surgical Cutting, Phacoemulsification & Therapeutic Ultrasound",overview:"Acoustic power transducer converting high-frequency electrical excitation (20 kHz–55 kHz) into amplified longitudinal displacement for bone scalpel resection, tissue emulsification, or IVUS imaging.",materials:["PZT-4 / PZT-8 Piezoelectric Ceramic","Grade 5 Titanium (Ti-6Al-4V) Horn","Beryllium Copper Electrodes","Pre-stressed Inconel Bolt"],keyDimensions:"Resonance frequency 25 kHz–55 kHz ±1 kHz, excursion amplitude 40–120 µm peak-to-peak, acoustic impedance matched",regulatoryStandards:["IEC 60601-1 (Electrical Safety)","IEC 60601-2-62 (Ultrasonic Equipment)","ISO 10993 (Patient contact acoustic tip)"],recommendedSuppliers:[{name:"PI Ceramic (Physik Instrumente)",location:"Lederhose, Germany / Auburn, MA",specialty:"Custom medical piezo discs, rings, stacked actuators, and sub-micron acoustic tuning",rating:4.9},{name:"CTS Corporation (Medical Division)",location:"Lisle, IL, USA",specialty:"High-power PZT formulations for phacoemulsification, harmonic cutting, and ultrasonic scalpel stacks",rating:4.8},{name:"APC International",location:"Mackeyville, PA, USA",specialty:"Custom piezoelectric ceramics, pre-stressed bolt-clamped Langevin transducers",rating:4.7}],manufacturingProcesses:"Precision ceramic lapping, vacuum electrode sputtering, calibrated pre-stress bolting, laser Doppler vibrometry tuning",rfqAdvice:"Specify operating resonant frequency, target acoustic power output (Watts), horn magnification ratio, and sterilization temperature cycling limits."};if(i.includes("pressure")||i.includes("mems")||i.includes("sensor"))return{componentName:"Medical MEMS Invasive Pressure Sensor Die",deviceClass:"Hemodynamic Monitoring, Catheter Tip Sensors & Infusion Pumps",overview:"Piezoresistive silicon micromachined pressure sensor die mounted at the distal tip of catheters or in-line manifolds for real-time arterial blood pressure or intracranial pressure (ICP) monitoring.",materials:["Piezoresistive Monocrystalline Silicon","Silicone Gel Encapsulant","Ceramic/Polyimide Substrate","Gold Bond Wires (99.99%)"],keyDimensions:"Die footprint 0.4 mm x 0.9 mm to 1.2 mm x 1.2 mm, operating range -50 to +300 mmHg, sensitivity 5 µV/V/mmHg",regulatoryStandards:["AAMI BP22 (Blood Pressure Transducers)","IEC 60601-2-34","ISO 10993-1","ISO 13485"],recommendedSuppliers:[{name:"TE Connectivity (Sensors Division)",location:"Schaffhausen, Switzerland / Fremont, CA",specialty:"Ultra-miniature catheter-tip MEMS pressure sensor dice (0.4 mm profile) for disposable blood pressure lines",rating:4.9},{name:"Amphenol Advanced Sensors (NovaSensor)",location:"Fremont, CA, USA",specialty:"Disposable medical pressure sensor chips with medical-grade gel isolation and calibrated bridge circuits",rating:4.8},{name:"Merit Medical Sensor Division",location:"South Jordan, UT, USA",specialty:"In-line hemodynamic pressure monitoring cells and manifold sensor sub-assemblies",rating:4.7}],manufacturingProcesses:"Silicon bulk micromachining (MEMS), sub-micron wire bonding, precision gel potting for dielectric and biological isolation",rfqAdvice:"State sensitivity range (mmHg), temperature coefficient of sensitivity (TCS), dielectric isolation requirement, and catheter lead interconnect type."};const s=e.split(" ").map(t=>t.charAt(0).toUpperCase()+t.slice(1)).join(" ");return{componentName:`${s} Assembly`,deviceClass:"Specialized Medical Device & Surgical Systems",overview:`Engineered medical-grade ${s.toLowerCase()} designed for clinical applications requiring strict dimensional tolerances, biocompatibility, and validated reliability under ISO 13485 controls.`,materials:["316L / 304V Medical Stainless Steel","Titanium Grade 5 (Ti-6Al-4V ELI)","Medical Grade PEEK (ASTM F2026)","USP Class VI Elastomer / Silicone"],keyDimensions:"Critical tolerances per engineering print: ±0.0005″ (±0.012 mm), micro-features down to 50 µm",regulatoryStandards:["ISO 13485 (Medical Quality Management)","ISO 10993-1 (Biocompatibility)","FDA 21 CFR Part 820","ASTM Material Specifications"],recommendedSuppliers:[{name:"Norman Noble, Inc.",location:"Cleveland, OH, USA",specialty:"Micromachining, Swiss CNC turning, laser micro-welding, and electropolishing for complex implants and instruments",rating:4.9},{name:"Resonetics",location:"Nashua, NH, USA",specialty:"Laser micro-machining, sensor integration, Nitinol shape-setting, and thin-wall fabrication",rating:4.9},{name:"Tegra Medical",location:"Franklin, MA / Dartmouth, MA",specialty:"End-to-end contract manufacturing of precision metal components, assemblies, and custom surgical instruments",rating:4.8}],manufacturingProcesses:"Precision Swiss machining, femtosecond laser cutting, multi-stage ultrasonic cleaning, cleanroom inspection",rfqAdvice:"Attach detailed CAD drawing (.STEP/.PDF), define critical-to-function (CTF) dimensions with GD&T, and specify required lot traceability (CoC / FAI)."}}function D(e,i){if(!m)return;const s=(e.recommendedSuppliers||[]).map(a=>`
      <div class="ai-sup-card">
        <div class="ai-sup-head">
          <strong class="ai-sup-name">${a.name}</strong>
          <span class="ai-sup-rating mono">★ ${a.rating||"4.8"}</span>
        </div>
        <div class="ai-sup-loc mono">${a.location||"USA / Europe"}</div>
        <div class="ai-sup-focus">${a.specialty||"Precision medical device manufacturing"}</div>
      </div>
    `).join(""),t=(e.materials||[]).map(a=>`<span class="ai-tag mono">${a}</span>`).join(" "),c=(e.regulatoryStandards||[]).map(a=>`<span class="ai-tag ai-tag--std mono">${a}</span>`).join(" "),d=new URLSearchParams({cat:"custom",vendor:e.recommendedSuppliers?.[0]?.name||"Vendor Applications Team",part:e.componentName||"Custom Component",app:e.deviceClass||"Medical Device Application",material:(e.materials||[]).join(", ")});m.innerHTML=`
      <div class="ai-card-banner">
        <div class="ai-badge-group">
          <span class="ai-source-badge mono">
            <span class="ai-sparkle">✦</span> ${i?"Google Gemini 2.5 Flash":"AI Component Synthesis"}
          </span>
          <span class="ai-class-badge mono">${e.deviceClass}</span>
        </div>
        <h3 class="ai-comp-title">${e.componentName}</h3>
        <p class="ai-comp-overview">${e.overview}</p>
      </div>

      <div class="ai-spec-grid">
        <div class="ai-spec-cell">
          <span class="ai-spec-label mono">Biocompatible Materials</span>
          <div class="ai-tags-wrap">${t}</div>
        </div>
        <div class="ai-spec-cell">
          <span class="ai-spec-label mono">Critical Dimensions &amp; Tolerances</span>
          <p class="ai-spec-val mono">${e.keyDimensions||"Per drawing specification"}</p>
        </div>
        <div class="ai-spec-cell">
          <span class="ai-spec-label mono">Applicable Consensus Standards</span>
          <div class="ai-tags-wrap">${c}</div>
        </div>
        <div class="ai-spec-cell">
          <span class="ai-spec-label mono">Manufacturing Processes</span>
          <p class="ai-spec-val">${e.manufacturingProcesses||"Swiss micro-machining, cleanroom assembly"}</p>
        </div>
      </div>

      <div class="ai-suppliers-section">
        <h4 class="ai-suppliers-title mono">Top 3 Recommended Medical Device Suppliers</h4>
        <div class="ai-suppliers-grid">${s}</div>
      </div>

      ${e.rfqAdvice?`
        <div class="ai-advice-box">
          <strong class="ai-advice-label mono">💡 Sourcing &amp; DFM Advice:</strong>
          <span class="ai-advice-text">${e.rfqAdvice}</span>
        </div>
      `:""}

      <div class="ai-card-actions">
        <a href="/rfq?${d.toString()}" class="btn btn-primary btn-ai-rfq">
          <span class="btn-icon">✉️</span> Create RFQ for ${e.componentName} (Copies You) &rsaquo;
        </a>
        <button type="button" id="btn-copy-ai-spec" class="btn btn-secondary mono">
          <span class="btn-icon">📋</span> Copy Component Spec
        </button>
      </div>
    `,m.style.display="block";const o=document.getElementById("btn-copy-ai-spec");o&&o.addEventListener("click",()=>{const a=`Component: ${e.componentName}
Device Application: ${e.deviceClass}

Overview:
${e.overview}

Materials:
${(e.materials||[]).join(", ")}

Dimensions & Tolerances:
${e.keyDimensions}

Standards:
${(e.regulatoryStandards||[]).join(", ")}

Recommended Suppliers:
${(e.recommendedSuppliers||[]).map(u=>`• ${u.name} (${u.location}) - ${u.specialty}`).join(`
`)}

DFM Advice:
${e.rfqAdvice||"Per specification"}`;navigator.clipboard.writeText(a).then(()=>{const u=o.innerHTML;o.innerHTML='<span class="btn-icon">✓</span> Copied Spec!',setTimeout(()=>{o.innerHTML=u},2e3)})})}document.addEventListener("keydown",e=>{e.key==="/"&&document.activeElement!==n&&document.activeElement?.tagName!=="INPUT"&&document.activeElement?.tagName!=="TEXTAREA"&&(e.preventDefault(),n&&n.focus())});const B=new URLSearchParams(window.location.search),M=B.get("q")||B.get("search");M&&n&&(n.value=M,l&&(l.style.display="block"),A(M));U();
