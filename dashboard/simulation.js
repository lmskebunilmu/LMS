import { auth, db } from "../firebase/firebase-config.js";

import {
  doc, getDoc,
  collection, getDocs,
  query, where, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ================= GLOBAL STATE =================
const id = new URLSearchParams(location.search).get("id");

let questions = [];
let studentData = null;
let exerciseData = null;
let isDataLoaded = false; // Flag status load data

let currentIndex = 0;
let userAnswers = {}; // { 0: "0", 1: ["0", "2"], ... }
let doubtStatus = {};  // { 0: true, 1: false, ... }
window.matchAnswers = {}; // Khusus tipe match per nomor soal

let timerInterval = null;
let timeRemaining = 0; // dalam detik

// ================= HELPER DECODER =================
function decodeHTML(html) {
  if (!html) return "";
  const txt = document.createElement("textarea");
  txt.innerHTML = html;
  return txt.value;
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
    alert("ID Latihan/Simulasi tidak ditemukan!");
    return;
  }

  // Coba cari di koleksi simulations terlebih dahulu, fallback ke exercises
  let exSnap = await getDoc(doc(db, "simulations", id));
  let isSimulationDoc = true;

  if (!exSnap.exists()) {
    exSnap = await getDoc(doc(db, "exercises", id));
    isSimulationDoc = false;
  }

  if (!exSnap.exists()) {
    alert("Data simulasi/latihan tidak ditemukan di database!");
    return;
  }

  exerciseData = exSnap.data();

  // Filter Level Siswa
  if (exerciseData.level && studentData && exerciseData.level !== studentData.level) {
    alert("❌ Simulasi ini tidak ditujukan untuk level kamu.");
    return;
  }

  // Jika dokumen simulation memiliki array questions langsung di dalamnya
  if (isSimulationDoc && Array.isArray(exerciseData.questions) && exerciseData.questions.length > 0) {
    questions = exerciseData.questions;
  } else {
    // Jalankan query collection 'questions'
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
  }

  if (questions.length === 0) {
    alert("Belum ada soal dalam simulasi ini.");
    document.getElementById("startSimMeta").innerText = "❌ Soal tidak ditemukan";
    return;
  }

  // Set Info pada Modal Mulai
  document.getElementById("startSimTitle").innerText = exerciseData.title || "Simulasi Ujian";
  document.getElementById("startSimMeta").innerText = `Jumlah Soal: ${questions.length} | Durasi: ${exerciseData.durationMinutes || exerciseData.duration || 60} Menit`;

  document.getElementById("simTitle").innerText = exerciseData.title || "Simulasi Ujian";
  document.getElementById("simMeta").innerText = `Total ${questions.length} Soal`;

  // Inisialisasi Timer
  const durationMinutes = exerciseData.durationMinutes || exerciseData.duration || 60;
  timeRemaining = durationMinutes * 60;

  // Flag data siap
  isDataLoaded = true;
}

// ================= START EXAM =================
window.startExamWithFullscreen = function () {
  if (!isDataLoaded || questions.length === 0) {
    alert("Data soal masih dimuat atau tidak ditemukan. Mohon tunggu sebentar...");
    return;
  }

  // Buka Fullscreen jika bisa
  const el = document.documentElement;
  if (el.requestFullscreen) {
    el.requestFullscreen().catch(() => {});
  }

  // Sembunyikan Modal Start & Hilangkan Blur
  document.getElementById("startModal").style.display = "none";
  document.getElementById("cbtHeader").classList.remove("blur-content");
  document.getElementById("cbtMainContainer").classList.remove("blur-content");

  // Jalankan Timer
  startTimer();

  // Render Soal Pertama & Grid
  renderQuestion(0);
  renderGridNumbers();
};

// ================= TIMER LOGIC =================
function startTimer() {
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    timeRemaining--;
    updateTimerDisplay();

    if (timeRemaining <= 0) {
      clearInterval(timerInterval);
      alert("⏰ Waktu ujian telah habis!");
      finishExam();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const hours = Math.floor(timeRemaining / 3600);
  const minutes = Math.floor((timeRemaining % 3600) / 60);
  const seconds = timeRemaining % 60;

  const formatted = [
    hours.toString().padStart(2, '0'),
    minutes.toString().padStart(2, '0'),
    seconds.toString().padStart(2, '0')
  ].join(':');

  document.getElementById("timerDisplay").innerText = formatted;
}

// ================= RENDER QUESTION =================
function renderQuestion(index) {
  currentIndex = index;
  const q = questions[index];

  // Safety Guard: jika index melampaui batas atau soal undefined
  if (!q) {
    console.error(`Soal index ${index} tidak ditemukan!`);
    document.getElementById("questionText").innerText = "Gagal memuat detail soal ini.";
    return;
  }

  const questionContent = q.question || q.text || q.title || "Pertanyaan tidak memiliki teks";

  // Set Nomor & Teks Soal
  document.getElementById("questionNumberHeader").innerText = `Soal No. ${index + 1} dari ${questions.length}`;
  document.getElementById("questionText").innerHTML = decodeHTML(questionContent);

  const area = document.getElementById("answerOptionsArea");
  area.innerHTML = "";

  // 1. PG
  if (q.type === "pg" && q.options) {
    let optHtml = `<div class="options-wrapper">`;
    q.options.forEach((opt, idx) => {
      const isChecked = userAnswers[index] == idx ? "checked" : "";
      optHtml += `
        <label class="opt-label">
          <input type="radio" name="cbtOpt" value="${idx}" ${isChecked} onchange="saveAnswer(${index}, ${idx})">
          <div>${decodeHTML(opt)}</div>
        </label>
      `;
    });
    optHtml += `</div>`;
    area.innerHTML = optHtml;
  }

  // 2. CHECKBOX
  else if (q.type === "checkbox" && q.options) {
    let optHtml = `<div class="options-wrapper">`;
    const saved = userAnswers[index] || [];
    q.options.forEach((opt, idx) => {
      const isChecked = saved.includes(String(idx)) ? "checked" : "";
      optHtml += `
        <label class="opt-label">
          <input type="checkbox" name="cbtOpt" value="${idx}" ${isChecked} onchange="saveCheckboxAnswer(${index})">
          <div>${decodeHTML(opt)}</div>
        </label>
      `;
    });
    optHtml += `</div>`;
    area.innerHTML = optHtml;
  }

  // 3. ISIAN
  else if (q.type === "isian") {
    const saved = userAnswers[index] || "";
    area.innerHTML = `
      <input type="text" value="${saved}" placeholder="Ketik jawaban Anda di sini..."
        style="padding:12px 16px; border-radius:10px; border:1px solid #cbd5e1; width:100%; font-size:15px;"
        oninput="saveAnswer(${index}, this.value)">
    `;
  }

  // 4. MULTI ISIAN
  else if (q.type === "multi_isian") {
    const fields = q.fields || (q.answers ? q.answers.map((_, idx) => ({ label: `Isian [${idx + 1}]` })) : []);
    const saved = userAnswers[index] || {};

    let html = `<div class="multi-wrapper">`;
    fields.forEach((f, idx) => {
      const val = saved[idx] || "";
      const labelText = typeof f === 'object' ? f.label : `Isian [${idx + 1}]`;
      html += `
        <div style="margin-bottom:14px">
          <label style="display:block;margin-bottom:6px;font-weight:bold;font-size:14px;">
            ${decodeHTML(labelText)}
          </label>
          <input type="text" class="multi-input" value="${val}"
            style="padding:10px;border-radius:8px;border:1px solid #cbd5e1;width:100%;box-sizing:border-box;"
            oninput="saveMultiIsianAnswer(${index}, ${idx}, this.value)">
        </div>
      `;
    });
    html += `</div>`;
    area.innerHTML = html;
  }

  // 5. MATRIX
  else if (q.type === "matrix" && q.columns && q.rows) {
    const saved = userAnswers[index] || {};
    const statementHeader = q.statementTitle || "Pernyataan / Argumen";

    let html = `
      <div class="cbt-table-wrapper">
        <table class="cbt-table">
          <thead>
            <tr>
              <th>${statementHeader}</th>
              ${q.columns.map(col => `<th>${decodeHTML(col)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
    `;

    q.rows.forEach((row, rIdx) => {
      html += `
        <tr>
          <td>${decodeHTML(row.statement)}</td>
          ${q.columns.map((_, cIdx) => {
            const isChecked = saved[rIdx] == cIdx ? "checked" : "";
            return `
              <td style="text-align:center;">
                <input type="radio" name="matrix_${index}_${rIdx}" value="${cIdx}" ${isChecked} onchange="saveMatrixAnswer(${index}, ${rIdx}, ${cIdx})">
              </td>
            `;
          }).join('')}
        </tr>
      `;
    });

    html += `</tbody></table></div>`;
    area.innerHTML = html;
  }

  // 6. MATCH
  else if (q.type === "match" && q.pairs) {
    const shuffled = [...q.pairs]
      .map((p, idx) => ({ ...p, original: idx }))
      .sort(() => Math.random() - 0.5);

    let html = `
      <div class="match-wrapper" id="matchWrap${index}" style="position:relative; display:flex; justify-content:space-between; gap:20px;">
        <svg class="match-lines" id="svg${index}" style="position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none;"></svg>
        <div class="match-column" style="flex:1;">
          ${q.pairs.map((p, idx) => `
            <div class="match-item left-item" data-index="${idx}" onclick="selectLeft(${index}, this)" style="padding:10px; border:1px solid #cbd5e1; margin-bottom:8px; border-radius:6px; cursor:pointer;">
              ${decodeHTML(p.left)}
            </div>
          `).join("")}
        </div>
        <div class="match-column" style="flex:1;">
          ${shuffled.map((p) => `
            <div class="match-item right-item" data-original="${p.original}" onclick="selectRight(${index}, this)" style="padding:10px; border:1px solid #cbd5e1; margin-bottom:8px; border-radius:6px; cursor:pointer;">
              ${decodeHTML(p.right)}
            </div>
          `).join("")}
        </div>
      </div>
    `;
    area.innerHTML = html;
    setTimeout(() => drawLines(index), 100);
  }

  // Update Navigasi Tombol
  document.getElementById("btnPrev").style.visibility = index === 0 ? "hidden" : "visible";
  document.getElementById("btnNext").innerText = index === questions.length - 1 ? "Selesai 🏁" : "Selanjutnya ▶";

  // Update Status Ragu-ragu
  const btnDoubt = document.getElementById("btnDoubt");
  if (doubtStatus[index]) {
    btnDoubt.style.background = "#d97706";
  } else {
    btnDoubt.style.background = "#eab308";
  }

  // Trigger MathJax
  if (window.MathJax && window.MathJax.typesetPromise) {
    MathJax.typesetClear();
    MathJax.typesetPromise([document.getElementById("cbtMainContainer")]).catch((err) => console.log(err));
  }
}

// ================= SIMPAN JAWABAN =================
window.saveAnswer = function(qIdx, val) {
  userAnswers[qIdx] = val;
  renderGridNumbers();
};

window.saveCheckboxAnswer = function(qIdx) {
  const checked = [...document.querySelectorAll('input[name="cbtOpt"]:checked')].map(x => x.value);
  userAnswers[qIdx] = checked;
  renderGridNumbers();
};

window.saveMultiIsianAnswer = function(qIdx, fIdx, val) {
  if (!userAnswers[qIdx]) userAnswers[qIdx] = {};
  userAnswers[qIdx][fIdx] = val;
  renderGridNumbers();
};

window.saveMatrixAnswer = function(qIdx, rIdx, cIdx) {
  if (!userAnswers[qIdx]) userAnswers[qIdx] = {};
  userAnswers[qIdx][rIdx] = cIdx;
  renderGridNumbers();
};

// ================= NAVIGASI =================
window.nextQuestion = function () {
  if (currentIndex < questions.length - 1) {
    renderQuestion(currentIndex + 1);
  } else {
    confirmFinish();
  }
};

window.prevQuestion = function () {
  if (currentIndex > 0) {
    renderQuestion(currentIndex - 1);
  }
};

window.toggleDoubt = function () {
  doubtStatus[currentIndex] = !doubtStatus[currentIndex];
  renderQuestion(currentIndex);
  renderGridNumbers();
};

// ================= DRAWER & GRID NUMBERS =================
window.toggleNavDrawer = function () {
  const drawer = document.getElementById("navDrawerOverlay");
  drawer.style.display = (drawer.style.display === "flex") ? "none" : "flex";
};

function renderGridNumbers() {
  const grid = document.getElementById("gridNumbers");
  grid.innerHTML = "";

  questions.forEach((_, idx) => {
    const box = document.createElement("div");
    box.className = "num-box";
    box.innerText = idx + 1;

    // Cek Status Jawaban
    const isAnswered = hasAnswer(idx);
    const isDoubt = doubtStatus[idx];

    if (isDoubt) box.classList.add("doubt");
    else if (isAnswered) box.classList.add("answered");

    if (idx === currentIndex) box.classList.add("active");

    box.onclick = () => {
      renderQuestion(idx);
      toggleNavDrawer();
    };

    grid.appendChild(box);
  });
}

function hasAnswer(idx) {
  const ans = userAnswers[idx];
  if (ans === undefined || ans === null || ans === "") return false;
  if (Array.isArray(ans) && ans.length === 0) return false;
  if (typeof ans === 'object' && Object.keys(ans).length === 0) return false;
  return true;
}

// ================= MATCH LOGIC =================
window.currentLeft = {};

window.selectLeft = function(qIndex, el) {
  document.querySelectorAll(`#matchWrap${qIndex} .left-item`).forEach(x => x.style.borderColor = "#cbd5e1");
  el.style.borderColor = "#2563eb";
  window.currentLeft[qIndex] = el;
};

window.selectRight = function(qIndex, el) {
  const leftEl = window.currentLeft[qIndex];
  if (!leftEl) {
    alert("Pilih sisi kiri terlebih dahulu!");
    return;
  }

  const leftIndex = leftEl.dataset.index;
  const rightIndex = el.dataset.original;

  if (!window.matchAnswers[qIndex]) window.matchAnswers[qIndex] = {};
  window.matchAnswers[qIndex][leftIndex] = rightIndex;
  userAnswers[qIndex] = window.matchAnswers[qIndex];

  leftEl.style.borderColor = "#10b981";
  el.style.borderColor = "#10b981";

  drawLines(qIndex);
  window.currentLeft[qIndex] = null;
  renderGridNumbers();
};

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

// ================= FINISH & HITUNG NILAI =================
window.confirmFinish = function () {
  if (confirm("Apakah Anda yakin ingin menyelesaikan simulasi ini?")) {
    finishExam();
  }
};

function finishExam() {
  clearInterval(timerInterval);

  let totalCorrect = 0;

  questions.forEach((q, i) => {
    const userAns = userAnswers[i];

    if (q.type === "pg" && userAns == q.answer) {
      totalCorrect++;
    } 
    else if (q.type === "checkbox") {
      const arrAns = (userAns || []).map(String).sort();
      const keyAns = (q.answer || []).map(String).sort();
      if (JSON.stringify(arrAns) === JSON.stringify(keyAns)) totalCorrect++;
    } 
    else if (q.type === "isian") {
      if (String(userAns || "").trim().toLowerCase() === String(q.answer).trim().toLowerCase()) {
        totalCorrect++;
      }
    } 
    else if (q.type === "multi_isian") {
      const fields = q.fields || (q.answers ? q.answers.map(ans => ({ answer: ans })) : []);
      let isAllCorrect = true;
      fields.forEach((f, idx) => {
        const uVal = String((userAns || {})[idx] || "").trim().toLowerCase();
        const keyVal = String(typeof f === 'object' ? f.answer : f).trim().toLowerCase();
        if (uVal !== keyVal) isAllCorrect = false;
      });
      if (isAllCorrect && fields.length > 0) totalCorrect++;
    } 
    else if (q.type === "matrix") {
      const answers = userAns || {};
      let isMatrixCorrect = true;
      if (!q.rows || Object.keys(answers).length !== q.rows.length) {
        isMatrixCorrect = false;
      } else {
        q.rows.forEach((row, rIdx) => {
          if (parseInt(answers[rIdx]) !== row.answer) isMatrixCorrect = false;
        });
      }
      if (isMatrixCorrect && q.rows.length > 0) totalCorrect++;
    }
    else if (q.type === "match") {
      const answers = userAns || {};
      let isMatchAll = true;
      if (!q.pairs || Object.keys(answers).length !== q.pairs.length) {
        isMatchAll = false;
      } else {
        q.pairs.forEach((_, idx) => {
          if (String(answers[idx]) !== String(idx)) isMatchAll = false;
        });
      }
      if (isMatchAll && q.pairs.length > 0) totalCorrect++;
    }
  });

  const finalScore = questions.length > 0 ? Math.round((totalCorrect / questions.length) * 100) : 0;
  const passingGrade = exerciseData.passingGrade || 75;

  // Tampilkan Modal Hasil
  document.getElementById("finalScore").innerText = finalScore;
  const statusEl = document.getElementById("passingStatus");

  if (finalScore >= passingGrade) {
    statusEl.innerText = `LULUS (Passing Grade: ${passingGrade}%)`;
    statusEl.style.color = "#16a34a";
  } else {
    statusEl.innerText = `BELUM LULUS (Passing Grade: ${passingGrade}%)`;
    statusEl.style.color = "#dc2626";
  }

  // Sembunyikan Drawer jika terbuka
  document.getElementById("navDrawerOverlay").style.display = "none";
  document.getElementById("resultModal").style.display = "flex";
}

window.backToClass = function () {
  window.location.href = "./index.html";
};
