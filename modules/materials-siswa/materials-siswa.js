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
let filteredExercises = [];
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
  
  renderMaterials(materialsSiswa, exercisesSiswa);
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
  filteredExercises = exercisesSiswa;
}

// ==========================
// RENDER UI (MAPEL -> BAB -> SUB-BAB -> ITEM) [URUT ABJAD A-Z]
// ==========================
function renderMaterials(matData, exData) {
  const container = document.getElementById("materialSiswaList");
  if (!container) return;

  container.innerHTML = "";

  if (!matData.length && !exData.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <div style="font-size: 15px; font-weight: 600; color: #334155;">Tidak Ditemukan</div>
        <p style="color:#64748b; font-size:13px; margin-top:4px;">Tidak ada materi atau latihan yang cocok dengan pencarian Anda.</p>
      </div>`;
    return;
  }

  const grouped = {};

  matData.forEach(m => {
    const mapel = m.subject || "Umum";
    const bab = m.chapter || "Umum";
    const sub = m.subChapter || "Umum";

    grouped[mapel] ??= {};
    grouped[mapel][bab] ??= {};
    grouped[mapel][bab][sub] ??= { materials: [], exercises: [] };
    grouped[mapel][bab][sub].materials.push(m);
  });

  exData.forEach(ex => {
    const mapel = ex.subject || "Umum";
    const bab = ex.chapter || "Umum";
    const sub = ex.subChapter || "Umum";

    grouped[mapel] ??= {};
    grouped[mapel][bab] ??= {};
    grouped[mapel][bab][sub] ??= { materials: [], exercises: [] };
    grouped[mapel][bab][sub].exercises.push(ex);
  });

  const sortedSubjects = Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'id', { sensitivity: 'base' }));

  sortedSubjects.forEach(mapel => {
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

    const sortedChapters = Object.keys(grouped[mapel]).sort((a, b) => a.localeCompare(b, 'id', { sensitivity: 'base' }));

    sortedChapters.forEach(bab => {
      const babDiv = document.createElement("div");
      babDiv.className = "chapter-group";
      babDiv.innerHTML = `
        <div class="chapter-header" onclick="toggleAccordion(this)">
          <span>📖 ${bab}</span>
          <div class="chevron">▼</div>
        </div>
        <div class="chapter-content" style="display: none;"></div>
      `;
      const babContent = babDiv.querySelector(".chapter-content");

      const sortedSubChapters = Object.keys(grouped[mapel][bab]).sort((a, b) => a.localeCompare(b, 'id', { sensitivity: 'base' }));

      sortedSubChapters.forEach(sub => {
        const subDiv = document.createElement("div");
        subDiv.className = "subchapter-group";
        subDiv.innerHTML = `
          <div class="subchapter-header" onclick="toggleAccordion(this)">
            <span>📑 ${sub}</span>
            <div class="chevron">▼</div>
          </div>
          <div class="subchapter-items" style="display: none;"></div>
        `;
        const subContent = subDiv.querySelector(".subchapter-items");
        const currentSub = grouped[mapel][bab][sub];

        currentSub.materials.sort((a, b) => a.title.localeCompare(b.title, 'id', { sensitivity: 'base' })).forEach(m => {
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
          subContent.appendChild(item);
        });

        currentSub.exercises.sort((a, b) => a.title.localeCompare(b.title, 'id', { sensitivity: 'base' })).forEach(ex => {
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
          
          subContent.appendChild(item);
        });

        babContent.appendChild(subDiv);
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
// OPEN EXERCISE (MENGGUNAKAN HALAMAN TERPISAH EXERCISE.HTML)
// ==========================
window.openExercise = (id) => {
  const win = window.open(`exercise.html?id=${id}`, "_blank");
  if (!win) {
    alert("Pop-up diblokir browser! Izinkan pop-up untuk mengerjakan latihan.");
  }
};

// ==========================
// SEARCH FILTER
// ==========================
window.filterMaterialsSiswa = () => {
  const search = document.getElementById("searchMaterialSiswa").value.toLowerCase();
  
  filteredMaterials = materialsSiswa.filter(m => {
    return m.title.toLowerCase().includes(search) || 
           m.subject.toLowerCase().includes(search) || 
           m.chapter.toLowerCase().includes(search);
  });

  filteredExercises = exercisesSiswa.filter(ex => {
    return ex.title.toLowerCase().includes(search) || 
           ex.subject.toLowerCase().includes(search) || 
           ex.chapter.toLowerCase().includes(search);
  });

  renderMaterials(filteredMaterials, filteredExercises);
};
