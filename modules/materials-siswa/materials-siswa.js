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
let classMap = {};
let schoolData = null;
let studentClassId = null; // Menyimpan ID Kelas tempat siswa bernaung

// ==========================
// AUTH
// ==========================
onAuthStateChanged(auth, async (user) => {
  if (!user) return window.location = "../../login.html";

  const userSnap = await getDoc(doc(db, "users", user.uid));
  if (!userSnap.exists()) return;

  const userData = userSnap.data();

  if (userData.role !== "siswa") {
    alert("Akses hanya siswa");
    return window.location = "../../login.html";
  }

  await loadLayout("siswa");

  // 🔥 WAJIB: tunggu header ready
  await waitForHeader();

  // 🔥 load header profil
  await loadProfileHeader(user, userData);

  await loadSchoolData(userData.schoolId);
  
  // 🔥 Cari kelas siswa berdasarkan array 'students' yang dikelola admin
  await findStudentClass(user.uid, userData.schoolId);
  
  // Ambil data peta nama kelas (Disinkronkan ke field 'className' milik admin)
  await loadClassMap(userData.schoolId);
  
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
  // Perbaikan path jika gambar default pecah/404
  document.getElementById("headerAvatarHeader").src = userData.avatarURL || "../../assets/images/default-avatar.png";
  document.getElementById("headerSchoolName").innerText = school.name || "-";
  document.getElementById("headerSchoolLogo").src = school.logoURL || "../../assets/images/default-logo.png";
}

// ==========================
// WAIT HEADER DOM READY
// ==========================
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

// ==========================
// SCHOOL
// ==========================
async function loadSchoolData(schoolId) {
  const snap = await getDoc(doc(db, "schools", schoolId));
  if (!snap.exists()) return;

  schoolData = snap.data();
  if (schoolData.status !== "aktif") {
    lockPage();
  }
}

// ==========================
// FIND STUDENT CLASS
// ==========================
async function findStudentClass(studentUid, schoolId) {
  try {
    const studentDocSnap = await getDoc(doc(db, "students", studentUid));
    if (studentDocSnap.exists()) {
      const studentData = studentDocSnap.data();
      studentClassId = studentData.classId || null;
      console.log("Menemukan Class ID Siswa:", studentClassId);
    } else {
      console.warn("Dokumen siswa di koleksi 'students' tidak ditemukan.");
    }
  } catch (err) {
    console.error("Gagal memuat kelas siswa:", err);
  }
}

// ==========================
// CLASS MAP
// ==========================
async function loadClassMap(schoolId) {
  const q = query(
    collection(db, "classes"),
    where("schoolId", "==", schoolId)
  );

  const snap = await getDocs(q);
  classMap = {};

  snap.forEach(d => {
    classMap[d.id] = d.data().name || "Kelas Tanpa Nama"; 
  });
}

// ==========================
// MATERIAL
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
      subject: mat.subject,
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

// ==========================
// EXERCISES
// ==========================
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
      subject: ex.subject,
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
// RENDER MATERIALS
// ==========================
function renderMaterials(data) {
  const container = document.getElementById("materialSiswaList");
  if (!container) return;

  container.innerHTML = "";

  if (!data.length && !exercisesSiswa.length) {
    container.innerHTML = `<p style="padding:10px">Tidak ada materi atau latihan untuk kelas Anda.</p>`;
    return;
  }

  const grouped = {};
  data.forEach(m => {
    const kelas = classMap[m.classId] || "Tanpa Kelas";
    const mapel = m.subject || "Umum";
    const bab = m.chapter || "Umum";

    grouped[kelas] ??= {};
    grouped[kelas][mapel] ??= {};
    grouped[kelas][mapel][bab] ??= { materials: [], exercises: [] };
    grouped[kelas][mapel][bab].materials.push(m);
  });

  exercisesSiswa.forEach(ex => {
    const kelas = classMap[ex.classId] || "Tanpa Kelas";
    const mapel = ex.subject || "Umum";
    const bab = ex.chapter || "Umum";

    grouped[kelas] ??= {};
    grouped[kelas][mapel] ??= {};
    grouped[kelas][mapel][bab] ??= { materials: [], exercises: [] };
    grouped[kelas][mapel][bab].exercises.push(ex);
  });

  Object.keys(grouped).forEach(kelas => {
    const box = document.createElement("div");
    box.className = "accordion-box";
    box.innerHTML = `
      <div class="level kelas" onclick="toggle(this)">🏫 ${kelas}</div>
      <div class="content"></div>
    `;
    const kelasContent = box.querySelector(".content");

    Object.keys(grouped[kelas]).forEach(mapel => {
      const mapelDiv = document.createElement("div");
      mapelDiv.innerHTML = `
        <div class="level mapel" onclick="toggle(this)">📘 ${mapel}</div>
        <div class="content"></div>
      `;
      const mapelContent = mapelDiv.querySelector(".content");

      Object.keys(grouped[kelas][mapel]).forEach(bab => {
        const babDiv = document.createElement("div");
        babDiv.innerHTML = `
          <div class="level bab" onclick="toggle(this)">📖 ${bab}</div>
          <div class="content"></div>
        `;
        const babContent = babDiv.querySelector(".content");
        const currentBab = grouped[kelas][mapel][bab];

        // Render Materi Bacaan
        currentBab.materials.forEach(m => {
          const item = document.createElement("div");
          item.className = "materi-item";
          item.innerHTML = `📄 ${m.title}`;
          item.onclick = () => openMaterial(m.materialId);
          babContent.appendChild(item);
        });

        // RENDER LATIHAN
        currentBab.exercises.forEach(ex => {
          const item = document.createElement("div");
          item.className = "materi-item";

          let isExpired = false;
          let deadlineString = "Tidak ditentukan";

          if (ex.deadlineDate && ex.deadlineTime) {
            const deadlineTarget = new Date(`${ex.deadlineDate}T${ex.deadlineTime}:00`);
            const sekarang = new Date();
            
            if (sekarang > deadlineTarget) {
              isExpired = true;
            }
            
            const opsiFormat = { year: 'numeric', month: 'short', day: 'numeric' };
            const tanggalRapi = new Date(ex.deadlineDate).toLocaleDateString('id-ID', opsiFormat);
            deadlineString = `${tanggalRapi} - Pukul ${ex.deadlineTime} WIB`;
          }

          if (ex.isAssigned && !isExpired) {
            item.style.borderLeft = "4px solid #16a34a"; 
            item.style.cursor = "pointer";
            item.innerHTML = `
              📝 ${ex.title} 
              <span style="color:#16a34a; font-size:11px; font-weight:bold; margin-left:8px;">
                ⏱ Batas: ${deadlineString} (Tugas Aktif)
              </span>`;
            item.onclick = () => openExercise(ex.exerciseId);

          } else if (ex.isAssigned && isExpired) {
            item.style.borderLeft = "4px solid #ef4444"; 
            item.style.opacity = "0.5";
            item.style.cursor = "not-allowed";
            item.innerHTML = `
              🔒 <s>📝 ${ex.title}</s> 
              <span style="color:#ef4444; font-size:11px; font-weight:bold; margin-left:8px;">
                ❌ Batas Waktu Habis (${deadlineString})
              </span>`;
            item.onclick = () => alert("Maaf, waktu pengerjaan latihan ini sudah habis/melewati batas pengumpulan!");

          } else {
            item.style.borderLeft = "4px solid #9ca3af"; 
            item.style.opacity = "0.6";
            item.style.cursor = "not-allowed";
            item.innerHTML = `
              🔒 <s>📝 ${ex.title}</s> 
              <span style="color:#6b7280; font-size:11px; font-style:italic; margin-left:8px;">
                (Belum Ditugaskan / Terkunci)
              </span>`;
            item.onclick = () => alert("Latihan ini belum dibuka/ditugaskan aktif oleh gurumu.");
          }
          
          babContent.appendChild(item);
        });

        mapelContent.appendChild(babDiv);
      });
      kelasContent.appendChild(mapelDiv);
    });
    container.appendChild(box);
  });
}

// ==========================
// TOGGLE
// ==========================
window.toggle = (el) => {
  const content = el.nextElementSibling;
  if (!content) return;
  content.style.display = content.style.display === "block" ? "none" : "block";
};

// ==========================
// OPEN MATERIAL
// ==========================
window.openMaterial = async (id) => {
  const snap = await getDoc(doc(db, "materials", id));
  if (!snap.exists()) return;

  const data = snap.data();
  const win = window.open("", "_blank");

  win.document.write(`
    <html>
    <head>
      <title>${data.title}</title>
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
        body{font-family:Arial;padding:20px;line-height:1.8}
      </style>
    </head>
    <body>
      <h2>${data.title}</h2>
      <div>${generateContent(data.content)}</div>
    </body>
    </html>
  `);
  win.document.close();
};

// ==========================
// LOCK PAGE IF SCHOOL INACTIVE
// ==========================
function lockPage(){
  const main = document.querySelector(".main");
  if (!main) return;
  main.innerHTML = `
    <div style="text-align:center;padding:50px">
      <h2>🚫 Sekolah Nonaktif</h2>
    </div>
  `;
}

// ==========================
// GENERATE EMBED CONTENT
// ==========================
function generateContent(input) {
  let output = input;

  // Youtube Embed
  output = output.replace(
    /(https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/[^\s<]+)/gi,
    (url) => {
      let videoId = "";
      if (url.includes("watch?v=")) {
        videoId = url.split("watch?v=")[1].split("&")[0];
      } else if (url.includes("youtu.be/")) {
        videoId = url.split("youtu.be/")[1].split("?")[0];
      }
      return `
        <iframe width="100%" height="315" src="https://www.youtube.com/embed/${videoId}" allowfullscreen style="border:none;border-radius:10px;margin-top:15px;"></iframe>
      `;
    }
  );

  // Google Drive Embed
  output = output.replace(
    /https?:\/\/drive\.google\.com\/file\/d\/([^\/]+)\/view[^\s<]*/gi,
    (match, fileId) => `
        <iframe src="https://drive.google.com/file/d/${fileId}/preview" width="100%" height="500" style="border:none;border-radius:10px;"></iframe>
      `
  );

  // Firebase PDF Embed
  output = output.replace(
    /(https?:\/\/[^\s<]+\.pdf(\?[^\s<]+)?)/gi,
    (url) => `
      <embed src="${url}" type="application/pdf" width="100%" height="600px" style="margin-top:15px; border-radius:10px;">
    `
  );

  // Script tag clean up
  output = output.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");

  return output;
}

// ==========================
// OPEN EXERCISE (SAVE FIREBASE + HITUNG NILAI + MAKS 2X CEK)
// ==========================
window.openExercise = async (id) => {
  const exSnap = await getDoc(doc(db, "exercises", id));
  if (!exSnap.exists()) {
    alert("Latihan tidak ditemukan");
    return;
  }

  const exData = exSnap.data();
  
  const q = query(
    collection(db, "questions"), 
    where("exerciseId", "==", id)
  );
  const qSnap = await getDocs(q);
  
  const questions = qSnap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));

  // Sorting berdasarkan waktu / fallback dokumen id
  questions.sort((a, b) => {
    let waktuA = a.createdAt?.toDate?.()?.getTime() || new Date(a.createdAt).getTime() || 0;
    let waktuB = b.createdAt?.toDate?.()?.getTime() || new Date(b.createdAt).getTime() || 0;
    if (waktuA === waktuB) return a.id.localeCompare(b.id);
    return waktuA - waktuB;
  });

  const win = window.open("", "_blank");
  if (!win) {
    alert("Pop-up diblokir oleh browser! Harap izinkan pop-up untuk membuka latihan.");
    return;
  }

  win.document.innerHTML = ""; 
  win.document.title = exData.title;

  // MathJax Config
  const inlineScript = win.document.createElement("script");
  inlineScript.text = `window.MathJax = { tex: { inlineMath: [['\\\\(', '\\\\)']], displayMath: [['\\\\[', '\\\\]']] } };`;
  win.document.head.appendChild(inlineScript);

  // Styling Modern & Atribut Tambahan
  const styleEl = win.document.createElement("style");
  styleEl.textContent = `
    *{box-sizing:border-box;}
    body{margin:0;font-family:Arial;background:#f5f6fa;color:#333;}
    .topbar{position:sticky;top:0;z-index:999;background:white;padding:15px 20px;display:flex;justify-content:space-between;align-items:center;box-shadow:0 2px 10px rgba(0,0,0,.08);}
    .title{font-size:20px;font-weight:bold;}
    .btn-group{display:flex;gap:10px;}
    button{border:none;padding:10px 18px;border-radius:10px;cursor:pointer;font-weight:bold;}
    .fullscreen-btn{background:#111827;color:white;}
    .exit-btn{background:#dc2626;color:white;}
    .submit-btn{background:#2563eb;color:white;width:100%;margin-top:30px;padding:15px;font-size:16px;}
    .container{max-width:1000px;margin:auto;padding:25px;}
    .question{background:white;margin-bottom:25px;padding:20px;border-radius:15px;box-shadow:0 2px 8px rgba(0,0,0,.05);}
    h3{margin-top:0;}
    label{display:block;margin:12px 0;padding:12px;border-radius:10px;background:#f9fafb;cursor:pointer;transition:.2s;}
    label:hover{background:#eef2ff;}
    input[type="text"]{width:100%;padding:12px;border-radius:10px;border:1px solid #ddd;}
    .match-wrapper{position:relative;display:grid;grid-template-columns:1fr 1fr;gap:50px;margin-top:20px;}
    .match-column{display:flex;flex-direction:column;gap:15px;}
    .match-item{background:white;border:2px solid #ddd;border-radius:12px;padding:14px;cursor:pointer;transition:.2s;position:relative;z-index:2;}
    .match-item:hover{background:#eef2ff;}
    .match-item.selected{border-color:#2563eb;background:#dbeafe;}
    .match-item.connected{border-color:#16a34a;background:#dcfce7;}
    .match-lines{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1;}
    .attempts-info{font-size:12px;color:#6b7280;margin-top:5px;display:block;}
  `;
  win.document.head.appendChild(styleEl);

  let bodyContent = `
    <div class="topbar">
      <div class="title">📝 ${exData.title}</div>
      <div class="btn-group">
        <button class="fullscreen-btn" onclick="openFullscreen()">⛶ Fullscreen</button>
        <button class="exit-btn" onclick="closeFullscreen()">✕ Exit Fullscreen</button>
      </div>
    </div>
    <div class="container">
  `;

  const currentUser = auth.currentUser;
  const studentUid = currentUser ? currentUser.uid : "anonymous";

  // Ambil state pengerjaan dan attempts berdasarkan ID Latihan + UID Siswa agar tidak bentrok
  const savedData = JSON.parse(localStorage.getItem(`exercise_${id}_${studentUid}`) || "{}");
  const savedAttempts = JSON.parse(localStorage.getItem(`attempts_${id}_${studentUid}`) || "{}");

  questions.forEach((qData, index) => {
    const savedAnswer = savedData[index];
    const currentAttempts = savedAttempts[index] || 0;
    const isLocked = currentAttempts >= 2;

    bodyContent += `<div class="question"><h3>${index + 1}. ${qData.question || ""}</h3>`;

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
      bodyContent += `<input type="text" id="q${index}" value="${savedAnswer || ""}" placeholder="Jawaban..." ${isLocked ? 'disabled' : ''}>`;
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
          <div style="margin-top:15px">
            <label style="display:block; margin-bottom:8px; font-weight:bold; background:none; padding:0;">${f.label}</label>
            <input type="text" name="multi_${index}_${i}" value="${val}" placeholder="Jawaban..." ${isLocked ? 'disabled' : ''}>
          </div>
        `;
      });
    }

    bodyContent += `
      <div style="margin-top:20px">
        <button id="btn_check_${index}" onclick="checkAnswer(${index})" style="background:#2563eb; color:white; border:none; padding:10px 16px; border-radius:10px; cursor:pointer;" ${isLocked ? 'disabled style="background:#9ca3af; cursor:not-allowed;"' : ''}>✅ Cek Jawaban</button>
        <span class="attempts-info" id="attempts_text_${index}">Mencoba: ${currentAttempts}/2 kali</span>
        <div id="result_${index}" style="margin-top:15px;font-weight:bold"></div>
        <div id="explain_${index}" style="margin-top:15px;display:none">
          <button onclick="toggleExplain(${index})" style="background:#16a34a; color:white; border:none; padding:10px 16px; border-radius:10px; cursor:pointer;">📘 Pembahasan</button>
          <div id="explain_content_${index}" style="display:none; margin-top:10px; background:#f3f4f6; padding:15px; border-radius:10px;">
            ${qData.explanation || "Belum ada pembahasan"}
          </div>
        </div>
      </div>
    </div>`;
  });

  bodyContent += `
      <button class="submit-btn" onclick="submitToFirebase()">📤 Kirim Jawaban & Simpan Nilai ke Firebase</button>
    </div>
  `;

  win.document.body.innerHTML = bodyContent;

  // Injeksi modul SDK Firebase ke popup baru agar bisa melakukan penulisan data secara terpisah
  const scriptEl = win.document.createElement("script");
  scriptEl.type = "module";
  scriptEl.text = `
    import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
    import { db } from "${window.location.origin}/firebase/firebase-config.js";

    const exerciseId = "${id}";
    const studentUid = "${studentUid}";
    const classId = "${studentClassId || ''}";
    const schoolId = "${schoolData?.schoolId || ''}";
    const questionsData = ${JSON.stringify(questions)};
    
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
      const key = "exercise_" + exerciseId + "_" + studentUid;
      const data = JSON.parse(localStorage.getItem(key) || "{}");
      data[index] = value;
      localStorage.setItem(key, JSON.stringify(data));
    }

    window.checkAnswer = function(index){
      const q = questionsData[index];
      const attemptKey = "attempts_" + exerciseId + "_" + studentUid;
      let attempts = JSON.parse(localStorage.getItem(attemptKey) || "{}");
      
      // Tambah riwayat hit pengerjaan
      attempts[index] = (attempts[index] || 0) + 1;
      localStorage.setItem(attemptKey, JSON.stringify(attempts));

      document.getElementById("attempts_text_" + index).innerText = "Mencoba: " + attempts[index] + "/2 kali";

      let correct = false;
      let userAnswer = null;

      if(q.type === "pg"){
        const selected = document.querySelector('input[name="q' + index + '"]:checked');
        if(!selected) { alert("Pilih salah satu opsi jawaban!"); return; }
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
        result.style.color = "green";
        document.getElementById("explain_"+index).style.display = "block";
        lockQuestionFields(index); // Jika benar langsung kunci agar tidak bisa diubah lagi
      }else{
        result.innerHTML = "❌ Jawaban Salah";
        result.style.color = "red";
      }

      // Kunci jika batas klik mencapai 2 kali
      if(attempts[index] >= 2){
        lockQuestionFields(index);
        document.getElementById("explain_"+index).style.display = "block"; // Munculkan pembahasan otomatis saat kesempatan habis
      }
    };

    function lockQuestionFields(index){
      const btn = document.getElementById("btn_check_" + index);
      if(btn) {
        btn.disabled = true;
        btn.style.background = "#9ca3af";
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

    // Fungsi Pengiriman Nilai & Jawaban Akhir ke Database Firebase
    window.submitToFirebase = async function() {
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

      // Perhitungan skor berbasis skala 100
      const score = questionsData.length > 0 ? Math.round((totalBenar / questionsData.length) * 100) : 0;

      try {
        // Disimpan ke dalam nama koleksi 'student_submissions'
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

        alert("🎉 Hasil pengerjaan Anda berhasil disimpan ke Firebase!\\nSkor Nilai Anda: " + score);
      } catch (error) {
        console.error("Gagal menyimpan ke Firebase:", error);
        alert("Gagal mengirim jawaban ke database, pastikan jaringan Anda stabil.");
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
      line.setAttribute("stroke", "#2563eb"); line.setAttribute("stroke-width", "3");
      svg.appendChild(line);
    };

    function restoreMatchAnswers(){
      const saved = JSON.parse(localStorage.getItem("exercise_" + exerciseId + "_" + studentUid) || "{}");
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

    setTimeout(() => { restoreMatchAnswers(); }, 300);
    
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
