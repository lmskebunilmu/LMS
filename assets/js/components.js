import { auth } from "../../firebase/firebase-config.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ==========================
// LOAD HTML COMPONENT
// ==========================
async function loadComponent(id, file) {
  try {
    const res = await fetch(file);
    const html = await res.text();
    document.getElementById(id).innerHTML = html;
  } catch(err) {
    console.error("Gagal load:", file, err);
  }
}

// ==========================
// LOAD LAYOUT
// ==========================
export async function loadLayout(role = "superadmin") {
  window.role = role; // Set global role

  // Load header
  await loadComponent("header-container", "../components/header.html");

  // Load sidebar sesuai role
  const sidebarFile = `../components/sidebar-${role}.html`;
  await loadComponent("sidebar-container", sidebarFile);

  // Set active menu setelah sidebar muncul
  setTimeout(() => setActiveMenu(), 200);
}

// ==========================
// SIDEBAR TOGGLE / CLOSE
// ==========================
function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("overlay");
  sidebar?.classList.toggle("active");
  overlay?.classList.toggle("active");
}

function closeSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("overlay");
  sidebar?.classList.remove("active");
  overlay?.classList.remove("active");
}

// ==========================
// AUTO CLOSE CLICK OUTSIDE
// ==========================
document.addEventListener("click", e => {
  const sidebar = document.getElementById("sidebar");
  const hamburger = document.querySelector(".hamburger");
  if (sidebar?.classList.contains("active")) {
    if (!sidebar.contains(e.target) && hamburger && !hamburger.contains(e.target)) {
      closeSidebar();
    }
  }
});

// ==========================
// NAVIGATION (role-aware)
// ==========================
function navigate(url) {
  closeSidebar();
  setTimeout(() => {
    window.location = "/LMS" + url;
  }, 200);
}

function goDashboard() {

  if (window.role === "admin") {

    navigate("../../dashboard/admin.html");

  }

  else if (window.role === "guru") {

    navigate("../../dashboard/guru.html");

  }

  else if (window.role === "siswa") {

    navigate("../../dashboard/siswa.html");

  }

  // 🔥 TAMBAH INI
  else if (window.role === "student") {
  navigate("/dashboard/student.html");
}
  else {

    navigate("../../dashboard/superadmin.html");

  }

}

function goSchools() {
  if (window.role === "admin") navigate("../../modules/students/students.html");
  else navigate("../modules/schools/schools.html");
}

function goTeachers() {
  if (window.role === "admin") navigate("../modules/teachers/teachers.html");
}

function goClasses() {
  if (window.role === "admin") navigate("../../modules/classes/classes.html");
}

function goAdmins() {
  if (window.role === "superadmin") navigate("../../modules/admins/admins.html");
}

function goBookingManagement() {

  if (window.role === "superadmin") {

    navigate("../../modules/booking-management/booking-management.html");

  }

}
function goMaterials() {
  if (window.role === "superadmin") navigate("../../modules/materials/materials.html");
}

function goBookingStudent() {

  if (
    window.role === "siswa" ||
    window.role === "student"
  ) {

    navigate("/modules/booking-student/booking-student.html");

  }

}

function goExercises() {
  if (window.role === "superadmin") navigate("../../modules/exercises/exercises.html");
}

function goAssessments() {
  if (window.role === "superadmin") navigate("../../modules/assessments/assessments.html");
}

function goCurriculum() {
  if (window.role === "superadmin") navigate("../../modules/curriculum/curriculum.html");
}

function goMaterialsAdmin() {
  if (window.role === "admin") {
    navigate("../../modules/materials-admin/materials-admin.html");
  }
}
function goMaterialsTeacher() {
  if (window.role === "guru") {
    navigate("../../modules/materials-guru/materials-guru.html");
  }
}

function goTeachersSuperAdmin() {
  if (window.role === "superadmin") {
    navigate("../../modules/teachers-superadmin/teachers.html");
  }
}
// ==========================
// NAVIGATION SISWA
// ==========================

function goDashboardSiswa() {
  navigate("../../dashboard/siswa.html");
}

function goMaterialsSiswa() {
  navigate("../../modules/materials-siswa/materials-siswa.html");
}

function goAssignmentsSiswa() {
  navigate("../../modules/assignments/assignments-siswa.html");
}

function goAttendance() {

  // ==========================
  // SUPERADMIN
  // ==========================
  if (window.role === "superadmin") {

    navigate("../../modules/attendance-system/attendance-system.html");

  }

  // ==========================
  // GURU
  // ==========================
  else if (window.role === "guru") {

    navigate("../../modules/attendance/attendance.html");

  }

  // ==========================
  // ADMIN
  // ==========================
  else if (window.role === "admin") {

    navigate("../../modules/attendance-admin/attendance-admin.html");

  }

  // ==========================
  // SISWA
  // ==========================
  else if (window.role === "siswa") {

    navigate("../../modules/attendance-siswa/attendance-siswa.html");

  }

}
function goClassSuperAdmin() {

  if (window.role === "superadmin") {

    navigate("../../modules/classes-admin/classesadmin.html");

  }

}
// ==========================
// LOGOUT
// ==========================
function logout() {
  closeSidebar();

  setTimeout(() => {

    signOut(auth)
      .then(() => {

        window.location = "../login.html";

      })
      .catch(err => alert(err.message));

  }, 200);
}

// ==========================
// AUTH CHECK
// ==========================
onAuthStateChanged(auth, user => {
  if (!user) window.location = "../../login.html";
});

// ==========================
// ACTIVE MENU
// ==========================
function setActiveMenu() {
  const buttons = document.querySelectorAll(".sidebar button");
  const currentPath = window.location.pathname;

  buttons.forEach(btn => {
    const onclickAttr = btn.getAttribute("onclick");
    if (!onclickAttr) return;

    if (onclickAttr.includes("goSchools") && currentPath.includes("students")) btn.classList.add("active");
    if (onclickAttr.includes("goTeachers") && currentPath.includes("teachers")) btn.classList.add("active");
    if (onclickAttr.includes("goClasses") && currentPath.includes("classes")) btn.classList.add("active");
    if (onclickAttr.includes("goAdmins") && currentPath.includes("admins")) btn.classList.add("active");
    if (onclickAttr.includes("goDashboard") && currentPath.includes("dashboard")) btn.classList.add("active");
    if (onclickAttr.includes("goDashboardSiswa") && currentPath.includes("siswa")) {
  btn.classList.add("active");
}

if (
  onclickAttr.includes("goBookingStudent") &&
  currentPath.includes("booking-student")
) {

  btn.classList.add("active");

}

if (onclickAttr.includes("goAssignmentsSiswa") && currentPath.includes("assignments")) {
  btn.classList.add("active");
}

if (
  onclickAttr.includes("goTeachersSuperAdmin") &&
  currentPath.includes("teachers")
) {
  btn.classList.add("active");
}

if (
  onclickAttr.includes("goBookingManagement") &&
  currentPath.includes("booking-management")
) {
  btn.classList.add("active");
}

if (onclickAttr.includes("goMaterialsSiswa") && currentPath.includes("materials")) {
  btn.classList.add("active");
}
if (onclickAttr.includes("goClassSuperAdmin") && currentPath.includes("classes")) {
  btn.classList.add("active");
}
  });
}
// ==========================
// GLOBAL TOAST
// ==========================

window.showToast = function(
message,
type = "success"
) {

const toast =
document.getElementById("toast");

if (!toast) return;

toast.innerText = message;

toast.className =
type === "error"
? "toast error active"
: "toast active";

setTimeout(() => {

toast.classList.remove("active");

}, 3000);

};
// ==========================
// EXPORT GLOBAL
// ==========================
window.toggleSidebar = toggleSidebar;
window.closeSidebar = closeSidebar;
window.goDashboard = goDashboard;
window.goSchools = goSchools;
window.goTeachers = goTeachers;
window.goClasses = goClasses;
window.goAdmins = goAdmins;
window.logout = logout;
window.goMaterials = goMaterials;
window.goExercises = goExercises;
window.goAssessments = goAssessments;
window.goCurriculum = goCurriculum;
window.goMaterialsAdmin = goMaterialsAdmin;
window.goMaterialsTeacher = goMaterialsTeacher;
window.goDashboardSiswa = goDashboardSiswa;
window.goMaterialsSiswa = goMaterialsSiswa;
window.goAssignmentsSiswa = goAssignmentsSiswa;
window.goAttendance = goAttendance;
window.goClassSuperAdmin = goClassSuperAdmin;
window.goTeachersSuperAdmin = goTeachersSuperAdmin;
window.goBookingManagement = goBookingManagement;
window.goBookingStudent = goBookingStudent;
