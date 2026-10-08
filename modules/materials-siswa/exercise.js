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
let selectedLeft = null;
window.matchAnswers = {};

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

window.openFullscreen = () => {
  const elem = document.documentElement;
  if (elem.requestFullscreen) elem.requestFullscreen();
};

async function loadExerciseData(exId, studentUid) {
  try {
    // Ambil soal dari Firebase UTAMA (db)
    const exSnap = await getDoc(doc(db, "exercises", exId));
    if (!exSnap.exists()) {
      alert("Latihan tidak ditemukan");
      return;
    }
    const exData = exSnap.data();
    
    // Cek riwayat pengerjaan dari Firebase KEDUA (dbSecondary) jika ingin tersinkron di sana
    const subSnap = await getDoc(doc(dbSecondary, "student_submissions", studentUid + "_" + exId));
    if (subSnap.exists()) dbSubmission = subSnap.data();

    document.getElementById("exerciseTitle").innerText = exData.title + (dbSubmission ? " (Selesai Dikumpulkan)" : "");

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
      restoreMatchAnswers(studentUid);
      questionsData.forEach((q, index) => {
        const attemptKey = "attempts_" + exerciseId + "_" + studentUid;
        const attempts = JSON.parse(localStorage.getItem(attemptKey) || "{}");
        if (dbSubmission || attempts[index] >= 1) {
          lockQuestionFields(index);
          const explainEl = document.getElementById("explain_" + index);
          if (explainEl) explainEl.style.display = "block";
        }
      });
    }, 300);

  } catch (error) {
    console.error("Gagal memuat soal:", error);
    alert("Terjadi kesalahan saat memuat soal.");
  }
}

function renderQuestions(questions, studentUid) {
  const container = document.getElementById("exerciseContainer");
  const savedData = dbSubmission?.answers || JSON.parse(localStorage.getItem(`exercise_${exerciseId}_${studentUid}`) || "{}");
  const savedAttempts = JSON.parse(localStorage.getItem(`attempts_${exerciseId}_${studentUid}`) || "{}");
  
  let html = "";
  questions.forEach((qData, index) => {
    const savedAnswer = savedData[index];
    const currentAttempts = dbSubmission ? 1 : (savedAttempts[index] || 0);
    const isLocked = currentAttempts >= 1;

    html += `<div class="question"><h3>Soal ${index + 1}. ${qData.question || ""}</h3>`;

    if (qData.type === "pg") {
      (qData.options || []).forEach((opt, i) => {
        const checked = savedAnswer == i ? "checked" : "";
        html += `<label><input type="radio" name="q${index}" value="${i}" ${checked} ${isLocked ? 'disabled' : ''}> ${opt}</label>`;
      });
    } else if (qData.type === "checkbox") {
      (qData.options || []).forEach((opt, i) => {
        const checked = Array.isArray(savedAnswer) && savedAnswer.includes(String(i)) ? "checked" : "";
        html += `<label><input type="checkbox" name="q${index}" value="${i}" ${checked} ${isLocked ? 'disabled' : ''}> ${opt}</label>`;
      });
    } else if (qData.type === "isian") {
      html += `<input type="text" id="q${index}" value="${savedAnswer || ""}" placeholder="Tulis jawaban Anda..." ${isLocked ? 'disabled' : ''}>`;
    } else if (qData.type === "multi_isian") {
      (qData.fields || []).forEach((f, i) => {
        const val = savedAnswer?.[i] || "";
        html += `
          <div style="margin-top:12px">
            <label style="display:block; margin-bottom:6px; font-weight:600; background:none; padding:0; border:none;">${f.label}</label>
            <input type="text" name="multi_${index}_${i}" value="${val}" placeholder="Jawaban..." ${isLocked ? 'disabled' : ''}>
          </div>
        `;
      });
    } else if (qData.type === "match") {
      const shuffled = [...(qData.pairs || [])].sort(() => Math.random() - 0.5);
      html += `
        <div class="match-wrapper" id="match_${index}" data-locked="${isLocked}">
          <svg class="match-lines"></svg>
          <div class="match-column">
            ${(qData.pairs || []).map((p, i) => `<div class="match-item left-item" data-question="${index}" data-left="${i}">${p.left}</div>`).join("")}
          </div>
          <div class="match-column">
            ${shuffled.map((p, i) => `<div class="match-item right-item" data-question="${index}" data-right="${p.right}">${p.right}</div>`).join("")}
          </div>
        </div>
      `;
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
                        <input type="radio" name="matrix_${index}_${rIdx}" value="${cIdx}" ${isChecked} ${isLocked ? 'disabled' : ''}>
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
      <div style="margin-top:16px">
        <button id="btn_check_${index}" onclick="checkAnswer(${index})" style="background:#4f46e5; color:white; padding:10px 16px; border-radius:10px;" ${isLocked ? 'disabled style="background:#cbd5e1; cursor:not-allowed;"' : ''}>✅ Cek Jawaban</button>
        <span class="attempts-info" id="attempts_text_${index}">${isLocked ? '🔒 Soal Terkunci' : '⚠️ Hanya bisa dicek 1 kali'}</span>
        <div id="result_${index}" style="margin-top:10px;font-weight:bold;font-size:14px;"></div>
        <div id="explain_${index}" style="margin-top:12px; ${isLocked ? 'display:block;' : 'display:none;'}">
          <button onclick="toggleExplain(${index})" style="background:#10b981; color:white; padding:10px 16px; border-radius:10px;">📘 Lihat Pembahasan</button>
          <div id="explain_content_${index}" style="display:none; margin-top:10px; background:#f8fafc; border:1px solid #e2e8f0; padding:14px; border-radius:10px; font-size:13px; line-height:1.6;">
            ${qData.explanation || "Belum ada pembahasan."}
          </div>
        </div>
      </div>
    </div>`;
  });

  html += `
      <button class="submit-btn" id="final_submit_btn" onclick="submitToFirebase()" ${dbSubmission ? 'disabled style="background:#cbd5e1; cursor:not-allowed;"' : ''}>
        ${dbSubmission ? '🔒 Jawaban Telah Disimpan' : '📤 Kirim Nilai ke Guru'}
      </button>
    </div>
  `;
  container.innerHTML = html;

  if (window.MathJax && typeof MathJax.typeset === "function") {
    MathJax.typeset();
  }
}

function saveAnswer(index, value) {
  if (dbSubmission) return;
  const studentUid = currentStudent.uid;
  const key = "exercise_" + exerciseId + "_" + studentUid;
  const data = JSON.parse(localStorage.getItem(key) || "{}");
  data[index] = value;
  localStorage.setItem(key, JSON.stringify(data));
}

window.checkAnswer = function(index) {
  if (dbSubmission) return alert("Latihan sudah dikumpulkan!");
  const studentUid = currentStudent.uid;
  const q = questionsData[index];
  
  const attemptKey = "attempts_" + exerciseId + "_" + studentUid;
  let attempts = JSON.parse(localStorage.getItem(attemptKey) || "{}");
  attempts[index] = 1;
  localStorage.setItem(attemptKey, JSON.stringify(attempts));

  document.getElementById("attempts_text_" + index).innerText = "🔒 Soal Terkunci";

  let correct = false;
  let userAnswer = null;

  if (q.type === "pg") {
    const selected = document.querySelector('input[name="q' + index + '"]:checked');
    if (!selected) return alert("Pilih opsi jawaban terlebih dahulu!");
    userAnswer = selected.value;
    saveAnswer(index, userAnswer);
    correct = userAnswer == q.answer;
  } else if (q.type === "checkbox") {
    const checked = [...document.querySelectorAll('input[name="q' + index + '"]:checked')].map(x => x.value);
    userAnswer = checked;
    saveAnswer(index, userAnswer);
    correct = JSON.stringify(checked.sort()) === JSON.stringify((q.answer || []).map(String).sort());
  } else if (q.type === "isian") {
    const input = document.getElementById("q" + index);
    userAnswer = input.value.trim();
    saveAnswer(index, userAnswer);
    correct = userAnswer.toLowerCase() === String(q.answer).toLowerCase();
  } else if (q.type === "multi_isian") {
    userAnswer = [];
    let totalCorrect = 0;
    (q.fields || []).forEach((f, i) => {
      const val = document.querySelector('[name="multi_' + index + '_' + i + '"]').value.trim();
      userAnswer.push(val);
      if (val.toLowerCase() === String(f.answer).toLowerCase()) totalCorrect++;
    });
    saveAnswer(index, userAnswer);
    correct = totalCorrect === q.fields.length;
  } else if (q.type === "match") {
    const pairs = window.matchAnswers[index] || {};
    saveAnswer(index, pairs);
    let totalCorrect = 0;
    (q.pairs || []).forEach((p, i) => {
      if (pairs[i] === p.right) totalCorrect++;
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
    saveAnswer(index, userAnswer);
    correct = totalCorrect === q.matrix.rows.length;
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
  
  const matchWrap = document.getElementById("match_" + index);
  if (matchWrap) matchWrap.dataset.locked = "true";
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
  if (dbSubmission) return;
  const studentUid = currentStudent.uid;
  let totalBenar = 0;
  const key = "exercise_" + exerciseId + "_" + studentUid;
  const savedAnswers = JSON.parse(localStorage.getItem(key) || "{}");

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
    // KIRIM KE FIREBASE KEDUA (ulangansains2025 / dbSecondary)
    await setDoc(doc(dbSecondary, "student_submissions", studentUid + "_" + exerciseId), submissionData, { merge: true });
    
    alert("🎉 Berhasil dikirim! Skor Anda: " + score);
    window.close();
  } catch (error) {
    console.error("Gagal mengirim:", error);
    alert("Gagal mengirim jawaban ke database: " + error.message);
  }
};

window.drawConnection = function(leftEl, rightEl) {
  const wrapper = leftEl.closest(".match-wrapper");
  const svg = wrapper.querySelector(".match-lines");
  const wrapperRect = wrapper.getBoundingClientRect();
  const leftRect = leftEl.getBoundingClientRect();
  const rightRect = rightEl.getBoundingClientRect();

  const x1 = leftRect.right - wrapperRect.left;
  const y1 = leftRect.top + leftRect.height / 2 - wrapperRect.top;
  const x2 = rightRect.left - wrapperRect.left;
  const y2 = rightRect.top + rightRect.height / 2 - wrapperRect.top;

  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", x1); line.setAttribute("y1", y1);
  line.setAttribute("x2", x2); line.setAttribute("y2", y2);
  line.setAttribute("stroke", "#4f46e5"); line.setAttribute("stroke-width", "2.5");
  svg.appendChild(line);
};

function restoreMatchAnswers(studentUid) {
  const key = "exercise_" + exerciseId + "_" + studentUid;
  const saved = dbSubmission?.answers || JSON.parse(localStorage.getItem(key) || "{}");
  
  Object.keys(saved).forEach(qIndex => {
    const pairs = saved[qIndex];
    if (typeof pairs !== "object" || Array.isArray(pairs)) return;
    window.matchAnswers[qIndex] = pairs;
    Object.keys(pairs).forEach(leftIndex => {
      const rightAnswer = pairs[leftIndex];
      const leftEl = document.querySelector('.left-item[data-question="' + qIndex + '"][data-left="' + leftIndex + '"]');
      const rightEl = document.querySelector('.right-item[data-question="' + qIndex + '"][data-right="' + rightAnswer + '"]');
      if (leftEl && rightEl) {
        leftEl.classList.add("connected");
        rightEl.classList.add("connected");
        window.drawConnection(leftEl, rightEl);
      }
    });
  });
}

document.addEventListener("click", (e) => {
  if (dbSubmission) return;
  const left = e.target.closest(".left-item");
  const right = e.target.closest(".right-item");

  if (left) {
    const wrapper = left.closest(".match-wrapper");
    if (wrapper.dataset.locked === "true") return;

    document.querySelectorAll(".left-item").forEach(x => x.classList.remove("selected"));
    left.classList.add("selected");
    selectedLeft = left;
  }

  if (right && selectedLeft) {
    const wrapper = right.closest(".match-wrapper");
    if (wrapper.dataset.locked === "true") return;

    const qIndex = selectedLeft.dataset.question;
    const leftIndex = selectedLeft.dataset.left;
    const rightValue = right.dataset.right;

    window.matchAnswers[qIndex] ??= {};
    window.matchAnswers[qIndex][leftIndex] = rightValue;

    window.drawConnection(selectedLeft, right);
    selectedLeft.classList.remove("selected");
    selectedLeft.classList.add("connected");
    right.classList.add("connected");

    saveAnswer(qIndex, window.matchAnswers[qIndex]);
    selectedLeft = null;
  }
});
