#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const statusValues = new Set(["IN_PROGRESS", "PASS", "FAIL", "ATTENTION", "HUMAN_GATED", "BLOCKED"]);
const waveStatusValues = new Set(["PENDING", "IN_PROGRESS", "COMPLETE", "FAILED", "TIMED_OUT", "BLOCKED"]);
const evidenceStatusValues = new Set(["PASS", "FAIL", "NOT_RUN", "NOT_INSTALLED", "HUMAN_GATED", "BLOCKED", "SYNTHETIC"]);
const verificationStatusValues = new Set(["PASS", "FAIL", "NOT_RUN", "NOT_INSTALLED", "TIMED_OUT", "BLOCKED"]);
const requiredScenario = ["id", "request", "setup", "expected_outcome", "expected_deterministic_invariants"];
const requiredRun = ["schema_version", "task_id", "synthetic", "status", "timestamps", "artifact_paths", "requirement_lock", "waves", "agents", "evidence", "conflicts", "verification", "human_gates", "usage", "limitations"];

function fail(message) {
  throw new Error(message);
}

function parseJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(`${file}: ${error.message}`);
  }
}

function requireFields(value, fields, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label}: expected object`);
  for (const field of fields) if (!(field in value)) fail(`${label}: missing ${field}`);
}

function validateSchema(file, requiredProperties) {
  const schema = parseJson(file);
  if (schema.type !== "object") fail(`${file}: top-level type must be object`);
  if (!schema.properties || typeof schema.properties !== "object") fail(`${file}: missing top-level properties`);
  if (!Array.isArray(schema.required)) fail(`${file}: missing top-level required array`);
  for (const property of requiredProperties) {
    if (!(property in schema.properties) || !schema.required.includes(property)) fail(`${file}: ${property} must be a required top-level property`);
  }
}

function validateScenarios(file) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 6) fail(`${file}: expected at least six scenarios`);
  const ids = new Set();
  lines.forEach((line, index) => {
    let scenario;
    try { scenario = JSON.parse(line); } catch (error) { fail(`${file}:${index + 1}: ${error.message}`); }
    requireFields(scenario, requiredScenario, `${file}:${index + 1}`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(scenario.id)) fail(`${file}:${index + 1}: invalid id`);
    if (ids.has(scenario.id)) fail(`${file}:${index + 1}: duplicate id ${scenario.id}`);
    ids.add(scenario.id);
    if (typeof scenario.request !== "string" || !scenario.request.trim()) fail(`${file}:${index + 1}: request must be non-empty`);
    if (!scenario.setup || typeof scenario.setup !== "object" || Array.isArray(scenario.setup)) fail(`${file}:${index + 1}: setup must be an object`);
    if (typeof scenario.expected_outcome !== "string" || !scenario.expected_outcome.trim()) fail(`${file}:${index + 1}: expected_outcome must be non-empty`);
    const invariants = scenario.expected_deterministic_invariants;
    if (!Array.isArray(invariants) || invariants.length === 0 || invariants.some((item) => typeof item !== "string" || !item.trim())) fail(`${file}:${index + 1}: invariants must be non-empty strings`);
    if (new Set(invariants).size !== invariants.length) fail(`${file}:${index + 1}: invariants must be unique`);
  });
  return lines.length;
}

function validateRun(file) {
  const run = parseJson(file);
  requireFields(run, requiredRun, file);
  if (run.schema_version !== 1) fail(`${file}: schema_version must be 1`);
  if (typeof run.task_id !== "string" || !run.task_id.trim()) fail(`${file}: task_id must be non-empty`);
  if (typeof run.synthetic !== "boolean") fail(`${file}: synthetic must be boolean`);
  if (!statusValues.has(run.status)) fail(`${file}: invalid status ${run.status}`);
  for (const field of ["waves", "agents", "evidence", "conflicts", "verification", "human_gates", "limitations"]) if (!Array.isArray(run[field])) fail(`${file}: ${field} must be an array`);
  requireFields(run.timestamps, ["started_at", "ended_at"], `${file}:timestamps`);
  requireFields(run.artifact_paths, ["run", "ui"], `${file}:artifact_paths`);
  requireFields(run.requirement_lock, ["id", "version", "status", "pm_owner", "lead_confirmed"], `${file}:requirement_lock`);
  const lockStatuses = new Set(["NOT_APPLICABLE", "DRAFT", "REQUIREMENTS_LOCKED", "CHANGE_REQUESTED", "SUPERSEDED"]);
  if (!lockStatuses.has(run.requirement_lock.status)) fail(`${file}: invalid requirement_lock status`);
  run.waves.forEach((item, index) => {
    requireFields(item, ["id", "phase", "started_at", "ended_at", "status"], `${file}:waves[${index}]`);
    if (!waveStatusValues.has(item.status)) fail(`${file}:waves[${index}]: invalid status`);
  });
  run.agents.forEach((item, index) => {
    requireFields(item, ["role", "model", "effort", "skill", "attempts", "timeouts", "evidence_owner"], `${file}:agents[${index}]`);
    if (!Number.isInteger(item.attempts) || item.attempts < 0 || !Number.isInteger(item.timeouts) || item.timeouts < 0) fail(`${file}:agents[${index}]: attempts/timeouts must be non-negative integers`);
  });
  run.evidence.forEach((item, index) => {
    requireFields(item, ["id", "owner", "status", "artifact"], `${file}:evidence[${index}]`);
    if (!evidenceStatusValues.has(item.status)) fail(`${file}:evidence[${index}]: invalid status`);
  });
  run.conflicts.forEach((item, index) => requireFields(item, ["id", "evidence", "acceptance_impact", "tie_break_owner", "disposition"], `${file}:conflicts[${index}]`));
  run.verification.forEach((item, index) => {
    requireFields(item, ["command", "status", "exit_code", "artifact", "tracked_state_unchanged"], `${file}:verification[${index}]`);
    if (!verificationStatusValues.has(item.status)) fail(`${file}:verification[${index}]: invalid status`);
  });
}

const scenarioFile = path.join(directory, "scenarios.jsonl");
const runSchema = path.join(directory, "run-record.schema.json");
const scenarioSchema = path.join(directory, "scenario.schema.json");
validateSchema(runSchema, requiredRun);
validateSchema(scenarioSchema, requiredScenario);
const scenarioCount = validateScenarios(scenarioFile);
for (const argument of process.argv.slice(2)) validateRun(path.resolve(argument));

process.stdout.write(`Structural validation passed: 2 schemas, ${scenarioCount} scenarios, ${process.argv.length - 2} run record(s). No behavioral or model evaluation was executed.\n`);
