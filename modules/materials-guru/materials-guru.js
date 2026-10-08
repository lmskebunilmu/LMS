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
let assignedMaterials = [];
let assignedExercises = [];


function getSelectedClassId() {
  return document.getElementById("classSelect").value;
}
// ==========================
// AUTH
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

await loadMaterials();
});

// ==========================
// LOAD KELAS
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

// ==========================
// LOAD SCHOOL
// ==========================
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
// LOAD MATERIALS
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

  filteredMaterials = materialsGuru;
  await loadAssignments();
  renderMaterials(filteredMaterials);
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

// ==========================
// RENDER (DENGAN SCROLL & PILIH SEMUA / SATU-SATU)
// ==========================
function renderMaterials(data){
  const container = document.getElementById("materialGuruList");
  container.innerHTML = "";

  if(data.length === 0){
    container.innerHTML = `<p style="text-align:center; color:#777; padding:20px;">Tidak ada materi</p>`;
    return;
  }

  const grouped = {};
  data.forEach(m => {
    const bab = m.chapter || "Bab Umum";
    if(!grouped[bab]) grouped[bab] = [];
    grouped[bab].push(m);
  });

  Object.keys(grouped).forEach((bab, babIndex) => {
    const babDiv = document.createElement("div");
    babDiv.className = "bab-box";
    babDiv.style.cssText = "border: 1px solid #ddd; border-radius: 6px; margin-bottom: 12px; background: #fdfdfd;";

    babDiv.innerHTML = `
      <div class="bab-title" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 15px; background: #f1f3f5; border-bottom: 1px solid #ddd; cursor: pointer;">
        <span style="font-weight: bold; color: #333;">📘 ${bab}</span>
        <div style="display: flex; gap: 8px; align-items: center;">
          <button type="button" onclick="toggleSelectAllBab('${babIndex}', true)" style="font-size: 11px; padding: 3px 8px; background: #28a745; color: white; border: none; border-radius: 3px; cursor: pointer;">Pilih Semua Bab</button>
          <button type="button" onclick="toggleSelectAllBab('${babIndex}', false)" style="font-size: 11px; padding: 3px 8px; background: #6c757d; color: white; border: none; border-radius: 3px; cursor: pointer;">Batal Semua</button>
          <button class="toggle-btn" style="font-size: 11px; padding: 3px 8px; background: #007bff; color: white; border: none; border-radius: 3px; cursor: pointer;">Lihat Materi</button>
        </div>
      </div>

      <div class="subbab-list" id="bab-content-${babIndex}" style="display: none; padding: 10px 15px;">
        ${grouped[bab].map((m, mIndex) => {
          const materialExercises = exercisesData.filter(ex => ex.materialId === m.id);
          const isMaterialChecked = assignedMaterials.includes(m.id) ? "checked" : "";

          return `
            <div class="subbab-item" style="border-bottom: 1px dashed #eee; padding: 8px 0;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <label style="cursor: pointer; font-weight: 500; display: flex; align-items: center; gap: 8px;">
                  <input
                    type="checkbox"
                    class="subbab-check bab-${babIndex}-item"
                    value="${m.id}"
                    data-bab-index="${babIndex}"
                    ${isMaterialChecked} >
                  <span>${m.subChapter || m.title}</span>
                </label>

                <div style="display: flex; gap: 6px;">
                  <button type="button" onclick="toggleSelectAllExercise('${babIndex}-${mIndex}', true)" style="font-size: 10px; padding: 2px 6px; background: #17a2b8; color: white; border: none; border-radius: 3px; cursor: pointer;" title="Centang semua latihan di sub-bab ini">Pilih Latihan</button>
                  <button type="button" onclick="previewMaterial('${m.id}')" style="font-size: 10px; padding: 2px 6px; background: #ffc107; border: none; border-radius: 3px; cursor: pointer;" title="Preview Materi">👁</button>
                </div>
              </div>

              <div class="exercise-list" style="margin-left: 25px; margin-top: 6px; background: #f8f9fa; padding: 6px; border-radius: 4px;">
                ${materialExercises.length === 0 ? '<span style="font-size: 11px; color: #888; font-style: italic;">Tidak ada latihan terkait</span>' : ''}
                ${materialExercises.map(ex => {
                  const isExerciseChecked = assignedExercises.includes(ex.id) ? "checked" : "";
                  return `
                    <label class="exercise-item" style="display:block; margin: 4px 0; font-size: 12px; cursor: pointer;">
                      <input
                        type="checkbox"
                        class="exercise-check bab-${babIndex}-item ex-group-${babIndex}-${mIndex}"
                        data-material="${m.id}"
                        value="${ex.id}"
                        ${isExerciseChecked} >
                      📝 ${ex.title}
                    </label>
                  `;
                }).join("")}
              </div>
            </div>
          `;
        }).join("")}

        <div style="margin-top: 15px; text-align: right;">
          <button type="button" onclick="assignSelected('${bab}')" style="background-color: #28a745; color: white; padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
            💾 Simpan Pilihan Bab Ini
          </button>
        </div>
      </div>
    `;

    const titleBar = babDiv.querySelector(".bab-title");
    const contentDiv = babDiv.querySelector(`#bab-content-${babIndex}`);
    const btn = babDiv.querySelector(".toggle-btn");

    titleBar.onclick = (e) => {
      if (e.target.tagName === 'BUTTON') return;
      const isOpen = contentDiv.style.display === "block";
      contentDiv.style.display = isOpen ? "none" : "block";
      btn.textContent = isOpen ? "Lihat Materi" : "Tutup";
    };

    btn.onclick = (e) => {
      e.stopPropagation();
      const isOpen = contentDiv.style.display === "block";
      contentDiv.style.display = isOpen ? "none" : "block";
      btn.textContent = isOpen ? "Lihat Materi" : "Tutup";
    };

    container.appendChild(babDiv);
  });
}

// ==========================
// FUNGSI BANTU PILIH SEMUA / BATAL
// ==========================
window.toggleSelectAllBab = (babIndex, checkStatus) => {
  const checkboxes = document.querySelectorAll(`.bab-${babIndex}-item`);
  checkboxes.forEach(cb => cb.checked = checkStatus);
};

window.toggleSelectAllExercise = (groupKey, checkStatus) => {
  const checkboxes = document.querySelectorAll(`.ex-group-${groupKey}`);
  checkboxes.forEach(cb => cb.checked = checkStatus);
  if (checkStatus) {
    const parentItem = document.querySelector(`.ex-group-${groupKey}`).closest('.subbab-item');
    const subbabCb = parentItem.querySelector('.subbab-check');
    if (subbabCb) subbabCb.checked = true;
  }
};

// ==========================
// FILTER
// ==========================
window.filterMaterialsGuru = () => {
  const search = document.getElementById("searchMaterialGuru").value.toLowerCase();
  const selectedSubject = document.getElementById("subjectFilter").value;

  filteredMaterials = materialsGuru.filter(m => {
    const matchSearch = m.title.toLowerCase().includes(search) || m.subject.toLowerCase().includes(search);
    const matchSubject = !selectedSubject || m.subject === selectedSubject;
    return matchSearch && matchSubject;
  });

  renderMaterials(filteredMaterials);
};

// ==========================
// ASSIGN
// ==========================
window.assignSelected = async (bab) => {
  const classId = document.getElementById("classSelect").value;
  if(!classId){
    showToast("Pilih kelas dulu", "error");
    return;
  }

  const checkedMaterials = document.querySelectorAll(".subbab-check:checked");
  if(checkedMaterials.length === 0){
    showToast("Pilih minimal 1 subbab", "error");
    return;
  }

  const user = auth.currentUser;
  const userSnap = await getDoc(doc(db,"users",user.uid));
  const userData = userSnap.data();

  const q = query(collection(db,"materialGuru"), where("classId","==",classId), where("teacherId","==",user.uid));
  const oldSnap = await getDocs(q);
  for(const d of oldSnap.docs) await deleteDoc(d.ref);

  const eq = query(collection(db,"exerciseGuru"), where("classId","==",classId), where("teacherId","==",user.uid));
  const exSnap = await getDocs(eq);
  for(const d of exSnap.docs) await deleteDoc(d.ref);

  for (const cb of checkedMaterials) {
    const materialId = cb.value;
    const selectedMaterial = materialsGuru.find(m => m.id === materialId);
    if (!selectedMaterial) continue;

    await addDoc(collection(db, "materialGuru"), {
      materialId, classId, teacherId: user.uid, schoolId: userData.schoolId,
      title: selectedMaterial.title, subject: selectedMaterial.subject, createdAt: new Date()
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
        isAssigned: false, 
        duration: 0,       
        createdAt: new Date()
      });
    }
  }

  showToast("Tugas berhasil ditandai! Buka menu Tugas untuk mengaktifkan durasi.");
  await loadMaterials();
};

// ==========================
// PREVIEW & UTILS
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
      const el = document.getElementById("headerAvatarHeader");
      if(el){
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
  const name = data.name || user.displayName || "Guru";
  const avatar = data.avatarURL || user.photoURL || "../assets/images/default-avatar.png";
  const schoolId = data.schoolId;

  let schoolName = "-";
  let schoolLogo = "../assets/images/default-logo.png";

  if(schoolId){
    const schoolSnap = await getDoc(doc(db,"schools",schoolId));
    if(schoolSnap.exists()){
      const schoolData = schoolSnap.data();
      if(schoolData.status !== "aktif"){
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

function lockPage(){
  const main = document.querySelector(".main");
  if(!main) return;
  main.innerHTML = `
    <div style="display:flex; justify-content:center; align-items:center; height:80vh; flex-direction:column; text-align:center;">
      <h1 style="color:red;">🚫 Akses Ditolak</h1>
      <p>Sekolah kamu sedang <b>nonaktif</b></p>
      <button onclick="window.location='../../login.html'">Logout</button>
    </div>
  `;
}

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

window.filterBySubject = () => {
  filterMaterialsGuru();
};

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
    if (m.subject === subject && m.chapter) {
      if (!chapters.includes(m.chapter)) {
        chapters.push(m.chapter);
      }
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
      title: title,
      subChapter: title, 
      chapter: chapter, 
      subject: subject,
      content: content,
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
    toggleForm('formMateri');
    
    await loadMaterials();
  } catch (error) {
    console.error("Error creating material:", error);
    showToast("Gagal membuat materi", "error");
  }
};

window.saveNewExercise = async () => {
  const subject = document.getElementById("newExerciseSubject").value;
  const chapter = document.getElementById("newExerciseChapter").value;
  const materialId = document.getElementById("newExerciseMaterialId").value;
  const title = document.getElementById("newExerciseTitle").value;
  
  if (!subject || !chapter || !materialId || !title) {
    showToast("Semua tingkatan (Mapel, Bab, Materi) dan Judul Latihan wajib dipilih/diisi!", "error");
    return;
  }

  try {
    const user = auth.currentUser;
    await addDoc(collection(db, "exercises"), {
      title: title,
      materialId: materialId, 
      subject: subject,
      chapter: chapter,
      createdBy: user.uid,
      isCustomTeacher: true,
      questions: [],         
      createdAt: new Date()
    });
    
    showToast("Latihan baru berhasil dibuat!");
    document.getElementById("newExerciseTitle").value = "";
    toggleForm('formExercise');
    
    await loadExercises();
    renderMaterials(filteredMaterials);
  } catch (error) {
    console.error("Error creating exercise:", error);
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
    if (m.subject === selectedSubject && m.chapter) {
      if (!chapters.includes(m.chapter)) {
        chapters.push(m.chapter);
      }
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
