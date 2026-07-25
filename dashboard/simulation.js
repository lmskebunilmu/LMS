import { auth, db } from "../firebase/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, addDoc, collection } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* =========================
   GLOBAL STATE
========================= */
const simId = new URLSearchParams(window.location.search).get("id");
let simData = null;
let questions = [];
let userAnswers = {}; // { 0: answer, 1: answer }
let doubtStatus = {}; // { 0: true, 1: false } -> menyimpan status ragu-ragu
let currentIndex = 0;
let timerInterval = null;
let timeRemaining = 0; 
let currentUser = null;

/* =========================
   AUTH CHECK
========================= */
onAuthStateChanged(auth, async (user) => {
  if (!user) return (window.location = "../login.html");
  currentUser = user;

  if (!simId) {
    alert("ID Simulasi tidak ditemukan!");
    window.history.back();
    return;
  }

  await loadSimulationData();
});

/* =========================
   LOAD SIMULASI
========================= */
async function loadSimulationData() {
  try {
    const docSnap = await getDoc(doc(db, "simulations", simId));
    if (!docSnap.exists()) {
      alert("Simulasi tidak ditemukan!");
      return;
    }

    simData = docSnap.data();
    questions = simData.questions || [];

    if (questions.length === 0) {
      alert("Simulasi ini belum memiliki soal.");
      window.history.back();
      return;
    }

    if (simData.randomizeQuestions) {
      questions = shuffleArray([...questions]);
    }

    const titleText = simData.title || "Simulasi Ujian";
    const metaText = `⏱ Durasi: ${simData.durationMinutes || 60} Menit | 📝 Total: ${questions.length} Soal | KKM: ${simData.passingGrade || 75}%`;

    document.getElementById("startSimTitle").innerText = titleText;
    document.getElementById("startSimMeta").innerText = metaText;

    document.getElementById("simTitle").innerText = titleText;
    document.getElementById("simMeta").innerText = `${questions.length} Soal | KKM: ${simData.passingGrade || 75}%`;

    timeRemaining = (simData.durationMinutes || 60) * 60;

    renderGridNav();
    loadQuestion(0);

  } catch (err) {
    console.error("Gagal memuat simulasi:", err);
    alert("Gagal memuat data simulasi.");
  }
}

/* =========================
   FULLSCREEN & START LOGIC
========================= */
window.startExamWithFullscreen = function () {
  const docEl = document.documentElement;
  if (docEl.requestFullscreen) {
    docEl.requestFullscreen().catch(err => console.log("Fullscreen diblokir"));
  } else if (docEl.webkitRequestFullscreen) {
    docEl.webkitRequestFullscreen();
  }

  document.getElementById("startModal").style.display = "none";
  document.getElementById("cbtHeader").classList.remove("blur-content");
  document.getElementById("cbtMainContainer").classList.remove("blur-content");

  startTimer();
};

/* =========================
   TIMER LOGIC
========================= */
function startTimer() {
  const timerDisplay = document.getElementById("timerDisplay");

  timerInterval = setInterval(() => {
    timeRemaining--;

    const hours = Math.floor(timeRemaining / 3600);
    const minutes = Math.floor((timeRemaining % 3600) / 60);
    const seconds = timeRemaining % 60;

    timerDisplay.innerText = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

    if (timeRemaining <= 0) {
      clearInterval(timerInterval);
      alert("Waktu simulasi telah habis!");
      finishSimulation();
    }
  }, 1000);
}

/* =========================
   RENDER SOAL PER NOMOR
========================= */
function loadQuestion(index) {
  currentIndex = index;
  const q = questions[index];

  document.getElementById("questionNumberHeader").innerText = `Soal No. ${index + 1} dari ${questions.length}`;
  document.getElementById("questionText").innerText = q.question || "";

  const area = document.getElementById("answerOptionsArea");
  area.innerHTML = "";

  // 1. Tipe PG (Radio Button)
  if (q.type === "pg" && q.options) {
    q.options.forEach((opt, optIdx) => {
      const isChecked = userAnswers[index] === optIdx;
      area.innerHTML += `
        <label class="opt-label">
          <input type="radio" name="opt_pg" value="${optIdx}" ${isChecked ? "checked" : ""} onchange="window.saveAnswer(${optIdx})">
          <span><b>${String.fromCharCode(65 + optIdx)}.</b> ${opt}</span>
        </label>
      `;
    });
  }

  // 2. Tipe Checkbox (Multi Jawaban)
  else if (q.type === "checkbox" && q.options) {
    const selectedList = userAnswers[index] || [];
    q.options.forEach((opt, optIdx) => {
      const isChecked = selectedList.includes(optIdx);
      area.innerHTML += `
        <label class="opt-label">
          <input type="checkbox" value="${optIdx}" ${isChecked ? "checked" : ""} onchange="window.saveCheckboxAnswer()">
          <span><b>${String.fromCharCode(65 + optIdx)}.</b> ${opt}</span>
        </label>
      `;
    });
  }

  // 3. Tipe Matrix (Tabel Pernyataan)
  else if (q.type === "matrix" && q.columns && q.rows) {
    const currentMatrixAns = userAnswers[index] || {};
    let tableHtml = `
      <div class="cbt-table-wrapper">
        <table class="cbt-table">
          <thead>
            <tr>
              <th>${q.statementTitle || "Pernyataan"}</th>
              ${q.columns.map(col => `<th>${col}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
    `;

    q.rows.forEach((row, rIdx) => {
      tableHtml += `
        <tr>
          <td>${row.statement}</td>
          ${q.columns.map((_, cIdx) => `
            <td style="text-align:center;">
              <input type="radio" name="matrix_row_${rIdx}" ${currentMatrixAns[rIdx] === cIdx ? "checked" : ""} onchange="window.saveMatrixAnswer(${rIdx}, ${cIdx})">
            </td>
          `).join('')}
        </tr>
      `;
    });

    tableHtml += `</tbody></table></div>`;
    area.innerHTML = tableHtml;
  }

  // 4. Tipe Menjodohkan (Matching) - Ditingkatkan toleransi struktur datanya
  else if (q.type === "matching") {
    const leftItems = q.leftItems || q.left || [];
    const rightItems = q.rightItems || q.right || [];
    const currentMatchingAns = userAnswers[index] || {};

    if (leftItems.length === 0 || rightItems.length === 0) {
      area.innerHTML = `<div style="color:#ef4444; padding:10px;">Data item soal menjodohkan belum lengkap.</div>`;
    } else {
      let tableHtml = `
        <div class="cbt-table-wrapper">
          <table class="cbt-table">
            <thead>
              <tr>
                <th style="width: 50%;">Pernyataan / Item</th>
                <th style="width: 50%;">Pasangan Jawaban</th>
              </tr>
            </thead>
            <tbody>
      `;

      leftItems.forEach((leftItem, lIdx) => {
        tableHtml += `
          <tr>
            <td><b>${lIdx + 1}.</b> ${leftItem}</td>
            <td>
              <select style="width:100%; padding:8px; border-radius:6px; border:1px solid #cbd5e1;" onchange="window.saveMatchingAnswer(${lIdx}, this.value)">
                <option value="">-- Pilih Pasangan --</option>
                ${rightItems.map((rOpt, rIdx) => `
                  <option value="${rIdx}" ${currentMatchingAns[lIdx] == rIdx ? "selected" : ""}>
                    ${String.fromCharCode(65 + rIdx)}. ${rOpt}
                  </option>
                `).join('')}
              </select>
            </td>
          </tr>
        `;
      });

      tableHtml += `</tbody></table></div>`;
      area.innerHTML = tableHtml;
    }
  }

  // 5. Tipe Isian
  else if (q.type === "isian") {
    const val = userAnswers[index] || "";
    area.innerHTML = `
      <input type="text" value="${val}" placeholder="Ketikkan jawaban Anda..." 
        style="width:100%; padding:14px; border:1px solid #cbd5e1; border-radius:10px; font-size:14px;"
        oninput="window.saveAnswer(this.value)">
    `;
  }

  updateGridNav();
  updateNavButtons();

  if (window.MathJax) {
    MathJax.typesetPromise([document.getElementById("questionText"), area]);
  }
}

/* =========================
   SAVE JAWABAN LOGIC (Didaftarkan ke window agar bisa diakses HTML)
========================= */
window.saveAnswer = function (val) {
  userAnswers[currentIndex] = val;
  updateGridNav();
};

window.saveCheckboxAnswer = function () {
  const checkedEls = document.querySelectorAll('#answerOptionsArea input[type="checkbox"]:checked');
  const values = Array.from(checkedEls).map(el => parseInt(el.value));
  userAnswers[currentIndex] = values.length > 0 ? values : undefined;
  updateGridNav();
};

window.saveMatrixAnswer = function (rowIdx, colIdx) {
  if (!userAnswers[currentIndex]) userAnswers[currentIndex] = {};
  userAnswers[currentIndex][rowIdx] = colIdx;
  updateGridNav();
};

window.saveMatchingAnswer = function (leftIdx, rightIdxVal) {
  if (!userAnswers[currentIndex]) userAnswers[currentIndex] = {};
  if (rightIdxVal === "") {
    delete userAnswers[currentIndex][leftIdx];
  } else {
    userAnswers[currentIndex][leftIdx] = parseInt(rightIdxVal);
  }
  updateGridNav();
};

/* =========================
   TOGGLE RAGU-RAGU & DRAWER
========================= */
window.toggleDoubt = function () {
  doubtStatus[currentIndex] = !doubtStatus[currentIndex];
  updateGridNav();
};

window.toggleNavDrawer = function () {
  const drawer = document.getElementById("navDrawerOverlay");
  if (!drawer) return;
  drawer.style.display = (drawer.style.display === "flex") ? "none" : "flex";
};

/* =========================
   NAVIGASI GRID & BUTTONS
========================= */
function renderGridNav() {
  const container = document.getElementById("gridNumbers");
  container.innerHTML = "";

  questions.forEach((_, idx) => {
    const box = document.createElement("div");
    box.className = `num-box`;
    box.id = `grid-num-${idx}`;
    box.innerText = idx + 1;
    box.onclick = () => {
      loadQuestion(idx);
      window.toggleNavDrawer(); // Menutup drawer setelah memilih nomor
    };
    container.appendChild(box);
  });
}

function updateGridNav() {
  questions.forEach((_, idx) => {
    const box = document.getElementById(`grid-num-${idx}`);
    if (!box) return;

    box.className = "num-box";
    
    const hasAnswered = userAnswers[idx] !== undefined && userAnswers[idx] !== "" && Object.keys(userAnswers[idx]).length > 0;
    const isDoubt = doubtStatus[idx];

    if (idx === currentIndex) box.classList.add("active");

    // Aturan Warna: Ragu = Kuning, Terjawab = Biru, Belum = Putih
    if (isDoubt) {
      box.classList.add("doubt");
    } else if (hasAnswered) {
      box.classList.add("answered");
    }
  });

  // Ganti style/label tombol ragu-ragu
  const btnDoubt = document.getElementById("btnDoubt");
  if (btnDoubt) {
    if (doubtStatus[currentIndex]) {
      btnDoubt.style.opacity = "0.7";
      btnDoubt.innerText = "✓ Ragu-Ragu";
    } else {
      btnDoubt.style.opacity = "1";
      btnDoubt.innerText = "🟧 Ragu-Ragu";
    }
  }
}

function updateNavButtons() {
  document.getElementById("btnPrev").style.visibility = currentIndex === 0 ? "hidden" : "visible";
  document.getElementById("btnNext").style.visibility = currentIndex === questions.length - 1 ? "hidden" : "visible";
}

window.nextQuestion = () => { if (currentIndex < questions.length - 1) loadQuestion(currentIndex + 1); };
window.prevQuestion = () => { if (currentIndex > 0) loadQuestion(currentIndex - 1); };

/* =========================
   FINISH & PENILAIAN
========================= */
window.confirmFinish = function () {
  const totalAnswered = Object.keys(userAnswers).filter(k => userAnswers[k] !== undefined && Object.keys(userAnswers[k]).length > 0).length;
  if (confirm(`Anda telah menjawab ${totalAnswered} dari ${questions.length} soal. Yakin ingin menyelesaikan simulasi?`)) {
    finishSimulation();
  }
};

async function finishSimulation() {
  clearInterval(timerInterval);

  if (document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }

  let totalCorrect = 0;

  questions.forEach((q, idx) => {
    const uAns = userAnswers[idx];

    if (q.type === "pg" && uAns === q.answer) {
      totalCorrect++;
    } else if (q.type === "checkbox" && Array.isArray(uAns) && Array.isArray(q.answer)) {
      if (JSON.stringify(uAns.sort()) === JSON.stringify(q.answer.sort())) totalCorrect++;
    } else if (q.type === "matrix" && typeof uAns === "object" && q.rows) {
      let isAllRowCorrect = true;
      q.rows.forEach((r, rIdx) => {
        if (uAns[rIdx] !== r.answer) isAllRowCorrect = false;
      });
      if (isAllRowCorrect) totalCorrect++;
    } else if (q.type === "matching" && typeof uAns === "object" && q.leftItems) {
      let isAllMatchCorrect = true;
      q.leftItems.forEach((_, lIdx) => {
        if (q.answers && uAns[lIdx] !== q.answers[lIdx]) isAllMatchCorrect = false;
      });
      if (isAllMatchCorrect) totalCorrect++;
    } else if (q.type === "isian" && typeof uAns === "string") {
      if (uAns.trim().toLowerCase() === String(q.answer || "").trim().toLowerCase()) totalCorrect++;
    }
  });

  const finalScore = Math.round((totalCorrect / questions.length) * 100);
  const isPassed = finalScore >= (simData.passingGrade || 75);

  try {
    await addDoc(collection(db, "simulation_results"), {
      simulationId: simId,
      studentId: currentUser.uid,
      score: finalScore,
      correctCount: totalCorrect,
      totalQuestions: questions.length,
      isPassed,
      completedAt: new Date()
    });
  } catch (err) {
    console.error("Gagal menyimpan hasil:", err);
  }

  document.getElementById("finalScore").innerText = finalScore;
  const statusEl = document.getElementById("passingStatus");
  statusEl.innerText = isPassed ? "LULUS (Memenuhi KKM)" : "BELUM LULUS";
  statusEl.style.color = isPassed ? "#16a34a" : "#ef4444";

  const drawer = document.getElementById("navDrawerOverlay");
  if (drawer) drawer.style.display = "none";
  
  document.getElementById("resultModal").style.display = "flex";
}

window.backToClass = function () {
  window.history.back();
};

function shuffleArray(array) {
  return array.sort(() => Math.random() - 0.5);
}
