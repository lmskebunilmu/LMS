import { auth, db } from "../firebase/firebase-config.js";
import {
  doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const id = new URLSearchParams(location.search).get("id");

// State Simulasi
let simulationData = null;
let questions = [];
let currentIndex = 0;
let userAnswers = {}; // { 0: answerValue, 1: answerValue }
let doubtStatus = {};  // { 0: true/false }
let timerInterval = null;
let timeRemaining = 0; // dalam detik
let studentData = null;

// ================= HELPER DECODER =================
function decodeHTML(html) {
  if (!html) return "";
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  return doc.body.innerHTML;
}

// ================= AUTH & INIT =================
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location = "../../login.html";
    return;
  }

  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (userSnap.exists()) {
      studentData = userSnap.data();
    }
    await loadSimulation();
  } catch (err) {
    console.error("Error loading user data:", err);
  }
});

// ================= LOAD SIMULATION DATA =================
async function loadSimulation() {
  if (!id) {
    alert("ID Simulasi tidak ditemukan!");
    return;
  }

  try {
    const simRef = doc(db, "simulations", id);
    const simSnap = await getDoc(simRef);

    if (!simSnap.exists()) {
      alert("Data simulasi tidak ditemukan!");
      return;
    }

    simulationData = simSnap.data();
    questions = simulationData.questions || [];

    if (questions.length === 0) {
      alert("Simulasi ini belum memiliki soal!");
      return;
    }

    if (simulationData.randomizeQuestions) {
      questions = questions.sort(() => Math.random() - 0.5);
    }

    document.getElementById("startSimTitle").innerText = simulationData.title || "Simulasi Ujian";
    document.getElementById("startSimMeta").innerText = `${questions.length} Soal | ${simulationData.durationMinutes || 60} Menit`;

    document.getElementById("simTitle").innerText = simulationData.title || "Simulasi Ujian";
    document.getElementById("simMeta").innerText = `${questions.length} Soal | Passing Grade: ${simulationData.passingGrade || 75}%`;

    timeRemaining = (simulationData.durationMinutes || 60) * 60;
    
    renderGridNumbers();
  } catch (err) {
    console.error("Error fetching simulation:", err);
    alert("Gagal memuat data simulasi.");
  }
}

// ================= RENDER CURRENT QUESTION =================
function renderCurrentQuestion() {
  const q = questions[currentIndex];
  if (!q) return;

  document.getElementById("questionNumberHeader").innerText = `Soal No. ${currentIndex + 1} dari ${questions.length}`;
  document.getElementById("questionText").innerHTML = decodeHTML(q.question);

  const container = document.getElementById("answerOptionsArea");
  container.innerHTML = "";

  // 1. PILIHAN GANDA (PG)
  if (q.type === "pg" && q.options) {
    let html = `<div class="options-wrapper">`;
    q.options.forEach((opt, idx) => {
      const isChecked = userAnswers[currentIndex] === idx ? "checked" : "";
      html += `
        <label class="opt-label">
          <input type="radio" name="opt_pg" value="${idx}" ${isChecked} onchange="saveAnswer(${idx})">
          <span><b>${String.fromCharCode(65 + idx)}.</b> ${decodeHTML(opt)}</span>
        </label>
      `;
    });
    html += `</div>`;
    container.innerHTML = html;
  }

  // 2. CHECKBOX
  else if (q.type === "checkbox" && q.options) {
    let html = `<div class="options-wrapper">`;
    const currentAns = userAnswers[currentIndex] || [];
    q.options.forEach((opt, idx) => {
      const isChecked = currentAns.includes(idx) ? "checked" : "";
      html += `
        <label class="opt-label">
          <input type="checkbox" name="opt_chk" value="${idx}" ${isChecked} onchange="saveAnswerCheckbox()">
          <span><b>${String.fromCharCode(65 + idx)}.</b> ${decodeHTML(opt)}</span>
        </label>
      `;
    });
    html += `</div>`;
    container.innerHTML = html;
  }

  // 3. ISIAN SINGKAT
  else if (q.type === "isian") {
    const val = userAnswers[currentIndex] !== undefined ? userAnswers[currentIndex] : "";
    container.innerHTML = `
      <input type="text" value="${val}" placeholder="Ketik jawaban Anda di sini..." 
        oninput="saveAnswer(this.value)"
        style="width:100%; padding:12px; border:1px solid #cbd5e1; border-radius:10px; font-size:14px; box-sizing:border-box;">
    `;
  }

  // 4. MULTI ISIAN
  else if (q.type === "multi_isian") {
    const expectedAns = q.answers || [];
    const currentAns = userAnswers[currentIndex] || {};
    let html = `<div style="display:flex; flex-direction:column; gap:12px;">`;
    expectedAns.forEach((_, idx) => {
      const val = currentAns[idx] || "";
      html += `
        <div>
          <label style="font-size:13px; font-weight:700; margin-bottom:4px; display:block;">Isian [${idx + 1}]</label>
          <input type="text" value="${val}" placeholder="Jawaban..." 
            oninput="saveAnswerMultiIsian(${idx}, this.value)"
            style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; font-size:14px; box-sizing:border-box;">
        </div>
      `;
    });
    html += `</div>`;
    container.innerHTML = html;
  }

  // 5. MATRIX
  else if (q.type === "matrix" && q.columns && q.rows) {
    const currentAns = userAnswers[currentIndex] || {};
    let html = `
      <div class="cbt-table-wrapper">
        <table class="cbt-table">
          <thead>
            <tr>
              <th>${decodeHTML(q.statementTitle || "Pernyataan")}</th>
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
            const isChecked = currentAns[rIdx] === cIdx ? "checked" : "";
            return `
              <td style="text-align:center;">
                <input type="radio" name="matrix_row_${rIdx}" value="${cIdx}" ${isChecked} onchange="saveAnswerMatrix(${rIdx}, ${cIdx})">
              </td>
            `;
          }).join('')}
        </tr>
      `;
    });
    html += `</tbody></table></div>`;
    container.innerHTML = html;
  }

  // 6. MATCHING / MENJODOHKAN
  else if (q.type === "match" && q.pairs) {
    const currentAns = userAnswers[currentIndex] || {};
    let html = `
      <div class="cbt-table-wrapper">
        <table class="cbt-table">
          <thead>
            <tr>
              <th style="width:50%;">Pernyataan (Kiri)</th>
              <th style="width:50%;">Pasangan Jawaban (Kanan)</th>
            </tr>
          </thead>
          <tbody>
    `;
    q.pairs.forEach((p, idx) => {
      const selectedVal = currentAns[idx] !== undefined ? currentAns[idx] : "";
      html += `
        <tr>
          <td>${decodeHTML(p.left)}</td>
          <td>
            <select style="width:100%; padding:8px; border-radius:6px; border:1px solid #cbd5e1;" onchange="saveAnswerMatch(${idx}, this.value)">
              <option value="">-- Pilih Pasangan --</option>
              ${q.pairs.map((pOpt, optIdx) => `
                <option value="${optIdx}" ${selectedVal == optIdx ? 'selected' : ''}>
                  ${decodeHTML(pOpt.right)}
                </option>
              `).join('')}
            </select>
          </td>
        </tr>
      `;
    });
    html += `</tbody></table></div>`;
    container.innerHTML = html;
  }

  const btnDoubt = document.getElementById("btnDoubt");
  if (doubtStatus[currentIndex]) {
    btnDoubt.style.background = "#d97706";
    btnDoubt.innerText = "🟧 Ragu-Ragu (Aktif)";
  } else {
    btnDoubt.style.background = "#eab308";
    btnDoubt.innerText = "🟧 Ragu-Ragu";
  }

  document.getElementById("btnPrev").disabled = currentIndex === 0;
  document.getElementById("btnNext").innerText = currentIndex === questions.length - 1 ? "Selesai 🏁" : "Selanjutnya ▶";

  if (window.MathJax && window.MathJax.typesetPromise) {
    MathJax.typesetPromise([document.getElementById("cbtMainContainer")]);
  }

  renderGridNumbers();
}

// ================= SAVE ANSWERS HELPERS =================
window.saveAnswer = function(val) {
  userAnswers[currentIndex] = val;
  renderGridNumbers();
};

window.saveAnswerCheckbox = function() {
  const checked = [...document.querySelectorAll('input[name="opt_chk"]:checked')].map(x => parseInt(x.value));
  if (checked.length > 0) {
    userAnswers[currentIndex] = checked;
  } else {
    delete userAnswers[currentIndex];
  }
  renderGridNumbers();
};

window.saveAnswerMultiIsian = function(subIdx, val) {
  if (!userAnswers[currentIndex]) userAnswers[currentIndex] = {};
  if (val.trim() === "") {
    delete userAnswers[currentIndex][subIdx];
  } else {
    userAnswers[currentIndex][subIdx] = val;
  }
  renderGridNumbers();
};

window.saveAnswerMatrix = function(rowIdx, colIdx) {
  if (!userAnswers[currentIndex]) userAnswers[currentIndex] = {};
  userAnswers[currentIndex][rowIdx] = colIdx;
  renderGridNumbers();
};

window.saveAnswerMatch = function(leftIdx, selectedRightIdx) {
  if (!userAnswers[currentIndex]) userAnswers[currentIndex] = {};
  if (selectedRightIdx === "") {
    delete userAnswers[currentIndex][leftIdx];
  } else {
    userAnswers[currentIndex][leftIdx] = parseInt(selectedRightIdx);
  }
  renderGridNumbers();
};

// ================= NAVIGATION =================
window.prevQuestion = function() {
  if (currentIndex > 0) {
    currentIndex--;
    renderCurrentQuestion();
  }
};

window.nextQuestion = function() {
  if (currentIndex < questions.length - 1) {
    currentIndex++;
    renderCurrentQuestion();
  } else {
    window.toggleNavDrawer();
  }
};

window.toggleDoubt = function() {
  doubtStatus[currentIndex] = !doubtStatus[currentIndex];
  renderCurrentQuestion();
};

window.goToQuestion = function(idx) {
  currentIndex = idx;
  renderCurrentQuestion();
  window.toggleNavDrawer();
};

window.toggleNavDrawer = function() {
  const overlay = document.getElementById("navDrawerOverlay");
  overlay.style.display = overlay.style.display === "flex" ? "none" : "flex";
};

// ================= CHECKING TERJAWAB (FIX BLUE BUTTON) =================
function isQuestionAnswered(idx) {
  const ans = userAnswers[idx];
  if (ans === undefined || ans === null) return false;
  if (typeof ans === "string") return ans.trim() !== "";
  if (typeof ans === "number") return true; // Mengatasi indeks 0 (Pilihan A)
  if (Array.isArray(ans)) return ans.length > 0;
  if (typeof ans === "object") return Object.keys(ans).length > 0;
  return false;
}

// ================= RENDER GRID NUMBERS =================
function renderGridNumbers() {
  const grid = document.getElementById("gridNumbers");
  if (!grid) return;
  grid.innerHTML = "";

  questions.forEach((_, idx) => {
    const btn = document.createElement("div");
    btn.className = "num-box";
    btn.innerText = idx + 1;

    const isAnswered = isQuestionAnswered(idx);
    const isDoubt = doubtStatus[idx];

    if (idx === currentIndex) btn.classList.add("active");
    
    // Warna: Ragu (Kuning), Terjawab (Biru)
    if (isDoubt) {
      btn.classList.add("doubt");
    } else if (isAnswered) {
      btn.classList.add("answered");
    }

    btn.onclick = () => window.goToQuestion(idx);
    grid.appendChild(btn);
  });
}

// ================= TIMER LOGIC =================
function startTimer() {
  timerInterval = setInterval(() => {
    if (timeRemaining <= 0) {
      clearInterval(timerInterval);
      alert("Waktu pengerjaan telah habis!");
      calculateAndFinish();
      return;
    }

    timeRemaining--;
    const h = Math.floor(timeRemaining / 3600).toString().padStart(2, '0');
    const m = Math.floor((timeRemaining % 3600) / 60).toString().padStart(2, '0');
    const s = (timeRemaining % 60).toString().padStart(2, '0');

    document.getElementById("timerDisplay").innerText = `${h}:${m}:${s}`;
  }, 1000);
}

// ================= START EXAM =================
window.startExamWithFullscreen = function() {
  const el = document.documentElement;
  if (el.requestFullscreen) {
    el.requestFullscreen().catch(() => {});
  }

  document.getElementById("startModal").style.display = "none";
  document.getElementById("cbtHeader").classList.remove("blur-content");
  document.getElementById("cbtMainContainer").classList.remove("blur-content");

  renderCurrentQuestion();
  startTimer();
};

// ================= FINISH SIMULATION =================
window.confirmFinish = function() {
  if (confirm("Apakah Anda yakin ingin menyelesaikan simulasi ujian ini?")) {
    window.toggleNavDrawer();
    calculateAndFinish();
  }
};

function calculateAndFinish() {
  clearInterval(timerInterval);

  let totalCorrect = 0;
  const resultsDetail = [];

  questions.forEach((q, idx) => {
    const ans = userAnswers[idx];
    let isCorrect = false;

    if (ans !== undefined && ans !== null) {
      // 1. PG
      if (q.type === "pg" && ans === q.answer) {
        isCorrect = true;
      }
      // 2. CHECKBOX
      else if (q.type === "checkbox") {
        const expected = (Array.isArray(q.answer) ? q.answer : []).slice().sort();
        const userSel = (Array.isArray(ans) ? ans : []).slice().sort();
        if (JSON.stringify(expected) === JSON.stringify(userSel)) isCorrect = true;
      }
      // 3. ISIAN
      else if (q.type === "isian") {
        if (String(ans).trim().toLowerCase() === String(q.answer).trim().toLowerCase()) isCorrect = true;
      }
      // 4. MULTI ISIAN
      else if (q.type === "multi_isian") {
        const expectedArr = q.answers || [];
        let isAllCorrect = true;
        expectedArr.forEach((exp, subIdx) => {
          if (!ans[subIdx] || String(ans[subIdx]).trim().toLowerCase() !== String(exp).trim().toLowerCase()) {
            isAllCorrect = false;
          }
        });
        if (isAllCorrect && expectedArr.length > 0) isCorrect = true;
      }
      // 5. MATRIX
      else if (q.type === "matrix") {
        let isAllCorrect = true;
        q.rows.forEach((row, rIdx) => {
          if (ans[rIdx] !== row.answer) isAllCorrect = false;
        });
        if (isAllCorrect) isCorrect = true;
      }
      // 6. MATCH
      else if (q.type === "match") {
        let isAllCorrect = true;
        if (Object.keys(ans).length !== q.pairs.length) {
          isAllCorrect = false;
        } else {
          q.pairs.forEach((_, pIdx) => {
            if (ans[pIdx] !== pIdx) isAllCorrect = false;
          });
        }
        if (isAllCorrect) isCorrect = true;
      }
    }

    if (isCorrect) totalCorrect++;
    resultsDetail.push({ question: q, isCorrect, userAnswer: ans });
  });

  const finalScore = Math.round((totalCorrect / questions.length) * 100) || 0;
  const passingGrade = simulationData.passingGrade || 75;
  const isPassed = finalScore >= passingGrade;

  document.getElementById("finalScore").innerText = finalScore;
  const statusEl = document.getElementById("passingStatus");
  statusEl.innerText = isPassed ? "LULUS (MEMENUHI PASSING GRADE)" : "TIDAK LULUS";
  statusEl.style.color = isPassed ? "#16a34a" : "#dc2626";

  // Build detail pembahasan
  renderReviewDetail(resultsDetail);

  document.getElementById("resultModal").style.display = "flex";
}

// ================= FORMATING TERJEMAHAN JAWABAN =================
function formatUserAnswerText(q, ans) {
  if (ans === undefined || ans === null || ans === "" || (typeof ans === "object" && Object.keys(ans).length === 0)) {
    return `<i style="color:#94a3b8;">Tidak Dijawab</i>`;
  }

  // 1. PG
  if (q.type === "pg" && q.options) {
    const optText = q.options[ans] ? decodeHTML(q.options[ans]) : "-";
    return `<b>${String.fromCharCode(65 + ans)}.</b> ${optText}`;
  }

  // 2. Checkbox
  if (q.type === "checkbox" && q.options && Array.isArray(ans)) {
    return ans.map(idx => `<b>${String.fromCharCode(65 + idx)}.</b> ${decodeHTML(q.options[idx])}`).join("<br>");
  }

  // 3. Isian Singkat
  if (q.type === "isian") {
    return `<b>${ans}</b>`;
  }

  // 4. Multi Isian
  if (q.type === "multi_isian") {
    let textArr = [];
    (q.answers || []).forEach((_, idx) => {
      textArr.push(`Isian [${idx + 1}]: <b>${ans[idx] || "-"}</b>`);
    });
    return textArr.join("<br>");
  }

  // 5. Matrix
  if (q.type === "matrix" && q.rows && q.columns) {
    let textArr = [];
    q.rows.forEach((row, rIdx) => {
      const colIdx = ans[rIdx];
      const selectedColName = colIdx !== undefined ? decodeHTML(q.columns[colIdx]) : "-";
      textArr.push(`${decodeHTML(row.statement)} ➔ <b>${selectedColName}</b>`);
    });
    return textArr.join("<br>");
  }

  // 6. Match / Menjodohkan
  if (q.type === "match" && q.pairs) {
    let textArr = [];
    q.pairs.forEach((pair, pIdx) => {
      const rightIdx = ans[pIdx];
      const selectedRightText = rightIdx !== undefined ? decodeHTML(q.pairs[rightIdx].right) : "-";
      textArr.push(`${decodeHTML(pair.left)} ➔ <b>${selectedRightText}</b>`);
    });
    return textArr.join("<br>");
  }

  return JSON.stringify(ans);
}

function formatCorrectAnswerText(q) {
  // 1. PG
  if (q.type === "pg" && q.options) {
    const optText = q.options[q.answer] ? decodeHTML(q.options[q.answer]) : "-";
    return `<b>${String.fromCharCode(65 + q.answer)}.</b> ${optText}`;
  }

  // 2. Checkbox
  if (q.type === "checkbox" && q.options && Array.isArray(q.answer)) {
    return q.answer.map(idx => `<b>${String.fromCharCode(65 + idx)}.</b> ${decodeHTML(q.options[idx])}`).join("<br>");
  }

  // 3. Isian Singkat
  if (q.type === "isian") {
    return `<b>${q.answer}</b>`;
  }

  // 4. Multi Isian
  if (q.type === "multi_isian") {
    let textArr = [];
    (q.answers || []).forEach((exp, idx) => {
      textArr.push(`Isian [${idx + 1}]: <b>${exp}</b>`);
    });
    return textArr.join("<br>");
  }

  // 5. Matrix
  if (q.type === "matrix" && q.rows && q.columns) {
    let textArr = [];
    q.rows.forEach((row) => {
      const colName = decodeHTML(q.columns[row.answer]);
      textArr.push(`${decodeHTML(row.statement)} ➔ <b>${colName}</b>`);
    });
    return textArr.join("<br>");
  }

  // 6. Match / Menjodohkan
  if (q.type === "match" && q.pairs) {
    let textArr = [];
    q.pairs.forEach((pair) => {
      textArr.push(`${decodeHTML(pair.left)} ➔ <b>${decodeHTML(pair.right)}</b>`);
    });
    return textArr.join("<br>");
  }

  return "-";
}

// ================= RENDER REVIEW DETAIL =================
function renderReviewDetail(resultsDetail) {
  const container = document.getElementById("reviewDetailArea");
  let html = "";

  resultsDetail.forEach((item, idx) => {
    const q = item.question;
    const isCorrect = item.isCorrect;
    const statusClass = isCorrect ? "status-correct" : "status-wrong";
    const statusText = isCorrect ? "✓ BENAR" : "✕ SALAH / BELUM DIISI";

    const userAnsText = formatUserAnswerText(q, item.userAnswer);
    const correctAnsText = formatCorrectAnswerText(q);
    const discussionText = q.explanation || q.discussion || q.pembahasan || "Tidak ada pembahasan khusus untuk soal ini.";

    html += `
      <div class="review-item" style="border-left: 5px solid ${isCorrect ? '#16a34a' : '#dc2626'};">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="font-weight:800; color:#1e293b;">Soal No. ${idx + 1}</span>
          <span class="review-status ${statusClass}">${statusText}</span>
        </div>

        <!-- Teks Soal -->
        <div style="margin-bottom: 12px; font-size:15px; color:#0f172a;">
          ${decodeHTML(q.question)}
        </div>

        <!-- Info Jawaban -->
        <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; font-size: 13px; margin-bottom: 10px;">
          <div style="margin-bottom: 6px;">
            <span style="color:#64748b; font-size:12px; display:block;">Jawaban Anda:</span>
            <div style="color: ${isCorrect ? '#166534' : '#991b1b'}; font-size: 14px;">
              ${userAnsText}
            </div>
          </div>
          
          <div style="border-top: 1px dashed #e2e8f0; padding-top: 6px; margin-top: 6px;">
            <span style="color:#64748b; font-size:12px; display:block;">Kunci Jawaban Benar:</span>
            <div style="color: #166534; font-size: 14px;">
              ${correctAnsText}
            </div>
          </div>
        </div>

        <!-- Teks Pembahasan -->
        <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px; font-size: 13px; color: #1e40af;">
          💡 <b>Pembahasan:</b><br>
          <div style="margin-top: 4px; color: #1e3a8a;">
            ${decodeHTML(discussionText)}
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  
  if (window.MathJax && window.MathJax.typesetPromise) {
    MathJax.typesetPromise([container]);
  }
}

window.toggleReviewDetail = function() {
  const area = document.getElementById("reviewDetailArea");
  const btn = document.getElementById("btnToggleDetail");
  if (area.style.display === "none") {
    area.style.display = "block";
    btn.innerText = "🙈 Sembunyikan Detail Pembahasan";
  } else {
    area.style.display = "none";
    btn.innerText = "🔍 Lihat Detail Pembahasan";
  }
};

// ================= NAVIGASI KEMBALI SEBELUMNYA =================
window.backToClass = function() {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.location.href = "materials.html";
  }
};
