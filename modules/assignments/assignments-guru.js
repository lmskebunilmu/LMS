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
  const el = document.getElementById("classSelect");
  return el ? el.value : "";
}

// ==========================
// AUTH INITIALIZATION
// ==========================
onAuthStateChanged(auth, async (user) => {
  if (!user) return (window.location = "../../login.html");

  console.log("AUTH UID:", user.uid);

  try {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      alert("Data user tidak ditemukan!");
      return (window.location = "../../login.html");
    }

    const userData = userSnap.data();

    if (userData.role !== "guru") {
      alert("Akses hanya guru!");
      return (window.location = "../../login.html");
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
    if (classSelect) {
      classSelect.addEventListener("change", async () => {
        document.getElementById("subjectFilter").value = "";
        await loadMaterialsData();
      });
    }

    await loadMaterialsData();
  } catch (err) {
    console.error("Error pada inisialisasi:", err);
  }
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

  snap.forEach((docSnap) => {
    const opt = document.createElement("option");
    opt.value = docSnap.id;
    opt.textContent = docSnap.data().name || "Kelas Tanpa Nama";
    select.appendChild(opt);
  });
}

async function loadSchoolData(schoolId) {
  if (!schoolId) return;
  const snap = await getDoc(doc(db, "schools", schoolId));
  if (!snap.exists()) return;
  schoolData = snap.data();
}

async function loadExercises() {
  const snap = await getDocs(collection(db, "exercises"));
  exercisesData = [];
  snap.forEach((docSnap) => {
    exercisesData.push({ id: docSnap.id, ...docSnap.data() });
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

  const approved = schoolData?.approvedSubjects || [];
  let q;

  if (teacherSubjects.length > 0) {
    q = query(
      collection(db, "materials"),
      where("level", "==", schoolData?.level || ""),
      where("curriculum", "==", schoolData?.curriculum || ""),
      where("subject", "in", teacherSubjects)
    );
  } else {
    q = query(
      collection(db, "materials"),
      where("level", "==", schoolData?.level || ""),
      where("curriculum", "==", schoolData?.curriculum || "")
    );
  }

  const snap = await getDocs(q);
  materialsGuru = [];

  snap.forEach((docSnap) => {
    const m = { id: docSnap.id, ...docSnap.data() };
    if (approved.length && !approved.includes(m.subject)) return;
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

  const mq = query(
    collection(db, "materialGuru"),
    where("classId", "==", classId),
    where("teacherId", "==", user.uid)
  );
  const msnap = await getDocs(mq);
  assignedMaterials = msnap.docs.map((d) => d.data().materialId);

  const eq = query(
    collection(db, "exerciseGuru"),
    where("classId", "==", classId),
    where("teacherId", "==", user.uid)
  );
  const esnap = await getDocs(eq);

  assignedExercises = [];
  assignedExercisesDetail = [];

  esnap.forEach((d) => {
    const data = d.data();
    assignedExercisesDetail.push({ docId: d.id, ...data });
    if (data.isAssigned) {
      assignedExercises.push(data.exerciseId);
    }
  });
}

// ==========================
// RENDER PANEL LOGIC
// ==========================
function renderAssignmentPanel(data) {
  const container = document.getElementById("assignmentGuruList");
  if (!container) return;
  container.innerHTML = "";

  if (data.length === 0) {
    container.innerHTML = `<p style="padding: 15px; color: gray;">Tidak ada materi atau kuis latihan ditemukan.</p>`;
    return;
  }

  const grouped = {};
  data.forEach((m) => {
    const bab = m.chapter || "Bab Umum";
    if (!grouped[bab]) grouped[bab] = [];
    grouped[bab].push(m);
  });

  Object.keys(grouped).forEach((bab) => {
    const babDiv = document.createElement("div");
    babDiv.className = "bab-box";
    babDiv.style.marginBottom = "15px";
    babDiv.style.border = "1px solid #ddd";
    babDiv.style.borderRadius = "6px";
    babDiv.style.padding = "10px";

    babDiv.innerHTML = `
      <h3 class="bab-title" style="display: flex; justify-content: space-between; align-items: center; margin: 0;">
        <span>📘 ${bab}</span>
        <button type="button" class="toggle-btn" style="cursor: pointer; padding: 6px 12px; border-radius: 4px; border: 1px solid #ccc; background: #f8f9fa;">Lihat Materi & Latihan</button>
      </h3>

      <div class="subbab-list" style="display: none; margin-top: 15px;">
        ${grouped[bab]
          .map((m) => {
            let materialExercises = exercisesData.filter(
              (ex) => ex.materialId === m.id
            );

            materialExercises.sort((a, b) => {
              const titleA = (a.title || "").toLowerCase();
              const titleB = (b.title || "").toLowerCase();
              return titleA.localeCompare(titleB);
            });

            const isMaterialChecked = assignedMaterials.includes(m.id)
              ? "checked"
              : "";

            return `
            <div class="subbab-item" style="margin-bottom: 15px;">
              <label style="font-weight: bold; display: block; margin-bottom: 8px;">
                <input type="checkbox" class="subbab-check" value="${m.id}" ${isMaterialChecked} disabled>
                📄 Sub-Bab: ${m.subChapter || m.title || "Sub-Bab Tanpa Judul"}
              </label>

              <div class="exercise-list" style="margin-left: 10px; background: #fafafa; padding: 10px; border-radius: 4px; max-height: 400px; overflow-y: auto; border: 1px solid #e0e0e0;">
                ${materialExercises
                  .map((ex) => {
                    const dbAssign = assignedExercisesDetail.find(
                      (e) => e.exerciseId === ex.id
                    );
                    const isChecked =
                      dbAssign && dbAssign.isAssigned ? "checked" : "";

                    const savedDeadlineDate = dbAssign
                      ? dbAssign.deadlineDate || ""
                      : "";
                    const savedDeadlineTime = dbAssign
                      ? dbAssign.deadlineTime || ""
                      : "";

                    return `
                    <div class="exercise-row" style="display: flex; align-items: center; justify-content: space-between; margin: 8px 0; background: #fff; padding: 10px; border-radius:4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); flex-wrap: wrap; gap: 10px;">
                      <label class="exercise-item" style="margin: 0; cursor:pointer; font-weight: 500; flex: 1; min-width: 180px;">
                        <input
                          type="checkbox"
                          class="exercise-check"
                          data-material="${m.id}"
                          value="${ex.id}"
                          ${isChecked}
                        >
                        📝 Latihan: ${ex.title || "Latihan Tanpa Judul"}
                      </label>

                      <div style="display:flex; align-items:center; gap:8px; flex-wrap: wrap;">
                        <span style="font-size:12px; color:gray;">Batas Pengumpulan:</span>
                        <input
                          type="date"
                          class="exercise-date"
                          data-id="${ex.id}"
                          value="${savedDeadlineDate}"
                          style="padding: 4px; border: 1px solid #ccc; border-radius: 4px; font-size: 13px;"
                        >
                        <input
                          type="time"
                          class="exercise-time"
                          data-id="${ex.id}"
                          value="${savedDeadlineTime}"
                          style="padding: 4px; border: 1px solid #ccc; border-radius: 4px; font-size: 13px;"
                        >
                      </div>
                    </div>
                  `;
                  })
                  .join("")}
                ${
                  materialExercises.length === 0
                    ? '<p style="font-size:12px; color:gray; margin:0;">Tidak ada latihan di sub-bab ini</p>'
                    : ""
                }
              </div>
            </div>
          `;
          })
          .join("")}

        <button type="button" class="save-btn" data-bab="${bab}" style="margin-top: 10px; padding: 8px 16px; cursor: pointer; background: #0d6efd; color: white; border: none; border-radius: 4px;">
          💾 Tugaskan & Aktifkan Latihan Durasi
        </button>
      </div>
    `;

    // Handler Event Toggle
    const btn = babDiv.querySelector(".toggle-btn");
    const subbabList = babDiv.querySelector(".subbab-list");

    btn.addEventListener("click", () => {
      const isVisible = subbabList.style.display === "block";
      subbabList.style.display = isVisible ? "none" : "block";
      btn.textContent = isVisible ? "Lihat Materi & Latihan" : "Tutup";
    });

    // Handler Event Simpan
    const saveBtn = babDiv.querySelector(".save-btn");
    saveBtn.addEventListener("click", () => {
      window.saveAssignmentStructure(bab);
    });

    container.appendChild(babDiv);
  });
}

// ==========================
// FILTER LOGIC
// ==========================
window.filterAssignmentsGuru = () => {
  const searchInput = document.getElementById("searchAssignmentGuru");
  const subjectInput = document.getElementById("subjectFilter");

  const search = searchInput ? searchInput.value.toLowerCase() : "";
  const selectedSubject = subjectInput ? subjectInput.value : "";

  filteredMaterials = materialsGuru.filter((m) => {
    // Safety check optional chaining (m.title || m.subChapter || "")
    const titleText = (m.title || m.subChapter || "").toLowerCase();
    const subjectText = (m.subject || "").toLowerCase();

    const matchSearch = titleText.includes(search) || subjectText.includes(search);
    const matchSubject = !selectedSubject || m.subject === selectedSubject;

    return matchSearch && matchSubject;
  });

  renderAssignmentPanel(filteredMaterials);
};

function loadSubjectFilter(teacherSubjects) {
  const select = document.getElementById("subjectFilter");
  if (!select) return;
  select.innerHTML = `<option value="">Semua Mapel</option>`;
  teacherSubjects.forEach((sub) => {
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
  const classId = getSelectedClassId();
  if (!classId) return showToast("Pilih kelas dulu", "error");

  const exerciseRows = document.querySelectorAll(".exercise-check");
  const { doc, updateDoc } = await import(
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
  );

  try {
    for (const el of exerciseRows) {
      const exerciseId = el.value;
      const isChecked = el.checked;

      const dateInput = document.querySelector(
        `.exercise-date[data-id="${exerciseId}"]`
      );
      const timeInput = document.querySelector(
        `.exercise-time[data-id="${exerciseId}"]`
      );

      const deadlineDate = dateInput ? dateInput.value : "";
      const deadlineTime = timeInput ? timeInput.value : "";

      const matchDb = assignedExercisesDetail.find(
        (e) => e.exerciseId === exerciseId
      );
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
  if (!t) return;
  t.innerText = msg;
  t.className = type === "error" ? "toast error active" : "toast active";
  setTimeout(() => {
    t.classList.remove("active");
  }, 3000);
}

function waitForHeader() {
  return new Promise((resolve) => {
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
  const avatar =
    data.avatarURL || user.photoURL || "../assets/images/default-avatar.png";
  const schoolId = data.schoolId;

  let schoolName = "-";
  let schoolLogo = "../assets/images/default-logo.png";

  if (schoolId) {
    const schoolSnap = await getDoc(doc(db, "schools", schoolId));
    if (schoolSnap.exists()) {
      const sData = schoolSnap.data();

      if (sData.status !== "aktif") {
        showToast("Sekolah kamu nonaktif!", "error");
        return;
      }

      schoolName = sData.name;
      schoolLogo = sData.logoURL || schoolLogo;
    }
  }

  const nameEl = document.getElementById("headerNameHeader");
  const avatarEl = document.getElementById("headerAvatarHeader");
  const schoolNameEl = document.getElementById("headerSchoolName");
  const schoolLogoEl = document.getElementById("headerSchoolLogo");

  if (nameEl) nameEl.innerText = name;
  if (avatarEl) avatarEl.src = avatar;
  if (schoolNameEl) schoolNameEl.innerText = schoolName;
  if (schoolLogoEl) schoolLogoEl.src = schoolLogo;
}
