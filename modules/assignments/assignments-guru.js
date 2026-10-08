import { auth, db } from "../../firebase/firebase-config.js";
import {
  collection,
  getDocs,
  getDoc,
  doc,
  addDoc,
  query,
  deleteDoc,
  where,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { loadLayout } from "../../assets/js/components.js";

// ==========================
// STATE MANAGEMENT
// ==========================
let materialsGuru = [];
let filteredMaterials = [];
let schoolData = null;
let exercisesData = [];
let assignedMaterials = [];
let assignedExercises = [];
let assignedExercisesDetail = [];

function getSelectedClassId() {
  return document.getElementById("classSelect").value;
}

// ==========================
// AUTH INITIALIZATION
// ==========================
onAuthStateChanged(auth, async (user) => {
  if (!user) return window.location = "../../login.html";

  console.log("AUTH UID:", user.uid);

  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    alert("Data user tidak ditemukan!");
    return window.location = "../../login.html";
  }

  const userData = userSnap.data();

  if (userData.role !== "guru") {
    alert("Akses hanya guru!");
    return window.location = "../../login.html";
  }

  // 🔒 CEK STATUS GURU
  const teacherSnap = await getDoc(doc(db, "teachers", user.uid));
  if (teacherSnap.exists()) {
    const teacherData = teacherSnap.data();
    if (teacherData.status === "nonaktif") {
      showToast("Akun kamu dinonaktifkan!", "error");
      document.querySelector(".main").innerHTML = `
        <div style="text-align:center;margin-top:100px;">
          <h1 style="color:red;">🚫 Akun Dinonaktifkan</h1>
          <p>Hubungi admin sekolah</p>
          <button onclick="window.location='../../login.html'">Logout</button>
        </div>
      `;
      return;
    }
  }

  await loadLayout("guru");
  await waitForHeader();
  await loadProfileHeader(user);

  await loadClasses(user);
  await loadSchoolData(userData.schoolId);
  await loadExercises();

  const classSelect = document.getElementById("classSelect");
  classSelect.addEventListener("change", async () => {
    document.getElementById("subjectFilter").value = "";
    await loadMaterialsData();
  });

  await loadMaterialsData();
});

// ==========================
// LOAD DATA FROM FIRESTORE
// ==========================
async function loadClasses(user) {
  const userSnap = await getDoc(doc(db, "users", user.uid));
  const userData = userSnap.data();

  const q = query(
    collection(db, "classes"),
    where("teacherIds", "array-contains", user.uid),
    where("schoolId", "==", userData.schoolId)
  );

  const snap = await getDocs(q);
  const select = document.getElementById("classSelect");
  select.innerHTML = "";

  // 1. Tampung data kelas ke dalam array untuk diurutkan
  let classesArray = [];
  snap.forEach(docSnap => {
    classesArray.push({
      id: docSnap.id,
      name: docSnap.data().name || "Kelas Tanpa Nama"
    });
  });

  // 2. Urutkan nama kelas secara alfabetis (A-Z) dengan dukungan numerik (misal: Kelas 7 sebelum Kelas 10)
  classesArray.sort((a, b) => a.name.localeCompare(b.name, 'id', { numeric: true }));

  // 3. Masukkan ke dalam elemen <select>
  classesArray.forEach(cls => {
    const opt = document.createElement("option");
    opt.value = cls.id;
    opt.textContent = cls.name;  
    select.appendChild(opt);
  });
}

async function loadSchoolData(schoolId) {
  const snap = await getDoc(doc(db, "schools", schoolId));
  if (!snap.exists()) return;
  schoolData = snap.data();
}

async function loadExercises() {
  const snap = await getDocs(collection(db, "exercises"));
  exercisesData = [];
  snap.forEach(doc => {
    exercisesData.push({ id: doc.id, ...doc.data() });
  });
}

async function loadMaterialsData() {
  const classId = getSelectedClassId();
  if (!classId) return;

  const classSnap = await getDoc(doc(db, "classes", classId));
  if (!classSnap.exists()) return;

  const classData = classSnap.data();
  const teacherSubjects = classData.teachers?.[auth.currentUser.uid] || [];
  loadSubjectFilter(teacherSubjects);

  const approved = schoolData.approvedSubjects || [];
  let q;

  if (teacherSubjects.length > 0) {
    q = query(
      collection(db, "materials"),
      where("level", "==", schoolData.level),
      where("curriculum", "==", schoolData.curriculum),
      where("subject", "in", teacherSubjects)
    );
  } else {
    q = query(
      collection(db, "materials"),
      where("level", "==", schoolData.level),
      where("curriculum", "==", schoolData.curriculum)
    );
  }

  const snap = await getDocs(q);
  materialsGuru = [];

  snap.forEach(doc => {
    const m = { id: doc.id, ...doc.data() };
    if (!approved.includes(m.subject)) return;
    if (teacherSubjects.length && !teacherSubjects.includes(m.subject)) return;
    materialsGuru.push(m);
  });

  filteredMaterials = materialsGuru;
  await loadAssignments();
  renderAssignmentPanel(filteredMaterials);
}

async function loadAssignments() {
  const classId = getSelectedClassId();
  const user = auth.currentUser;
  if (!classId || !user) return;

  const mq = query(collection(db, "materialGuru"), where("classId", "==", classId), where("teacherId", "==", user.uid));
  const msnap = await getDocs(mq);
  assignedMaterials = msnap.docs.map(d => d.data().materialId);

  const eq = query(collection(db, "exerciseGuru"), where("classId", "==", classId), where("teacherId", "==", user.uid));
  const esnap = await getDocs(eq);
  
  assignedExercises = [];
  assignedExercisesDetail = [];
  
  esnap.forEach(d => {
    const data = d.data();
    assignedExercisesDetail.push({ docId: d.id, ...data });
    if (data.isAssigned) {
      assignedExercises.push(data.exerciseId);
    }
  });
}

// ==========================
// RENDER PANEL LOGIC (Tampilan Vertikal ke Bawah & Responsif HP)
// ==========================
function renderAssignmentPanel(data) {
  const container = document.getElementById("assignmentGuruList");
  container.innerHTML = "";

  if (data.length === 0) {
    container.innerHTML = `<p style="text-align:center; color:gray; padding:20px;">Tidak ada materi atau kuis latihan ditemukan.</p>`;
    return;
  }

  // 1. Grouping berdasarkan Bab (Chapter)
  const groupedByChapter = {};
  data.forEach(m => {
    const bab = m.chapter || "Bab Umum";
    if (!groupedByChapter[bab]) groupedByChapter[bab] = [];
    groupedByChapter[bab].push(m);
  });

  Object.keys(groupedByChapter).forEach(bab => {
    const babDiv = document.createElement("div");
    babDiv.className = "bab-box";

    const materialsInChapter = groupedByChapter[bab];
    const groupedBySubChapter = {};
    materialsInChapter.forEach(m => {
      const subChp = m.subChapter || "Sub-Bab Umum";
      if (!groupedBySubChapter[subChp]) groupedBySubChapter[subChp] = [];
      groupedBySubChapter[subChp].push(m);
    });

    babDiv.innerHTML = `
      <h3 class="bab-title">
        <span>📘 Bab: ${bab}</span>
        <button class="toggle-btn" style="padding: 6px 12px; background: #0d6efd; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 500;">Lihat Materi & Latihan</button>
      </h3>

      <div class="subbab-list">
        ${Object.keys(groupedBySubChapter).map(subChp => {
          return `
            <div class="subbab-group" style="margin-bottom: 15px; border-left: 3px solid #0d6efd; padding-left: 10px;">
              <div style="font-weight: bold; font-size: 14px; color: #1e293b; margin-bottom: 8px;">
                📂 Sub-Bab: ${subChp}
              </div>

              ${groupedBySubChapter[subChp].map(m => {
                let materialExercises = exercisesData.filter(ex => ex.materialId === m.id);
                
                materialExercises.sort((a, b) => {
                  const titleA = (a.title || "").toLowerCase();
                  const titleB = (b.title || "").toLowerCase();
                  return titleA.localeCompare(titleB);
                });

                const isMaterialChecked = assignedMaterials.includes(m.id) ? "checked" : "";

                return `
                  <div class="materi-item" style="background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; margin-bottom: 10px;">
                    
                    <div style="margin-bottom: 8px;">
                      <label style="font-weight: 600; color: #334155; cursor: pointer; display: flex; align-items: flex-start; gap: 8px; font-size: 14px;">
                        <input type="checkbox" class="subbab-check" value="${m.id}" ${isMaterialChecked} disabled style="margin-top: 3px;">
                        <span>📄 Materi: ${m.title}</span>
                      </label>
                    </div>

                    <div class="exercise-list">
                      <div style="font-size: 11px; font-weight: bold; color: #64748b; margin-bottom: 6px; text-transform: uppercase;">📝 Daftar Latihan Soal:</div>
                      
                      ${materialExercises.map(ex => {
                        const dbAssign = assignedExercisesDetail.find(e => e.exerciseId === ex.id);
                        const isChecked = dbAssign && dbAssign.isAssigned ? "checked" : "";
                        
                        const savedDeadlineDate = dbAssign ? dbAssign.deadlineDate || "" : "";
                        const savedDeadlineTime = dbAssign ? dbAssign.deadlineTime || "" : "";

                        return `
                          <div class="exercise-row">
                            <label class="exercise-item" style="margin: 0; cursor: pointer; font-weight: 500; font-size: 13px; display: flex; align-items: flex-start; gap: 8px;">
                              <input
                                type="checkbox"
                                class="exercise-check"
                                data-material="${m.id}"
                                value="${ex.id}"
                                ${isChecked} 
                                style="margin-top: 2px;"
                              >
                              <span>Latihan: ${ex.title}</span>
                            </label>
                            
                            <div class="exercise-deadline-container">
                              <span style="font-size: 11px; color: #64748b; font-weight: 500;">Batas Waktu:</span>
                              <div style="display: flex; gap: 6px; width: 100%;">
                                <input 
                                  type="date" 
                                  class="exercise-date" 
                                  data-id="${ex.id}" 
                                  value="${savedDeadlineDate}" 
                                  style="flex: 1; padding: 6px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px; background: #fff;"
                                >
                                <input 
                                  type="time" 
                                  class="exercise-time" 
                                  data-id="${ex.id}" 
                                  value="${savedDeadlineTime}" 
                                  style="width: 90px; padding: 6px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px; background: #fff;"
                                >
                              </div>
                            </div>
                          </div>
                        `;
                      }).join("")}
                      ${materialExercises.length === 0 ? '<p style="font-size:12px; color:gray; margin:0; padding: 4px;">Tidak ada latihan di materi ini</p>' : ''}
                    </div>

                  </div>
                `;
              }).join("")}

            </div>
          `;
        }).join("")}
      </div>

      <div style="padding: 12px 16px; background: #fff; border-top: 1px solid #f1f5f9;">
        <button onclick="saveAssignmentStructure('${bab}')" style="width: 100%; padding: 10px; background: #059669; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 14px;">
          💾 Simpan Penugasan Bab Ini
        </button>
      </div>
    `;

    const btn = babDiv.querySelector(".toggle-btn");
    btn.onclick = () => {
      document.querySelectorAll(".bab-box").forEach(b => {
        if (b !== babDiv) b.classList.remove("active");
      });
      babDiv.classList.toggle("active");
      btn.textContent = babDiv.classList.contains("active") ? "Tutup" : "Lihat Materi & Latihan";
    };

    container.appendChild(babDiv);
  });
}

// ==========================
// FILTER LOGIC
// ==========================
window.filterAssignmentsGuru = () => {
  const search = document.getElementById("searchAssignmentGuru").value.toLowerCase();
  const selectedSubject = document.getElementById("subjectFilter").value;

  filteredMaterials = materialsGuru.filter(m => {
    const matchSearch = m.title.toLowerCase().includes(search) || m.subject.toLowerCase().includes(search);
    const matchSubject = !selectedSubject || m.subject === selectedSubject;
    return matchSearch && matchSubject;
  });

  renderAssignmentPanel(filteredMaterials);
};

function loadSubjectFilter(teacherSubjects) {
  const select = document.getElementById("subjectFilter");
  select.innerHTML = `<option value="">Semua Mapel</option>`;

  // Urutkan daftar mapel secara alfabetis (A-Z)
  const sortedSubjects = [...teacherSubjects].sort((a, b) => a.localeCompare(b, 'id', { sensitivity: 'accent' }));

  sortedSubjects.forEach(sub => {
    const opt = document.createElement("option");
    opt.value = sub;
    opt.textContent = sub;
    select.appendChild(opt);
  });
}

window.filterBySubject = () => {
  window.filterAssignmentsGuru();
};

// ==========================
// SAVE LOGIC
// ==========================
window.saveAssignmentStructure = async (bab) => {
  const classId = document.getElementById("classSelect").value;
  if (!classId) return showToast("Pilih kelas dulu", "error");

  const exerciseRows = document.querySelectorAll(".exercise-check");
  
  try {
    for (const el of exerciseRows) {
      const exerciseId = el.value;
      const isChecked = el.checked;
      
      const dateInput = document.querySelector(`.exercise-date[data-id="${exerciseId}"]`);
      const timeInput = document.querySelector(`.exercise-time[data-id="${exerciseId}"]`);
      
      const deadlineDate = dateInput ? dateInput.value : "";
      const deadlineTime = timeInput ? timeInput.value : "";

      const matchDb = assignedExercisesDetail.find(e => e.exerciseId === exerciseId);
      if (matchDb) {
        const docRef = doc(db, "exerciseGuru", matchDb.docId);
        
        await updateDoc(docRef, {
          isAssigned: isChecked,
          deadlineDate: deadlineDate,
          deadlineTime: deadlineTime
        });
      }
    }

    showToast("Pengaturan tanggal batas pengumpulan tugas berhasil disimpan!");
    await loadMaterialsData(); 
  } catch (error) {
    console.error(error);
    showToast("Gagal memperbarui batas penugasan", "error");
  }
};

// ==========================
// TOAST & PROFILE HEADER SYSTEM
// ==========================
function showToast(msg, type = "success") {
  const t = document.getElementById("toast");
  t.innerText = msg;
  t.className = type === "error" ? "toast error active" : "toast active";
  setTimeout(() => { t.classList.remove("active"); }, 3000);
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

async function loadProfileHeader(user) {
  const userSnap = await getDoc(doc(db, "users", user.uid));
  if (!userSnap.exists()) return;

  const data = userSnap.data();
  const name = data.name || user.displayName || "Guru";
  const avatar = data.avatarURL || user.photoURL || "../assets/images/default-avatar.png";
  const schoolId = data.schoolId;

  let schoolName = "-";
  let schoolLogo = "../assets/images/default-logo.png";

  if (schoolId) {
    const schoolSnap = await getDoc(doc(db, "schools", schoolId));
    if (schoolSnap.exists()) {
      const schoolData = schoolSnap.data();
      
      if (schoolData.status !== "aktif") {
        showToast("Sekolah kamu nonaktif!", "error");
        return;
      }

      schoolName = schoolData.name;
      schoolLogo = schoolData.logoURL || schoolLogo;
    }
  }

  document.getElementById("headerNameHeader").innerText = name;
  document.getElementById("headerAvatarHeader").src = avatar;
  document.getElementById("headerSchoolName").innerText = schoolName; 
  document.getElementById("headerSchoolLogo").src = schoolLogo;        
}
