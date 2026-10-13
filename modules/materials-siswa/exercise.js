import { auth, db, dbSecondary } from "../../firebase/firebase-config.js";
import { doc, getDoc, collection, query, where, getDocs, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const urlParams = new URLSearchParams(window.location.search);
const exerciseId = urlParams.get("id");

let currentStudent = null;
let studentClassId = "";
let currentSchoolId = "";
let questionsData = [];
let dbSubmission = null;
let currentQuestionIndex = 0;
let isSubmitting = false;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    alert("Silakan login terlebih dahulu.");
    return window.location = "../../login.html";
  }
  currentStudent = user;

  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (userSnap.exists()) {
      currentSchoolId = userSnap.data().schoolId || "";
    }
    const studentSnap = await getDoc(doc(db, "students", user.uid));
    if (studentSnap.exists()) {
      studentClassId = studentSnap.data().classId || "";
    }
  } catch (err) {
    console.error("Gagal memuat profil siswa:", err);
  }

  if (exerciseId) {
    loadExerciseData(exerciseId, user.uid);
  } else {
    document.getElementById("exerciseTitle").innerText = "Latihan tidak valid.";
  }
});

window.addEventListener("beforeunload", (event) => {
  if (!dbSubmission && !isSubmitting) {
    event.preventDefault();
    event.returnValue = "Jawaban Anda sudah tersinkronisasi ke Cloud. Yakin ingin keluar?";
    return event.returnValue;
  }
});

window.openFullscreen = () => {
  const elem = document.documentElement;
  if (elem.requestFullscreen) elem.requestFullscreen();
};

async function loadExerciseData(exId, studentUid) {
  try {
    const exSnap = await getDoc(doc(db, "exercises", exId));
    if (!exSnap.exists()) {
      alert("Latihan tidak ditemukan");
      return;
    }
    const exData = exSnap.data();
    
    const subSnap = await getDoc(doc(dbSecondary, "student_submissions", studentUid + "_" + exId));
    if (subSnap.exists()) {
      dbSubmission = subSnap.data();
    }

    document.getElementById("exerciseTitle").innerText = exData.title + (dbSubmission?.submittedAt ? " (Selesai Dikumpulkan)" : "");

    const qQuery = query(collection(db, "questions"), where("exerciseId", "==", exId));
    const qSnap = await getDocs(qQuery);
    questionsData = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    questionsData.sort((a, b) => {
      let waktuA = a.createdAt?.toDate?.()?.getTime() || new Date(a.createdAt).getTime() || 0;
      let waktuB = b.createdAt?.toDate?.()?.getTime() || new Date(b.createdAt).getTime() || 0;
      return waktuA - waktuB;
    });

    renderQuestions(questionsData, studentUid);
    
    setTimeout(() => {
      questionsData.forEach((q, index) => {
        const savedAttempts = dbSubmission?.attempts || {};
        const isLocked = dbSubmission?.submittedAt || savedAttempts[index] >= 1;
        if (isLocked) {
          lockQuestionFields(index);
          const explainEl = document.getElementById("explain_" + index);
          if (explainEl) explainEl.style.display = "block";
        }
      });
      updatePaginationState();
      checkAllQuestionsAnswered();
    }, 300);

  } catch (error) {
    console.error("Gagal memuat soal:", error);
    alert("Terjadi kesalahan saat memuat soal.");
  }
}

function renderQuestions(questions, studentUid) {
  const container = document.getElementById("exerciseContainer");
  const navPagination = document.getElementById("navPagination");
  const savedData = dbSubmission?.answers || {};
  const savedAttempts = dbSubmission?.attempts || {};
  
  let navHtml = "";
  let html = "";

  questions.forEach((qData, index) => {
    const savedAnswer = savedData[index];
    const isLocked = dbSubmission?.submittedAt ? true : (savedAttempts[index] >= 1);

    navHtml += `<button class="page-btn ${index === 0 ? 'active' : ''}" id="nav_btn_${index}" onclick="switchQuestion(${index})">Soal ${index + 1}</button>`;

    html += `<div class="question-card ${index === 0 ? 'active' : ''}" id="question_card_${index}">`;
    html += `<h3>Soal ${index + 1}. ${qData.question || ""}</h3>`;

    if (qData.type === "pg") {
      (qData.options || []).forEach((opt, i) => {
        const checked = savedAnswer == i ? "checked" : "";
        html += `<label><input type="radio" name="q${index}" value="${i}" ${checked} ${isLocked ? 'disabled' : ''} onchange="markAnswered(${index})"> <span>${opt}</span></label>`;
      });
    } else if (qData.type === "checkbox") {
      (qData.options || []).forEach((opt, i) => {
        const checked = Array.isArray(savedAnswer) && savedAnswer.includes(String(i)) ? "checked" : "";
        html += `<label><input type="checkbox" name="q${index}" value="${i}" ${checked} ${isLocked ? 'disabled' : ''} onchange="markAnswered(${index})"> <span>${opt}</span></label>`;
      });
    } else if (qData.type === "isian") {
      html += `<div style="margin-top:12px;"><input type="text" id="q${index}" value="${savedAnswer || ""}" placeholder="Tulis jawaban Anda..." ${isLocked ? 'disabled' : ''} oninput="markAnswered(${index})"></div>`;
    } else if (qData.type === "multi_isian") {
      (qData.fields || []).forEach((f, i) => {
        const val = savedAnswer?.[i] || "";
        html += `
          <div style="margin-top:12px">
            <span style="display:block; margin-bottom:6px; font-size:13px; font-weight:600; color:#334155;">${f.label}</span>
            <input type="text" name="multi_${index}_${i}" value="${val}" placeholder="Jawaban..." ${isLocked ? 'disabled' : ''} oninput="markAnswered(${index})">
          </div>
        `;
      });
    } else if (qData.type === "match") {
      const rightOptions = (qData.pairs || []).map(p => p.right);
      html += `<div class="match-container" id="match_${index}" data-locked="${isLocked}">`;
      (qData.pairs || []).forEach((p, i) => {
        const currentSelected = savedAnswer?.[i] || "";
        html += `
          <div class="match-row-mobile">
            <div class="match-left-text">${p.left}</div>
            <div>➔</div>
            <select class="match-select" data-question="${index}" data-left="${i}" ${isLocked ? 'disabled' : ''} onchange="markAnswered(${index})">
              <option value="">Pilih jawaban...</option>
              ${rightOptions.map(opt => `<option value="${opt}" ${currentSelected === opt ? 'selected' : ''}>${opt}</option>`).join('')}
            </select>
          </div>
        `;
      });
      html += `</div>`;
    } else if (qData.type === "matrix" && qData.matrix) {
      html += `
        <div class="matrix-table-wrapper">
          <table class="matrix-table">
            <thead>
              <tr>
                <th>Pernyataan</th>
                ${qData.matrix.columns.map(col => `<th>${col}</th>`).join("")}
              </tr>
            </thead>
            <tbody>
              ${qData.matrix.rows.map((row, rIdx) => `
                <tr>
                  <td>${row.statement}</td>${qData.matrix.columns.map((_, cIdx) => {
                    const isChecked = savedAnswer?.[rIdx] == cIdx ? "checked" : "";
                    return `
                      <td>
                        <input type="radio" name="matrix_${index}_${rIdx}" value="${cIdx}" ${isChecked} ${isLocked ? 'disabled' : ''} onchange="markAnswered(${index})">
                      </td>
                    `;
                  }).join("")}
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
    }

    html += `
        <button class="check-btn" id="btn_check_${index}" onclick="checkAnswer(${index})" ${isLocked ? 'style="background:#cbd5e1; cursor:not-allowed;" disabled' : ''}>✅ Cek Jawaban</button>
        <span class="attempts-info" id="attempts_text_${index}">${isLocked ? '🔒 Soal Terkunci' : '⚠️ Hanya bisa dicek 1 kali'}</span>
        <div id="result_${index}" style="margin-top:10px;font-weight:700;font-size:13px;"></div>
        <div id="explain_${index}" style="margin-top:12px; ${isLocked ? 'display:block;' : 'display:none;'}">
          <button onclick="toggleExplain(${index})" style="background:#059669; color:white; padding:8px 14px; border-radius:8px; font-size:12px; font-weight:600; cursor:pointer;">📘 Lihat Pembahasan</button>
          <div id="explain_content_${index}" style="display:none; margin-top:10px; background:#f8fafc; border:1px solid #e2e8f0; padding:14px; border-radius:10px; font-size:13px; line-height:1.6; color:#334155;">
            ${qData.explanation || "Belum ada pembahasan."}
          </div>
        </div>

        <div class="nav-bottom-group">
          <button class="nav-btn" onclick="prevQuestion()" ${index === 0 ? 'style="opacity:0.4; pointer-events:none;"' : ''}>⬅️ Sebelumnya</button>
          <button class="nav-btn" onclick="nextQuestion()" ${index === questions.length - 1 ? 'style="opacity:0.4; pointer-events:none;"' : ''}>Selanjutnya ➡️</button>
        </div>
      </div>`;
  });

  html += `
      <button class="submit-btn" id="final_submit_btn" onclick="submitToFirebase()" style="background:#cbd5e1; cursor:not-allowed; opacity:0.6;" disabled>
        📤 Kirim Nilai ke Guru (Selesaikan Semua Soal)
      </button>
  `;

  navPagination.innerHTML = navHtml;
  container.innerHTML = html;

  if (window.MathJax && typeof MathJax.typeset === "function") {
    MathJax.typeset();
  }
}

window.switchQuestion = function(index) {
  document.querySelectorAll(".question-card").forEach(card => card.classList.remove("active"));
  document.querySelectorAll(".page-btn").forEach(btn => btn.classList.remove("active"));

  document.getElementById("question_card_" + index).classList.add("active");
  document.getElementById("nav_btn_" + index).classList.add("active");
  currentQuestionIndex = index;
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.nextQuestion = function() {
  if (currentQuestionIndex < questionsData.length - 1) {
    switchQuestion(currentQuestionIndex + 1);
  }
};

window.prevQuestion = function() {
  if (currentQuestionIndex > 0) {
    switchQuestion(currentQuestionIndex - 1);
  }
};

window.markAnswered = function(index) {
  if (dbSubmission?.submittedAt) return;
  const q = questionsData[index];
  let userAnswer = null;

  if (q.type === "pg") {
    const selected = document.querySelector('input[name="q' + index + '"]:checked');
    if (selected) userAnswer = selected.value;
  } else if (q.type === "checkbox") {
    userAnswer = [...document.querySelectorAll('input[name="q' + index + '"]:checked')].map(x => x.value);
  } else if (q.type === "isian") {
    const el = document.getElementById("q" + index);
    if (el) userAnswer = el.value.trim();
  } else if (q.type === "multi_isian") {
    userAnswer = [];
    (q.fields || []).forEach((_, i) => {
      const el = document.querySelector('[name="multi_' + index + '_' + i + '"]');
      userAnswer.push(el ? el.value.trim() : "");
    });
  } else if (q.type === "match") {
    userAnswer = {};
    document.querySelectorAll(`select[data-question="${index}"]`).forEach(sel => {
      userAnswer[sel.getAttribute("data-left")] = sel.value;
    });
  } else if (q.type === "matrix") {
    userAnswer = {};
    q.matrix.rows.forEach((_, rIdx) => {
      const checked = document.querySelector(`input[name="matrix_${index}_${rIdx}"]:checked`);
      userAnswer[rIdx] = checked ? parseInt(checked.value) : null;
    });
  }

  saveAnswerToCloud(index, userAnswer);
  updatePaginationState();
  checkAllQuestionsAnswered();
};

async function saveAnswerToCloud(index, value) {
  if (dbSubmission?.submittedAt || !currentStudent) return;
  const studentUid = currentStudent.uid;
  
  const existingAnswers = dbSubmission?.answers || {};
  existingAnswers[index] = value;

  if (!dbSubmission) {
    dbSubmission = { answers: existingAnswers };
  } else {
    dbSubmission.answers = existingAnswers;
  }

  try {
    const docRef = doc(dbSecondary, "student_submissions", studentUid + "_" + exerciseId);
    await setDoc(docRef, {
      studentUid: String(studentUid),
      exerciseId: String(exerciseId),
      classId: String(studentClassId),
      schoolId: String(currentSchoolId),
      answers: existingAnswers,
      updatedAt: new Date()
    }, { merge: true });
  } catch (err) {
    console.error("Gagal auto-sync jawaban ke cloud:", err);
  }
}

function updatePaginationState() {
  const savedAnswers = dbSubmission?.answers || {};

  questionsData.forEach((q, index) => {
    const btn = document.getElementById("nav_btn_" + index);
    if (!btn) return;
    
    const ans = savedAnswers[index];
    let isAnswered = isAnswerValid(q, ans);

    if (isAnswered) {
      btn.classList.add("answered");
    } else {
      btn.classList.remove("answered");
    }
  });
}

function isAnswerValid(q, ans) {
  if (ans === undefined || ans === null) return false;
  if (q.type === "pg" || q.type === "isian") {
    return ans !== "";
  } else if (q.type === "checkbox") {
    return Array.isArray(ans) && ans.length > 0;
  } else if (q.type === "multi_isian") {
    return Array.isArray(ans) && ans.every(v => v && v.trim() !== "");
  } else if (q.type === "match") {
    return typeof ans === "object" && Object.keys(ans).length === (q.pairs || []).length && Object.values(ans).every(v => v !== "");
  } else if (q.type === "matrix") {
    return typeof ans === "object" && Object.keys(ans).length === (q.matrix?.rows || []).length && Object.values(ans).every(v => v !== null && v !== undefined);
  }
  return false;
}

function checkAllQuestionsAnswered() {
  if (dbSubmission?.submittedAt) return;
  const savedAnswers = dbSubmission?.answers || {};

  let allAnswered = true;
  questionsData.forEach((q, index) => {
    const ans = savedAnswers[index];
    if (!isAnswerValid(q, ans)) {
      allAnswered = false;
    }
  });

  const submitBtn = document.getElementById("final_submit_btn");
  if (!submitBtn) return;

  if (allAnswered && questionsData.length > 0) {
    submitBtn.disabled = false;
    submitBtn.style.background = "#059669";
    submitBtn.style.cursor = "pointer";
    submitBtn.style.opacity = "1";
    submitBtn.innerText = "📤 Kirim Nilai ke Guru";
  } else {
    submitBtn.disabled = true;
    submitBtn.style.background = "#cbd5e1";
    submitBtn.style.cursor = "not-allowed";
    submitBtn.style.opacity = "0.6";
    submitBtn.innerText = "📤 Kirim Nilai ke Guru (Selesaikan Semua Soal)";
  }
}

window.checkAnswer = async function(index) {
  if (dbSubmission?.submittedAt) return alert("Latihan sudah dikumpulkan!");
  const studentUid = currentStudent.uid;
  const q = questionsData[index];
  
  let attempts = dbSubmission?.attempts || {};
  attempts[index] = 1;
  
  if (!dbSubmission) dbSubmission = {};
  dbSubmission.attempts = attempts;

  document.getElementById("attempts_text_" + index).innerText = "🔒 Soal Terkunci";

  let correct = false;
  let userAnswer = null;

  if (q.type === "pg") {
    const selected = document.querySelector('input[name="q' + index + '"]:checked');
    if (!selected) return alert("Pilih opsi jawaban terlebih dahulu!");
    userAnswer = selected.value;
    correct = userAnswer == q.answer;
  } else if (q.type === "checkbox") {
    const checked = [...document.querySelectorAll('input[name="q' + index + '"]:checked')].map(x => x.value);
    userAnswer = checked;
    correct = JSON.stringify(checked.sort()) === JSON.stringify((q.answer || []).map(String).sort());
  } else if (q.type === "isian") {
    const input = document.getElementById("q" + index);
    userAnswer = input.value.trim();
    correct = userAnswer.toLowerCase() === String(q.answer).toLowerCase();
  } else if (q.type === "multi_isian") {
    userAnswer = [];
    let totalCorrect = 0;
    (q.fields || []).forEach((f, i) => {
      const val = document.querySelector('[name="multi_' + index + '_' + i + '"]').value.trim();
      userAnswer.push(val);
      if (val.toLowerCase() === String(f.answer).toLowerCase()) totalCorrect++;
    });
    correct = totalCorrect === q.fields.length;
  } else if (q.type === "match") {
    userAnswer = {};
    let totalCorrect = 0;
    document.querySelectorAll(`select[data-question="${index}"]`).forEach(sel => {
      const leftIdx = sel.getAttribute("data-left");
      const val = sel.value;
      userAnswer[leftIdx] = val;
    });
    (q.pairs || []).forEach((p, i) => {
      if (userAnswer[i] === p.right) totalCorrect++;
    });
    correct = totalCorrect === q.pairs.length;
  } else if (q.type === "matrix") {
    userAnswer = {};
    let totalCorrect = 0;
    q.matrix.rows.forEach((row, rIdx) => {
      const checked = document.querySelector(`input[name="matrix_${index}_${rIdx}"]:checked`);
      const val = checked ? parseInt(checked.value) : null;
      userAnswer[rIdx] = val;
      if (val === row.answerKey) totalCorrect++;
    });
    correct = totalCorrect === q.matrix.rows.length;
  }

  await saveAnswerToCloud(index, userAnswer);
  try {
    const docRef = doc(dbSecondary, "student_submissions", studentUid + "_" + exerciseId);
    await setDoc(docRef, { attempts: attempts }, { merge: true });
  } catch (err) {
    console.error("Gagal memperbarui status attempts:", err);
  }

  const result = document.getElementById("result_" + index);
  if (correct) {
    result.innerHTML = "✅ Jawaban Benar";
    result.style.color = "#059669";
  } else {
    result.innerHTML = "❌ Jawaban Salah";
    result.style.color = "#dc2626";
  }

  lockQuestionFields(index);
  document.getElementById("explain_" + index).style.display = "block";
  updatePaginationState();
  checkAllQuestionsAnswered();
};

window.lockQuestionFields = function(index) {
  const btn = document.getElementById("btn_check_" + index);
  if (btn) {
    btn.disabled = true;
    btn.style.background = "#cbd5e1";
    btn.style.cursor = "not-allowed";
  }
  document.querySelectorAll('input[name="q' + index + '"]').forEach(el => el.disabled = true);
  const isian = document.getElementById("q" + index);
  if (isian) isian.disabled = true;
  document.querySelectorAll('[name^="multi_' + index + '_"]').forEach(el => el.disabled = true);
  document.querySelectorAll(`input[name^="matrix_${index}_"]`).forEach(el => el.disabled = true);
  document.querySelectorAll(`select[data-question="${index}"]`).forEach(el => el.disabled = true);
};

window.toggleExplain = function(index) {
  const el = document.getElementById("explain_content_" + index);
  const isHidden = el.style.display === "none" || el.style.display === "";
  el.style.display = isHidden ? "block" : "none";

  if (isHidden && window.MathJax && typeof MathJax.typeset === "function") {
    MathJax.typeset([el]);
  }
};

window.submitToFirebase = async function() {
  if (dbSubmission?.submittedAt) return;
  isSubmitting = true;

  const studentUid = currentStudent.uid;
  let totalBenar = 0;
  const savedAnswers = dbSubmission?.answers || {};

  questionsData.forEach((q, index) => {
    const uAns = savedAnswers[index];
    if (uAns === undefined || uAns === null) return;

    if (q.type === "pg" && uAns == q.answer) {
      totalBenar++;
    } else if (q.type === "isian" && String(uAns).toLowerCase() === String(q.answer).toLowerCase()) {
      totalBenar++;
    } else if (q.type === "checkbox") {
      if (JSON.stringify([...uAns].sort()) === JSON.stringify((q.answer || []).map(String).sort())) totalBenar++;
    } else if (q.type === "multi_isian") {
      let multiCorrect = 0;
      (q.fields || []).forEach((f, i) => {
        if (uAns[i] && uAns[i].toLowerCase() === String(f.answer).toLowerCase()) multiCorrect++;
      });
      if (multiCorrect === q.fields.length) totalBenar++;
    } else if (q.type === "match") {
      let matchCorrect = 0;
      (q.pairs || []).forEach((p, i) => {
        if (uAns[i] === p.right) matchCorrect++;
      });
      if (matchCorrect === q.pairs.length) totalBenar++;
    } else if (q.type === "matrix") {
      let matrixCorrect = 0;
      q.matrix.rows.forEach((row, rIdx) => {
        if (uAns[rIdx] === row.answerKey) matrixCorrect++;
      });
      if (matrixCorrect === q.matrix.rows.length) totalBenar++;
    }
  });

  const score = questionsData.length > 0 ? Math.round((totalBenar / questionsData.length) * 100) : 0;

  const cleanedAnswers = {};
  Object.keys(savedAnswers).forEach(k => {
    if (savedAnswers[k] !== undefined) {
      cleanedAnswers[k] = savedAnswers[k];
    }
  });

  const submissionData = {
    studentUid: String(studentUid),
    exerciseId: String(exerciseId),
    classId: String(studentClassId),
    schoolId: String(currentSchoolId),
    answers: cleanedAnswers,
    score: Number(score),
    totalQuestions: Number(questionsData.length),
    correctAnswers: Number(totalBenar),
    submittedAt: new Date()
  };

  try {
    await setDoc(doc(dbSecondary, "student_submissions", studentUid + "_" + exerciseId), submissionData, { merge: true });
    
    // Tampilkan Modal Popup Kustom yang Elegan
    document.getElementById("modalScoreValue").innerText = score;
    document.getElementById("resultModal").classList.add("active");

  } catch (error) {
    console.error("Gagal mengirim:", error);
    isSubmitting = false;
    alert("Gagal mengirim jawaban ke database: " + error.message);
  }
};
