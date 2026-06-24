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
// STATE MANAGEMENT
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
  schoolData = snap.data();
}

async function loadExercises(){
  const snap = await getDocs(collection(db,"exercises"));
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
  renderAssignmentPanel(filteredMaterials);
}

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

// ==========================
// RENDER PENUGASAN (DASHBOARD KONTROL)
// ==========================
function renderAssignmentPanel(data){
  const container = document.getElementById("assignmentGuruList");
  container.innerHTML = "";

  if(data.length === 0){
    container.innerHTML = `<p>Tidak ada materi atau kuis latihan ditemukan.</p>`;
    return;
  }

  const grouped = {};
  data.forEach(m => {
    const bab = m.chapter || "Bab Umum";
    if(!grouped[bab]) grouped[bab] = [];
    grouped[bab].push(m);
  });

  Object.keys(grouped).forEach(bab => {
    const babDiv = document.createElement("div");
    babDiv.className = "bab-box";

    babDiv.innerHTML = `
      <h3 class="bab-title">
        <span>📘 ${bab}</span>
        <button class="toggle-btn">Lihat Materi & Latihan</button>
      </h3>

      <div class="subbab-list">
        ${grouped[bab].map(m => {
          const materialExercises = exercisesData.filter(ex => ex.materialId === m.id);
          const isMaterialChecked = assignedMaterials.includes(m.id) ? "checked" : "";

          return `
            <div class="subbab-item">
              <label style="font-weight: bold;">
                <input
                  type="checkbox"
                  class="subbab-check"
                  value="${m.id}"
                  ${isMaterialChecked} 
                >
                📄 Sub-Bab: ${m.subChapter || m.title}
              </label>

              <div class="exercise-list" style="margin-left: 20px; background: #fafafa; padding: 5px; border-radius: 4px;">
                ${materialExercises.map(ex => {
                  const isExerciseChecked = assignedExercises.includes(ex.id) ? "checked" : "";
                  return `
                    <label class="exercise-item" style="display: block; margin: 5px 0;">
                      <input
                        type="checkbox"
                        class="exercise-check"
                        data-material="${m.id}"
                        value="${ex.id}"
                        ${isExerciseChecked} 
                      >
                      📝 Latihan: ${ex.title}
                    </label>
                  `;
                }).join("")}
                ${materialExercises.length === 0 ? '<p style="font-size:12px; color:gray; margin:0;">Tidak ada latihan di sub-bab ini</p>' : ''}
              </div>
            </div>
          `;
        }).join("")}
      </div>

      <button onclick="saveAssignmentStructure('${bab}')">
        ➕ Pakai Materi Ini
      </button>
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
  teacherSubjects.forEach(sub => {
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
// PROSES UTAMA SIMPAN TUGAS KELAS SISWA
// ==========================
window.saveAssignmentStructure = async (bab) => {
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

  // Bersihkan data lama kelas tersebut
  const q = query(collection(db,"materialGuru"), where("classId","==",classId), where("teacherId","==",user.uid));
  const oldSnap = await getDocs(q);
  for(const d of oldSnap.docs) await deleteDoc(d.ref);

  const eq = query(collection(db,"exerciseGuru"), where("classId","==",classId), where("teacherId","==",user.uid));
  const exSnap = await getDocs(eq);
  for(const d of exSnap.docs) await deleteDoc(d.ref);

  // Masukkan struktur penugasan baru
  for (const cb of checked) {
    const materialId = cb.value;
    const selectedMaterial = materialsGuru.find(m => m.id === materialId);

    if (!selectedMaterial) continue;

    await addDoc(collection(db, "materialGuru"), {
      materialId,
      classId,
      teacherId: user.uid,
      schoolId: userData.schoolId,
      title: selectedMaterial.title,
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
  await loadMaterialsData();
};

// ==========================
// TOAST & PROFILE HEADER SYSTEM
// ==========================
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

  document.getElementById("headerNameHeader").innerText = name;
  document.getElementById("headerAvatarHeader").src = avatar;
}
