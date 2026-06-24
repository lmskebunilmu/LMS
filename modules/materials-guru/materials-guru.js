import { auth, db } from "../../firebase/firebase-config.js";
import {
  collection,
  getDocs,
  getDoc,
  doc,
  addDoc,
  query,
  deleteDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { loadLayout } from "../../assets/js/components.js";

// ==========================
let materialsGuru = [];
let filteredMaterials = [];
let schoolData = null;
let exercisesData = [];

function getSelectedClassId() {
  return document.getElementById("classSelect").value;
}

// ==========================
// AUTH & INITIALIZATION
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
  console.log("USER DATA:", userData);

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
    await loadMaterials();
  });

  // Load pertama kali
  await loadMaterials();
});

// ==========================
// DATA FETCHING (LOADERS)
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

  snap.forEach(doc => {
    const opt = document.createElement("option");
    opt.value = doc.id;
    opt.textContent = doc.data().name;
    select.appendChild(opt);
  });
}

async function loadSchoolData(schoolId) {
  const snap = await getDoc(doc(db, "schools", schoolId));
  if (!snap.exists()) return;

  const data = snap.data();
  if (data.status !== "aktif") {
    showToast("Sekolah tidak aktif", "error");
    lockPage();
    return;
  }
  schoolData = data;
}

async function loadMaterials() {
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
  renderMaterials(filteredMaterials);
}

async function loadExercises() {
  const snap = await getDocs(collection(db, "exercises"));
  exercisesData = [];
  snap.forEach(doc => {
    exercisesData.push({ id: doc.id, ...doc.data() });
  });
}

// ==========================
// RENDERING
// ==========================
function renderMaterials(data) {
  const container = document.getElementById("materialGuruList");
  container.innerHTML = "";

  if (data.length === 0) {
    container.innerHTML = `<p>Tidak ada materi</p>`;
    return;
  }

  const grouped = {};
  data.forEach(m => {
    const bab = m.chapter || "Bab Umum";
    if (!grouped[bab]) grouped[bab] = [];
    grouped[bab].push(m);
  });

  Object.keys(grouped).forEach(bab => {
    const babDiv = document.createElement("div");
    babDiv.className = "bab-box";

    babDiv.innerHTML = `
      <h3 class="bab-title">
        <span>📘 ${bab}</span>
        <button class="toggle-btn">Lihat Materi</button>
      </h3>
      <div class="subbab-list">
        ${grouped[bab].map(m => {
          const materialExercises = exercisesData.filter(ex => ex.materialId === m.id);
          return `
            <div class="subbab-item">
              <label>
                <input type="checkbox" class="subbab-check" value="${m.id}">
                ${m.subChapter || m.title}
              </label>
              <button onclick="previewMaterial('${m.id}')">👁</button>
              <div class="exercise-list">
                ${materialExercises.map(ex => `
                  <label class="exercise-item">
                    <input type="checkbox" class="exercise-check" data-material="${m.id}" value="${ex.id}">
                    📝 ${ex.title}
                  </label>
                `).join("")}
              </div>
            </div>
          `;
        }).join("")}
      </div>
      <button onclick="assignSelected('${bab}')">➕ Pakai Materi Ini</button>
    `;

    const btn = babDiv.querySelector(".toggle-btn");
    btn.onclick = () => {
      document.querySelectorAll(".bab-box").forEach(b => {
        if (b !== babDiv) b.classList.remove("active");
      });
      babDiv.classList.toggle("active");
      btn.textContent = babDiv.classList.contains("active") ? "Tutup" : "Lihat Materi";
    };

    container.appendChild(babDiv);
  });
}

// ==========================
// FILTERS & ACTIONS
// ==========================
window.filterMaterialsGuru = () => {
  const search = document.getElementById("searchMaterialGuru").value.toLowerCase();
  const selectedSubject = document.getElementById("subjectFilter").value;

  filteredMaterials = materialsGuru.filter(m => {
    // Diperbaiki agar mengecek title dan subChapter jika ada
    const titleMatch = m.title ? m.title.toLowerCase().includes(search) : false;
    const subChapterMatch = m.subChapter ? m.subChapter.toLowerCase().includes(search) : false;
    const subjectMatch = m.subject ? m.subject.toLowerCase().includes(search) : false;

    const matchSearch = titleMatch || subChapterMatch || subjectMatch;
    const matchSubject = !selectedSubject || m.subject === selectedSubject;

    return matchSearch && matchSubject;
  });

  renderMaterials(filteredMaterials);
};

window.filterBySubject = () => {
  window.filterMaterialsGuru();
};

window.assignSelected = async (bab) => {
  const classId = document.getElementById("classSelect").value;
  if (!classId) return showToast("Pilih kelas dulu", "error");

  const checked = document.querySelectorAll(".subbab-check:checked");
  if (checked.length === 0) return showToast("Pilih minimal 1 subbab", "error");

  const user = auth.currentUser;
  const userSnap = await getDoc(doc(db, "users", user.uid));
  const userData = userSnap.data();

  // Clean old selections
  const q = query(collection(db, "materialGuru"), where("classId", "==", classId), where("teacherId", "==", user.uid));
  const oldSnap = await getDocs(q);
  for (const d of oldSnap.docs) await deleteDoc(d.ref);

  const eq = query(collection(db, "exerciseGuru"), where("classId", "==", classId), where("teacherId", "==", user.uid));
  const exSnap = await getDocs(eq);
  for (const d of exSnap.docs) await deleteDoc(d.ref);

  // Save checked
  for (const cb of checked) {
    const materialId = cb.value;
    const selectedMaterial = materialsGuru.find(m => m.id === materialId);
    if (!selectedMaterial) continue;

    await addDoc(collection(db, "materialGuru"), {
      materialId,
      classId,
      teacherId: user.uid,
      schoolId: userData.schoolId,
      title: selectedMaterial.title || selectedMaterial.subChapter,
      subject: selectedMaterial.subject,
      createdAt: new Date()
    });

    const checkedExercises = document.querySelectorAll(`.exercise-check[data-material="${materialId}"]:checked`);
    for (const exCb of checkedExercises) {
      const exerciseId = exCb.value;
      const ex = exercisesData.find(e => e.id === exerciseId);
      if (!ex) continue;

      await addDoc(collection(db, "exerciseGuru"), {
        exerciseId: ex.id,
        materialId: materialId,
        classId,
        teacherId: user.uid,
        schoolId: userData.schoolId,
        title: ex.title,
        subject: ex.subject || "",
        createdAt: new Date()
      });
    }
  }

  showToast("Materi dan latihan berhasil disimpan (update)");
};

window.previewMaterial = (id) => {
  window.open(`preview.html?id=${id}`, "_blank");
};

// ==========================
// FORM EXERCISE & MATERIAL MANIPULATION
// ==========================
function populateNewMaterialSubjects() {
  const select = document.getElementById("newMaterialSubject");
  select.innerHTML = "";
  const filterSelect = document.getElementById("subjectFilter");
  for (let option of filterSelect.options) {
    if (option.value !== "") {
      const opt = document.createElement("option");
      opt.value = option.value;
      opt.textContent = option.textContent;
      select.appendChild(opt);
    }
  }
}

function populateExerciseSubjects() {
  const select = document.getElementById("newExerciseSubject");
  select.innerHTML = '<option value="">-- Pilih Mapel --</option>';
  const filterSelect = document.getElementById("subjectFilter");
  for (let option of filterSelect.options) {
    if (option.value !== "") {
      const opt = document.createElement("option");
      opt.value = option.value;
      opt.textContent = option.textContent;
      select.appendChild(opt);
    }
  }
  document.getElementById("newExerciseChapter").innerHTML = '<option value="">-- Pilih Bab --</option>';
  document.getElementById("newExerciseChapter").disabled = true;
  document.getElementById("newExerciseMaterialId").innerHTML = '<option value="">-- Pilih Sub-Bab / Materi --</option>';
  document.getElementById("newExerciseMaterialId").disabled = true;
}

window.updateExerciseChapters = () => {
  const subject = document.getElementById("newExerciseSubject").value;
  const chapterSelect = document.getElementById("newExerciseChapter");
  const materialSelect = document.getElementById("newExerciseMaterialId");

  chapterSelect.innerHTML = '<option value="">-- Pilih Bab --</option>';
  materialSelect.innerHTML = '<option value="">-- Pilih Sub-Bab / Materi --</option>';
  materialSelect.disabled = true;

  if (!subject) {
    chapterSelect.disabled = true;
    return;
  }

  const chapters = [];
  materialsGuru.forEach(m => {
    if (m.subject === subject && m.chapter && !chapters.includes(m.chapter)) {
      chapters.push(m.chapter);
    }
  });

  chapters.forEach(bab => {
    const opt = document.createElement("option");
    opt.value = bab;
    opt.textContent = bab;
    chapterSelect.appendChild(opt);
  });
  chapterSelect.disabled = false;
};

window.updateExerciseMaterials = () => {
  const subject = document.getElementById("newExerciseSubject").value;
  const chapter = document.getElementById("newExerciseChapter").value;
  const materialSelect = document.getElementById("newExerciseMaterialId");

  materialSelect.innerHTML = '<option value="">-- Pilih Sub-Bab / Materi --</option>';
  if (!chapter) {
    materialSelect.disabled = true;
    return;
  }

  const filtered = materialsGuru.filter(m => m.subject === subject && m.chapter === chapter);
  filtered.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.subChapter || m.title;
    materialSelect.appendChild(opt);
  });
  materialSelect.disabled = false;
};

window.populateExistingChapters = () => {
  const selectedSubject = document.getElementById("newMaterialSubject").value;
  const chapterSelect = document.getElementById("newMaterialChapterSelect");
  chapterSelect.innerHTML = '<option value="">-- Pilih Bab Yang Sudah Ada --</option>';
  if (!selectedSubject) return;

  const chapters = [];
  materialsGuru.forEach(m => {
    if (m.subject === selectedSubject && m.chapter && !chapters.includes(m.chapter)) {
      chapters.push(m.chapter);
    }
  });

  chapters.forEach(bab => {
    const opt = document.createElement("option");
    opt.value = bab;
    opt.textContent = bab;
    chapterSelect.appendChild(opt);
  });
  document.getElementById("newMaterialChapterInput").value = "";
};

window.handleChapterSelectChange = () => {
  const selectVal = document.getElementById("newMaterialChapterSelect").value;
  const inputEl = document.getElementById("newMaterialChapterInput");
  if (selectVal !== "") {
    inputEl.value = "";
    inputEl.placeholder = "Kosong (Menggunakan bab pilihan di atas)";
    inputEl.disabled = true;
    inputEl.style.backgroundColor = "#eee";
  } else {
    inputEl.placeholder = "Ketik Nama Bab Baru (Contoh: Bab 1: Aljabar)";
    inputEl.disabled = false;
    inputEl.style.backgroundColor = "#fff";
  }
};

window.saveNewMaterial = async () => {
  const title = document.getElementById("newMaterialTitle").value;
  const subject = document.getElementById("newMaterialSubject").value;
  const content = document.getElementById("newMaterialContent").value;
  const selectedChapter = document.getElementById("newMaterialChapterSelect").value;
  const inputtedChapter = document.getElementById("newMaterialChapterInput").value;
  const chapter = selectedChapter || inputtedChapter;

  if (!title || !chapter || !subject) {
    return showToast("Judul, Bab, dan Mapel wajib diisi!", "error");
  }

  try {
    const user = auth.currentUser;
    await addDoc(collection(db, "materials"), {
      title,
      subChapter: title,
      chapter,
      subject,
      content,
      level: schoolData.level,
      curriculum: schoolData.curriculum,
      createdBy: user.uid,
      isCustomTeacher: true,
      createdAt: new Date()
    });

    showToast("Materi baru berhasil dibuat!");
    document.getElementById("newMaterialTitle").value = "";
    document.getElementById("newMaterialChapterInput").value = "";
    document.getElementById("newMaterialChapterInput").disabled = false;
    document.getElementById("newMaterialChapterInput").style.backgroundColor = "#fff";
    document.getElementById("newMaterialContent").value = "";
    window.toggleForm('formMateri');
    await loadMaterials();
  } catch (error) {
    console.error(error);
    showToast("Gagal membuat materi", "error");
  }
};

window.saveNewExercise = async () => {
  const subject = document.getElementById("newExerciseSubject").value;
  const chapter = document.getElementById("newExerciseChapter").value;
  const materialId = document.getElementById("newExerciseMaterialId").value;
  const title = document.getElementById("newExerciseTitle").value;

  if (!subject || !chapter || !materialId || !title) {
    return showToast("Semua tingkatan wajib diisi!", "error");
  }

  try {
    const user = auth.currentUser;
    await addDoc(collection(db, "exercises"), {
      title,
      materialId,
      subject,
      chapter,
      createdBy: user.uid,
      isCustomTeacher: true,
      questions: [],
      createdAt: new Date()
    });

    showToast("Latihan baru berhasil dibuat!");
    document.getElementById("newExerciseTitle").value = "";
    window.toggleForm('formExercise');
    await loadExercises();
    renderMaterials(filteredMaterials);
  } catch (error) {
    console.error(error);
    showToast("Gagal membuat latihan", "error");
  }
};

// Satu-satunya implementasi toggleForm yang valid (paling bawah)
window.toggleForm = (formId) => {
  const form = document.getElementById(formId);
  if (form.style.display === "none") {
    form.style.display = "block";
    if (formId === 'formMateri') {
      populateNewMaterialSubjects();
      window.populateExistingChapters();
    }
    if (formId === 'formExercise') {
      populateExerciseSubjects();
    }
  } else {
    form.style.display = "none";
  }
};

// ==========================
// UTILITIES (TOAST, LAYOUT, FILTERS)
// ==========================
function loadSubjectFilter(teacherSubjects) {
  const select = document.getElementById("subjectFilter");
  select.innerHTML = `<option value="">Semua Mapel</option>`;
  teacherSubjects.forEach(sub => {
    const opt = document.createElement("option");
    opt.value = sub;
    opt.textContent = sub;
    select.appendChild(opt);
  });
}

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
      if (el) { clearInterval(interval); resolve(); }
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
        lockPage();
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

function lockPage() {
  const main = document.querySelector(".main");
  if (!main) return;
  main.innerHTML = `
    <div style="display:flex; justify-content:center; align-items:center; height:80vh; flex-direction:column; text-align:center;">
      <h1 style="color:red;">🚫 Akses Ditolak</h1>
      <p>Sekolah kamu sedang <b>nonaktif</b></p>
      <button onclick="window.location='../../login.html'">Logout</button>
    </div>
  `;
}
