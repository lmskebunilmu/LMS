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

  const classesList = [];
  snap.forEach(docSnap => {
    classesList.push({
      id: docSnap.id,
      name: docSnap.data().name || "Kelas Tanpa Nama"
    });
  });

  classesList.sort((a, b) => a.name.localeCompare(b.name, 'id', { numeric: true, sensitivity: 'base' }));

  if (classesList.length === 0) {
    select.innerHTML = `<option value="">-- Belum ada kelas --</option>`;
    return;
  }

  classesList.forEach(cls => {
    const opt = document.createElement("option");
    opt.value = cls.id;
    opt.textContent = cls.name;
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

  materialsGuru.sort((a, b) => {
    const titleA = (a.subChapter || a.title || "").toLowerCase();
    const titleB = (b.subChapter || b.title || "").toLowerCase();
    return titleA.localeCompare(titleB, 'id', { numeric: true });
  });

  filteredMaterials = materialsGuru;
  await loadAssignments();
  renderMaterials(filteredMaterials);
}

async function loadExercises(){
  const snap = await getDocs(collection(db,"exercises"));
  exercisesData = [];
  snap.forEach(doc => {
    exercisesData.push({ id: doc.id, ...doc.data() });
  });
  exercisesData.sort((a, b) => (a.title || "").localeCompare(b.title || "", 'id', { numeric: true }));
}

// ==========================
// RENDER TOMBOL BAB (MODERN DI HP)
// ==========================
function renderMaterials(data){
  const container = document.getElementById("materialGuruList");
  container.innerHTML = "";

  if(data.length === 0){
    container.innerHTML = `<p style="text-align: center; color: #64748b;">Tidak ada materi</p>`;
    return;
  }

  const grouped = {};
  data.forEach(m => {
    const bab = m.chapter || "Bab Umum";
    if(!grouped[bab]) grouped[bab] = [];
    grouped[bab].push(m);
  });

  const sortedChapters = Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'id', { numeric: true, sensitivity: 'base' }));

  sortedChapters.forEach(bab => {
    const totalMateri = grouped[bab].length;
    const babBtn = document.createElement("button");
    
    babBtn.className = "bab-trigger-btn";
    babBtn.style.cssText = "width: 100%; padding: 14px 18px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; font-size: 14px; font-weight: 600; color: #1e293b; box-shadow: 0 1px 3px rgba(0,0,0,0.05); transition: all 0.2s;";
    
    babBtn.innerHTML = `
      <span style="text-align: left;">📘 ${bab} <span style="display: block; font-size: 12px; font-weight: normal; color: #64748b; margin-top: 2px;">${totalMateri} Sub-Bab Tersedia</span></span>
      <span style="color: #4f46e5; font-weight: bold;">Buka &rarr;</span>
    `;

    babBtn.onclick = () => openChapterModal(bab, grouped[bab]);
    container.appendChild(babBtn);
  });
}

// ==========================
// KONTROL MODAL BAB
// ==========================
window.openChapterModal = (babName, materialsList) => {
  document.getElementById("modalChapterTitle").innerText = `📘 ${babName}`;
  const bodyContainer = document.getElementById("modalChapterBody");
  bodyContainer.innerHTML = "";

  materialsList.forEach(m => {
    const materialExercises = exercisesData.filter(ex => ex.materialId === m.id);
    const isMaterialChecked = assignedMaterials.includes(m.id) ? "checked" : "";

    const itemDiv = document.createElement("div");
    itemDiv.style.cssText = "margin-bottom: 15px; padding-bottom: 12px; border-bottom: 1px solid #f1f5f9;";
    
    itemDiv.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; flex: 1; font-size: 14px; font-weight: 600; color: #334155;">
          <input
            type="checkbox"
            class="subbab-check-modal"
            value="${m.id}"
            onchange="autoSaveMaterialFirebase(this)"
            ${isMaterialChecked}
            style="width: 18px; height: 18px; cursor: pointer;" >
          <span>${m.subChapter || m.title}</span>
        </label>
        <button onclick="previewMaterial('${m.id}')" style="background: #e2e8f0; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">👁 Lihat</button>
      </div>

      <div style="margin-left: 26px; margin-top: 6px; background: #f8fafc; padding: 8px; border-left: 2px solid #cbd5e1; border-radius: 4px;">
        <div style="font-size: 11px; color: #64748b; margin-bottom: 4px;">📝 Latihan Terkait:</div>
        ${materialExercises.length > 0 ? materialExercises.map(ex => {
          const isExerciseChecked = (assignedMaterials.includes(m.id) || assignedExercises.includes(ex.id)) ? "checked" : "";
          return `
            <label style="display:block; margin: 3px 0; font-size: 12px; color: #475569;">
              <input
                type="checkbox"
                class="exercise-check-modal"
                data-material="${m.id}"
                value="${ex.id}"
                ${isExerciseChecked}
                disabled >
              📝 ${ex.title}
            </label>
          `;
        }).join("") : '<span style="font-size:11px; color:#94a3b8;">Tidak ada latihan</span>'}
      </div>
    `;
    bodyContainer.appendChild(itemDiv);
  });

  document.getElementById("chapterModal").style.display = "flex";
};

window.closeChapterModal = () => {
  document.getElementById("chapterModal").style.display = "none";
};

// ==========================
// OTOMATIS SIMPAN KE FIREBASE SAAT DICENTANG
// ==========================
window.autoSaveMaterialFirebase = async (checkbox) => {
  const materialId = checkbox.value;
  const isChecked = checkbox.checked;
  const classId = getSelectedClassId();

  if(!classId) {
    showToast("Pilih kelas terlebih dahulu!", "error");
    checkbox.checked = !isChecked;
    return;
  }

  const user = auth.currentUser;
  const userSnap = await getDoc(doc(db, "users", user.uid));
  const userData = userSnap.data();
  const selectedMaterial = materialsGuru.find(m => m.id === materialId);

  const exerciseCheckboxes = document.querySelectorAll(`.exercise-check-modal[data-material="${materialId}"]`);
  exerciseCheckboxes.forEach(exCb => {
    exCb.checked = isChecked;
  });

  try {
    if (isChecked) {
      await addDoc(collection(db, "materialGuru"), {
        materialId, 
        classId, 
        teacherId: user.uid, 
        schoolId: userData.schoolId,
        title: selectedMaterial.title, 
        subject: selectedMaterial.subject, 
        createdAt: new Date()
      });

      if (!assignedMaterials.includes(materialId)) {
        assignedMaterials.push(materialId);
      }

      const materialExercises = exercisesData.filter(ex => ex.materialId === materialId);
      for (const ex of materialExercises) {
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
        if (!assignedExercises.includes(ex.id)) {
          assignedExercises.push(ex.id);
        }
      }

      showToast("Materi & Latihan berhasil disimpan ke Firebase!");
    } else {
      const mq = query(
        collection(db, "materialGuru"), 
        where("classId", "==", classId), 
        where("teacherId", "==", user.uid),
        where("materialId", "==", materialId)
      );
      const mSnap = await getDocs(mq);
      for (const d of mSnap.docs) {
        await deleteDoc(d.ref);
      }

      assignedMaterials = assignedMaterials.filter(id => id !== materialId);

      const eq = query(
        collection(db, "exerciseGuru"), 
        where("classId", "==", classId), 
        where("teacherId", "==", user.uid),
        where("materialId", "==", materialId)
      );
      const eSnap = await getDocs(eq);
      for (const d of eSnap.docs) {
        await deleteDoc(d.ref);
      }

      assignedExercises = assignedExercises.filter(id => !exercisesData.some(e => e.id === id && e.materialId === materialId));

      showToast("Materi & Latihan dihapus dari Firebase", "error");
    }
  } catch (error) {
    console.error("Gagal sinkronisasi Firebase:", error);
    showToast("Gagal menyimpan ke Firebase", "error");
  }
};

// ==========================
// FILTER
// ==========================
window.filterMaterialsGuru = () => {
  const search = document.getElementById("searchMaterialGuru").value.toLowerCase();
  const selectedSubject = document.getElementById("subjectFilter").value;

  filteredMaterials = materialsGuru.filter(m => {
    const matchSearch =
      m.title.toLowerCase().includes(search) ||
      m.subject.toLowerCase().includes(search);

    const matchSubject = !selectedSubject || m.subject === selectedSubject;
    return matchSearch && matchSubject;
  });

  renderMaterials(filteredMaterials);
};

window.previewMaterial = (id) => {
  window.open(`preview.html?id=${id}`, "_blank");
};

function showToast(msg, type="success"){
  const t = document.getElementById("toast");
  if(!t) return;
  t.innerText = msg;
  t.className = type === "error" ? "toast error active" : "toast active";
  setTimeout(() => {
    t.classList.remove("active");
  }, 3000);
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

  if(document.getElementById("headerNameHeader")) document.getElementById("headerNameHeader").innerText = name;
  if(document.getElementById("headerAvatarHeader")) document.getElementById("headerAvatarHeader").src = avatar;
  if(document.getElementById("headerSchoolName")) document.getElementById("headerSchoolName").innerText = schoolName;
  if(document.getElementById("headerSchoolLogo")) document.getElementById("headerSchoolLogo").src = schoolLogo;
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
  if(!select) return;

  select.innerHTML = `<option value="">Semua Mapel</option>`;
  const sortedSubjects = [...teacherSubjects].sort((a, b) => a.localeCompare(b, 'id', { sensitivity: 'base' }));

  sortedSubjects.forEach(sub => {
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

  const mq = query(
    collection(db,"materialGuru"),
    where("classId","==",classId),
    where("teacherId","==",user.uid)
  );
  const msnap = await getDocs(mq);
  assignedMaterials = msnap.docs.map(d => d.data().materialId);

  const eq = query(
    collection(db,"exerciseGuru"),
    where("classId","==",classId),
    where("teacherId","==",user.uid)
  );
  const esnap = await getDocs(eq);
  assignedExercises = esnap.docs.map(d => d.data().exerciseId);
}

window.toggleForm = (formId) => {
  const form = document.getElementById(formId);
  if(!form) return;

  if(form.style.display === "none") {
    form.style.display = "block";
    if(formId === 'formMateri') populateNewMaterialSubjects();
    if(formId === 'formExercise') populateExerciseSubjects();
  } else {
    form.style.display = "none";
  }
};

function populateNewMaterialSubjects() {
  const select = document.getElementById("newMaterialSubject");
  if(!select) return;
  select.innerHTML = "";
  
  const filterSelect = document.getElementById("subjectFilter");
  if(!filterSelect) return;

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
  if(!select) return;
  select.innerHTML = '<option value="">-- Pilih Mapel --</option>';
  
  const filterSelect = document.getElementById("subjectFilter");
  if(!filterSelect) return;

  for (let option of filterSelect.options) {
    if (option.value !== "") {
      const opt = document.createElement("option");
      opt.value = option.value;
      opt.textContent = option.textContent;
      select.appendChild(opt);
    }
  }

  if(document.getElementById("newExerciseChapter")) {
    document.getElementById("newExerciseChapter").innerHTML = '<option value="">-- Pilih Bab --</option>';
    document.getElementById("newExerciseChapter").disabled = true;
  }
  if(document.getElementById("newExerciseMaterialId")) {
    document.getElementById("newExerciseMaterialId").innerHTML = '<option value="">-- Pilih Sub-Bab / Materi --</option>';
    document.getElementById("newExerciseMaterialId").disabled = true;
  }
}

window.updateExerciseChapters = () => {
  const subject = document.getElementById("newExerciseSubject").value;
  const chapterSelect = document.getElementById("newExerciseChapter");
  const materialSelect = document.getElementById("newExerciseMaterialId");

  if(!chapterSelect || !materialSelect) return;
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
      if (!chapters.includes(m.chapter)) chapters.push(m.chapter);
    }
  });

  chapters.sort((a, b) => a.localeCompare(b, 'id', { numeric: true, sensitivity: 'base' }));
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

  if(!materialSelect) return;
  materialSelect.innerHTML = '<option value="">-- Pilih Sub-Bab / Materi --</option>';

  if (!chapter) {
    materialSelect.disabled = true;
    return;
  }

  const filtered = materialsGuru.filter(m => m.subject === subject && m.chapter === chapter);
  filtered.sort((a, b) => (a.subChapter || a.title || "").localeCompare(b.subChapter || b.title || "", 'id', { numeric: true }));

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
    showToast("Semua tingkatan dan Judul Latihan wajib diisi!", "error");
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
  if(!chapterSelect) return;
  
  chapterSelect.innerHTML = '<option value="">-- Pilih Bab Yang Sudah Ada --</option>';
  if (!selectedSubject) return;

  const chapters = [];
  materialsGuru.forEach(m => {
    if (m.subject === selectedSubject && m.chapter) {
      if (!chapters.includes(m.chapter)) chapters.push(m.chapter);
    }
  });

  chapters.sort((a, b) => a.localeCompare(b, 'id', { numeric: true, sensitivity: 'base' }));
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
  if(!inputEl) return;
  
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
