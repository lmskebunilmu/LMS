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
let schoolData = null;
let exercisesData = [];
let assignedMaterials = [];
let assignedExercises = [];

function getSelectedClassId() {
  return document.getElementById("classSelect").value;
}

// ==========================
// AUTH & INITIAL LOAD
// ==========================
onAuthStateChanged(auth, async (user) => {
  if (!user) return window.location = "../../login.html";

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
    resetModuleWizard();
    await loadMaterials();
  });

  await loadMaterials();
});

// ==========================
// LOAD KELAS & SEKOLAH
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
    opt.textContent = doc.data().name || "Kelas Tanpa Nama"; 
    select.appendChild(opt);
  });
}

async function loadSchoolData(schoolId) {
  const snap = await getDoc(doc(db,"schools",schoolId));
  if(!snap.exists()) return;

  const data = snap.data();
  if(data.status !== "aktif"){
    showToast("Sekolah tidak aktif", "error");
    lockPage();
    return;
  }
  schoolData = data;
}

// ==========================
// LOAD DATA MATERIALS & EXERCISES
// ==========================
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
      collection(db,"materials"),
      where("level","==",schoolData.level),
      where("curriculum","==",schoolData.curriculum),
      where("subject","in", teacherSubjects)
    );
  } else {
    q = query(
      collection(db,"materials"),
      where("level","==",schoolData.level),
      where("curriculum","==",schoolData.curriculum)
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

  await loadAssignments();
}

async function loadExercises(){
  const snap = await getDocs(collection(db,"exercises"));
  exercisesData = [];
  snap.forEach(doc => {
    exercisesData.push({
      id: doc.id,
      ...doc.data()
    });
  });
}

async function loadAssignments() {
  const classId = getSelectedClassId();
  const user = auth.currentUser;
  if(!classId || !user) return;

  const mq = query(collection(db,"materialGuru"), where("classId","==",classId), where("teacherId","==",user.uid));
  const msnap = await getDocs(mq);
  assignedMaterials = msnap.docs.map(d => d.data().materialId);

  const eq = query(collection(db,"exerciseGuru"), where("classId","==",classId), where("teacherId","==",user.uid));
  const esnap = await getDocs(eq);
  assignedExercises = esnap.docs.map(d => d.data().exerciseId);
}

// ==========================
// LOGIKA WIZARD MODUL BERTAHAP
// ==========================
function loadSubjectFilter(teacherSubjects) {
  const select = document.getElementById("subjectFilter");
  select.innerHTML = `<option value="">-- Pilih Mapel --</option>`;
  teacherSubjects.forEach(sub => {
    const opt = document.createElement("option");
    opt.value = sub;
    opt.textContent = sub;
    select.appendChild(opt);
  });
}

window.onModuleSubjectChange = () => {
  const subject = document.getElementById("subjectFilter").value;
  const chapterSelect = document.getElementById("moduleChapterSelect");
  const materialSelect = document.getElementById("moduleMaterialSelect");
  const resultContainer = document.getElementById("moduleResultContainer");

  chapterSelect.innerHTML = '<option value="">-- Pilih Bab --</option>';
  materialSelect.innerHTML = '<option value="">-- Pilih Sub-Bab --</option>';
  chapterSelect.disabled = true;
  materialSelect.disabled = true;
  resultContainer.innerHTML = `<p style="text-align: center; color: #777; margin-top: 50px;">Silakan pilih Bab terlebih dahulu.</p>`;

  if (!subject) return;

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

window.onModuleChapterChange = () => {
  const subject = document.getElementById("subjectFilter").value;
  const chapter = document.getElementById("moduleChapterSelect").value;
  const materialSelect = document.getElementById("moduleMaterialSelect");
  const resultContainer = document.getElementById("moduleResultContainer");

  materialSelect.innerHTML = '<option value="">-- Pilih Sub-Bab --</option>';
  materialSelect.disabled = true;
  resultContainer.innerHTML = `<p style="text-align: center; color: #777; margin-top: 50px;">Silakan pilih Sub-Bab materi terlebih dahulu.</p>`;

  if (!chapter) return;

  const filtered = materialsGuru.filter(m => m.subject === subject && m.chapter === chapter);
  filtered.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.subChapter || m.title;
    materialSelect.appendChild(opt);
  });

  materialSelect.disabled = false;
};

window.onModuleMaterialChange = () => {
  const materialId = document.getElementById("moduleMaterialSelect").value;
  const resultContainer = document.getElementById("moduleResultContainer");

  if (!materialId) {
    resultContainer.innerHTML = `<p style="text-align: center; color: #777; margin-top: 50px;">Silakan pilih Sub-Bab materi terlebih dahulu.</p>`;
    return;
  }

  const selectedMaterial = materialsGuru.find(m => m.id === materialId);
  if (!selectedMaterial) return;

  const materialExercises = exercisesData.filter(ex => ex.materialId === materialId);
  const isMaterialChecked = assignedMaterials.includes(materialId) ? "checked" : "";

  resultContainer.innerHTML = `
    <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; border: 1px solid #ddd;">
      <h4 style="margin-top: 0; color: #007bff;">📖 ${selectedMaterial.subChapter || selectedMaterial.title}</h4>
      <p style="font-size: 13px; color: #555; margin-bottom: 10px;"><b>Bab:</b> ${selectedMaterial.chapter}</p>
      
      <div style="margin: 15px 0; display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
        <label style="cursor: pointer; font-weight: bold; display: flex; align-items: center; gap: 8px;">
          <input type="checkbox" id="moduleMaterialCheckbox" value="${selectedMaterial.id}" ${isMaterialChecked}>
          Tandai Materi Ini untuk Kelas
        </label>
        <button type="button" onclick="previewMaterial('${selectedMaterial.id}')" style="font-size: 12px; padding: 4px 10px; background: #ffc107; border: none; border-radius: 4px; cursor: pointer;">👁 Preview Materi</button>
      </div>

      <hr style="border: 0; border-top: 1px solid #ddd; margin: 15px 0;">

      <h5 style="margin-bottom: 8px;">📝 Latihan / Kuis Terkait untuk Modul Ini:</h5>
      <div style="background: #fff; padding: 10px; border-radius: 4px; border: 1px solid #eee;">
        ${materialExercises.length === 0 ? '<p style="font-size: 12px; color: #888; font-style: italic; margin: 0;">Tidak ada latihan terkait untuk materi ini.</p>' : ''}
        ${materialExercises.map(ex => {
          const isExerciseChecked = assignedExercises.includes(ex.id) ? "checked" : "";
          return `
            <label style="display: block; margin: 6px 0; font-size: 13px; cursor: pointer;">
              <input type="checkbox" class="module-exercise-check" value="${ex.id}" ${isExerciseChecked}>
              📝 ${ex.title}
            </label>
          `;
        }).join("")}
      </div>

      <div style="margin-top: 20px; text-align: right;">
        <button type="button" onclick="saveModuleAssignment('${selectedMaterial.id}')" style="background-color: #28a745; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
          💾 Simpan Pilihan Modul Ini
        </button>
      </div>
    </div>
  `;
};

window.saveModuleAssignment = async (materialId) => {
  const classId = document.getElementById("classSelect").value;
  if (!classId) {
    showToast("Pilih kelas terlebih dahulu!", "error");
    return;
  }

  const isMaterialChecked = document.getElementById("moduleMaterialCheckbox").checked;
  const user = auth.currentUser;
  const userSnap = await getDoc(doc(db, "users", user.uid));
  const userData = userSnap.data();

  if (isMaterialChecked) {
    const mq = query(collection(db, "materialGuru"), where("classId", "==", classId), where("materialId", "==", materialId), where("teacherId", "==", user.uid));
    const msnap = await getDocs(mq);
    if (msnap.empty) {
      const selectedMaterial = materialsGuru.find(m => m.id === materialId);
      await addDoc(collection(db, "materialGuru"), {
        materialId, classId, teacherId: user.uid, schoolId: userData.schoolId,
        title: selectedMaterial.title, subject: selectedMaterial.subject, createdAt: new Date()
      });
    }
  } else {
    const mq = query(collection(db, "materialGuru"), where("classId", "==", classId), where("materialId", "==", materialId), where("teacherId", "==", user.uid));
    const msnap = await getDocs(mq);
    for (const d of msnap.docs) await deleteDoc(d.ref);
  }

  const checkedExercises = document.querySelectorAll(".module-exercise-check:checked");
  const eq = query(collection(db, "exerciseGuru"), where("classId", "==", classId), where("materialId", "==", materialId), where("teacherId", "==", user.uid));
  const esnap = await getDocs(eq);
  for (const d of esnap.docs) await deleteDoc(d.ref);

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
      isAssigned: false,
      duration: 0,
      createdAt: new Date()
    });
  }

  showToast("Modul berhasil disimpan!");
  await loadAssignments();
};

function resetModuleWizard() {
  document.getElementById("moduleChapterSelect").innerHTML = '<option value="">-- Pilih Bab --</option>';
  document.getElementById("moduleChapterSelect").disabled = true;
  document.getElementById("moduleMaterialSelect").innerHTML = '<option value="">-- Pilih Sub-Bab --</option>';
  document.getElementById("moduleMaterialSelect").disabled = true;
  document.getElementById("moduleResultContainer").innerHTML = `<p style="text-align: center; color: #777; margin-top: 50px;">Silakan pilih Mata Pelajaran terlebih dahulu.</p>`;
}

// ==========================
// FORM BUAT MATERI & EXERCISE BARU
// ==========================
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

function populateNewMaterialSubjects() {
  const select = document.getElementById("newMaterialSubject");
  select.innerHTML = "";
  const filterSelect = document.getElementById("subjectFilter");
  for (let option of filterSelect.options) {
    if(option.value !== "") {
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
  document.getElementById("newExerciseMaterialId").innerHTML = '<option value="">-- Pilih Materi --</option>';
  document.getElementById("newExerciseMaterialId").disabled = true;
}

window.updateExerciseChapters = () => {
  const subject = document.getElementById("newExerciseSubject").value;
  const chapterSelect = document.getElementById("newExerciseChapter");
  const materialSelect = document.getElementById("newExerciseMaterialId");

  chapterSelect.innerHTML = '<option value="">-- Pilih Bab --</option>';
  materialSelect.innerHTML = '<option value="">-- Pilih Materi --</option>';
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

  materialSelect.innerHTML = '<option value="">-- Pilih Materi --</option>';
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

window.saveNewMaterial = async () => {
  const title = document.getElementById("newMaterialTitle").value;
  const subject = document.getElementById("newMaterialSubject").value;
  const content = document.getElementById("newMaterialContent").value;
  const selectedChapter = document.getElementById("newMaterialChapterSelect").value;
  const inputtedChapter = document.getElementById("newMaterialChapterInput").value;
  const chapter = selectedChapter || inputtedChapter;

  if(!title || !chapter || !subject) {
    showToast("Judul, Bab, dan Mapel wajib diisi/dipilih!", "error");
    return;
  }
  
  try {
    const user = auth.currentUser;
    await addDoc(collection(db, "materials"), {
      title, subChapter: title, chapter, subject, content,
      level: schoolData.level, curriculum: schoolData.curriculum, 
      createdBy: user.uid, isCustomTeacher: true, createdAt: new Date()
    });
    
    showToast("Materi baru berhasil dibuat!");
    document.getElementById("newMaterialTitle").value = "";
    document.getElementById("newMaterialChapterInput").value = "";
    document.getElementById("newMaterialContent").value = "";
    toggleForm('formMateri');
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
    showToast("Semua data dan Judul Latihan wajib diisi!", "error");
    return;
  }

  try {
    const user = auth.currentUser;
    await addDoc(collection(db, "exercises"), {
      title, materialId, subject, chapter,
      createdBy: user.uid, isCustomTeacher: true, questions: [], createdAt: new Date()
    });
    
    showToast("Latihan baru berhasil dibuat!");
    document.getElementById("newExerciseTitle").value = "";
    toggleForm('formExercise');
    await loadExercises();
  } catch (error) {
    console.error(error);
    showToast("Gagal membuat latihan", "error");
  }
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
};

window.handleChapterSelectChange = () => {
  const selectVal = document.getElementById("newMaterialChapterSelect").value;
  const inputEl = document.getElementById("newMaterialChapterInput");
  if (selectVal !== "") {
    inputEl.value = ""; 
    inputEl.disabled = true;
    inputEl.style.backgroundColor = "#eee";
  } else {
    inputEl.disabled = false;
    inputEl.style.backgroundColor = "#fff";
  }
};

// ==========================
// UTILS
// ==========================
window.previewMaterial = (id) => {
  window.open(`preview.html?id=${id}`, "_blank");
};

function showToast(msg, type="success"){
  const t = document.getElementById("toast");
  t.innerText = msg;
  t.className = type === "error" ? "toast error active" : "toast active";
  setTimeout(() => { t.classList.remove("active"); }, 3000);
}

function waitForHeader(){
  return new Promise(resolve=>{
    const interval = setInterval(()=>{
      if(document.getElementById("headerAvatarHeader")){
        clearInterval(interval);
        resolve();
      }
    },50);
  });
}

async function loadProfileHeader(user){
  const userSnap = await getDoc(doc(db,"users",user.uid));
  if(!userSnap.exists()) return;
  const data = userSnap.data();
  document.getElementById("headerNameHeader").innerText = data.name || user.displayName || "Guru";
  document.getElementById("headerAvatarHeader").src = data.avatarURL || user.photoURL || "../assets/images/default-avatar.png";
}

function lockPage(){
  document.querySelector(".main").innerHTML = `
    <div style="text-align:center;margin-top:100px;">
      <h1 style="color:red;">🚫 Akses Ditolak</h1>
      <p>Sekolah kamu sedang <b>nonaktif</b></p>
      <button onclick="window.location='../../login.html'">Logout</button>
    </div>
  `;
}
