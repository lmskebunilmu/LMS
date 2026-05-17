import { auth, db }
from "../../firebase/firebase-config.js";

import {
onAuthStateChanged
}
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
collection,
getDocs,
addDoc,
serverTimestamp,
doc,
getDoc,
query,
where
}
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
loadLayout
}
from "../../assets/js/components.js";

let studentData = null;
let allTeachers = [];
let availableTeachers = [];

const dayMap = [
"Minggu",
"Senin",
"Selasa",
"Rabu",
"Kamis",
"Jumat",
"Sabtu"
];

// AUTH
onAuthStateChanged(auth, async(user)=>{

if(!user){

window.location =
"../../login.html";


return;

}


await loadLayout("student");

// FIX PATH COMPONENT
const headerContainer =
document.getElementById("header-container");

const sidebarContainer =
document.getElementById("sidebar-container");

if (headerContainer) {

  const headerRes = await fetch(
    "../../components/header.html"
  );

  headerContainer.innerHTML =
  await headerRes.text();

}

if (sidebarContainer) {

  const sidebarRes = await fetch(
    "../../components/sidebar-student.html"
  );

  sidebarContainer.innerHTML =
  await sidebarRes.text();

}

const userSnap =
await getDoc(
doc(db,"users",user.uid)
);

studentData =
userSnap.data();


setTimeout(() => {
  // LOGO SEKOLAH
  const logo = document.getElementById("headerSchoolLogo");
  if (logo) {
    logo.src =
      "https://zahwan93.github.io/Kebun-Ilmu-Matematika-SMP/logo.png";
  }

  // NAMA SEKOLAH (kalau mau sekalian)
  const schoolName = document.getElementById("headerSchoolName");
  if (schoolName) {
    schoolName.innerText = "Kebun Ilmu Matematika";
  }

  // AVATAR USER (opsional override)
  const avatar = document.getElementById("headerAvatarHeader");
  if (avatar && studentData?.avatarURL) {
    avatar.src = studentData.avatarURL;
  }
}, 200);

setMinimumBookingDate();

await loadSubjects();

await loadMyBookings();

});

// MIN DATE
function setMinimumBookingDate(){

const tomorrow =
new Date();

tomorrow.setDate(
tomorrow.getDate() + 1
);

document.getElementById(
"bookingDate"
).min =
tomorrow.toISOString().split("T")[0];

}

// LOAD SUBJECT
async function loadSubjects(){

const subjectSelect =
document.getElementById(
"subjectSelect"
);

subjectSelect.innerHTML =
`<option value="">Pilih Subject</option>`;

const q = query(
collection(db,"teachers"),
where(
"levels",
"array-contains",
studentData.level
)
);

const snap =
await getDocs(q);

const subjects = [];

allTeachers = [];

snap.forEach(docSnap=>{

const teacher =
docSnap.data();

teacher.id =
docSnap.id;

if(
!(teacher.curriculums || [])
.includes(studentData.curriculum)
){
return;
}

allTeachers.push(teacher);

(teacher.subjects || [])
.forEach(subject=>{

if(!subjects.includes(subject)){

subjects.push(subject);

}

});

});

subjects.forEach(subject=>{

subjectSelect.innerHTML += `
<option value="${subject}">
${subject}
</option>
`;

});

}

// EVENT
document
.getElementById("bookingDate")
.addEventListener(
"change",
handleFilter
);

document
.getElementById("subjectSelect")
.addEventListener(
"change",
handleFilter
);

// HANDLE FILTER
async function handleFilter(){

const subject =
document.getElementById(
"subjectSelect"
).value;

const bookingDate =
document.getElementById(
"bookingDate"
).value;

if(!subject || !bookingDate) return;

const date =
new Date(bookingDate);

const dayName =
dayMap[date.getDay()];

document.getElementById(
"selectedDay"
).value =
dayName;

await loadSessions(dayName);

}

// LOAD SESSION
async function loadSessions(day){

const sessionSelect =
document.getElementById(
"sessionSelect"
);

sessionSelect.innerHTML =
`<option value="">Pilih Sesi</option>`;

const subject =
document.getElementById(
"subjectSelect"
).value;

const teachers =
allTeachers.filter(t=>

(t.subjects || [])
.includes(subject)

);

const allSessionMap = {};

for(const teacher of teachers){

const scheduleSnap = await getDoc(
  doc(db, "teacher_schedules", teacher.id)
);

if(!scheduleSnap.exists())
continue;

const schedule =
scheduleSnap.data();

const sessions =
schedule.availability?.[day] || [];

sessions.forEach(session=>{

allSessionMap[
session.sesi
] = session;

});

}

Object.values(allSessionMap)
.sort((a,b)=>a.sesi - b.sesi)
.forEach(session=>{

sessionSelect.innerHTML += `

<option value="${session.sesi}">
Sesi ${session.sesi}
(${session.start} - ${session.end})
</option>

`;

});

}

// SESSION CHANGE
document
.getElementById("sessionSelect")
.addEventListener(
"change",
loadAvailableTeachers
);

// LOAD AVAILABLE TEACHERS
async function loadAvailableTeachers(){

const subject =
document.getElementById(
"subjectSelect"
).value;

const bookingDate =
document.getElementById(
"bookingDate"
).value;

const day =
document.getElementById(
"selectedDay"
).value;

const session =
Number(
document.getElementById(
"sessionSelect"
).value
);

const teacherSelect =
document.getElementById(
"teacherSelect"
);

teacherSelect.innerHTML =
`<option value="">Pilih Teacher</option>`;

availableTeachers = [];

const bookingSnap =
await getDocs(
collection(db,"student_bookings")
);

const bookings = [];

bookingSnap.forEach(docSnap=>{

bookings.push(
docSnap.data()
);

});

const teachers =
allTeachers.filter(t=>

(t.subjects || [])
.includes(subject)

);

for(const teacher of teachers){

const scheduleSnap =
await getDoc(
doc(
db,
"teacher_schedules",
teacher.teacherId
)
);

if(!scheduleSnap.exists())
continue;

const schedule =
scheduleSnap.data();

const sessions =
schedule.availability?.[day] || [];

const hasSession =
sessions.find(
s=>s.sesi === session
);

if(!hasSession)
continue;

const alreadyBooked = bookings.find(item =>
  item.teacherId === teacher.id &&
  item.bookingDate === bookingDate &&
  item.session === session &&
  item.status !== "rejected"
);

if(alreadyBooked)
continue;

availableTeachers.push({
...teacher,
sessionData:hasSession
});

teacherSelect.innerHTML += `

<option value="${teacher.id}">
${teacher.name}
</option>

`;

}

}

// TEACHER CHANGE
document
.getElementById("teacherSelect")
.addEventListener(
"change",
()=>{

const teacherId =
document.getElementById(
"teacherSelect"
).value;

const teacher =
availableTeachers.find(
t => t.id === teacherId
);

const info =
document.getElementById(
"teacherInfo"
);

if(!teacher){

info.innerHTML = "";

return;

}

info.innerHTML = `

<div class="teacher-info">

<div class="teacher-name">
${teacher.name}
</div>

<div class="teacher-detail">
📘 ${(teacher.subjects || []).join(", ")}
</div>

<div class="teacher-detail">
🎓 ${(teacher.levels || []).join(", ")}
</div>

</div>

`;

});

// BOOK
window.bookTeacher =
async()=>{

try{

const user =
auth.currentUser;

const subject =
document.getElementById(
"subjectSelect"
).value;

const teacherId =
document.getElementById(
"teacherSelect"
).value;

const bookingDate =
document.getElementById(
"bookingDate"
).value;

const day =
document.getElementById(
"selectedDay"
).value;

const session =
Number(
document.getElementById(
"sessionSelect"
).value
);

if(
!subject ||
!teacherId ||
!bookingDate ||
!day ||
!session
){

alert(
"Lengkapi semua data"
);

return;

}

const teacher =
availableTeachers.find(
t=>t.teacherId === teacherId
);

await addDoc(
collection(
db,
"student_bookings"
),
{

studentId:user.uid,

studentName:
studentData.name || "",

teacherId,

teacherName:
teacher.name,

subject,

bookingDate,

day,

session,

startTime:
teacher.sessionData.start,

endTime:
teacher.sessionData.end,

status:"pending",

createdAt:
serverTimestamp()

}
);

alert(
"Booking berhasil dibuat"
);

await loadMyBookings();

}
catch(err){

console.error(err);

alert(
"Gagal booking"
);

}

};

// LOAD MY BOOKINGS
async function loadMyBookings(){

const user =
auth.currentUser;

const table =
document.getElementById(
"myBookingTable"
);

const container =
document.getElementById(
"myBookingList"
);

const q = query(
collection(db,"student_bookings"),
where(
"studentId",
"==",
user.uid
)
);

const snap =
await getDocs(q);

table.innerHTML = "";
container.innerHTML = "";

if(snap.empty){

table.innerHTML = `
<tr>
<td colspan="5">
Belum ada booking
</td>
</tr>
`;

container.innerHTML = `
<div class="empty-state">
Belum ada jadwal kelas
</div>
`;

return;

}

const bookings = [];

snap.forEach(docSnap=>{

bookings.push(
docSnap.data()
);

});

bookings.sort((a,b)=>

(a.bookingDate || "")
.localeCompare(
b.bookingDate || ""
)

);

bookings.forEach(data=>{

const tr =
document.createElement("tr");

tr.innerHTML = `

<td>${data.teacherName}</td>

<td>${data.subject}</td>

<td>${data.bookingDate}</td>

<td>
Sesi ${data.session}
<br>
${data.startTime}
-
${data.endTime}
</td>

<td>

<span class="badge ${
data.status === "approved"
? "badge-approved"
:
data.status === "rejected"
? "badge-rejected"
:
"badge-pending"
}">

${data.status}

</span>

</td>

`;

table.appendChild(tr);

});

let html =
`<div class="booking-history-list">`;

bookings.forEach(data=>{

if(data.status !== "approved") return;

// FILTER TANGGAL YANG SUDAH LEWAT
const today = new Date();
today.setHours(0,0,0,0);

const bookingDate = new Date(data.bookingDate);

if(bookingDate < today) return;

html += `

<div class="booking-history-item">

<div class="booking-history-top">

<div>

<div class="booking-history-name">
${data.teacherName}
</div>

<div class="booking-history-subject">
📘 ${data.subject}
</div>

</div>

<span class="badge badge-approved">
Approved
</span>

</div>

<div class="booking-history-detail">

<div class="booking-detail-box">
📅 ${data.bookingDate}
</div>

<div class="booking-detail-box">
🗓️ ${data.day}
</div>

<div class="booking-detail-box">
⏰ Sesi ${data.session}
</div>

<div class="booking-detail-box">
🕒 ${convertTimeByOffset(data.startTime, 1)} -
${convertTimeByOffset(data.endTime, 1)}
</div>

</div>

</div>

`;

});

html += `</div>`;

container.innerHTML = html;

}
function convertTimeByOffset(time, offsetHour) {
  const [h, m] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(h + offsetHour, m, 0);

  return date.toTimeString().slice(0,5);
}

