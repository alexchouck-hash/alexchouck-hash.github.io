const d=document.getElementById("catalog-filter"),g=document.getElementById("search-count");d&&d.addEventListener("input",o=>{const t=o.target.value.toLowerCase().trim(),e=document.querySelectorAll(".component-row"),s=document.querySelectorAll(".component-tile-item");let a=0;e.forEach(p=>{const r=(p.textContent||"").toLowerCase(),m=!t||r.includes(t);p.style.display=m?"":"none",m&&a++}),s.forEach(p=>{const r=(p.textContent||"").toLowerCase();p.style.display=!t||r.includes(t)?"":"none"}),g&&(g.textContent=t?`${a} match(es)`:`${e.length} components`);const c=document.getElementById("device-filter-empty"),n=document.getElementById("device-filter-global-link"),l=document.getElementById("device-filter-q");c&&(t&&a===0?(c.style.display="flex",n&&(n.href=`/components?q=${encodeURIComponent(t)}`),l&&(l.textContent=t)):c.style.display="none")});function i(o,t){const e=document.getElementById(o);if(!e)return;const s=e.closest("table"),a=e.previousElementSibling,c=e.style.display!=="none",n=t!==void 0?t:!c;s&&n&&(s.querySelectorAll(".mcmaster-flyout-row").forEach(l=>{l.style.display="none"}),s.querySelectorAll(".supplier-row").forEach(l=>{l.classList.remove("active-selected"),l.setAttribute("aria-expanded","false")})),e.style.display=n?"table-row":"none",a&&(a.classList.toggle("active-selected",n),a.setAttribute("aria-expanded",n?"true":"false"))}document.querySelectorAll(".supplier-row").forEach(o=>{const t=o.getAttribute("data-target");o.addEventListener("click",e=>{e.target.closest("a")||e.target.closest("button")||i(t)}),o.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){if(e.target.closest("a")||e.target.closest("button"))return;e.preventDefault(),i(t)}})});document.querySelectorAll(".flyout-btn").forEach(o=>{o.addEventListener("click",t=>{t.stopPropagation();const e=o.getAttribute("data-toggle");i(e)})});document.querySelectorAll(".flyout-close-btn").forEach(o=>{o.addEventListener("click",t=>{t.stopPropagation();const e=o.getAttribute("data-close");i(e,!1)})});document.querySelectorAll(".stock-select").forEach(o=>{o.addEventListener("change",()=>{const t=o.getAttribute("data-cat"),e=o.options[o.selectedIndex];if(!e||!e.dataset.info)return;const s=JSON.parse(e.dataset.info),a=document.getElementById(`stock-spec-display-${t}`),c=document.getElementById(`btn-stock-rfq-${t}`);let n="",l="";t==="hypodermic-tubing"?(n=`
          <div class="stock-spec-badges-wrap">
            <span class="stock-spec-pill stock-spec-pill--highlight mono">OD: <strong>${s.odIn}″</strong> (${s.odMm} mm)</span>
            <span class="stock-spec-pill mono">ID: <strong>${s.idIn}″</strong> (${s.idMm} mm)</span>
            <span class="stock-spec-pill mono">Wall: <strong>${s.wallIn}″</strong> (${s.wallMm} mm)</span>
            <span class="stock-spec-pill mono">Class: <strong>${s.wallClass}</strong></span>
            <span class="stock-spec-pill stock-spec-pill--app mono">Target: ${s.commonUses}</span>
          </div>
        `,l=`OD: ${s.odIn}″ (${s.odMm} mm), ID: ${s.idIn}″ (${s.idMm} mm), Wall: ${s.wallIn}″ (${s.wallClass})`):t==="ptfe-liners"?(n=`
          <div class="stock-spec-badges-wrap">
            <span class="stock-spec-pill stock-spec-pill--highlight mono">ID: <strong>${s.idIn}″</strong> (${s.idMm} mm)</span>
            <span class="stock-spec-pill mono">Wall: <strong>${s.wallIn}″</strong> (${s.wallMm} mm)</span>
            <span class="stock-spec-pill mono">Max OD: <strong>${s.odMaxIn}″</strong> (${s.odMaxMm} mm)</span>
            <span class="stock-spec-pill stock-spec-pill--app mono">Target: ${s.commonUses}</span>
          </div>
        `,l=`ID: ${s.idIn}″ (${s.idMm} mm), Wall: ${s.wallIn}″, Max OD: ${s.odMaxIn}″`):t==="braid"?(n=`
          <div class="stock-spec-badges-wrap">
            <span class="stock-spec-pill stock-spec-pill--highlight mono">Thickness: <strong>${s.thickIn}″</strong> (${s.thickMm} mm)</span>
            <span class="stock-spec-pill mono">Width: <strong>${s.widthIn}″</strong> (${s.widthMm} mm)</span>
            <span class="stock-spec-pill mono">Profile: <strong>${s.profile}</strong></span>
            <span class="stock-spec-pill stock-spec-pill--app mono">Target: ${s.commonUses}</span>
          </div>
        `,l=`Thick: ${s.thickIn}″ (${s.thickMm} mm), Width: ${s.widthIn}″ (${s.widthMm} mm), Profile: ${s.profile}`):t==="radiopaque-markers"?(n=`
          <div class="stock-spec-badges-wrap">
            <span class="stock-spec-pill stock-spec-pill--highlight mono">ID: <strong>${s.idIn}″</strong> (${s.idMm} mm)</span>
            <span class="stock-spec-pill mono">OD: <strong>${s.odIn}″</strong> (${s.odMm} mm)</span>
            <span class="stock-spec-pill mono">Length: <strong>${s.lenMm} mm</strong></span>
            <span class="stock-spec-pill mono">Wall: <strong>${s.wallIn}″</strong></span>
            <span class="stock-spec-pill stock-spec-pill--app mono">Target: ${s.commonUses}</span>
          </div>
        `,l=`ID: ${s.idIn}″, OD: ${s.odIn}″, Len: ${s.lenMm} mm, Wall: ${s.wallIn}″`):t==="heat-shrink"?(n=`
          <div class="stock-spec-badges-wrap">
            <span class="stock-spec-pill stock-spec-pill--highlight mono">Exp ID: <strong>${s.expIdIn}″</strong></span>
            <span class="stock-spec-pill mono">Rec ID: <strong>${s.recIdIn}″</strong></span>
            <span class="stock-spec-pill mono">Rec Wall: <strong>${s.recWallIn}″</strong></span>
            <span class="stock-spec-pill mono">Material: <strong>${s.material}</strong></span>
            <span class="stock-spec-pill stock-spec-pill--app mono">Target: ${s.commonUses}</span>
          </div>
        `,l=`Exp ID: ${s.expIdIn}″, Rec ID: ${s.recIdIn}″, Wall: ${s.recWallIn}″ (${s.material})`):t==="wires-and-cores"?(n=`
          <div class="stock-spec-badges-wrap">
            <span class="stock-spec-pill stock-spec-pill--highlight mono">Diameter: <strong>${s.diaIn}″</strong> (${s.diaMm} mm)</span>
            <span class="stock-spec-pill mono">Alloy: <strong>${s.alloy}</strong></span>
            <span class="stock-spec-pill stock-spec-pill--app mono">Target: ${s.commonUses}</span>
          </div>
        `,l=`Diameter: ${s.diaIn}″ (${s.diaMm} mm), Alloy: ${s.alloy}`):t==="luer-fittings"?(n=`
          <div class="stock-spec-badges-wrap">
            <span class="stock-spec-pill stock-spec-pill--highlight mono">Type: <strong>${s.sex}</strong></span>
            <span class="stock-spec-pill mono">Barb ID: <strong>${s.barbIn?`${s.barbIn}″ (${s.barbMm} mm)`:s.thread}</strong></span>
            <span class="stock-spec-pill mono">Material: <strong>${s.material}</strong></span>
            <span class="stock-spec-pill stock-spec-pill--app mono">Target: ${s.commonUses}</span>
          </div>
        `,l=`Type: ${s.sex}, Barb: ${s.barbIn?`${s.barbIn}″`:s.thread}, Material: ${s.material}`):t==="bone-screws"&&(n=`
          <div class="stock-spec-badges-wrap">
            <span class="stock-spec-pill stock-spec-pill--highlight mono">Thread Dia: <strong>${s.majorDiaMm} mm</strong></span>
            <span class="stock-spec-pill mono">Core Dia: <strong>${s.coreDiaMm} mm</strong></span>
            <span class="stock-spec-pill mono">Pitch: <strong>${s.pitchMm} mm</strong></span>
            <span class="stock-spec-pill mono">Drive: <strong>${s.drive}</strong></span>
            <span class="stock-spec-pill mono">Lengths: <strong>${s.lenRange}</strong></span>
            <span class="stock-spec-pill stock-spec-pill--app mono">Target: ${s.commonUses}</span>
          </div>
        `,l=`Thread: ${s.majorDiaMm} mm, Core: ${s.coreDiaMm} mm, Pitch: ${s.pitchMm} mm, Drive: ${s.drive}`),a&&n&&(a.innerHTML=n),c&&(c.href=`/rfq?cat=${t}&part=${encodeURIComponent(s.label)}&specs=${encodeURIComponent(l||s.commonUses||"")}`)})});document.querySelectorAll(".btn-toggle-table").forEach(o=>{o.addEventListener("click",()=>{const t=o.getAttribute("data-target"),e=document.getElementById(t);e&&(e.open=!e.open,e.open&&e.scrollIntoView({behavior:"smooth",block:"nearest"}))})});
