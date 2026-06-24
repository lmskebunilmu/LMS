import { auth, db } from "../../firebase/firebase-config.js";
import {
  collection,
  getDocs,
  getDoc,
  doc,
  query,
  where,
  orderBy
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
  document.getElementById("headerAvatarHeader").src = userData.avatarURL || "../assets/images/default-avatar.png";
  document.getElementById("headerSchoolName").innerText = school.name || "-";
  document.getElementById("headerSchoolLogo").src = school.logoURL || "../assets/images/default-logo.png";
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
// FIND STUDENT CLASS (REVISI TOTAL AGAR SINKRON DENGAN ADMIN)
// ==========================
async function findStudentClass(studentUid, schoolId) {
  try {
    // Admin menyimpan classId langsung di dalam dokumen student, bukan array di dokumen kelas
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
// CLASS MAP (REVISI SINKRONISASI FIELD NAME)
// ==========================
async function loadClassMap(schoolId) {
  const q = query(
    collection(db, "classes"),
    where("schoolId", "==", schoolId)
  );

  const snap = await getDocs(q);
  classMap = {};

  snap.forEach(d => {
    // REVISI: diubah dari className menjadi name agar sinkron dengan Admin & Guru
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
// Ubah fungsi LOADEXERCISES milik siswa agar mengambil rincian data terbaru
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
  deadlineDate: assign.deadlineDate || "", // 🔥 Tanggal batas
  deadlineTime: assign.deadlineTime || "", // 🔥 Jam menit batas
  questions: ex.questions || []
});
  }

  const map = new Map();
  temp.forEach(i => map.set(i.exerciseId, i));
  exercisesSiswa = [...map.values()];
}

// Sesuaikan fungsi RENDER MATERIALS siswa untuk mengunci latihan yang belum aktif
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

        // 🔥 RENDER LATIHAN DENGAN SISTEM CEK KONDISI AKTIF DAN WAKTU DURASI
        currentBab.exercises.forEach(ex => {
  const item = document.createElement("div");
  item.className = "materi-item";

  // LOGIKA VALIDASI APAKAH DEADLINE SUDAH LEWAT ATAU BELUM
  let isExpired = false;
  let deadlineString = "Tidak ditentukan";

  if (ex.deadlineDate && ex.deadlineTime) {
    const deadlineTarget = new Date(`${ex.deadlineDate}T${ex.deadlineTime}:00`);
    const sekarang = new Date();
    
    // Bandingkan waktu sekarang dengan target dari guru
    if (sekarang > deadlineTarget) {
      isExpired = true;
    }
    
    // Format tampilan info rapi untuk siswa
    const opsiFormat = { year: 'numeric', month: 'short', day: 'numeric' };
    const tanggalRapi = new Date(ex.deadlineDate).toLocaleDateString('id-ID', opsiFormat);
    deadlineString = `${tanggalRapi} - Pukul ${ex.deadlineTime} WIB`;
  }

  // VALIDASI KONDISI TAMPILAN
  if (ex.isAssigned && !isExpired) {
    // TUGAS AKTIF BISA DIKERJAKAN
    item.style.borderLeft = "4px solid #16a34a"; 
    item.style.cursor = "pointer";
    item.innerHTML = `
      📝 ${ex.title} 
      <span style="color:#16a34a; font-size:11px; font-weight:bold; margin-left:8px;">
        ⏱ Batas: ${deadlineString} (Tugas Aktif)
      </span>`;
    item.onclick = () => openExercise(ex.exerciseId);

  } else if (ex.isAssigned && isExpired) {
    // TUGAS SUDAH LEWAt BATAS (TERKUNCI OTOMATIS)
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
    // BELUM DIAKTIFKAN OLEH GURU
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
// OPEN EXERCISE
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
  where("exerciseId", "==", id), 
  orderBy("order", "asc") // 🔥 Parameter orderBy harus berada di dalam tanda kurung query()
);
  const qSnap = await getDocs(q);
  const questions = qSnap.docs.map(d => d.data());

  const win = window.open("", "_blank");
  let html = `
  <html>
  <head>
  <title>${exData.title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
      *{box-sizing:border-box;}
      body{margin:0;font-family:Arial;background:#f5f6fa;}
      .topbar{position:sticky;top:0;z-index:999;background:white;padding:15px 20px;display:flex;justify-content:space-between;align-items:center;box-shadow:0 2px 10px rgba(0,0,0,.08);}
      .title{font-size:20px;font-weight:bold;}
      .btn-group{display:flex;gap:10px;}
      button{border:none;padding:10px 18px;border-radius:10px;cursor:pointer;font-weight:bold;}
      .fullscreen-btn{background:#111827;color:white;}
      .exit-btn{background:#dc2626;color:white;}
      .submit-btn{background:#2563eb;color:white;width:100%;margin-top:30px;}
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
    </style>
  </head>
  <body>
    <div class="topbar">
      <div class="title">📝 ${exData.title}</div>
      <div class="btn-group">
        <button class="fullscreen-btn" onclick="openFullscreen()">⛶ Fullscreen</button>
        <button class="exit-btn" onclick="closeFullscreen()">✕ Exit Fullscreen</button>
      </div>
    </div>
    <div class="container">
  `;

  questions.forEach((q, index) => {
    const saved = JSON.parse(localStorage.getItem("exercise_" + id) || "{}");
    const savedAnswer = saved[index];

    html += `
      <div class="question">
         <h3>${index + 1}. ${q.question || ""}</h3>
    `;

    if (q.type === "pg") {
      (q.options || []).forEach((opt, i) => {
        const checked = savedAnswer == i ? "checked" : "";
        html += `
          <label>
            <input type="radio" name="q${index}" value="${i}" ${checked}> ${opt}
          </label>
        `;
      });
    } else if (q.type === "checkbox") {
      (q.options || []).forEach((opt, i) => {
        const checked = Array.isArray(savedAnswer) && savedAnswer.includes(String(i)) ? "checked" : "";
        html += `
          <label>
            <input type="checkbox" name="q${index}" value="${i}" ${checked}> ${opt}
          </label>
        `;
      });
    } else if (q.type === "isian") {
      html += `
        <input type="text" id="q${index}" value="${savedAnswer || ""}" placeholder="Jawaban...">
      `;
    } else if (q.type === "match") {
      const shuffled = [...(q.pairs || [])].sort(() => Math.random() - 0.5);
      html += `
        <div class="match-wrapper">
          <svg class="match-lines"></svg>
          <div class="match-column">
            ${(q.pairs || []).map((p, i) => `
              <div class="match-item left-item" data-question="${index}" data-left="${i}" data-answer="${p.right}">
                ${p.left}
              </div>
            `).join("")}
          </div>
          <div class="match-column">
            ${shuffled.map((p, i) => `
              <div class="match-item right-item" data-question="${index}" data-right="${p.right}">
                ${p.right}
              </div>
            `).join("")}
          </div>
        </div>
      `;
    } else if (q.type === "multi_isian") {
      (q.fields || []).forEach((f, i) => {
        const val = savedAnswer?.[i] || "";
        html += `
          <div style="margin-top:15px">
            <label style="display:block; margin-bottom:8px; font-weight:bold; background:none; padding:0;">${f.label}</label>
            <input type="text" name="multi_${index}_${i}" value="${val}" placeholder="Jawaban...">
          </div>
        `;
      });
    }

    html += `
      <div style="margin-top:20px">
        <button onclick="checkAnswer(${index})" style="background:#2563eb; color:white; border:none; padding:10px 16px; border-radius:10px; cursor:pointer;">✅ Cek Jawaban</button>
        <div id="result_${index}" style="margin-top:15px;font-weight:bold"></div>
        <div id="explain_${index}" style="margin-top:15px;display:none">
          <button onclick="toggleExplain(${index})" style="background:#16a34a; color:white; border:none; padding:10px 16px; border-radius:10px; cursor:pointer;">📘 Pembahasan</button>
          <div id="explain_content_${index}" style="display:none; margin-top:10px; background:#f3f4f6; padding:15px; border-radius:10px;">
            ${q.explanation || "Belum ada pembahasan"}
          </div>
        </div>
      </div>
    </div>
    `;
  });

  html += `
      <button class="submit-btn" onclick="alert('Jawaban latihan Anda berhasil tersimpan di browser!')">Kirim Jawaban</button>
    </div>
    <script>
      function openFullscreen(){
        const elem = document.documentElement;
        if (elem.requestFullscreen) elem.requestFullscreen();
      }
      function closeFullscreen(){
        if (document.exitFullscreen) document.exitFullscreen();
      }
      window.onload = () => {
        openFullscreen();
        setTimeout(() => { restoreMatchAnswers(); }, 300);
      };
      
      window.addEventListener("load", async () => {
        if (window.MathJax) { await MathJax.typesetPromise(); }
      });

      let selectedLeft = null;
      document.addEventListener("click", (e) => {
        const left = e.target.closest(".left-item");
        const right = e.target.closest(".right-item");

        if (left) {
          document.querySelectorAll(".left-item").forEach(x => x.classList.remove("selected"));
          left.classList.add("selected");
          selectedLeft = left;
        }

        if (right && selectedLeft) {
          const qIndex = selectedLeft.dataset.question;
          const leftIndex = selectedLeft.dataset.left;
          const rightValue = right.dataset.right;

          window.matchAnswers ??= {};
          window.matchAnswers[qIndex] ??= {};
          window.matchAnswers[qIndex][leftIndex] = rightValue;

          drawConnection(selectedLeft, right);
          selectedLeft.classList.remove("selected");
          selectedLeft.classList.add("connected");
          right.classList.add("connected");

          saveAnswer(qIndex, window.matchAnswers[qIndex]);
          selectedLeft = null;
        }
      });

      function drawConnection(leftEl, rightEl){
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
      }

      function saveAnswer(index, value){
  const key = "exercise_" + "${id}";
  const data = JSON.parse(localStorage.getItem(key) || "{}");
  data[index] = value;
  localStorage.setItem(key, JSON.stringify(data));
}

function checkAnswer(index){
  const question = ${JSON.stringify(questions)};
  const q = question[index];
  let correct = false;
  let userAnswer = null;

  if(q.type === "pg"){
    // PERBAIKAN SINTAKS SELECTOR
    const selected = document.querySelector('input[name="q' + index + '"]:checked');
    if(!selected) { alert("Pilih jawaban!"); return; }
    userAnswer = selected.value;
    saveAnswer(index, userAnswer);
    correct = userAnswer == q.answer;
  }
  else if(q.type === "checkbox"){
    // PERBAIKAN SINTAKS SELECTOR
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
          const pairs = window.matchAnswers?.[index] || {};
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
        }else{
          result.innerHTML = "❌ Jawaban Salah";
          result.style.color = "red";
        }
      }

      function toggleExplain(index){
        const el = document.getElementById("explain_content_"+index);
        el.style.display = el.style.display === "block" ? "none" : "block";
      }

      function restoreMatchAnswers(){
        const saved = JSON.parse(localStorage.getItem("exercise_" + "${id}") || "{}");
        window.matchAnswers = {};
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
              drawConnection(leftEl, rightEl);
            }
          });
        });
      }
    </script>
  </body>
  </html>
  `;

  win.document.write(html);
  win.document.close();
};
window.filterMaterialsSiswa = () => {
  const search = document.getElementById("searchMaterialSiswa").value.toLowerCase();
  filteredMaterials = materialsSiswa.filter(m => {
    return m.title.toLowerCase().includes(search) || m.subject.toLowerCase().includes(search);
  });
  renderMaterials(filteredMaterials);
};
