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

let allSchoolSimulations = [];
let filteredSchoolSimulations = [];
let assignedSimulationMap = {};

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
  await loadSchoolSimulations();
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
        <button class="primary" onclick="viewMaterial('${m.id}')" title="Lihat Materi">👁</button>
      </td>
    `;
    list.appendChild(tr);
  });
}

// ==========================
// LOAD SCHOOL SIMULATIONS
// ==========================
async function loadSchoolSimulations() {
  const tbody = document.getElementById("schoolSimulationsTable");
  tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:gray;">Memuat daftar simulasi...</td></tr>`;

  try {
    const approvedSubjects = schoolData.approvedSubjects || [];
    if (approvedSubjects.length === 0) {
      allSchoolSimulations = [];
      filteredSchoolSimulations = [];
      assignedSimulationMap = {};
      renderSimulationsTable();
      return;
    }

    // Ambil data penugasan aktif dari simulationGuru untuk sekolah ini
    assignedSimulationMap = {};
    const simGuruSnap = await getDocs(query(
      collection(db, "simulationGuru"), 
      where("schoolId", "==", currentSchoolId),
      where("isAssigned", "==", true)
    ));
    
    simGuruSnap.forEach(docSnap => {
      const data = docSnap.data();
      if (data.simulationId) {
        assignedSimulationMap[data.simulationId] = true;
      }
    });

    const qSim = query(
      collection(db, "simulations"),
      where("level", "==", schoolData.level),
      where("curriculum", "==", schoolData.curriculum)
    );

    const snap = await getDocs(qSim);
    
    allSchoolSimulations = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(sim => approvedSubjects.includes(sim.subject));

    filteredSchoolSimulations = allSchoolSimulations;
    renderSimulationsTable();

  } catch (err) {
    console.error("Error loading school simulations:", err);
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:red;">Gagal memuat daftar simulasi.</td></tr>`;
  }
}

function renderSimulationsTable() {
  const tbody = document.getElementById("schoolSimulationsTable");
  tbody.innerHTML = "";

  if (filteredSchoolSimulations.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:gray; padding:20px;">Belum ada simulasi untuk mapel aktif di tingkat ini.</td></tr>`;
    return;
  }

  filteredSchoolSimulations.forEach((sim, idx) => {
    const tr = document.createElement("tr");
    const isAssigned = !!assignedSimulationMap[sim.id];
    const questionCount = (sim.questions || []).length;

    let statusBadge = '';
    let actionButton = '';

    if (isAssigned) {
      statusBadge = `<span style="background:#dcfce7; color:#166534; padding:3px 8px; border-radius:12px; font-weight:bold; font-size:11px;">🟢 Tampil (Aktif)</span>`;
      actionButton = `<button onclick="togglePublishSimulation('${sim.id}', false)" style="background:#dc2626; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; font-size:12px;" title="Sembunyikan dari siswa">🛑 Sembunyikan</button>`;
    } else {
      statusBadge = `<span style="background:#f1f5f9; color:#64748b; padding:3px 8px; border-radius:12px; font-weight:bold; font-size:11px;">⚪ Belum Tampil</span>`;
      actionButton = `<button onclick="togglePublishSimulation('${sim.id}', true)" style="background:#4f46e5; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; font-size:12px;" title="Tampilkan ke siswa">🚀 Tampilkan</button>`;
    }

    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td><strong>${sim.title || "Tanpa Judul"}</strong></td>
      <td><span style="background:#f1f1f1; padding:3px 8px; border-radius:4px; font-size:12px;">${sim.subject || "-"}</span></td>
      <td>${sim.durationMinutes || 60} Menit</td>
      <td><span style="background:#dbeafe; color:#1e40af; padding:2px 8px; border-radius:12px; font-weight:bold; font-size:12px;">${questionCount} Soal</span></td>
      <td>${statusBadge}</td>
      <td>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button onclick="previewSimulation('${sim.id}')" style="background:#10b981; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; font-size:12px;" title="Lihat Soal">👁️ Lihat</button>
          ${actionButton}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.filterSimulationsList = () => {
  const search = document.getElementById("searchSimulationInput").value.toLowerCase();
  filteredSchoolSimulations = allSchoolSimulations.filter(s => 
    (s.title || "").toLowerCase().includes(search) || 
    (s.subject || "").toLowerCase().includes(search)
  );
  renderSimulationsTable();
};

// ==========================
// TOGGLE PUBLISH (Tampilkan / Sembunyikan)
// ==========================
window.togglePublishSimulation = async (simId, shouldPublish) => {
  const sim = allSchoolSimulations.find(s => s.id === simId);
  if (!sim) return;

  if (shouldPublish) {
    if (!confirm(`Tampilkan simulasi "${sim.title}" untuk dikerjakan siswa di sekolah ini?`)) return;

    try {
      const classesSnap = await getDocs(query(collection(db, "classes"), where("schoolId", "==", currentSchoolId)));
      
      if (classesSnap.empty) {
        showToast("Tidak ada data kelas di sekolah ini!", "error");
        return;
      }

      let batchCount = 0;
      for (const classDoc of classesSnap.docs) {
        await addDoc(collection(db, "simulationGuru"), {
          schoolId: currentSchoolId,
          classId: classDoc.id,
          simulationId: simId,
          isAssigned: true,
          assignedAt: new Date()
        });
        batchCount++;
      }

      showToast(`Berhasil! Simulasi ditampilkan ke ${batchCount} kelas.`);
      await loadSchoolSimulations();
    } catch (err) {
      console.error("Gagal menampilkan simulasi:", err);
      showToast("Gagal menampilkan simulasi.", "error");
    }
  } else {
    if (!confirm(`Sembunyikan simulasi "${sim.title}" dari siswa?`)) return;

    try {
      const qCheck = query(
        collection(db, "simulationGuru"),
        where("schoolId", "==", currentSchoolId),
        where("simulationId", "==", simId)
      );
      const snap = await getDocs(qCheck);
      
      for (const docSnap of snap.docs) {
        await deleteDoc(doc(db, "simulationGuru", docSnap.id));
      }

      showToast("Simulasi berhasil disembunyikan.");
      await loadSchoolSimulations();
    } catch (err) {
      console.error("Gagal menyembunyikan simulasi:", err);
      showToast("Gagal menyembunyikan simulasi.", "error");
    }
  }
};

// ==========================
// PREVIEW SIMULATION
// ==========================
window.previewSimulation = (simId) => {
  const sim = allSchoolSimulations.find(s => s.id === simId);
  if (!sim) return;

  const container = document.getElementById("previewQuestionsListContainer");
  container.innerHTML = "";

  const questions = sim.questions || [];
  if (questions.length === 0) {
    container.innerHTML = `<p style="text-align:center; color:gray;">Simulasi ini belum memiliki soal.</p>`;
  } else {
    questions.forEach((q, idx) => {
      let badgeColor = "background:#e0e7ff; color:#3730a3;";
      if (q.type === "matrix") badgeColor = "background:#fef3c7; color:#92400e;";
      if (q.type === "checkbox") badgeColor = "background:#dcfce7; color:#166534;";

      let html = `
        <div style="margin-bottom: 25px; padding-bottom: 20px; border-bottom: 1px solid #e2e8f0;">
          <div style="font-weight:bold; margin-bottom:8px; font-size:14px; color:#1e293b; display:flex; align-items:center; gap:8px;">
            <span>Soal ${idx + 1}</span>
            <span style="font-size:10px; ${badgeColor} padding:2px 6px; border-radius:4px;">${(q.type || "pg").toUpperCase()}</span>
          </div>
          <div style="margin-bottom:12px; font-size:14px; color:#334155;">${q.question || ""}</div>
      `;

      if (q.type === "pg" && q.options) {
        html += `<div style="display:flex; flex-direction:column; gap:6px;">`;
        q.options.forEach((opt, optIdx) => {
          const isCorrect = q.answer === optIdx;
          html += `
            <div style="padding:8px 10px; border:1px solid ${isCorrect ? '#86efac' : '#e5e7eb'}; border-radius:6px; background:${isCorrect ? '#f0fdf4' : '#fff'}; font-size:13px;">
              <b>${String.fromCharCode(65 + optIdx)}.</b> ${opt}
              ${isCorrect ? '<span style="float:right; font-size:11px; background:#22c55e; color:white; padding:2px 6px; border-radius:4px;">Kunci Jawaban</span>' : ''}
            </div>
          `;
        });
        html += `</div>`;
      } else if (q.type === "checkbox" && q.options) {
        html += `<div style="display:flex; flex-direction:column; gap:6px;">`;
        const correctAnswers = Array.isArray(q.answer) ? q.answer : [];
        q.options.forEach((opt, optIdx) => {
          const isCorrect = correctAnswers.includes(optIdx);
          html += `
            <div style="padding:8px 10px; border:1px solid ${isCorrect ? '#86efac' : '#e5e7eb'}; border-radius:6px; background:${isCorrect ? '#f0fdf4' : '#fff'}; font-size:13px; display:flex; align-items:center;">
              <input type="checkbox" ${isCorrect ? 'checked' : ''} disabled style="margin-right:8px;">
              <div style="flex:1;"><b>${String.fromCharCode(65 + optIdx)}.</b> ${opt}</div>
              ${isCorrect ? '<span style="font-size:11px; background:#22c55e; color:white; padding:2px 6px; border-radius:4px;">Kunci Jawaban</span>' : ''}
            </div>
          `;
        });
        html += `</div>`;
      } else if (q.type === "matrix" && q.columns && q.rows) {
        const statementHeader = q.statementTitle || "Pernyataan / Argumen";
        html += `
          <table style="width:100%; border-collapse:collapse; margin-top:8px; font-size:13px;">
            <thead>
              <tr style="background:#f3f4f6;">
                <th style="padding:8px; border:1px solid #d1d5db; text-align:left;">${statementHeader}</th>
                ${q.columns.map(col => `<th style="padding:8px; border:1px solid #d1d5db; text-align:center; width:110px;">${col}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
        `;
        q.rows.forEach((row) => {
          html += `
            <tr>
              <td style="padding:8px; border:1px solid #d1d5db;">${row.statement}</td>
              ${q.columns.map((col, cIdx) => {
                const isCorrect = row.answer === cIdx;
                return `
                  <td style="padding:8px; border:1px solid #d1d5db; text-align:center; background:${isCorrect ? '#f0fdf4' : 'transparent'};">
                    <input type="radio" ${isCorrect ? 'checked' : ''} disabled>
                  </td>
                `;
              }).join('')}
            </tr>
          `;
        });
        html += `</tbody></table>`;
      } else if (q.type === "match" && q.pairs) {
        html += `
          <table style="width:100%; border-collapse:collapse; margin-top:8px; font-size:13px;">
            <thead>
              <tr style="background:#f3f4f6;">
                <th style="padding:8px; border:1px solid #d1d5db; text-align:left; width:50%;">Pernyataan / Item (Kiri)</th>
                <th style="padding:8px; border:1px solid #d1d5db; text-align:left; width:50%;">Pasangan Jawaban (Kanan)</th>
              </tr>
            </thead>
            <tbody>
        `;
        q.pairs.forEach(p => {
          html += `
            <tr>
              <td style="padding:8px; border:1px solid #d1d5db;">${p.left}</td>
              <td style="padding:8px; border:1px solid #d1d5db; background:#f0fdf4; color:#15803d; font-weight:bold;">➡️ ${p.right}</td>
            </tr>
          `;
        });
        html += `</tbody></table>`;
      } else if (q.type === "isian") {
        html += `
          <div style="margin-top:8px; font-size:13px; color:#15803d; background:#f0fdf4; padding:8px 12px; border-radius:6px; border:1px solid #86efac;">
            <b>Kunci Jawaban:</b> ${q.answer || "-"}
          </div>
        `;
      }

      if (q.explanation) {
        html += `
          <div style="margin-top:10px; font-size:12px; background:#eff6ff; color:#1e40af; padding:8px 12px; border-radius:6px; border:1px solid #bfdbfe;">
            <b>💡 Pembahasan:</b> ${q.explanation}
          </div>
        `;
      }

      html += `</div>`;
      container.innerHTML += html;
    });
  }

  document.getElementById("previewQuestionModal").style.display = "flex";
  if (window.MathJax) {
    MathJax.typesetPromise([container]);
  }
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
    await loadSchoolSimulations();
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
  loadSchoolSimulations();
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
