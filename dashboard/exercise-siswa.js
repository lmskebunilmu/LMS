import { auth, db } from "../firebase/firebase-config.js";

import {
  doc, getDoc,
  collection, getDocs,
  query, where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const id = new URLSearchParams(location.search).get("id");
const container = document.getElementById("exerciseContainer");

let questions = [];
let studentData = null;

window.matchAnswers = {};

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

  // 🔥 FILTER SISWA (INI YANG PENTING)
  if (ex.level && ex.level !== studentData.level) {
    container.innerHTML = "❌ Latihan ini tidak untuk level kamu";
    return;
  }

  const qSnap = await getDocs(
    query(collection(db, "questions"), where("exerciseId", "==", id))
  );

  // 🔥 FIX: ambil id juga
  questions = qSnap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));

  render(ex.title);
}

// ================= RENDER =================
function render(title) {

  let html = `
    <div class="question-card">
      <h3>📘 ${title}</h3>
    </div>
  `;

  questions.forEach((q, i) => {

    html += `
      <div class="question-card">
        <div class="question-title">${i + 1}. ${q.question}</div>
    `;

    // ================= PG =================
    if (q.type === "pg") {
      q.options.forEach((opt, idx) => {
        html += `
          <label class="option">
            <input type="radio" name="q${i}" value="${idx}">
            <span>${opt}</span>
          </label>
        `;
      });
    }

    // ================= CHECKBOX =================
    else if (q.type === "checkbox") {
      q.options.forEach((opt, idx) => {
        html += `
          <label class="option">
            <input type="checkbox" name="q${i}" value="${idx}">
            <span>${opt}</span>
          </label>
        `;
      });
    }

    // ================= ISIAN =================
    else if (q.type === "isian") {
      html += `
        <input type="text" id="q${i}" placeholder="Jawaban..."
        style="padding:10px;border-radius:10px;border:1px solid #ddd;width:100%">
      `;
    }

    // ================= MULTI ISIAN =================
    else if (q.type === "multi_isian") {

      html += `<div class="multi-wrapper">`;

      q.fields.forEach((f, idx) => {
        html += `
          <div style="margin-bottom:14px">
            <label style="display:block;margin-bottom:6px;font-weight:bold;">
              ${f.label}
            </label>

            <input type="text" id="q${i}_${idx}" class="multi-input">
          </div>
        `;
      });

      html += `</div>`;
    }

    // ================= MATCH =================
    else if (q.type === "match") {

      const shuffled = [...q.pairs]
        .map((p, idx) => ({ ...p, original: idx }))
        .sort(() => Math.random() - 0.5);

      html += `
        <div class="match-wrapper" id="matchWrap${i}">
          <svg class="match-lines" id="svg${i}"></svg>

          <div class="match-column">
            ${q.pairs.map((p, idx) => `
              <div class="match-item left-item"
                data-index="${idx}"
                onclick="selectLeft(${i}, this)">
                ${p.left}
              </div>
            `).join("")}
          </div>

          <div class="match-column">
            ${shuffled.map((p) => `
              <div class="match-item right-item"
                data-original="${p.original}"
                onclick="selectRight(${i}, this)">
                ${p.right}
              </div>
            `).join("")}
          </div>

        </div>
      `;
    }

    // ================= BUTTON =================
    html += `
      <button class="btn-check" onclick="check(${i})">Cek Jawaban</button>
      <button class="btn-explain" onclick="toggle(${i})">📘 Pembahasan</button>

      <div class="result" id="res${i}"></div>

      <div id="exp${i}" style="display:none;margin-top:10px">
        ${q.explanation || "Belum ada pembahasan"}
      </div>
    `;

    html += `</div>`;
  });

  container.innerHTML = html;

  if (window.MathJax) {
    MathJax.typesetClear();
    MathJax.typesetPromise([container]);
  }
}

// ================= CHECK =================
window.check = function (i) {

  const q = questions[i];
  let correct = false;

  if (q.type === "pg") {
    const sel = document.querySelector(`input[name="q${i}"]:checked`);
    if (!sel) return alert("Pilih jawaban");
    correct = sel.value == q.answer;
  }

  else if (q.type === "checkbox") {
    const sel = [...document.querySelectorAll(`input[name="q${i}"]:checked`)]
      .map(x => x.value);

    correct =
      JSON.stringify(sel.sort()) ===
      JSON.stringify((q.answer || []).map(String).sort());
  }

  else if (q.type === "isian") {
    const val = document.getElementById("q" + i).value;
    correct = val.trim().toLowerCase() === String(q.answer).toLowerCase();
  }

  else if (q.type === "multi_isian") {
    correct = true;

    q.fields.forEach((f, idx) => {
      const val = document.getElementById(`q${i}_${idx}`).value.trim().toLowerCase();
      const ans = String(f.answer).trim().toLowerCase();

      if (val !== ans) correct = false;
    });
  }

  const res = document.getElementById("res" + i);

  res.innerHTML = correct ? "✅ Benar" : "❌ Salah";
  res.style.color = correct ? "green" : "red";
  res.style.padding = "8px";
  res.style.background = correct ? "#dcfce7" : "#fee2e2";
  res.style.borderRadius = "10px";
};

window.toggle = function (i) {
  const el = document.getElementById("exp" + i);
  el.style.display = el.style.display === "block" ? "none" : "block";
};

loadExercise();
