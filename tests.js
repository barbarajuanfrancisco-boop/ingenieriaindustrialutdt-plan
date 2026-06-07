const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync("data.js", "utf8"), context);

const courses = context.window.CURRICULUM;
const byId = new Map(courses.map((course) => [course.id, course]));
function entry(status = "pending", grade = "", components = [], passingGrade = "4") {
  return { status, grade, components, passingGrade };
}

const initialState = Object.fromEntries(courses.map((course) => [course.id, entry()]));

function missing(courseId, state) {
  return byId.get(courseId).prerequisites.filter((id) => state[id]?.status !== "approved");
}

function available(courseId, state) {
  return state[courseId]?.status !== "approved" && missing(courseId, state).length === 0;
}

function summary(state) {
  const approvedWithGrade = courses
    .map((course) => state[course.id])
    .filter((courseEntry) => courseEntry.status === "approved" && Number(courseEntry.grade) >= 1 && Number(courseEntry.grade) <= 10);
  const approvedCount = courses.filter((course) => state[course.id].status === "approved").length;
  return {
    approvedCount,
    average: approvedWithGrade.reduce((total, courseEntry) => total + Number(courseEntry.grade), 0) / approvedWithGrade.length,
  };
}

function weightedGrade(components) {
  const totalWeight = components.reduce((total, component) => total + Number(component.weight), 0);
  if (totalWeight !== 100) return null;
  return components.reduce((total, component) => total + Number(component.score) * (Number(component.weight) / 100), 0);
}

assert.equal(courses.length, 42);
assert.equal(available("mat-i", initialState), true);
assert.equal(available("mat-ii", initialState), false);

const state = structuredClone(initialState);
state["mat-i"] = entry("approved", "8");
state["intro-prog"] = entry("approved", "10");
state["humanidades"] = entry("approved", "");

assert.equal(available("mat-ii", state), true);
assert.deepEqual(Array.from(missing("fisica-i", state)), ["mat-ii", "algebra"]);
assert.equal(summary(state).approvedCount, 3);
assert.equal(summary(state).average, 9);
assert.equal(
  weightedGrade([
    { weight: "40", score: "8" },
    { weight: "30", score: "10" },
    { weight: "30", score: "7" },
  ]),
  8.3,
);

console.log("Tests passed");
