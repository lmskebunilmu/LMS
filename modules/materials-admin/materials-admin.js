import { auth, db } from "../../firebase/firebase-config.js";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  query, 
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { loadLayout } from "../../assets/js/components.js";

let materialsData = [];
let currentSchoolId = null;
let schoolData = null;

// State Tambahan untuk Simulasi
let activeMaterialId = null;
let currentMaterialForSim = null;
let simulationsList = [];
let activeSimulationId = null;
let activeSimulationData = null;
let allExercisesData = [];

// ==========================
// AUTH
// ==========================
onAuthStateChanged(auth, async (user) => {
  if (!user) return window.location = "../../login.html";

  const userSnap = await getDoc(doc(db, "users", user.uid));
  const userData = userSnap.data();

  if (userData.role !== "admin") {
    alert("Akses ditolak!");
    return window.location = "../../login.html";
  }

  currentSchoolId = userData.schoolId;

  await loadLayout("admin");

  await waitForHeader();
  await loadProfileHeader(user);

  await loadSchoolData();
  if (!schoolData || schoolData.status !== "aktif") return;

  renderActiveSubjects();
  await loadSubjects();
  await loadMaterials();
});

// ==========================
// LOAD SCHOOL
// ==========================
async function loadSchoolData() {
  const snap = await getDoc(doc(db, "schools", currentSchoolId));
  schoolData = snap.data();

  if (schoolData?.status !== "aktif") {
    showToast("Sekolah kamu nonaktif!", "error");
    lockDashboard();
    return;
  }

  const allowed = schoolData.allowedSubjects || [];
  let approved = schoolData.approvedSubjects || [];

  approved = approved.filter(sub => allowed.includes(sub));

  if (approved.length !== (schoolData.approvedSubjects || []).length) {
    await updateDoc(doc(db, "schools", currentSchoolId), {
      approvedSubjects: approved
    });
    schoolData.approvedSubjects = approved;
  }
}

// ==========================
// LOAD MATERIALS
// ==========================
async function loadMaterials() {
  if (!schoolData) return;

  const list = document.getElementById("materialList");
  if (list) {
    list.innerHTML = `<tr><td colspan="5">⏳ Memuat materi...</td></tr>`;
  }

  try {
    const q = query(
      collection(db, "materials"),
      where("level", "==", schoolData.level),
      where("curriculum", "==", schoolData.curriculum)
    );

    const snapshot = await getDocs(q);
    const approved = schoolData.approvedSubjects || [];

    materialsData = (snapshot.docs || [])
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(m => approved.includes(m.subject));

    renderMaterials(materialsData);

  } catch (err) {
    console.error(err);
    if (list) {
      list.innerHTML = `<tr><td colspan="5">❌ Gagal memuat data</td></tr>`;
    }
  }
}

// ==========================
// RENDER MATERIALS
// ==========================
function renderMaterials(data) {
  const list = document.getElementById("materialList");
  list.innerHTML = "";

  if (data.length === 0) {
    list.innerHTML = `<tr><td colspan="5">Belum ada materi tersedia</td></tr>`;
    return;
  }

  data.forEach(m => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${m.title}</td>
      <td>
        <span style="background:#f1f1f1;padding:4px 8px;border-radius:5px;">
          ${m.subject}
        </span>
      </td>
      <td>${m.level}</td>
      <td>${m.curriculum}</td>
      <td>
        <div style="display:flex; gap:5px;">
          <button class="primary" onclick="viewMaterial('${m.id}')" title="Lihat Materi">👁</button>
          <button onclick="openSimulationManager('${m.id}')" style="background:#8b5cf6; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;" title="Kelola Simulasi Materi Ini">🎯 Simulasi</button>
        </div>
      </td>
    `;

    list.appendChild(tr);
  });
}

// ==========================
// SIMULATION MANAGER INTEGRATION
// ==========================
window.openSimulationManager = async (materialId) => {
  activeMaterialId = materialId;
  currentMaterialForSim = materialsData.find(m => m.id === materialId);

  if (!currentMaterialForSim) return showToast("Materi tidak ditemukan", "error");

  document.getElementById("materialTitleHeader").innerText = `🎯 Kelola Simulasi: ${currentMaterialForSim.title}`;
  document.getElementById("materialDetail").innerText = `${currentMaterialForSim.level || "-"} | ${currentMaterialForSim.subject || "-"} - ${currentMaterialForSim.chapter || "-"}`;
  
  document.getElementById("simulationSectionCard").style.display = "block";
  document.getElementById("simulationListView").style.display = "block";
  document.getElementById("simulationEditorView").style.display = "none";

  // Scroll otomatis ke bawah agar admin melihat panel simulasi
  document.getElementById("simulationSectionCard").scrollIntoView({ behavior: 'smooth' });

  await loadSimulationsList();
};

async function loadSimulationsList() {
  const tbody = document.getElementById("simulationListTable");
  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:gray;">Memuat daftar simulasi...</td></tr>`;

  try {
    const qSim = query(collection(db, "simulations"), where("materialId", "==", activeMaterialId));
    const snap = await getDocs(qSim);

    simulationsList = snap.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    renderSimulationsTable();
  } catch (err) {
    console.error("Error loading simulations:", err);
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:red;">Gagal memuat daftar simulasi.</td></tr>`;
  }
}

function renderSimulationsTable() {
  const tbody = document.getElementById("simulationListTable");
  tbody.innerHTML = "";

  if (simulationsList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:gray; padding:20px;">Belum ada simulasi untuk materi ini. Klik <b>"Buat Simulasi Baru"</b> di atas.</td></tr>`;
    return;
  }

  simulationsList.forEach((sim, idx) => {
    const tr = document.createElement("tr");
    const questionCount = (sim.questions || []).length;

    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td><strong>${sim.title || "Tanpa Judul"}</strong></td>
      <td>${sim.durationMinutes || 60} Menit</td>
      <td>${sim.passingGrade || 75}%</td>
      <td><span style="background:#dbeafe; color:#1e40af; padding:2px 8px; border-radius:12px; font-weight:bold; font-size:12px;">${questionCount} Soal</span></td>
      <td>
        <div style="display:flex; gap:5px;">
          <button onclick="openSimulationEditor('${sim.id}')" class="primary" style="padding:4px 8px; font-size:12px;">⚙️ Kelola</button>
          <button onclick="deleteSimulation('${sim.id}')" style="background:#ef4444; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:12px;">🗑 Hapus</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.filterSimulationsList = () => {
  const search = document.getElementById("searchSimulationInput").value.toLowerCase();
  const filtered = simulationsList.filter(s => (s.title || "").toLowerCase().includes(search));
  
  const tbody = document.getElementById("simulationListTable");
  tbody.innerHTML = "";

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:gray;">Simulasi tidak ditemukan.</td></tr>`;
    return;
  }

  filtered.forEach((sim, idx) => {
    const tr = document.createElement("tr");
    const questionCount = (sim.questions || []).length;
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td><strong>${sim.title || "Tanpa Judul"}</strong></td>
      <td>${sim.durationMinutes || 60} Menit</td>
      <td>${sim.passingGrade || 75}%</td>
      <td><span style="background:#dbeafe; color:#1e40af; padding:2px 8px; border-radius:12px; font-weight:bold; font-size:12px;">${questionCount} Soal</span></td>
      <td>
        <div style="display:flex; gap:5px;">
          <button onclick="openSimulationEditor('${sim.id}')" class="primary" style="padding:4px 8px; font-size:12px;">⚙️ Kelola</button>
          <button onclick="deleteSimulation('${sim.id}')" style="background:#ef4444; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:12px;">🗑 Hapus</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
};

// ==========================
// CREATE & EDIT SIMULATION
// ==========================
window.openCreateSimulationModal = () => {
  document.getElementById("newSimTitle").value = `Simulasi ${currentMaterialForSim?.title || ""}`;
  document.getElementById("newSimDuration").value = 60;
  document.getElementById("newSimPassingGrade").value = 75;
  document.getElementById("createSimModal").style.display = "flex";
};

window.closeCreateSimulationModal = () => {
  document.getElementById("createSimModal").style.display = "none";
};

window.createNewSimulation = async () => {
  const title = document.getElementById("newSimTitle").value.trim();
  const durationMinutes = parseInt(document.getElementById("newSimDuration").value) || 60;
  const passingGrade = parseInt(document.getElementById("newSimPassingGrade").value) || 75;

  if (!title) return showToast("Judul simulasi wajib diisi!", "error");

  const newSimData = {
    title,
    durationMinutes,
    passingGrade,
    randomizeQuestions: true,
    materialId: activeMaterialId,
    level: currentMaterialForSim?.level || schoolData.level,
    subject: currentMaterialForSim?.subject || "",
    curriculum: currentMaterialForSim?.curriculum || schoolData.curriculum,
    chapter: currentMaterialForSim?.chapter || "",
    questions: [],
    createdAt: new Date()
  };

  try {
    const docRef = await addDoc(collection(db, "simulations"), newSimData);
    showToast("Simulasi berhasil dibuat!");
    closeCreateSimulationModal();
    await loadSimulationsList();
    openSimulationEditor(docRef.id);
  } catch (err) {
    showToast("Gagal membuat simulasi: " + err.message, "error");
  }
};

window.openSimulationEditor = async (simId) => {
  activeSimulationId = simId;
  activeSimulationData = simulationsList.find(s => s.id === simId);

  if (!activeSimulationData) {
    const docSnap = await getDoc(doc(db, "simulations", simId));
    if (docSnap.exists()) {
      activeSimulationData = { id: docSnap.id, ...docSnap.data() };
    } else {
      return showToast("Data simulasi tidak ditemukan!", "error");
    }
  }

  document.getElementById("activeSimTitle").innerText = activeSimulationData.title;
  document.getElementById("simTitle").value = activeSimulationData.title;
  document.getElementById("simDuration").value = activeSimulationData.durationMinutes || 60;
  document.getElementById("simPassingGrade").value = activeSimulationData.passingGrade || 75;
  document.getElementById("simRandom").value = String(activeSimulationData.randomizeQuestions ?? true);

  document.getElementById("simulationListView").style.display = "none";
  document.getElementById("simulationEditorView").style.display = "block";

  renderQuestions();
};

window.closeSimulationEditor = () => {
  activeSimulationId = null;
  activeSimulationData = null;
  document.getElementById("simulationEditorView").style.display = "none";
  document.getElementById("simulationListView").style.display = "block";
  loadSimulationsList();
};

window.saveSimulationConfig = async () => {
  if (!activeSimulationId) return;

  const title = document.getElementById("simTitle").value.trim();
  const durationMinutes = parseInt(document.getElementById("simDuration").value) || 60;
  const passingGrade = parseInt(document.getElementById("simPassingGrade").value) || 75;
  const randomizeQuestions = document.getElementById("simRandom").value === "true";

  if (!title) return showToast("Judul simulasi wajib diisi!", "error");

  try {
    await updateDoc(doc(db, "simulations", activeSimulationId), {
      title,
      durationMinutes,
      passingGrade,
      randomizeQuestions
    });

    document.getElementById("activeSimTitle").innerText = title;
    showToast("Pengaturan berhasil disimpan!");
  } catch (err) {
    showToast(err.message, "error");
  }
};

window.deleteSimulation = async (simId) => {
  if (!confirm("Apakah Anda yakin ingin menghapus simulasi ini?")) return;

  try {
    await deleteDoc(doc(db, "simulations", simId));
    showToast("Simulasi berhasil dihapus!");
    loadSimulationsList();
  } catch (err) {
    showToast("Gagal menghapus simulasi", "error");
  }
};

// ==========================
// RENDER & MANAJEMEN SOAL SIMULASI
// ==========================
function renderQuestions() {
  const tbody = document.getElementById("questionList");
  const countSpan = document.getElementById("totalQuestionsCount");
  tbody.innerHTML = "";

  const questions = activeSimulationData?.questions || [];
  countSpan.innerText = questions.length;

  if (questions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:gray; padding:20px;">Belum ada soal. Klik <b>"Impor dari Latihan"</b> atau <b>"Tambah Soal Manual"</b>.</td></tr>`;
    return;
  }

  questions.forEach((q, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td><span style="background:#e0e7ff; color:#3730a3; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:bold;">${(q.type || "pg").toUpperCase()}</span></td>
      <td>${q.question || "-"}</td>
      <td>
        <div style="display:flex; gap:4px;">
          <button onclick="openPreviewQuestionModal(${idx})" style="background:#10b981; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:12px;">👁️ Preview</button>
          <button onclick="deleteQuestion(${idx})" style="background:#ef4444; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:12px;">🗑 Hapus</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  if (window.MathJax) {
    MathJax.typesetPromise([tbody]);
  }
}

window.deleteQuestion = async (index) => {
  if (!confirm("Hapus soal ini dari simulasi?")) return;
  activeSimulationData.questions.splice(index, 1);

  try {
    await updateDoc(doc(db, "simulations", activeSimulationId), {
      questions: activeSimulationData.questions
    });
    showToast("Soal berhasil dihapus!");
    renderQuestions();
  } catch (err) {
    showToast(err.message, "error");
  }
};

// ==========================
// IMPOR MULTI LATIHAN
// ==========================
window.openImportMultiModal = async () => {
  document.getElementById("importMultiModal").style.display = "flex";
  const container = document.getElementById("exercisesContainerList");
  container.innerHTML = "<p style='color:gray;'>Memuat daftar seluruh latihan...</p>";

  try {
    const snapExercises = await getDocs(collection(db, "exercises"));
    allExercisesData = snapExercises.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    renderExercisesList(allExercisesData);
  } catch (err) {
    container.innerHTML = "<p style='color:red;'>Gagal memuat daftar latihan.</p>";
  }
};

function renderExercisesList(list) {
  const container = document.getElementById("exercisesContainerList");
  container.innerHTML = "";

  if (list.length === 0) {
    container.innerHTML = "<p style='color:gray;'>Latihan tidak ditemukan.</p>";
    return;
  }

  list.forEach(ex => {
    const isCurrentMaterial = ex.materialId === activeMaterialId;
    const div = document.createElement("div");
    div.style.cssText = "display:flex; align-items:center; justify-content:space-between; padding:10px 12px; background:white; margin-bottom:8px; border-radius:6px; border:1px solid #e5e7eb;";

    div.innerHTML = `
      <label style="display:flex; align-items:center; gap:12px; cursor:pointer; width:100%;">
        <input type="checkbox" class="ex-checkbox" value="${ex.id}" style="width:18px; height:18px; cursor:pointer;" ${isCurrentMaterial ? 'checked' : ''}>
        <div>
          <strong style="font-size:14px; color:#1e3a8a;">${ex.title} ${isCurrentMaterial ? '<span style="font-size:11px; background:#dbeafe; color:#1e40af; padding:2px 6px; border-radius:4px;">Materi Ini</span>' : ''}</strong>
          <div style="font-size:12px; color:gray; margin-top:2px;">📘 ${ex.subject || "-"} | 📗 Bab: ${ex.chapter || "-"}</div>
        </div>
      </label>
    `;
    container.appendChild(div);
  });
}

window.filterExercisesList = () => {
  const search = document.getElementById("searchExerciseInput").value.toLowerCase();
  const filtered = allExercisesData.filter(ex => 
    (ex.title || "").toLowerCase().includes(search) ||
    (ex.subject || "").toLowerCase().includes(search)
  );
  renderExercisesList(filtered);
};

window.closeImportMultiModal = () => {
  document.getElementById("importMultiModal").style.display = "none";
};

window.confirmImportSelectedExercises = async () => {
  const checkboxes = document.querySelectorAll(".ex-checkbox:checked");
  const selectedIds = Array.from(checkboxes).map(cb => cb.value);

  if (selectedIds.length === 0) return showToast("Pilih minimal 1 latihan!", "error");

  showToast("Mengambil soal dari latihan terpilih...", "info");

  try {
    let importedQuestions = [];
    for (const exId of selectedIds) {
      const qQuestions = query(collection(db, "questions"), where("exerciseId", "==", exId));
      const snapQ = await getDocs(qQuestions);
      snapQ.docs.forEach(docSnap => {
        importedQuestions.push(docSnap.data());
      });
    }

    if (importedQuestions.length === 0) return showToast("Latihan terpilih belum memiliki isi soal!", "error");

    if (!activeSimulationData.questions) activeSimulationData.questions = [];
    activeSimulationData.questions = [...activeSimulationData.questions, ...importedQuestions];

    await updateDoc(doc(db, "simulations", activeSimulationId), {
      questions: activeSimulationData.questions
    });

    showToast(`Berhasil menambahkan ${importedQuestions.length} soal!`);
    closeImportMultiModal();
    renderQuestions();
  } catch (err) {
    showToast("Gagal mengimpor soal", "error");
  }
};

// ==========================
// TAMBAH SOAL MANUAL & PREVIEW
// ==========================
window.showAddQuestionModal = () => {
  document.getElementById("jsonInput").value = "";
  document.getElementById("questionModal").style.display = "flex";
};

window.closeQuestionModal = () => {
  document.getElementById("questionModal").style.display = "none";
};

window.saveQuestionJSON = async () => {
  const jsonStr = document.getElementById("jsonInput").value.trim();
  if (!jsonStr) return showToast("JSON tidak boleh kosong", "error");

  try {
    const parsed = JSON.parse(jsonStr);
    const newQuestions = Array.isArray(parsed) ? parsed : [parsed];

    if (!activeSimulationData.questions) activeSimulationData.questions = [];
    activeSimulationData.questions.push(...newQuestions);

    await updateDoc(doc(db, "simulations", activeSimulationId), {
      questions: activeSimulationData.questions
    });

    showToast("Soal berhasil ditambahkan!");
    closeQuestionModal();
    renderQuestions();
  } catch (err) {
    alert("Format JSON tidak valid!");
  }
};

window.openPreviewQuestionModal = (index) => {
  const q = activeSimulationData.questions[index];
  if (!q) return;

  const container = document.getElementById("previewQuestionContainer");
  document.getElementById("previewBadgeType").innerText = (q.type || "pg").toUpperCase();

  let html = `<div style="font-weight:600; margin-bottom:15px; font-size:16px;">${q.question || ""}</div>`;
  if (q.type === "pg" && q.options) {
    html += `<div style="display:flex; flex-direction:column; gap:8px;">`;
    q.options.forEach((opt, optIdx) => {
      const isCorrect = q.answer === optIdx;
      html += `<div style="padding:10px 12px; border:1px solid ${isCorrect ? '#86efac' : '#e5e7eb'}; border-radius:6px; background:${isCorrect ? '#f0fdf4' : '#fff'};"><b>${String.fromCharCode(65 + optIdx)}.</b> ${opt}</div>`;
    });
    html += `</div>`;
  }
  container.innerHTML = html;
  document.getElementById("previewQuestionModal").style.display = "flex";
};

window.closePreviewQuestionModal = () => {
  document.getElementById("previewQuestionModal").style.display = "none";
};

// ==========================
// STANDAR (SUBJECTS, VIEW, SEARCH)
// ==========================
async function loadSubjects() {
  const select = document.getElementById("subjectSelect");
  if (!select || !schoolData) return;

  const allowedSubjects = schoolData.allowedSubjects || [];
  select.innerHTML = `<option value="">Pilih Mapel</option>`;

  allowedSubjects.forEach(sub => {
    const opt = document.createElement("option");
    opt.value = sub;
    opt.textContent = sub;
    select.appendChild(opt);
  });
}

async function loadProfileHeader(user) {
  const userSnap = await getDoc(doc(db, "users", user.uid));
  if (!userSnap.exists()) return;

  const data = userSnap.data();
  const name = data.name || "Admin";
  const avatar = data.avatarURL || "../../assets/images/default-avatar.png";

  if (document.getElementById("headerNameHeader")) document.getElementById("headerNameHeader").innerText = name;
  if (document.getElementById("headerAvatarHeader")) document.getElementById("headerAvatarHeader").src = avatar;

  if (currentSchoolId) {
    const schoolSnap = await getDoc(doc(db, "schools", currentSchoolId));
    if (schoolSnap.exists()) {
      const school = schoolSnap.data();
      if (document.getElementById("headerSchoolName")) document.getElementById("headerSchoolName").innerText = school.name || "-";
      if (document.getElementById("headerSchoolLogo")) document.getElementById("headerSchoolLogo").src = school.logoURL || "../../assets/images/default-logo.png";
    }
  }
}

window.approveSubject = async () => {
  const subject = document.getElementById("subjectSelect").value;
  if (!subject) return showToast("Pilih mapel dulu");

  let subjects = schoolData.approvedSubjects || [];
  if (!subjects.includes(subject)) {
    subjects.push(subject);
    await updateDoc(doc(db, "schools", currentSchoolId), { approvedSubjects: subjects });
    showToast("Mapel berhasil diaktifkan");
    await loadSchoolData();
    renderActiveSubjects();
    await loadMaterials();
  } else {
    showToast("Mapel sudah aktif");
  }
};

window.removeSubject = async (subject) => {
  let subjects = schoolData.approvedSubjects || [];
  subjects = subjects.filter(s => s !== subject);

  await updateDoc(doc(db, "schools", currentSchoolId), { approvedSubjects: subjects });
  showToast("Mapel dinonaktifkan");
  await loadSchoolData();
  renderActiveSubjects();
  loadMaterials();
};

window.viewMaterial = (id) => {
  const data = materialsData.find(m => m.id === id);
  if (!data) return;

  const win = window.open("", "_blank");
  win.document.open();
  win.document.write(data.content || "");
  win.document.close();
};

window.filterMaterials = () => {
  const search = document.getElementById("searchMaterial").value.toLowerCase();
  const filtered = materialsData.filter(m =>
    m.title.toLowerCase().includes(search) ||
    m.subject.toLowerCase().includes(search)
  );
  renderMaterials(filtered);
};

function showToast(msg, type = "success") {
  const t = document.getElementById("toast");
  t.innerText = msg;
  t.className = type === "error" ? "toast error active" : "toast active";
  setTimeout(() => t.classList.remove("active"), 3000);
}

function waitForHeader() {
  return new Promise(resolve => {
    const interval = setInterval(() => {
      const el = document.getElementById("headerAvatarHeader");
      if (el) {
        clearInterval(interval);
        resolve();
      }
    }, 50);
  });
}

function renderActiveSubjects() {
  const container = document.getElementById("activeSubjects");
  if (!container) return;

  const subjects = schoolData.approvedSubjects || [];
  if (subjects.length === 0) {
    container.innerHTML = `<small>Belum ada mapel aktif</small>`;
    return;
  }

  container.innerHTML = subjects.map(sub => `
    <span style="background:#e3f2fd; color:#1976d2; padding:5px 10px; margin:3px; border-radius:20px; display:inline-flex; align-items:center;">
      ${sub}
      <button onclick="removeSubject('${sub}')" style="margin-left:5px; background:none; border:none; cursor:pointer;">❌</button>
    </span>
  `).join("");
}

function lockDashboard() {
  const main = document.querySelector(".main");
  if (!main) return;
  main.innerHTML = `
    <div style="display:flex; justify-content:center; align-items:center; height:80vh; flex-direction:column; text-align:center;">
      <h1 style="color:red;">🚫 Akses Ditolak</h1>
      <p>Sekolah kamu sedang <b>nonaktif</b></p>
      <button onclick="location.href='../../login.html'" class="primary">Logout</button>
    </div>
  `;
}
