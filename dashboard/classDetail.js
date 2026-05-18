

import { auth, db } from "../firebase/firebase-config.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { loadLayout } from "../assets/js/components.js";

function waitForElement(id) {
  return new Promise(resolve => {
    const interval = setInterval(() => {
      const el = document.getElementById(id);
      if (el) {
        clearInterval(interval);
        resolve(el);
      }
    }, 50);
  });
}
/* =========================
   GET CLASS ID
========================= */

const classId = new URLSearchParams(window.location.search).get("id");

/* =========================
   AUTH
========================= */

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location = "../login.html";
    return;
  }

  try {
    await loadLayout("student");

// tunggu header benar-benar ready
await Promise.all([
  waitForElement("headerAvatarHeader"),
  waitForElement("headerNameHeader"),
  waitForElement("headerSchoolLogo"),
  waitForElement("headerSchoolName")
]);

// ⬇️ WAJIB pakai await
    
await loadClassDetail(classId);
await loadMaterials(classId);
    
  } catch (err) {
    console.error(err);
    alert("Terjadi kesalahan");
  }
});

/* =========================
   LOAD CLASS DETAIL
========================= */

async function loadClassDetail(classId) {

  if (!classId) return alert("Class ID tidak ditemukan");

  const classSnap = await getDoc(doc(db, "classes", classId));

  if (!classSnap.exists()) return alert("Kelas tidak ditemukan");

  const data = classSnap.data();

  document.getElementById("classThumbnail").src =
    data.thumbnail ||
    "https://images.unsplash.com/photo-1523240795612-9a054b0db644?q=80&w=1200";

  const badge = document.getElementById("classBadge");

  badge.innerText = data.isPaid ? "PREMIUM" : "FREE";
  badge.className = `badge ${data.isPaid ? "badge-premium" : "badge-free"}`;

  document.getElementById("className").innerText = data.className || "-";
  document.getElementById("classDescription").innerText = data.description || "-";
  document.getElementById("classSubject").innerText = data.subject || "-";
  document.getElementById("classTeacher").innerText = data.teacherName || "-";
  document.getElementById("classLevel").innerText = data.level || "-";
  document.getElementById("classCurriculum").innerText = data.curriculum || "-";
}

/* =========================
   LOAD MATERIAL + EXERCISE
========================= */

async function loadMaterials(classId) {

  const container = document.getElementById("materialContainer");
  container.innerHTML = "Loading...";

  try {

    /* =====================
       1. GET MATERIALS
    ===================== */
    const materialSnap = await getDocs(
      query(collection(db, "class_materials"), where("classId", "==", classId))
    );

    if (materialSnap.empty) {
      container.innerHTML = "<p>Belum ada materi</p>";
      return;
    }

    const materials = [];

    for (const rel of materialSnap.docs) {
      const mDoc = await getDoc(doc(db, "materials", rel.data().materialId));
      if (!mDoc.exists()) continue;

      materials.push({
        id: mDoc.id,
        ...mDoc.data()
      });
    }

    /* =====================
       2. BUILD EXERCISE MAP (FIX UTAMA)
    ===================== */

    const exerciseSnap = await getDocs(collection(db, "exercises"));

    const exerciseMap = {};

    exerciseSnap.docs.forEach((docSnap) => {
      const ex = docSnap.data();

      const key = String(ex.materialId || "").trim();
      if (!key) return;

      if (!exerciseMap[key]) {
        exerciseMap[key] = [];
      }

      exerciseMap[key].push({
        id: docSnap.id,
        ...ex
      });
    });

    console.log("EXERCISE MAP:", exerciseMap);

    /* =====================
       3. GROUP MATERIAL
    ===================== */

    const grouped = {};

    materials.forEach((m) => {

      const chapter = m.chapter || "Tanpa Bab";
      const sub = m.subChapter || "Tanpa Sub Bab";

      if (!grouped[chapter]) grouped[chapter] = {};
      if (!grouped[chapter][sub]) grouped[chapter][sub] = [];

      grouped[chapter][sub].push(m);

    });

    /* =====================
       4. RENDER UI
    ===================== */

    container.innerHTML = "";

    Object.keys(grouped)
  .sort((a, b) => a.localeCompare(b))
  .forEach(chapter => {

      const chapterDiv = document.createElement("div");
      chapterDiv.className = "card";

      let html = `<h2>📘 ${chapter}</h2>`;

      Object.keys(grouped[chapter])
  .sort((a, b) => a.localeCompare(b))
  .forEach(sub => {

        html += `<h3>📖 ${sub}</h3>`;

        grouped[chapter][sub]
  .sort((a, b) => a.title.localeCompare(b.title))
  .forEach(m => {

          const exercises = exerciseMap[String(m.id).trim()] || [];

          let exHTML = "";

          exercises
  .sort((a, b) => a.title.localeCompare(b.title))
  .forEach((ex, i) => {
           exHTML += `
  <div class="exercise-item"
       style="cursor:pointer"
       onclick="event.stopPropagation(); openExercise('${ex.id}')">

    📝 ${i + 1}. ${ex.title}
  </div>
`;
          });

         html += `
  <div class="material-item"
       style="cursor:pointer"
       onclick="openMaterial('${m.id}')">

    <div>
      <b>📚 ${m.title}</b>
      <p>${m.description || ""}</p>

      ${exHTML}
    </div>
  </div>
`;

        });

      });

      chapterDiv.innerHTML = html;
      container.appendChild(chapterDiv);

    });

  } catch (err) {
    console.error(err);
    container.innerHTML = "Gagal load materi";
  }
}

window.openExercise = function (id) {
  window.location.href =
    `/LMS/dashboard/exercise.html?id=${encodeURIComponent(id)}`;
};

window.openMaterial = function (id) {
  window.location.href =
    `/LMS/dashboard/material.html?id=${encodeURIComponent(id)}`;
};
