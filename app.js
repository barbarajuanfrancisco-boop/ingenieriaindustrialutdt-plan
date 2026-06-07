(function () {
  const STORAGE_KEY = "mi-carrera-industrial-v1";
  const THEME_KEY = "mi-carrera-theme-v1";
  const DEFAULT_PASSING_GRADE = 4;
  const componentDefaults = [
    { type: "Parcial", name: "Primer parcial", weight: "40", score: "" },
    { type: "Trabajo practico", name: "Trabajos practicos", weight: "30", score: "" },
    { type: "Examen final", name: "Examen final", weight: "30", score: "" },
  ];

  const $ = (selector) => document.querySelector(selector);
  const courses = window.CURRICULUM;
  const courseById = new Map(courses.map((course) => [course.id, course]));
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

  function preferredTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
    return systemDark.matches ? "dark" : "light";
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    $("#themeIcon").textContent = theme === "dark" ? "☀" : "☾";
    $("#themeButton").setAttribute("aria-label", theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro");
    $("#themeColorMeta").setAttribute("content", theme === "dark" ? "#0c1110" : "#0f766e");
  }

  function createCourseEntry(saved = {}) {
    return {
      status: saved.status || "pending",
      grade: saved.grade || "",
      passingGrade: saved.passingGrade || String(DEFAULT_PASSING_GRADE),
      components: Array.isArray(saved.components) ? saved.components : [],
    };
  }

  function createInitialState(saved = {}) {
    return Object.fromEntries(courses.map((course) => [course.id, createCourseEntry(saved[course.id])]));
  }

  function loadState() {
    try {
      return createInitialState(JSON.parse(localStorage.getItem(STORAGE_KEY)) || {});
    } catch {
      return createInitialState();
    }
  }

  function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function isApproved(state, courseId) {
    return state[courseId]?.status === "approved";
  }

  function getMissingPrerequisites(course, state) {
    return course.prerequisites.filter((id) => !isApproved(state, id));
  }

  function isCourseAvailable(course, state) {
    return state[course.id]?.status !== "approved" && getMissingPrerequisites(course, state).length === 0;
  }

  function validGrade(value) {
    const grade = Number(value);
    return grade >= 1 && grade <= 10;
  }

  function getComponentTotal(components) {
    return components.reduce((total, component) => total + (Number(component.weight) || 0), 0);
  }

  function calculateWeightedGrade(components) {
    if (!components.length || Math.round(getComponentTotal(components) * 100) / 100 !== 100) return null;
    const hasEveryScore = components.every((component) => validGrade(component.score));
    if (!hasEveryScore) return null;
    const total = components.reduce((sum, component) => {
      return sum + Number(component.score) * ((Number(component.weight) || 0) / 100);
    }, 0);
    return Math.round(total * 100) / 100;
  }

  function getFinalGrade(entry) {
    const computed = calculateWeightedGrade(entry.components || []);
    if (computed !== null) return computed;
    return validGrade(entry.grade) ? Number(entry.grade) : null;
  }

  function syncComputedGrade(entry) {
    const computed = calculateWeightedGrade(entry.components || []);
    if (computed === null) return entry;
    return { ...entry, grade: computed.toFixed(2) };
  }

  function calculateSummary(state) {
    const approvedWithGrade = courses
      .map((course) => state[course.id])
      .filter((entry) => entry?.status === "approved" && getFinalGrade(entry) !== null);
    const approvedCount = courses.filter((course) => state[course.id]?.status === "approved").length;
    const sum = approvedWithGrade.reduce((total, entry) => total + getFinalGrade(entry), 0);
    const average = approvedWithGrade.length ? sum / approvedWithGrade.length : null;

    return {
      average,
      gradedCount: approvedWithGrade.length,
      approvedCount,
      pendingCount: courses.length - approvedCount,
      progress: courses.length ? Math.round((approvedCount / courses.length) * 100) : 0,
    };
  }

  function semesterLabel(year, semester) {
    return `${year}.o año - ${semester}.er semestre`.replace("2.er", "2.o");
  }

  function courseNames(ids) {
    return ids.map((id) => courseById.get(id)?.name || id).join(", ");
  }

  function selectedCourseId() {
    return $("#settingsCourse").value || courses[0].id;
  }

  let state = loadState();

  function renderDashboard() {
    const summary = calculateSummary(state);
    $("#averageValue").textContent = summary.average === null ? "--" : summary.average.toFixed(2);
    $("#averageDetail").textContent = summary.gradedCount
      ? `${summary.gradedCount} materia${summary.gradedCount === 1 ? "" : "s"} con nota`
      : "Sin materias aprobadas";
    $("#progressValue").textContent = `${summary.progress}%`;
    $("#progressDetail").textContent = `${summary.approvedCount} de ${courses.length} aprobadas`;
    $("#pendingValue").textContent = String(summary.pendingCount);

    const available = courses.filter((course) => isCourseAvailable(course, state));
    const list = $("#availableList");
    list.innerHTML = "";
    if (!available.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "No hay materias nuevas habilitadas por ahora.";
      list.append(empty);
      return;
    }
    available.slice(0, 12).forEach((course) => {
      const chip = document.createElement("span");
      chip.className = "available-chip";
      chip.textContent = course.name;
      list.append(chip);
    });
  }

  function renderCurriculum() {
    const root = $("#curriculum");
    const template = $("#courseTemplate");
    root.innerHTML = "";

    for (let year = 1; year <= 5; year += 1) {
      for (let semester = 1; semester <= 2; semester += 1) {
        const semesterCourses = courses.filter((course) => course.year === year && course.semester === semester);
        const section = document.createElement("section");
        section.className = "semester";
        section.innerHTML = `
          <div class="semester-header">
            <h3>${year}.o año</h3>
            <p>${semester === 1 ? "1.er" : "2.o"} semestre</p>
          </div>
          <div class="course-list"></div>
        `;

        const list = section.querySelector(".course-list");
        semesterCourses.forEach((course) => {
          const node = template.content.firstElementChild.cloneNode(true);
          const entry = state[course.id] || createCourseEntry();
          const computed = calculateWeightedGrade(entry.components || []);
          const missing = getMissingPrerequisites(course, state);
          const available = missing.length === 0;

          node.dataset.courseId = course.id;
          node.dataset.status = entry.status;
          node.classList.toggle("is-locked", !available && entry.status !== "approved");
          node.querySelector(".course-meta").textContent = semesterLabel(course.year, course.semester);
          node.querySelector("h3").textContent = course.name;

          const pill = node.querySelector(".lock-pill");
          pill.className = `lock-pill ${available ? "open" : "closed"}`;
          pill.textContent = available || entry.status === "approved" ? "Habilitada" : "Bloqueada";

          const select = node.querySelector(".status-select");
          select.value = entry.status;
          select.addEventListener("change", (event) => {
            const nextStatus = event.target.value;
            state[course.id] = syncComputedGrade({
              ...state[course.id],
              status: nextStatus,
              grade: nextStatus === "approved" ? state[course.id]?.grade || "" : "",
            });
            saveState(state);
            render();
          });

          const grade = node.querySelector(".grade-input");
          grade.value = computed === null ? entry.grade || "" : computed.toFixed(2);
          grade.disabled = entry.status !== "approved" || computed !== null;
          grade.addEventListener("input", (event) => {
            state[course.id] = { ...state[course.id], grade: event.target.value };
            saveState(state);
            renderDashboard();
          });

          const missingText = node.querySelector(".missing-text");
          if (missing.length && entry.status !== "approved") {
            missingText.textContent = `Faltan correlativas: ${courseNames(missing)}.`;
          }
          if (computed !== null) {
            const note = document.createElement("p");
            note.className = "evaluation-note";
            note.textContent = `Nota calculada por evaluaciones. Se aprueba con ${entry.passingGrade || DEFAULT_PASSING_GRADE}.`;
            node.append(note);
          }

          list.append(node);
        });

        root.append(section);
      }
    }
  }

  function renderCourseOptions() {
    const select = $("#settingsCourse");
    if (select.options.length) return;
    courses.forEach((course) => {
      const option = document.createElement("option");
      option.value = course.id;
      option.textContent = `${course.name} (${course.year}.o año, ${course.semester === 1 ? "1.er" : "2.o"} semestre)`;
      select.append(option);
    });
  }

  function renderSettings() {
    renderCourseOptions();
    const courseId = selectedCourseId();
    renderSettingsMeta(courseId);

    const list = $("#componentList");
    const template = $("#componentTemplate");
    list.innerHTML = "";
    (state[courseId]?.components || []).forEach((component, index) => {
      const row = template.content.firstElementChild.cloneNode(true);
      row.querySelector(".component-type").value = component.type || "Parcial";
      row.querySelector(".component-name").value = component.name || "";
      row.querySelector(".component-weight").value = component.weight || "";
      row.querySelector(".component-score").value = component.score || "";

      row.querySelectorAll("input, select").forEach((control) => {
        control.addEventListener("input", () => updateComponentFromRow(courseId, index, row));
        control.addEventListener("change", () => updateComponentFromRow(courseId, index, row));
      });
      row.querySelector(".remove-component").addEventListener("click", () => {
        const next = [...(state[courseId].components || [])];
        next.splice(index, 1);
        state[courseId] = syncComputedGrade({ ...state[courseId], components: next });
        saveState(state);
        render();
      });
      list.append(row);
    });
  }

  function renderSettingsMeta(courseId) {
    const course = courseById.get(courseId);
    const entry = state[courseId] || createCourseEntry();
    const components = entry.components || [];
    const computed = calculateWeightedGrade(components);
    const totalWeight = getComponentTotal(components);
    const passingGrade = entry.passingGrade || String(DEFAULT_PASSING_GRADE);
    const approvalText =
      computed === null ? "Nota final pendiente" : computed >= Number(passingGrade) ? "Aprueba con la nota calculada" : "No alcanza la nota minima";

    $("#passingGradeInput").value = passingGrade;
    $("#computedGradeInput").value = computed === null ? "Sin calcular" : computed.toFixed(2);
    $("#settingsSummary").innerHTML = `
      <strong>${course.name}</strong><br>
      ${semesterLabel(course.year, course.semester)}<br>
      ${components.length} instancia${components.length === 1 ? "" : "s"} cargada${components.length === 1 ? "" : "s"}.<br>
      ${approvalText}.
    `;

    const message = $("#weightMessage");
    message.className = "weight-message";
    if (!components.length) {
      message.textContent = "Todavia no hay instancias: podés agregar parciales, trabajos practicos, final u otra evaluacion.";
    } else if (Math.round(totalWeight * 100) / 100 === 100) {
      message.textContent = computed === null ? "Los pesos suman 100%. Carga todas las notas para calcular la final." : "Los pesos suman 100% y la nota final ya esta calculada.";
      message.classList.add("is-ok");
    } else {
      message.textContent = `Los pesos suman ${totalWeight || 0}%. Para calcular la nota final tienen que sumar 100%.`;
      message.classList.add("is-warning");
    }
  }

  function updateComponentFromRow(courseId, index, row) {
    const next = [...(state[courseId].components || [])];
    next[index] = {
      type: row.querySelector(".component-type").value,
      name: row.querySelector(".component-name").value,
      weight: row.querySelector(".component-weight").value,
      score: row.querySelector(".component-score").value,
    };
    state[courseId] = syncComputedGrade({ ...state[courseId], components: next });
    saveState(state);
    renderDashboard();
    renderCurriculum();
    renderSettingsMeta(courseId);
  }

  function render() {
    renderDashboard();
    renderCurriculum();
    renderSettings();
  }

  function switchView(view) {
    $("#mainView").hidden = view !== "main";
    $("#settingsView").hidden = view !== "settings";
    document.querySelectorAll(".tab-button").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.view === view);
    });
  }

  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  $("#themeButton").addEventListener("click", () => {
    const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, nextTheme);
    applyTheme(nextTheme);
  });

  systemDark.addEventListener("change", () => {
    if (!localStorage.getItem(THEME_KEY)) applyTheme(preferredTheme());
  });

  $("#settingsCourse").addEventListener("change", renderSettings);

  $("#passingGradeInput").addEventListener("input", (event) => {
    const courseId = selectedCourseId();
    const value = event.target.value;
    state[courseId] = { ...state[courseId], passingGrade: value };
    saveState(state);
    renderCurriculum();
    renderSettingsMeta(courseId);
  });

  $("#addComponentButton").addEventListener("click", () => {
    const courseId = selectedCourseId();
    const current = state[courseId].components || [];
    const nextComponent = componentDefaults[current.length] || {
      type: "Otra instancia",
      name: `Instancia ${current.length + 1}`,
      weight: "",
      score: "",
    };
    state[courseId] = syncComputedGrade({ ...state[courseId], components: [...current, { ...nextComponent }] });
    saveState(state);
    render();
  });

  $("#resetButton").addEventListener("click", () => {
    const confirmed = window.confirm("Esto borra tus estados, notas y configuraciones guardadas en este dispositivo.");
    if (!confirmed) return;
    state = createInitialState();
    saveState(state);
    render();
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  window.AppModel = {
    calculateSummary,
    calculateWeightedGrade,
    createInitialState,
    getMissingPrerequisites,
    isCourseAvailable,
    courses,
  };

  applyTheme(preferredTheme());
  render();
})();
