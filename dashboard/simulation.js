import { auth, db } from "../firebase/firebase-config.js";

import {
  doc, getDoc,
  collection, getDocs,
  query, where, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const id = new URLSearchParams(location.search).get("id");
const container = document.getElementById("exerciseContainer");

let questions = [];
let studentData = null;

window.matchAnswers = {};

// ================= HELPER HTML DECODER =================
// Menggunakan DOMParser untuk keamanan dan rendering HTML/math yang aman
function decodeHTML(html) {
  if (!html) return "";
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  return doc.body.innerHTML;
}

// ================= AUTH + LOAD =================
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location = "../../login.html";
    return;
  }

  const userSnap = await getDoc(doc(db, "users", user.uid));
  studentData = userSnap.data();

  await loadExercise();
});

// ================= LOAD EXERCISE =================
async function loadExercise() {
  if (!id) {
    container.innerHTML = "ID tidak ditemukan";
    return;
  }

  const exSnap = await getDoc(doc(db, "exercises", id));
  if (!exSnap.exists()) {
    container.innerHTML = "Latihan tidak ditemukan";
    return;
  }

  const ex = exSnap.data();

  // FILTER LEVEL SISWA
  if (ex.level && studentData && ex.level !== studentData.level) {
    container.innerHTML = "❌ Latihan ini tidak untuk level kamu";
    return;
  }

  const qSnap = await getDocs(
    query(
      collection(db, "questions"), 
      where("exerciseId", "==", id),
      orderBy("createdAt", "asc")
    )
  );

  questions = qSnap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));

  render(ex.title);
}

// ================= RENDER =================
function render(title) {

  let html = `
  <div class="question-card" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;">
    <h3>📘 ${title}</h3>
    <div>
      <button id="fsBtn" onclick="toggleFullscreen()" class="btn-full">⛶ Fullscreen</button>
    </div>
  </div>
`;

  questions.forEach((q, i) => {

    html += `
      <div class="question-card" style="margin-bottom:20px; padding:15px; border:1px solid #e5e7eb; border-radius:8px; background:#fff;">
        <div class="question-title" style="display:flex;gap:6px;align-items:flex-start;margin-bottom:12px;">
          <span style="font-weight:bold;">${i + 1}.</span>
          <div class="q-content" style="flex:1;">${decodeHTML(q.question)}</div>
        </div>
    `;

    // ================= PG =================
    if (q.type === "pg" && q.options) {
      q.options.forEach((opt, idx) => {
        html += `
          <label class="option" style="display:flex;align-items:center;gap:10px;margin-bottom:8px;cursor:pointer;">
            <input type="radio" name="q${i}" value="${idx}">
            <div>${decodeHTML(opt)}</div>
          </label>
        `;
      });
    }

    // ================= CHECKBOX =================
    else if (q.type === "checkbox" && q.options) {
      q.options.forEach((opt, idx) => {
        html += `
          <label class="option" style="display:flex;align-items:center;gap:10px;margin-bottom:8px;cursor:pointer;">
            <input type="checkbox" name="q${i}" value="${idx}">
            <div>${decodeHTML(opt)}</div>
          </label>
        `;
      });
    }

    // ================= ISIAN =================
    else if (q.type === "isian") {
      html += `
        <input type="text" id="q${i}" placeholder="Jawaban..."
        style="padding:10px;border-radius:6px;border:1px solid #ddd;width:100%;box-sizing:border-box;">
      `;
    }

    // ================= MULTI ISIAN =================
    else if (q.type === "multi_isian") {
      html += `<div class="multi-wrapper">`;
      const fields = q.fields || (q.answers ? q.answers.map((ans, idx) => ({ label: `Isian [${idx + 1}]`, answer: ans })) : []);

      fields.forEach((f, idx) => {
        const labelText = typeof f === 'object' ? f.label : `Isian [${idx + 1}]`;
        html += `
          <div style="margin-bottom:12px">
            <label style="display:block;margin-bottom:4px;font-weight:bold;font-size:13px;">
              ${decodeHTML(labelText)}
            </label>
            <input type="text" id="q${i}_${idx}" class="multi-input" style="padding:8px;border-radius:6px;border:1px solid #ddd;width:100%;box-sizing:border-box;">
          </div>
        `;
      });
      html += `</div>`;
    }

    // ================= MATRIX =================
    else if (q.type === "matrix" && q.columns && q.rows) {
      const statementHeader = q.statementTitle || "Pernyataan / Argumen";
      html += `
        <div style="overflow-x:auto;">
          <table class="matrix-table" style="width:100%; border-collapse:collapse; margin-top:10px;">
            <thead>
              <tr style="background:#f3f4f6;">
                <th style="padding:10px; border:1px solid #d1d5db; text-align:left;">${statementHeader}</th>
                ${q.columns.map(col => `<th style="padding:10px; border:1px solid #d1d5db; text-align:center; min-width:100px;">${decodeHTML(col)}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
      `;
      q.rows.forEach((row, rIdx) => {
        html += `
          <tr>
            <td style="padding:10px; border:1px solid #d1d5db;">${decodeHTML(row.statement)}</td>
            ${q.columns.map((_, cIdx) => `
              <td style="padding:10px; border:1px solid #d1d5db; text-align:center;">
                <input type="radio" name="q${i}_m${rIdx}" value="${cIdx}">
              </td>
            `).join('')}
          </tr>
        `;
      });
      html += `</tbody></table></div>`;
    }

    // ================= MATCH =================
    else if (q.type === "match" && q.pairs) {
      const shuffled = [...q.pairs]
        .map((p, idx) => ({ ...p, original: idx }))
        .sort(() => Math.random() - 0.5);

      html += `
        <div class="match-wrapper" id="matchWrap${i}" style="position:relative; display:flex; justify-content:space-between; gap:20px; margin-top:10px;">
          <svg class="match-lines" id="svg${i}" style="position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:1;"></svg>

          <div class="match-column" style="flex:1; display:flex; flex-direction:column; gap:10px; z-index:2;">
            ${q.pairs.map((p, idx) => `
              <div class="match-item left-item"
                data-index="${idx}"
                onclick="selectLeft(${i}, this)"
                style="padding:10px; border:1px solid #cbd5e1; border-radius:6px; background:#f8fafc; cursor:pointer;">
                ${decodeHTML(p.left)}
              </div>
            `).join("")}
          </div>

          <div class="match-column" style="flex:1; display:flex; flex-direction:column; gap:10px; z-index:2;">
            ${shuffled.map((p) => `
              <div class="match-item right-item"
                data-original="${p.original}"
                onclick="selectRight(${i}, this)"
                style="padding:10px; border:1px solid #cbd5e1; border-radius:6px; background:#f8fafc; cursor:pointer;">
                ${decodeHTML(p.right)}
              </div>
            `).join("")}
          </div>
        </div>
      `;
    }

    // ================= BUTTON & PEMBAHASAN =================
    html += `
      <div style="margin-top:15px;display:flex;gap:10px;">
        <button class="btn-check" onclick="check(${i})" style="padding:8px 16px; background:#2563eb; color:white; border:none; border-radius:6px; cursor:pointer;">Cek Jawaban</button>
        <button class="btn-explain" onclick="toggle(${i})" style="padding:8px 16px; background:#64748b; color:white; border:none; border-radius:6px; cursor:pointer;">📘 Pembahasan</button>
      </div>

      <div class="result" id="res${i}" style="margin-top:10px;"></div>

      <div id="exp${i}" style="display:none;margin-top:10px;padding:12px;background:#f8fafc;border-left:4px solid #3b82f6;border-radius:6px;">
        ${decodeHTML(q.explanation || "Belum ada pembahasan")}
      </div>
    `;

    html += `</div>`;
  });

  container.innerHTML = html;

  // Trigger ulang MathJax
  if (window.MathJax && window.MathJax.typesetPromise) {
    MathJax.typesetClear();
    MathJax.typesetPromise([container]).catch((err) => console.log('MathJax error:', err));
  }
}

// ================= CHECK JAWABAN =================
window.check = function (i) {
  const q = questions[i];
  let correct = false;

  if (q.type === "pg") {
    const sel = document.querySelector(`input[name="q${i}"]:checked`);
    if (!sel) return alert("Pilih jawaban terlebih dahulu!");
    correct = parseInt(sel.value) === q.answer;
  }

  else if (q.type === "checkbox") {
    const sel = [...document.querySelectorAll(`input[name="q${i}"]:checked`)]
      .map(x => parseInt(x.value));

    const expected = (Array.isArray(q.answer) ? q.answer : []).map(Number).sort();
    correct = JSON.stringify(sel.sort()) === JSON.stringify(expected);
  }

  else if (q.type === "isian") {
    const val = document.getElementById("q" + i).value;
    correct = val.trim().toLowerCase() === String(q.answer).trim().toLowerCase();
  }

  else if (q.type === "multi_isian") {
    correct = true;
    const fields = q.fields || (q.answers ? q.answers.map(ans => ({ answer: ans })) : []);

    fields.forEach((f, idx) => {
      const inputEl = document.getElementById(`q${i}_${idx}`);
      if (inputEl) {
        const val = inputEl.value.trim().toLowerCase();
        const expectedAns = String(typeof f === 'object' ? f.answer : f).trim().toLowerCase();
        if (val !== expectedAns) correct = false;
      } else {
        correct = false;
      }
    });
  }

  else if (q.type === "matrix") {
    correct = true;
    for (let rIdx = 0; rIdx < q.rows.length; rIdx++) {
      const sel = document.querySelector(`input[name="q${i}_m${rIdx}"]:checked`);
      if (!sel || parseInt(sel.value) !== q.rows[rIdx].answer) {
        correct = false;
        break;
      }
    }
  }

  else if (q.type === "match") {
    const ans = window.matchAnswers[i] || {};
    correct = true;

    if (Object.keys(ans).length !== q.pairs.length) {
      correct = false;
    } else {
      q.pairs.forEach((_, idx) => {
        if (String(ans[idx]) !== String(idx)) {
          correct = false;
        }
      });
    }
  }

  const res = document.getElementById("res" + i);
  res.innerHTML = correct ? "✅ Benar" : "❌ Salah";
  res.style.color = correct ? "#15803d" : "#b91c1c";
  res.style.padding = "8px 12px";
  res.style.background = correct ? "#dcfce7" : "#fee2e2";
  res.style.borderRadius = "8px";
  res.style.fontWeight = "bold";
};

window.toggle = function (i) {
  const el = document.getElementById("exp" + i);
  el.style.display = el.style.display === "block" ? "none" : "block";
};

// ================= MATCH LOGIC =================
window.currentLeft = {};

window.selectLeft = function(qIndex, el) {
  document.querySelectorAll(`#matchWrap${qIndex} .left-item`)
    .forEach(x => x.style.borderColor = "#cbd5e1");

  el.style.borderColor = "#2563eb";
  window.currentLeft[qIndex] = el;
};

window.selectRight = function(qIndex, el) {
  const leftEl = window.currentLeft[qIndex];

  if (!leftEl) {
    alert("Pilih item di sebelah kiri terlebih dahulu!");
    return;
  }

  const leftIndex = leftEl.dataset.index;
  const rightIndex = el.dataset.original;

  if (!window.matchAnswers[qIndex]) {
    window.matchAnswers[qIndex] = {};
  }

  window.matchAnswers[qIndex][leftIndex] = rightIndex;

  leftEl.style.borderColor = "#10b981";
  el.style.borderColor = "#10b981";

  drawLines(qIndex);
  window.currentLeft[qIndex] = null;
};

// ================= DRAW SVG LINES =================
function drawLines(qIndex) {
  const wrap = document.getElementById(`matchWrap${qIndex}`);
  const svg = document.getElementById(`svg${qIndex}`);

  if (!wrap || !svg) return;

  svg.innerHTML = "";
  const wrapRect = wrap.getBoundingClientRect();
  const answers = window.matchAnswers[qIndex] || {};

  Object.entries(answers).forEach(([leftIdx, rightIdx]) => {
    const leftEl = wrap.querySelector(`.left-item[data-index="${leftIdx}"]`);
    const rightEl = wrap.querySelector(`.right-item[data-original="${rightIdx}"]`);

    if (!leftEl || !rightEl) return;

    const leftRect = leftEl.getBoundingClientRect();
    const rightRect = rightEl.getBoundingClientRect();

    const x1 = leftRect.right - wrapRect.left;
    const y1 = leftRect.top + leftRect.height / 2 - wrapRect.top;

    const x2 = rightRect.left - wrapRect.left;
    const y2 = rightRect.top + rightRect.height / 2 - wrapRect.top;

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");

    line.setAttribute("x1", x1);
    line.setAttribute("y1", y1);
    line.setAttribute("x2", x2);
    line.setAttribute("y2", y2);
    line.setAttribute("stroke", "#2563eb");
    line.setAttribute("stroke-width", "3");
    line.setAttribute("stroke-linecap", "round");

    svg.appendChild(line);
  });
}

// Redraw garis jika window di-resize agar posisi garis tidak geser
window.addEventListener("resize", () => {
  questions.forEach((q, idx) => {
    if (q.type === "match") drawLines(idx);
  });
});

// ================= FULLSCREEN =================
window.toggleFullscreen = function () { 
  const el = document.documentElement; 
  if (!document.fullscreenElement) { 
    el.requestFullscreen(); 
  } else { 
    document.exitFullscreen(); 
  } 
};

document.addEventListener("fullscreenchange", () => {
  const btn = document.getElementById("fsBtn");
  if (btn) {
    btn.innerText = document.fullscreenElement ? "❌ Exit Fullscreen" : "⛶ Fullscreen";
  }
  
  // Redraw garis match saat fullscreen berganti
  setTimeout(() => {
    questions.forEach((q, idx) => {
      if (q.type === "match") drawLines(idx);
    });
  }, 200);
});
