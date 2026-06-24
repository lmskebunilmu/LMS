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

// 🔥 WAJIB TAMBAH INI
await waitForHeader();
await loadProfileHeader(user); // 🔥 TAMBAH INI

await loadClasses(user);
await loadSchoolData(userData.schoolId);
await loadExercises();
// 🔥 TAMBAH INI
const classSelect = document.getElementById("classSelect");

classSelect.addEventListener("change", async () => {

  // 🔥 RESET FILTER MAPEL
  document.getElementById("subjectFilter").value = "";

  await loadMaterials();
});

// load pertama
await loadMaterials();
});

// ==========================
// LOAD KELAS
// ==========================
async function loadClasses(user) {

  const userSnap = await getDoc(doc(db, "users", user.uid));
  const userData = userSnap.data();

  const q = query(
    collection(db,"classes"),
    where("teacherIds","array-contains",user.uid),
    where("schoolId","==",userData.schoolId)
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

// ==========================
// LOAD SCHOOL
// ==========================
async function loadSchoolData(schoolId) {

  const snap = await getDoc(doc(db,"schools",schoolId));

  if(!snap.exists()) return;

  const data = snap.data();

  // 🚨 VALIDASI STATUS SEKOLAH
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

  // 🔥 ambil data class
  const classSnap = await getDoc(doc(db, "classes", classId));
  if (!classSnap.exists()) return;

  const classData = classSnap.data();

  // 🔥 ambil mapel guru di class ini
 //  KODE BARU (Sudah sesuai dengan Firestore kamu)
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

    // ✅ filter sekolah
    if (!approved.includes(m.subject)) return;

    // ✅ filter berdasarkan kelas + guru
    if (teacherSubjects.length && !teacherSubjects.includes(m.subject)) return;

    materialsGuru.push(m);

  });

  filteredMaterials = materialsGuru;

  renderMaterials(filteredMaterials);
}

async function loadExercises(){

  const snap = await getDocs(
    collection(db,"exercises")
  );

  exercisesData = [];

  snap.forEach(doc => {

    exercisesData.push({
      id: doc.id,
      ...doc.data()
    });

  });

}
// ==========================
// RENDER
// ==========================
function renderMaterials(data){

  const container = document.getElementById("materialGuruList");
  container.innerHTML = "";

  if(data.length === 0){
    container.innerHTML = `<p>Tidak ada materi</p>`;
    return;
  }

  // ==========================
  // GROUP BY CHAPTER
  // ==========================
  const grouped = {};

  data.forEach(m => {

    const bab = m.chapter || "Bab Umum";

    if(!grouped[bab]) grouped[bab] = [];

    grouped[bab].push(m);

  });

  // ==========================
  // RENDER PER BAB
  // ==========================
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

  // 🔥 ambil exercise sesuai material
  const materialExercises =
    exercisesData.filter(
      ex => ex.materialId === m.id
    );

  return `

    <div class="subbab-item">

      <label>
        <input
          type="checkbox"
          class="subbab-check"
          value="${m.id}"
        >

        ${m.subChapter || m.title}
      </label>

      <button onclick="previewMaterial('${m.id}')">
        👁
      </button>

      <!-- 🔥 LIST EXERCISE -->
      <div class="exercise-list">

        ${materialExercises.map(ex => `

          <label class="exercise-item">

            <input
              type="checkbox"
              class="exercise-check"
              data-material="${m.id}"
              value="${ex.id}"
            >

            📝 ${ex.title}

          </label>

        `).join("")}

      </div>

    </div>

  `;
}).join("")}
      </div>

      <button onclick="assignSelected('${bab}')">
        ➕ Pakai Materi Ini
      </button>
    `;

    // ==========================
    // ACCORDION CLICK
    // ==========================
    const btn = babDiv.querySelector(".toggle-btn");

btn.onclick = () => {

  document.querySelectorAll(".bab-box").forEach(b => {
    if (b !== babDiv) b.classList.remove("active");
  });

  babDiv.classList.toggle("active");

  // 🔥 ganti teks tombol
  btn.textContent = babDiv.classList.contains("active")
    ? "Tutup"
    : "Lihat Materi";
};

    container.appendChild(babDiv);

  });

}

// ==========================
// FILTER
// ==========================
window.filterMaterialsGuru = () => {

  const search = document
    .getElementById("searchMaterialGuru")
    .value.toLowerCase();

  const selectedSubject =
    document.getElementById("subjectFilter").value;

  filteredMaterials = materialsGuru.filter(m => {

    const matchSearch =
      m.title.toLowerCase().includes(search) ||
      m.subject.toLowerCase().includes(search);

    const matchSubject =
      !selectedSubject || m.subject === selectedSubject;

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

  const checked = document.querySelectorAll(".subbab-check:checked");

  if(checked.length === 0){
    showToast("Pilih minimal 1 subbab", "error");
    return;
  }

  const user = auth.currentUser;

  const userSnap = await getDoc(doc(db,"users",user.uid));
  const userData = userSnap.data();

 // ==========================
// 🔥 HAPUS MATERIAL LAMA
// ==========================
const q = query(
  collection(db,"materialGuru"),
  where("classId","==",classId),
  where("teacherId","==",user.uid)
);

const oldSnap = await getDocs(q);

for(const d of oldSnap.docs){
  await deleteDoc(d.ref);
}

// ==========================
// 🔥 HAPUS EXERCISE LAMA
// ==========================
const eq = query(
  collection(db,"exerciseGuru"),
  where("classId","==",classId),
  where("teacherId","==",user.uid)
);

const exSnap = await getDocs(eq);

for(const d of exSnap.docs){
  await deleteDoc(d.ref);
}

 // ==========================
// ==========================
// 🔥 2. INSERT MATERIAL & EXERCISE YANG DICENTANG
// ==========================
for (const cb of checked) {
  const materialId = cb.value;
  const selectedMaterial = materialsGuru.find(m => m.id === materialId);

  if (!selectedMaterial) continue;

  // 1. Simpan Materi yang dicentang
  await addDoc(collection(db, "materialGuru"), {
    materialId,
    classId,
    teacherId: user.uid,
    schoolId: userData.schoolId,
    title: selectedMaterial.title,
    subject: selectedMaterial.subject,
    createdAt: new Date()
  });

  // 2. AMBIL HANYA EXERCISE YANG DICENTANG UNTUK MATERIAL INI
  // Kita cari checkbox exercise yang dicentang DAN memiliki data-material yang cocok
  const checkedExercises = document.querySelectorAll(`.exercise-check[data-material="${materialId}"]:checked`);

  for (const exCb of checkedExercises) {
    const exerciseId = exCb.value;
    
    // Cari data lengkap exercise dari array exercisesData
    const ex = exercisesData.find(e => e.id === exerciseId);
    if (!ex) continue;

    // Simpan ke Firestore
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

// ==========================
// PREVIEW
// ==========================
window.previewMaterial = (id) => {
  window.open(`preview.html?id=${id}`, "_blank");
};

// ==========================
// TOAST
// ==========================
function showToast(msg, type="success"){

  const t = document.getElementById("toast");

  t.innerText = msg;

  t.className =
    type === "error"
    ? "toast error active"
    : "toast active";

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

  const name =
    data.name ||
    user.displayName ||
    "Guru";

  const avatar =
    data.avatarURL ||
    user.photoURL ||
    "../assets/images/default-avatar.png";

  const schoolId = data.schoolId;

  let schoolName = "-";
  let schoolLogo = "../assets/images/default-logo.png";

  if(schoolId){

    const schoolSnap = await getDoc(doc(db,"schools",schoolId));

    if(schoolSnap.exists()){

      const schoolData = schoolSnap.data();

      // 🚨 CEK STATUS SEKOLAH
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
    <div style="
      display:flex;
      justify-content:center;
      align-items:center;
      height:80vh;
      flex-direction:column;
      text-align:center;
    ">
      <h1 style="color:red;">🚫 Akses Ditolak</h1>
      <p>Sekolah kamu sedang <b>nonaktif</b></p>
      <button onclick="window.location='../../login.html'">
        Logout
      </button>
    </div>
  `;
}



async function getTeacherData(userId){

  const q = query(
    collection(db,"teachers"),
    where("userId","==",userId)
  );

  const snap = await getDocs(q);

  if(snap.empty) return null;

  return snap.docs[0].data();

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

function generateContent(input) {
  let output = input;

  // YouTube
  output = output.replace(
    /(https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/[^\s<]+)/g,
    (url) => {
      let videoId = "";
      if (url.includes("watch?v=")) videoId = url.split("watch?v=")[1].split("&")[0];
      else if (url.includes("youtu.be/")) videoId = url.split("youtu.be/")[1].split("?")[0];

      return `<iframe width="100%" height="315"
        src="https://www.youtube.com/embed/${videoId}"
        allowfullscreen>
      </iframe>`;
    }
  );

  // PDF
  output = output.replace(
    /(https?:\/\/[^\s<]+\.pdf)/g,
    (url) => `<iframe src="${url}" width="100%" height="500px"></iframe>`
  );

  // remove script
  output = output.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");

  return output;
}

async function loadAssignments() {

  const classId = getSelectedClassId();
  const user = auth.currentUser;

  // MATERIAL
  const mq = query(
    collection(db,"materialGuru"),
    where("classId","==",classId),
    where("teacherId","==",user.uid)
  );

  const msnap = await getDocs(mq);

  assignedMaterials = msnap.docs.map(d => d.data().materialId);

  // EXERCISE
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
  if(form.style.display === "none") {
    form.style.display = "block";
    // Jika membuka form materi, isi pilihan mapelnya
    if(formId === 'formMateri') populateNewMaterialSubjects();
    // Jika membuka form exercise, isi pilihan materinya
    if(formId === 'formExercise') populateNewExerciseMaterials();
  } else {
    form.style.display = "none";
  }
};

// Mengisi dropdown Mapel di form materi baru berdasarkan mapel yang diampu guru
function populateNewMaterialSubjects() {
  const select = document.getElementById("newMaterialSubject");
  select.innerHTML = "";
  
  // Mengambil mata pelajaran dari filter yang aktif (yang dimiliki guru)
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

// Mengisi dropdown Pilihan Materi untuk form Exercise baru
function populateNewExerciseMaterials() {
  const select = document.getElementById("newExerciseMaterialId");
  select.innerHTML = "<option value=''>-- Pilih Materi Terkait --</option>";
  
  materialsGuru.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = `[${m.subject}] ${m.chapter} - ${m.title}`;
    select.appendChild(opt);
  });
}
window.saveNewMaterial = async () => {
  const title = document.getElementById("newMaterialTitle").value;
  const chapter = document.getElementById("newMaterialChapter").value;
  const subject = document.getElementById("newMaterialSubject").value;
  const content = document.getElementById("newMaterialContent").value;
  
  if(!title || !chapter || !subject) {
    showToast("Judul, Bab, dan Mapel wajib diisi!", "error");
    return;
  }
  
  try {
    const user = auth.currentUser;
    // Tambahkan data materi baru ke koleksi 'materials' pusat
    await addDoc(collection(db, "materials"), {
      title: title,
      subChapter: title, // samakan atau sesuaikan
      chapter: chapter,
      subject: subject,
      content: content,
      level: schoolData.level,         // disamakan dengan level sekolah guru saat ini
      curriculum: schoolData.curriculum, // disamakan dengan kurikulum sekolah guru saat ini
      createdBy: user.uid,             // Penanda bahwa ini dibuat oleh guru tersebut
      isCustomTeacher: true,
      createdAt: new Date()
    });
    
    showToast("Materi baru berhasil dibuat!");
    
    // Reset & tutup form
    document.getElementById("newMaterialTitle").value = "";
    document.getElementById("newMaterialChapter").value = "";
    document.getElementById("newMaterialContent").value = "";
    toggleForm('formMateri');
    
    // Refresh list materi
    await loadMaterials();
  } catch (error) {
    console.error("Error creating material:", error);
    showToast("Gagal membuat materi", "error");
  }
};
window.saveNewExercise = async () => {
  const title = document.getElementById("newExerciseTitle").value;
  const materialId = document.getElementById("newExerciseMaterialId").value;
  
  if(!title || !materialId) {
    showToast("Judul latihan dan materi terkait wajib diisi!", "error");
    return;
  }
  
  // Cari tahu mapel dari materi yang dipilih
  const selectedMat = materialsGuru.find(m => m.id === materialId);
  const subject = selectedMat ? selectedMat.subject : "";

  try {
    const user = auth.currentUser;
    // Tambahkan ke koleksi 'exercises' pusat
    await addDoc(collection(db, "exercises"), {
      title: title,
      materialId: materialId,
      subject: subject,
      createdBy: user.uid,
      isCustomTeacher: true,
      questions: [], // Nanti superadmin/guru bisa mengisi array ini lewat halaman pembuat soal
      createdAt: new Date()
    });
    
    showToast("Latihan baru berhasil dibuat!");
    
    // Reset & tutup form
    document.getElementById("newExerciseTitle").value = "";
    toggleForm('formExercise');
    
    // Refresh data exercise dan list tampilan
    await loadExercises();
    renderMaterials(filteredMaterials);
  } catch (error) {
    console.error("Error creating exercise:", error);
    showToast("Gagal membuat latihan", "error");
  }
};

// Fungsi untuk mengisi daftar Bab yang sudah ada berdasarkan Mapel yang dipilih
window.populateExistingChapters = () => {
  const selectedSubject = document.getElementById("newMaterialSubject").value;
  const chapterSelect = document.getElementById("newMaterialChapterSelect");
  
  // Reset dropdown Bab
  chapterSelect.innerHTML = '<option value="">-- Pilih Bab Yang Sudah Ada --</option>';
  
  if (!selectedSubject) return;

  // Ambil semua bab unik dari materi yang punya mapel sama
  const chapters = [];
  materialsGuru.forEach(m => {
    if (m.subject === selectedSubject && m.chapter) {
      if (!chapters.includes(m.chapter)) {
        chapters.push(m.chapter);
      }
    }
  });

  // Masukkan bab-bab tersebut ke dalam dropdown select
  chapters.forEach(bab => {
    const opt = document.createElement("option");
    opt.value = bab;
    opt.textContent = bab;
    chapterSelect.appendChild(opt);
  });
  
  // Reset input teks bab baru jika mapel berubah
  document.getElementById("newMaterialChapterInput").value = "";
};

// Fungsi pendukung jika user memilih Bab dari dropdown, matikan/kosongkan input teks baru agar tidak membingungkan
window.handleChapterSelectChange = () => {
  const selectVal = document.getElementById("newMaterialChapterSelect").value;
  const inputEl = document.getElementById("newMaterialChapterInput");
  
  if (selectVal !== "") {
    inputEl.value = ""; // kosongkan input teks karena user memilih bab yang ada
    inputEl.placeholder = "Kosong (Menggunakan bab pilihan di atas)";
    inputEl.disabled = true;
    inputEl.style.backgroundColor = "#eee";
  } else {
    inputEl.placeholder = "Ketik Nama Bab Baru (Contoh: Bab 1: Aljabar)";
    inputEl.disabled = false;
    inputEl.style.backgroundColor = "#fff";
  }
};

// Jangan lupa update fungsi toggleForm yang sebelumnya agar memanggil populateExistingChapters() saat form materi dibuka
window.toggleForm = (formId) => {
  const form = document.getElementById(formId);
  if(form.style.display === "none") {
    form.style.display = "block";
    if(formId === 'formMateri') {
      populateNewMaterialSubjects();
      populateExistingChapters(); // 🔥 ISI DAFTAR BAB SAAT FORM DIBUKA
    }
    if(formId === 'formExercise') populateNewExerciseMaterials();
  } else {
    form.style.display = "none";
  }
};
