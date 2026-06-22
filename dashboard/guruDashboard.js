import { auth, db }
from "../firebase/firebase-config.js";

import {
onAuthStateChanged,
updateProfile,
updateEmail,
updatePassword
}
from
"https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
collection,
getDocs,
getDoc,
doc,
updateDoc,
query,
where,
onSnapshot
}
from
"https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


import {
loadLayout
}
from "../assets/js/components.js";

let currentSchoolName = "-";
let currentSchoolLogo =
"../assets/images/default-logo.png";

// ==========================
// AUTH STATE
// ==========================

onAuthStateChanged(auth,
async (user)=>{

if(!user){

window.location =
"../login.html";

return;

}

try{

const userSnap =
await getDoc(
doc(db,"users",user.uid)
);

if(!userSnap.exists()){

alert("User tidak ditemukan");

window.location =
"../login.html";

return;

}

const userData =
userSnap.data();

if(userData.role !== "guru"){

alert("Akses hanya untuk guru");

window.location =
"../login.html";

return;

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
        <button onclick="window.location='../login.html'">Logout</button>
      </div>
    `;

    return;
  }
}

// LOAD LAYOUT

await loadLayout("guru");

await waitForHeader();

await loadProfileHeader(user);

await loadStats(user);

await loadClassWithStudents(user);

}catch(err){

console.error(err);

}

});

// ==========================
// WAIT HEADER READY
// ==========================

function waitForHeader(){

return new Promise(resolve=>{

const interval =
setInterval(()=>{

const el =
document.getElementById(
"headerAvatarHeader"
);

if(el){

clearInterval(interval);

resolve();

}

},50);

});

}

// ==========================
// LOAD PROFILE HEADER
// ==========================

async function loadProfileHeader(user){

const userSnap =
await getDoc(
doc(db,"users",user.uid)
);

if(!userSnap.exists()) return;

const data =
userSnap.data();

const name =
data.name ||
user.displayName ||
"Guru";

const email =
data.email ||
user.email;

const avatar =
data.avatarURL ||
user.photoURL ||
"../assets/images/default-avatar.png";

const schoolId =
data.schoolId || null;


// ==========================
// AMBIL DATA SEKOLAH
// ==========================

let schoolName = "-";
let schoolLogo =
"../assets/images/default-logo.png";

if (schoolId) {

  const schoolSnap = await getDoc(doc(db, "schools", schoolId));

  if (schoolSnap.exists()) {

    const schoolData = schoolSnap.data();

    // 🚨 CEK STATUS SEKOLAH
    if (schoolData.status !== "aktif") {

      showToast("Sekolah kamu nonaktif!", "error");

      lockDashboard(); // ⛔ blok akses
      return;

    }

    // ✅ lanjut normal
    schoolName = schoolData.name || "-";
    schoolLogo = schoolData.logoURL || "../assets/images/default-logo.png";
  }
}

currentSchoolName =
schoolName;

currentSchoolLogo =
schoolLogo;


// ==========================
// UPDATE HEADER (SAFE)
// ==========================

const nameHeader =
document.getElementById(
"headerNameHeader"
);

if(nameHeader)
nameHeader.innerText = name;

const avatarHeader =
document.getElementById(
"headerAvatarHeader"
);

if(avatarHeader)
avatarHeader.src = avatar;

const schoolNameEl =
document.getElementById(
"headerSchoolName"
);

if(schoolNameEl)
schoolNameEl.innerText =
schoolName;

const schoolLogoEl =
document.getElementById(
"headerSchoolLogo"
);

if(schoolLogoEl)
schoolLogoEl.src =
schoolLogo;


// ==========================
// UPDATE PROFILE CARD (SAFE)
// ==========================

const nameCard =
document.getElementById(
"headerNameCard"
);

if(nameCard)
nameCard.innerText = name;

const emailCard =
document.getElementById(
"headerEmailCard"
);

if(emailCard)
emailCard.innerText = email;

const avatarCard =
document.getElementById(
"headerAvatarCard"
);

if(avatarCard)
avatarCard.src = avatar;

const schoolCard =
document.getElementById(
"headerSchoolCard"
);

if(schoolCard)
schoolCard.innerText =
schoolName;


// ==========================
// ISI MODAL (SAFE)
// ==========================

const profileName =
document.getElementById(
"profileName"
);

if(profileName)
profileName.value = name;

const profileEmail =
document.getElementById(
"profileEmail"
);

if(profileEmail)
profileEmail.value = email;

}

// ==========================
// LOAD STATS
// ==========================

async function loadStats(user){

  try{

    const userSnap = await getDoc(doc(db,"users",user.uid));
    const userData = userSnap.data();

    const schoolId = userData.schoolId;
    if(!schoolId) return;

    // ==========================
    // QUERY CLASSES
    // ==========================
    const qClasses = query(
      collection(db,"classes"),
      where("teacherIds","array-contains",user.uid),
      where("schoolId","==",schoolId)
    );

    // ==========================
    // REALTIME LISTENER 🔥
    // ==========================
    onSnapshot(qClasses, (snapClasses) => {

      // CLASSES
      document.getElementById("totalClasses").innerText =
        snapClasses.size;

      // ==========================
      // STUDENTS
      // ==========================
      let totalStudents = 0;

      snapClasses.forEach(doc => {
        const data = doc.data();
        const studentIds = data.studentIds || [];
        totalStudents += studentIds.length;
      });

      document.getElementById("totalStudents").innerText =
        totalStudents;

      // ==========================
      // SUBJECTS (MAPEL)
      // ==========================
      const subjectSet = new Set();

      snapClasses.forEach(classDoc => {
        const classData = classDoc.data();

        const teacherMap = classData.teacherMap || {};
        const subjects = teacherMap[user.uid] || [];

        subjects.forEach(sub => subjectSet.add(sub));
      });

      document.getElementById("totalSubjects").innerText =
        subjectSet.size;

    });

  } catch(err){
    console.error("Gagal load statistik:", err);
  }

}
// ==========================
// MODAL
// ==========================

window.openProfileModal =
()=>{

document
.getElementById(
"profileModal"
)
.classList.add("active");

};

window.closeProfileModal =
()=>{

document
.getElementById(
"profileModal"
)
.classList.remove("active");

};

// ==========================
// SAVE PROFILE
// ==========================

// ==========================
// SAVE PROFILE
// ==========================

window.saveProfile =
async ()=>{

const user =
auth.currentUser;

if(!user) return;

const name =
document.getElementById(
"profileName"
).value.trim();

const email =
document.getElementById(
"profileEmail"
).value.trim();

const file =
document.getElementById(
"profileAvatarFile"
).files[0];

if(!name || !email){

showToast(
"Isi semua data",
"error"
);

return;

}

try{

// ==========================
// AMBIL DATA USER LAMA
// ==========================

const userSnap =
await getDoc(
doc(db,"users",user.uid)
);

const userData =
userSnap.data();

// DEFAULT AVATAR (AMAN)

let avatarURL =
userData?.avatarURL ??
user.photoURL ??
"../assets/images/default-avatar.png";

// ==========================
// UPLOAD CLOUDINARY
// ==========================

if(file){

const formData =
new FormData();

formData.append(
"file",
file
);

formData.append(
"upload_preset",
"avatar_upload"
);

const cloudName =
"djlvnubgn";

const res =
await fetch(
`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
{
method:"POST",
body:formData
}
);

const data =
await res.json();

console.log(
"Cloudinary response:",
data
);

// VALIDASI

if(!data || !data.secure_url){

console.error(
"Cloudinary gagal:",
data
);

throw new Error(
"Upload avatar gagal"
);

}

// SIMPAN URL

avatarURL =
data.secure_url;

}

// ==========================
// UPDATE AUTH
// ==========================

await updateProfile(user,{
displayName:name,
photoURL:avatarURL
});

if(email !== user.email){

await updateEmail(
user,
email
);

}
// ==========================
// UPDATE PASSWORD
// ==========================

const password =
document.getElementById(
"profilePassword"
)?.value.trim();

const confirmPassword =
document.getElementById(
"profilePasswordConfirm"
)?.value.trim();

if(password){

// VALIDASI PANJANG

if(password.length < 6){

showToast(
"Password minimal 6 karakter",
"error"
);

return;

}

// VALIDASI KONFIRMASI

if(password !== confirmPassword){

showToast(
"Password tidak sama",
"error"
);

return;

}

// UPDATE PASSWORD FIREBASE

await updatePassword(
user,
password
);

// KOSONGKAN INPUT

document.getElementById(
"profilePassword"
).value = "";

document.getElementById(
"profilePasswordConfirm"
).value = "";

}
// ==========================
// UPDATE FIRESTORE
// ==========================

await updateDoc(
doc(db,"users",user.uid),
{
name,
email,
avatarURL
}
);

showToast(
"Profil guru berhasil diperbarui"
);

closeProfileModal();

// REFRESH UI

await loadProfileHeader(user);

}catch(err){

console.error(err);

showToast(
"Gagal update profil",
"error"
);

}

};// ==========================
// NAVIGASI
// ==========================

window.goMaterials =
()=>{

window.location =
"../modules/materials/materials.html";

};

window.goAssignments =
()=>{

window.location =
"../modules/assignments/assignments.html";

};

window.goAttendance =
()=>{

window.location =
"../modules/attendance/attendance.html";

};

function lockDashboard() {

  const main = document.querySelector(".main");

  if (!main) return;

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
      <button onclick="window.location='../login.html'" class="btn-edit">
        Logout
      </button>
    </div>
  `;
}
async function loadClassWithStudents(user){
  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    const userData = userSnap.data();

    const schoolId = userData.schoolId;
    if(!schoolId) return;

    const container = document.getElementById("classListContainer");
    container.innerHTML = "Loading...";

    // Query semua kelas di sekolah ini yang di dalamnya terdapat ID guru ini
    const qClasses = query(
      collection(db, "classes"),
      where("teacherIds", "array-contains", user.uid),
      where("schoolId", "==", schoolId)
    );

    const snapClasses = await getDocs(qClasses);

    if (snapClasses.empty) {
      container.innerHTML = "<p>Tidak ada kelas yang diampu</p>";
      return;
    }

    container.innerHTML = "";

    // 🔥 LOOP KELAS
    for (const classDoc of snapClasses.docs) {
      const classData = classDoc.data();
      const classId = classDoc.id;
      const studentIds = classData.studentIds || [];

      // 1. Cek Apakah Guru Ini Adalah Wali Kelas Di Sini
      const isWaliKelas = classData.homeroomTeacherId === user.uid;
      const waliKelasBadge = isWaliKelas 
        ? `<span style="background-color: #10b981; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; margin-left: 8px;">👑 Wali Kelas</span>` 
        : "";

      // 2. Ambil Mata Pelajaran Yang Diajarkan Guru Ini Khusus Di Kelas Ini
      // Mendukung struktur field 'teachers' (object map) maupun 'teacherMap'
      const classTeachersMapping = classData.teachers || classData.teacherMap || {};
      const mySubjects = classTeachersMapping[user.uid] || [];
      const subjectsText = mySubjects.length > 0 ? mySubjects.join(", ") : "-";

      // 3. AMBIL DATA SISWA
      const students = await Promise.all(
        studentIds.map(async (id) => {
          try {
            const snap = await getDoc(doc(db, "users", id));
            return snap.exists() ? snap.data() : null;
          } catch {
            return null;
          }
        })
      );

      // Urutkan siswa A-Z
      const cleanStudents = students
        .filter(s => s !== null)
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

      const div = document.createElement("div");
      div.className = "class-box";
      div.style.marginBottom = "15px";

      div.innerHTML = `
        <button class="class-toggle" style="width:100%; text-align:left; display:flex; justify-content:space-between; align-items:center;">
          <span>📋 <b>${classData.name}</b> ${waliKelasBadge}</span>
          <span style="font-size:12px; color:#64748b;">📖 ${mySubjects.length} Mapel</span>
        </button>

        <div class="class-detail" style="display:none; padding: 15px; border: 1px solid #e2e8f0; border-top:none; border-radius:0 0 6px 6px; background:#fff;">
          <div style="margin-bottom: 10px; font-size: 13px; color: #475569; line-height: 1.6;">
            <div>• Status: <b>${isWaliKelas ? "Wali Kelas" : "Guru Pengampu"}</b></div>
            <div>• Mengajar Mapel: <span style="color:#4f46e5; font-weight:600;">${subjectsText}</span></div>
            <div>• Total Siswa: <b>${cleanStudents.length} Anak</b></div>
          </div>

          <div class="export-buttons" style="margin-bottom:15px;">
            <button class="btn-export btn-csv">Export CSV</button>
            <button class="btn-export btn-pdf">Download PDF</button>
          </div>

          <strong style="font-size:13px; display:block; margin-bottom:5px; color:#1e293b;">Daftar Murid:</strong>
          <ul style="list-style: none; padding: 0; margin: 0; max-height: 150px; overflow-y: auto;">
            ${
              cleanStudents.length > 0
              ? cleanStudents.map((s, index) => `<li style="padding: 6px 0; border-bottom: 1px dashed #f1f5f9; font-size:13px;">${index + 1}. 👤 ${s.name}</li>`).join("")
              : "<li style='color:#94a3b8; font-size:13px;'>Tidak ada siswa di kelas ini</li>"
            }
          </ul>
        </div>
      `;

      // Fungsi Toggle Detail Tampilan Kelas
      div.querySelector(".class-toggle").onclick = () => {
        const detail = div.querySelector(".class-detail");
        detail.style.display = detail.style.display === "none" ? "block" : "none";
      };

      // Aksi Tombol Dokumen
      div.querySelector(".btn-csv").onclick = () => {
        exportCSV(cleanStudents, classData.name);
      };

      div.querySelector(".btn-pdf").onclick = () => {
        exportPDF(cleanStudents, classData.name);
      };

      container.appendChild(div);
    }

  } catch(err) {
    console.error("Gagal memuat detail kelas dan siswa:", err);
  }
}

window.exportCSV = (students, className) => {

  let csv = "Nama,Email\n";

  students.forEach(s => {
    csv += `${s.name},${s.email || "-"}\n`;
  });

  const blob = new Blob([csv], { type: "text/csv" });
  const url = window.URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${className}.csv`;
  a.click();

};

window.exportPDF = async (students, className) => {

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // ==========================
  // LOAD LOGO (ASYNC)
  // ==========================
  const getBase64FromURL = async (url) => {
    const res = await fetch(url);
    const blob = await res.blob();

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  };

  let logoBase64 = null;

  try {
    logoBase64 = await getBase64FromURL(currentSchoolLogo);
  } catch (err) {
    console.warn("Logo gagal dimuat");
  }

  // ==========================
  // HEADER SEKOLAH
  // ==========================
  if (logoBase64) {
    doc.addImage(logoBase64, "PNG", 14, 10, 20, 20);
  }

  doc.setFontSize(14);
  doc.text(currentSchoolName || "Nama Sekolah", 40, 15);

  doc.setFontSize(11);
  doc.text("Laporan Data Siswa", 40, 22);

  // ==========================
  // INFO KELAS
  // ==========================
  doc.setFontSize(12);
  doc.text(`Kelas: ${className}`, 14, 40);

  const today = new Date().toLocaleDateString();
  doc.text(`Tanggal: ${today}`, 14, 47);

  // ==========================
  // DATA TABLE
  // ==========================
  const tableData = students.map((s, i) => [
    i + 1,
    s.name || "-",
    s.email || "-"
  ]);

  doc.autoTable({
    startY: 55,
    head: [["No", "Nama", "Email"]],
    body: tableData,

    styles: {
      fontSize: 10,
      cellPadding: 3,
    },

    headStyles: {
      fillColor: [37, 99, 235],
      textColor: 255,
    },

    alternateRowStyles: {
      fillColor: [240, 245, 255],
    },
  });

  // ==========================
  // FOOTER
  // ==========================
  doc.text(
    `Total siswa: ${students.length}`,
    14,
    doc.lastAutoTable.finalY + 10
  );

  // ==========================
  // SAVE
  // ==========================
  doc.save(`Data_Siswa_${className}.pdf`);

};
