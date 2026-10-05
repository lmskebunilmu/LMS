import { auth, db } from "../../firebase/firebase-config.js";
import {
  collection,
  getDocs,
  getDoc,
  doc,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { loadLayout } from "../../assets/js/components.js";

// ==========================
let materialsSiswa = [];
let exercisesSiswa = [];
let filteredMaterials = [];
let schoolData = null;
let studentClassId = null;

// ==========================
// AUTH & INITIAL LOAD
// ==========================
onAuthStateChanged(auth, async (user) => {
  if (!user) return window.location = "../../login.html";

  const userSnap = await getDoc(doc(db, "users", user.uid));
  if (!userSnap.exists()) return;

  const userData = userSnap.data();

  if (userData.role !== "siswa") {
    alert("Akses khusus siswa!");
    return window.location = "../../login.html";
  }

  await loadLayout("siswa");
  await waitForHeader();
  await loadProfileHeader(user, userData);
  await loadSchoolData(userData.schoolId);
  
  await findStudentClass(user.uid);
  
  if (studentClassId) {
    await loadMaterials(userData.schoolId, studentClassId);
    await loadExercises(userData.schoolId, studentClassId);
  }
  
  renderMaterials(materialsSiswa);
});

// ==========================
// HEADER PROFIL
// ==========================
async function loadProfileHeader(user, userData){
  const schoolSnap = await getDoc(doc(db, "schools", userData.schoolId));
  const school = schoolSnap.exists() ? schoolSnap.data() : {};

  document.getElementById("headerNameHeader").innerText = userData.name || "Siswa";
  document.getElementById("headerAvatarHeader").src = userData.avatarURL || "../../assets/images/default-avatar.png";
  document.getElementById("headerSchoolName").innerText = school.name || "-";
  document.getElementById("headerSchoolLogo").src = school.logoURL || "../../assets/images/default-logo.png";
}

function waitForHeader(){
  return new Promise(resolve => {
    const interval = setInterval(() => {
      const el = document.getElementById("headerNameHeader");
      if(el){
        clearInterval(interval);
        resolve();
      }
    }, 50);
  });
}

async function loadSchoolData(schoolId) {
  const snap = await getDoc(doc(db, "schools", schoolId));
  if (!snap.exists()) return;

  schoolData = snap.data();
  if (schoolData.status !== "aktif") {
    lockPage();
  }
}

async function findStudentClass(studentUid) {
  try {
    const studentDocSnap = await getDoc(doc(db, "students", studentUid));
    if (studentDocSnap.exists()) {
      studentClassId = studentDocSnap.data().classId || null;
    }
  } catch (err) {
    console.error("Gagal memuat kelas siswa:", err);
  }
}

// ==========================
// LOAD DATA MATERIALS & EXERCISES
// ==========================
async function loadMaterials(schoolId, classId) {
  const q = query(
    collection(db, "materialGuru"),
    where("classId", "==", classId),
    where("schoolId", "==", schoolId)
  );

  const snap = await getDocs(q);
  const temp = [];

  for (const d of snap.docs) {
    const assign = d.data();
    const matSnap = await getDoc(doc(db, "materials", assign.materialId));
    if (!matSnap.exists()) continue;

    const mat = matSnap.data();
    temp.push({
      materialId: assign.materialId,
      classId: assign.classId,
      subject: mat.subject || "Umum",
      chapter: mat.chapter || "Umum",
      subChapter: mat.subChapter || "Umum",
      title: mat.title,
      content: mat.content
    });
  }

  const map = new Map();
  temp.forEach(i => map.set(i.materialId, i));

  materialsSiswa = [...map.values()];
  filteredMaterials = materialsSiswa;
}

async function loadExercises(schoolId, classId) {
  const q = query(
    collection(db, "exerciseGuru"),
    where("classId", "==", classId),
    where("schoolId", "==", schoolId)
  );

  const snap = await getDocs(q);
  const temp = [];

  for (const d of snap.docs) {
    const assign = d.data();
    const exSnap = await getDoc(doc(db, "exercises", assign.exerciseId));
    if (!exSnap.exists()) continue;

    const ex = exSnap.data();
    temp.push({
      exerciseId: assign.exerciseId,
      classId: assign.classId,
      subject: ex.subject || "Umum",
      chapter: ex.chapter || "Umum",
      subChapter: ex.subChapter || "Umum",
      title: ex.title,
      isAssigned: assign.isAssigned ?? false,
      deadlineDate: assign.deadlineDate || "",
      deadlineTime: assign.deadlineTime || "",
      questions: ex.questions || []
    });
  }

  const map = new Map();
  temp.forEach(i => map.set(i.exerciseId, i));
  exercisesSiswa = [...map.values()];
}

// ==========================
// RENDER UI MODERN (DEFAULT CLOSED / SCROLLABLE)
// ==========================
function renderMaterials(data) {
  const container = document.getElementById("materialSiswaList");
  if (!container) return;

  container.innerHTML = "";

  if (!data.length && !exercisesSiswa.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <div style="font-size: 15px; font-weight: 600; color: #334155;">Belum Ada Materi</div>
        <p style="color:#64748b; font-size:13px; margin-top:4px;">Belum ada materi atau latihan yang tersedia untuk kelas Anda saat ini.</p>
      </div>`;
    return;
  }

  const grouped = {};

  // Grouping Materi
  data.forEach(m => {
    const mapel = m.subject || "Umum";
    const bab = m.chapter || "Umum";

    grouped[mapel] ??= {};
    grouped[mapel][bab] ??= { materials: [], exercises: [] };
    grouped[mapel][bab].materials.push(m);
  });

  // Grouping Exercises
  exercisesSiswa.forEach(ex => {
    const mapel = ex.subject || "Umum";
    const bab = ex.chapter || "Umum";

    grouped[mapel] ??= {};
    grouped[mapel][bab] ??= { materials: [], exercises: [] };
    grouped[mapel][bab].exercises.push(ex);
  });

  Object.keys(grouped).forEach(mapel => {
    const cardBox = document.createElement("div");
    cardBox.className = "subject-card-box";
    cardBox.innerHTML = `
      <div class="subject-header" onclick="toggleAccordion(this)">
        <div class="subject-title-wrapper">
          <div class="subject-icon">📚</div>
          <span>${mapel}</span>
        </div>
        <div class="chevron">▼</div>
      </div>
      <div class="subject-content" style="display: none;"></div>
    `;
    const subjectContent = cardBox.querySelector(".subject-content");

    Object.keys(grouped[mapel]).forEach(bab => {
      const babDiv = document.createElement("div");
      babDiv.className = "chapter-group";
      babDiv.innerHTML = `
        <div class="chapter-header" onclick="toggleAccordion(this)">
          <span>📖 ${bab}</span>
          <div class="chevron">▼</div>
        </div>
        <div class="chapter-items scrollable-chapter" style="display: none;"></div>
      `;
      const babContent = babDiv.querySelector(".chapter-items");
      const currentBab = grouped[mapel][bab];

      // 1. Render Materi Bacaan
      currentBab.materials.forEach(m => {
        const item = document.createElement("div");
        item.className = "item-row material-item";
        item.innerHTML = `
          <div class="item-icon-box">📄</div>
          <div class="item-info">
            <div class="item-title">${m.title}</div>
            <div class="item-meta" style="color: var(--primary); font-weight: 600;">Materi Pembelajaran</div>
          </div>
        `;
        item.onclick = (e) => {
          e.stopPropagation();
          openMaterial(m.materialId);
        };
        babContent.appendChild(item);
      });

      // 2. Render Latihan / Tugas
      currentBab.exercises.forEach(ex => {
        const item = document.createElement("div");
        item.className = "item-row exercise-item";

        let isExpired = false;
        let deadlineString = "Waktu fleksibel";

        if (ex.deadlineDate && ex.deadlineTime) {
          const deadlineTarget = new Date(`${ex.deadlineDate}T${ex.deadlineTime}:00`);
          const sekarang = new Date();
          
          if (sekarang > deadlineTarget) {
            isExpired = true;
          }
          
          const opsiFormat = { year: 'numeric', month: 'short', day: 'numeric' };
          const tanggalRapi = new Date(ex.deadlineDate).toLocaleDateString('id-ID', opsiFormat);
          deadlineString = `${tanggalRapi} - ${ex.deadlineTime} WIB`;
        }

        if (ex.isAssigned && !isExpired) {
          item.classList.add("status-active");
          item.innerHTML = `
            <div class="item-icon-box">📝</div>
            <div class="item-info">
              <div class="item-title">${ex.title}</div>
              <div class="item-meta text-success">⏱ Batas: ${deadlineString} • <b>Tugas Aktif</b></div>
            </div>
          `;
          item.onclick = (e) => {
            e.stopPropagation();
            openExercise(ex.exerciseId);
          };
        } else if (ex.isAssigned && isExpired) {
          item.classList.add("status-expired");
          item.innerHTML = `
            <div class="item-icon-box">🔒</div>
            <div class="item-info">
              <div class="item-title"><s>${ex.title}</s></div>
              <div class="item-meta text-danger">❌ Waktu Habis (${deadlineString})</div>
            </div>
          `;
          item.onclick = (e) => {
            e.stopPropagation();
            alert("Maaf, waktu pengerjaan latihan ini sudah berakhir.");
          };
        } else {
          item.classList.add("status-locked");
          item.innerHTML = `
            <div class="item-icon-box">🔒</div>
            <div class="item-info">
              <div class="item-title"><s>${ex.title}</s></div>
              <div class="item-meta text-muted">Belum Ditugaskan / Terkunci</div>
            </div>
          `;
          item.onclick = (e) => {
            e.stopPropagation();
            alert("Latihan ini belum dibuka oleh guru Anda.");
          };
        }
        
        babContent.appendChild(item);
      });

      subjectContent.appendChild(babDiv);
    });
    container.appendChild(cardBox);
  });
}

// ==========================
// TOGGLE ACCORDION
// ==========================
window.toggleAccordion = (el) => {
  el.classList.toggle("active");
  const content = el.nextElementSibling;
  if (!content) return;
  
  if (content.style.display === "block") {
    content.style.display = "none";
  } else {
    content.style.display = "block";
  }
};

// ==========================
// OPEN MATERIAL VIEWER
// ==========================
window.openMaterial = async (id) => {
  const snap = await getDoc(doc(db, "materials", id));
  if (!snap.exists()) return;

  const data = snap.data();
  const win = window.open("", "_blank");

  win.document.write(`
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${data.title}</title>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
      <script>
        window.MathJax = {
          tex: {
            inlineMath: [['\\\\(', '\\\\)']],
            displayMath: [['\\\\[', '\\\\]']]
          }
        };
      </script>
      <script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
      <style>
        body{font-family:'Inter',sans-serif;padding:30px 20px;max-width:800px;margin:auto;line-height:1.8;color:#0f172a;background:#f8fafc;}
        h2{color:#4f46e5;border-bottom:2px solid #e2e8f0;padding-bottom:12px;margin-bottom:20px;}
        iframe, embed{width:100%;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.05);margin:20px 0;background:#fff;}
        .content-box{background:#fff;padding:25px;border-radius:16px;border:1px solid #e2e8f0;box-shadow:0 4px 6px -1px rgba(0,0,0,0.02);}
      </style>
    </head>
    <body>
      <div class="content-box">
        <h2>${data.title}</h2>
        <div>${generateContent(data.content)}</div>
      </div>
    </body>
    </html>
  `);
  win.document.close();
};

function lockPage(){
  const main = document.querySelector(".main");
  if (!main) return;
  main.innerHTML = `
    <div style="text-align:center;padding:50px">
      <h2>🚫 Sekolah Nonaktif</h2>
    </div>
  `;
}

function generateContent(input) {
  let output = input;
  output = output.replace(
    /(https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/[^\s<]+)/gi,
    (url) => {
      let videoId = "";
      if (url.includes("watch?v=")) {
        videoId = url.split("watch?v=")[1].split("&")[0];
      } else if (url.includes("youtu.be/")) {
        videoId = url.split("youtu.be/")[1].split("?")[0];
      }
      return `<iframe width="100%" height="380" src="https://www.youtube.com/embed/${videoId}" allowfullscreen style="border:none;"></iframe>`;
    }
  );

  output = output.replace(
    /https?:\/\/drive\.google\.com\/file\/d\/([^\/]+)\/view[^\s<]*/gi,
    (match, fileId) => `<iframe src="https://drive.google.com/file/d/${fileId}/preview" width="100%" height="500" style="border:none;"></iframe>`
  );

  output = output.replace(
    /(https?:\/\/[^\s<]+\.pdf(\?[^\s<]+)?)/gi,
    (url) => `<embed src="${url}" type="application/pdf" width="100%" height="600px">`
  );

  output = output.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  return output;
}

// ==========================
// OPEN EXERCISE
// ==========================
window.openExercise = async (id) => {
  const exSnap = await getDoc(doc(db, "exercises", id));
  if (!exSnap.exists()) {
    alert("Latihan tidak ditemukan");
    return;
  }

  const exData = exSnap.data();
  const q = query(collection(db, "questions"), where("exerciseId", "==", id));
  const qSnap = await getDocs(q);
  
  const questions = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  questions.sort((a, b) => {
    let waktuA = a.createdAt?.toDate?.()?.getTime() || new Date(a.createdAt).getTime() || 0;
    let waktuB = b.createdAt?.toDate?.()?.getTime() || new Date(b.createdAt).getTime() || 0;
    if (waktuA === waktuB) return a.id.localeCompare(b.id);
    return waktuA - waktuB;
  });

  const currentUser = auth.currentUser;
  const studentUid = currentUser ? currentUser.uid : "anonymous";

  let dbSubmission = null;
  try {
    const subSnap = await getDoc(doc(db, "student_submissions", studentUid + "_" + id));
    if (subSnap.exists()) dbSubmission = subSnap.data();
  } catch (err) {
    console.error("Gagal memeriksa submission:", err);
  }

  const win = window.open("", "_blank");
  if (!win) {
    alert("Pop-up diblokir browser! Izinkan pop-up untuk mengerjakan latihan.");
    return;
  }

  win.document.title = exData.title;

  const inlineScript = win.document.createElement("script");
  inlineScript.text = `window.MathJax = { tex: { inlineMath: [['\\\\(', '\\\\)']], displayMath: [['\\\\[', '\\\\]']] } };`;
  win.document.head.appendChild(inlineScript);

  const styleEl = win.document.createElement("style");
  styleEl.textContent = `
    *{box-sizing:border-box;}
    body{margin:0;font-family:'Inter',sans-serif;background:#f8fafc;color:#0f172a;padding-bottom:50px;}
    .topbar{position:sticky;top:0;z-index:999;background:#fff;padding:16px 24px;display:flex;justify-content:space-between;align-items:center;box-shadow:0 1px 3px rgba(0,0,0,0.05);border-bottom:1px solid #e2e8f0;}
    .title{font-size:16px;font-weight:700;color:#0f172a;}
    .btn-group{display:flex;gap:10px;}
    button{border:none;padding:9px 16px;border-radius:10px;cursor:pointer;font-weight:600;font-size:13px;transition:all 0.2s;}
    .fullscreen-btn{background:#334151;color:white;}
    .fullscreen-btn:hover{background:#1e293b;}
    .exit-btn{background:#ef4444;color:white;}
    .exit-btn:hover{background:#dc2626;}
    .submit-btn{background:#4f46e5;color:white;width:100%;margin-top:24px;padding:15px;font-size:15px;border-radius:12px;box-shadow:0 4px 12px rgba(79,70,229,0.25);}
    .submit-btn:hover{background:#4338ca;}
    .container{max-width:800px;margin:auto;padding:20px;}
    .question{background:white;margin-bottom:20px;padding:22px;border-radius:16px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.02);border:1px solid #e2e8f0;}
    h3{margin-top:0;font-size:15px;color:#1e293b;font-weight:600;}
    label{display:block;margin:12px 0;padding:12px 16px;border-radius:10px;background:#f8fafc;cursor:pointer;border:1px solid #e2e8f0;font-size:14px;transition:all .2s;}
    label:hover{background:#eef2ff;border-color:#c7d2fe;}
    input[type="text"]{width:100%;padding:12px 16px;border-radius:10px;border:1px solid #cbd5e1;font-size:14px;outline:none;}
    input[type="text"]:focus{border-color:#4f46e5;box-shadow:0 0 0 3px rgba(79,70,229,0.1);}
    .match-wrapper{position:relative;display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:16px;}
    .match-column{display:flex;flex-direction:column;gap:12px;}
    .match-item{background:white;border:1px solid #cbd5e1;border-radius:10px;padding:12px;cursor:pointer;font-size:13px;position:relative;z-index:2;transition:all 0.2s;}
    .match-item:hover{background:#f1f5f9;}
    .match-item.selected{border-color:#4f46e5;background:#eef2ff;}
    .match-item.connected{border-color:#10b981;background:#ecfdf5;}
    .match-lines{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1;}
    .attempts-info{font-size:12px;color:#ef4444;margin-top:6px;display:block;font-weight:600;}
  `;
  win.document.head.appendChild(styleEl);

  let bodyContent = `
    <div class="topbar">
      <div class="title">📝 ${exData.title} ${dbSubmission ? '<span style="color:#10b981;font-size:13px;">(Selesai Dikumpulkan)</span>' : ''}</div>
      <div class="btn-group">
        <button class="fullscreen-btn" onclick="openFullscreen()">⛶ Fullscreen</button>
        <button class="exit-btn" onclick="closeFullscreen()">✕ Tutup</button>
      </div>
    </div>
    <div class="container">
  `;

  const savedData = dbSubmission?.answers || JSON.parse(localStorage.getItem(`exercise_${id}_${studentUid}`) || "{}");
  const savedAttempts = JSON.parse(localStorage.getItem(`attempts_${id}_${studentUid}`) || "{}");

  questions.forEach((qData, index) => {
    const savedAnswer = savedData[index];
    const currentAttempts = dbSubmission ? 1 : (savedAttempts[index] || 0);
    const isLocked = currentAttempts >= 1;

    bodyContent += `<div class="question"><h3>Soal ${index + 1}. ${qData.question || ""}</h3>`;

    if (qData.type === "pg") {
      (qData.options || []).forEach((opt, i) => {
        const checked = savedAnswer == i ? "checked" : "";
        bodyContent += `<label><input type="radio" name="q${index}" value="${i}" ${checked} ${isLocked ? 'disabled' : ''}> ${opt}</label>`;
      });
    } else if (qData.type === "checkbox") {
      (qData.options || []).forEach((opt, i) => {
        const checked = Array.isArray(savedAnswer) && savedAnswer.includes(String(i)) ? "checked" : "";
        bodyContent += `<label><input type="checkbox" name="q${index}" value="${i}" ${checked} ${isLocked ? 'disabled' : ''}> ${opt}</label>`;
      });
    } else if (qData.type === "isian") {
      bodyContent += `<input type="text" id="q${index}" value="${savedAnswer || ""}" placeholder="Tulis jawaban Anda..." ${isLocked ? 'disabled' : ''}>`;
    } else if (qData.type === "match") {
      const shuffled = [...(qData.pairs || [])].sort(() => Math.random() - 0.5);
      bodyContent += `
        <div class="match-wrapper" id="match_${index}" data-locked="${isLocked}">
          <svg class="match-lines"></svg>
          <div class="match-column">
            ${(qData.pairs || []).map((p, i) => `<div class="match-item left-item" data-question="${index}" data-left="${i}" data-answer="${p.right}">${p.left}</div>`).join("")}
          </div>
          <div class="match-column">
            ${shuffled.map((p, i) => `<div class="match-item right-item" data-question="${index}" data-right="${p.right}">${p.right}</div>`).join("")}
          </div>
        </div>
      `;
    } else if (qData.type === "multi_isian") {
      (qData.fields || []).forEach((f, i) => {
        const val = savedAnswer?.[i] || "";
        bodyContent += `
          <div style="margin-top:12px">
            <label style="display:block; margin-bottom:6px; font-weight:600; background:none; padding:0; border:none;">${f.label}</label>
            <input type="text" name="multi_${index}_${i}" value="${val}" placeholder="Jawaban..." ${isLocked ? 'disabled' : ''}>
          </div>
        `;
      });
    }

    bodyContent += `
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

  bodyContent += `
      <button class="submit-btn" id="final_submit_btn" onclick="submitToFirebase()" ${dbSubmission ? 'disabled style="background:#cbd5e1; cursor:not-allowed;"' : ''}>
        ${dbSubmission ? '🔒 Jawaban Telah Disimpan' : '📤 Kirim Nilai ke Guru'}
      </button>
    </div>
  `;

  win.document.body.innerHTML = bodyContent;

  const scriptEl = win.document.createElement("script");
  scriptEl.type = "module";
  scriptEl.text = `
    import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
    import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

    const firebaseConfig = ${JSON.stringify(auth.app.options)};
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    const exerciseId = "${id}";
    const studentUid = "${studentUid}";
    const classId = "${studentClassId || ''}";
    const schoolId = "${schoolData?.schoolId || ''}";
    const questionsData = ${JSON.stringify(questions)};
    const isAlreadySubmitted = ${dbSubmission ? true : false};
    
    let selectedLeft = null;
    window.matchAnswers = {};

    window.openFullscreen = () => {
      const elem = document.documentElement;
      if (elem.requestFullscreen) elem.requestFullscreen();
    };
    window.closeFullscreen = () => {
      if (document.exitFullscreen) document.exitFullscreen();
    };

    function saveAnswer(index, value){
      if(isAlreadySubmitted) return;
      const key = "exercise_" + exerciseId + "_" + studentUid;
      const data = JSON.parse(localStorage.getItem(key) || "{}");
      data[index] = value;
      localStorage.setItem(key, JSON.stringify(data));
    }

    window.checkAnswer = function(index){
      if(isAlreadySubmitted) { alert("Latihan sudah dikumpulkan!"); return; }
      
      const q = questionsData[index];
      const attemptKey = "attempts_" + exerciseId + "_" + studentUid;
      let attempts = JSON.parse(localStorage.getItem(attemptKey) || "{}");
      
      attempts[index] = 1;
      localStorage.setItem(attemptKey, JSON.stringify(attempts));

      document.getElementById("attempts_text_" + index).innerText = "🔒 Soal Terkunci";

      let correct = false;
      let userAnswer = null;

      if(q.type === "pg"){
        const selected = document.querySelector('input[name="q' + index + '"]:checked');
        if(!selected) { alert("Pilih opsi jawaban terlebih dahulu!"); return; }
        userAnswer = selected.value;
        saveAnswer(index, userAnswer);
        correct = userAnswer == q.answer;
      }
      else if(q.type === "checkbox"){
        const checked = [...document.querySelectorAll('input[name="q' + index + '"]:checked')].map(x => x.value);
        userAnswer = checked;
        saveAnswer(index, userAnswer);
        correct = JSON.stringify(checked.sort()) === JSON.stringify((q.answer || []).map(String).sort());
      }
      else if(q.type === "isian"){
        const input = document.getElementById("q"+index);
        userAnswer = input.value.trim();
        saveAnswer(index, userAnswer);
        correct = userAnswer.toLowerCase() === String(q.answer).toLowerCase();
      }
      else if(q.type === "multi_isian"){
        userAnswer = [];
        let totalCorrect = 0;
        (q.fields || []).forEach((f,i)=>{
          const val = document.querySelector('[name="multi_'+index+'_'+i+'"]').value.trim();
          userAnswer.push(val);
          if(val.toLowerCase() === String(f.answer).toLowerCase()) totalCorrect++;
        });
        saveAnswer(index, userAnswer);
        correct = totalCorrect === q.fields.length;
      }
      else if(q.type === "match"){
        const pairs = window.matchAnswers[index] || {};
        saveAnswer(index, pairs);
        let totalCorrect = 0;
        (q.pairs || []).forEach((p,i)=>{
          if(pairs[i] === p.right) totalCorrect++;
        });
        correct = totalCorrect === q.pairs.length;
      }

      const result = document.getElementById("result_"+index);
      if(correct){
        result.innerHTML = "✅ Jawaban Benar";
        result.style.color = "#059669";
      }else{
        result.innerHTML = "❌ Jawaban Salah";
        result.style.color = "#dc2626";
      }

      window.lockQuestionFields(index);
      document.getElementById("explain_"+index).style.display = "block";
    };

    window.lockQuestionFields = function(index){
      const btn = document.getElementById("btn_check_" + index);
      if(btn) {
        btn.disabled = true;
        btn.style.background = "#cbd5e1";
        btn.style.cursor = "not-allowed";
      }
      document.querySelectorAll('input[name="q'+index+'"]').forEach(el => el.disabled = true);
      const isian = document.getElementById("q"+index);
      if(isian) isian.disabled = true;
      document.querySelectorAll('[name^="multi_'+index+'_"]').forEach(el => el.disabled = true);
      
      const matchWrap = document.getElementById("match_" + index);
      if(matchWrap) matchWrap.dataset.locked = "true";
    }

    window.toggleExplain = function(index){
      const el = document.getElementById("explain_content_"+index);
      el.style.display = el.style.display === "block" ? "none" : "block";
    };

    window.submitToFirebase = async function() {
      if(isAlreadySubmitted) return;

      let totalBenar = 0;
      const key = "exercise_" + exerciseId + "_" + studentUid;
      const savedAnswers = JSON.parse(localStorage.getItem(key) || "{}");

      questionsData.forEach((q, index) => {
        const uAns = savedAnswers[index];
        if (uAns === undefined || uAns === null) return;

        if (q.type === "pg" && uAns == q.answer) totalBenar++;
        else if (q.type === "isian" && String(uAns).toLowerCase() === String(q.answer).toLowerCase()) totalBenar++;
        else if (q.type === "checkbox") {
          if (JSON.stringify([...uAns].sort()) === JSON.stringify((q.answer || []).map(String).sort())) totalBenar++;
        }
        else if (q.type === "multi_isian") {
          let multiCorrect = 0;
          (q.fields || []).forEach((f, i) => {
            if (uAns[i] && uAns[i].toLowerCase() === String(f.answer).toLowerCase()) multiCorrect++;
          });
          if (multiCorrect === q.fields.length) totalBenar++;
        }
        else if (q.type === "match") {
          let matchCorrect = 0;
          (q.pairs || []).forEach((p, i) => {
            if (uAns[i] === p.right) matchCorrect++;
          });
          if (matchCorrect === q.pairs.length) totalBenar++;
        }
      });

      const score = questionsData.length > 0 ? Math.round((totalBenar / questionsData.length) * 100) : 0;

      try {
        await setDoc(doc(db, "student_submissions", studentUid + "_" + exerciseId), {
          studentUid: studentUid,
          exerciseId: exerciseId,
          classId: classId,
          schoolId: schoolId,
          answers: savedAnswers,
          score: score,
          totalQuestions: questionsData.length,
          correctAnswers: totalBenar,
          submittedAt: new Date()
        });

        alert("🎉 Berhasil dikirim! Skor Anda: " + score);
        window.close(); 
      } catch (error) {
        console.error("Gagal mengirim:", error);
        alert("Gagal mengirim jawaban ke database.");
      }
    };

    window.drawConnection = function(leftEl, rightEl){
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

    function restoreMatchAnswers(){
      const key = "exercise_" + exerciseId + "_" + studentUid;
      const saved = isAlreadySubmitted ? ${JSON.stringify(savedData)} : JSON.parse(localStorage.getItem(key) || "{}");
      
      Object.keys(saved).forEach(qIndex => {
        const pairs = saved[qIndex];
        if(typeof pairs !== "object" || Array.isArray(pairs)) return;
        window.matchAnswers[qIndex] = pairs;
        Object.keys(pairs).forEach(leftIndex => {
          const rightAnswer = pairs[leftIndex];
          const leftEl = document.querySelector('.left-item[data-question="'+qIndex+'"][data-left="'+leftIndex+'"]');
          const rightEl = document.querySelector('.right-item[data-question="'+qIndex+'"][data-right="'+rightAnswer+'"]');
          if(leftEl && rightEl){
            leftEl.classList.add("connected");
            rightEl.classList.add("connected");
            window.drawConnection(leftEl, rightEl);
          }
        });
      });
    }

    document.addEventListener("click", (e) => {
      if(isAlreadySubmitted) return;
      const left = e.target.closest(".left-item");
      const right = e.target.closest(".right-item");

      if (left) {
        const wrapper = left.closest(".match-wrapper");
        if(wrapper.dataset.locked === "true") return;

        document.querySelectorAll(".left-item").forEach(x => x.classList.remove("selected"));
        left.classList.add("selected");
        selectedLeft = left;
      }

      if (right && selectedLeft) {
        const wrapper = right.closest(".match-wrapper");
        if(wrapper.dataset.locked === "true") return;

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

    setTimeout(() => { 
      restoreMatchAnswers(); 
      questionsData.forEach((q, index) => {
        const attemptKey = "attempts_" + exerciseId + "_" + studentUid;
        const attempts = JSON.parse(localStorage.getItem(attemptKey) || "{}");
        if(isAlreadySubmitted || attempts[index] >= 1){
          window.lockQuestionFields(index);
        }
      });
    }, 300);

    const mjScript = document.createElement('script');
    mjScript.src = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js";
    mjScript.async = true;
    document.head.appendChild(mjScript);
  `;
  win.document.body.appendChild(scriptEl);
};

window.filterMaterialsSiswa = () => {
  const search = document.getElementById("searchMaterialSiswa").value.toLowerCase();
  filteredMaterials = materialsSiswa.filter(m => {
    return m.title.toLowerCase().includes(search) || m.subject.toLowerCase().includes(search);
  });
  renderMaterials(filteredMaterials);
};
