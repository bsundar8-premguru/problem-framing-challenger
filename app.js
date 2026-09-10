(function () {
  "use strict";

  const config = window.PROBLEM_FRAMING_CONFIG || {};
  const form = document.querySelector("#challengeForm");
  const problem = document.querySelector("#problem");
  const stakeholders = document.querySelector("#stakeholders");
  const context = document.querySelector("#context");
  const inputPanel = document.querySelector("#inputPanel");
  const resultsPanel = document.querySelector("#resultsPanel");
  const analyzeButton = document.querySelector("#analyzeButton");
  const exampleButton = document.querySelector("#exampleButton");
  const toast = document.querySelector("#toast");
  const themeToggle = document.querySelector("#themeToggle");
  const themeMedia = window.matchMedia("(prefers-color-scheme: dark)");
  let latestResult = null;
  let themeWasChosen = false;

  const lensNames = {
    solution_bias: "Solution lock-in",
    assumptions: "Assumptions",
    stakeholders: "Missing voices",
    success: "Success definition"
  };

  setTheme(themeMedia.matches ? "dark" : "light");
  themeToggle.addEventListener("click", () => {
    themeWasChosen = true;
    const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
  });
  themeMedia.addEventListener?.("change", (event) => {
    if (!themeWasChosen) setTheme(event.matches ? "dark" : "light");
  });

  function setTheme(theme) {
    const isDark = theme === "dark";
    document.documentElement.dataset.theme = theme;
    themeToggle.setAttribute("aria-pressed", String(isDark));
    themeToggle.setAttribute("aria-label", `Switch to ${isDark ? "light" : "dark"} mode`);
    themeToggle.querySelector(".theme-icon").textContent = isDark ? "☀" : "☾";
    themeToggle.querySelector(".theme-label").textContent = isDark ? "Light" : "Dark";
  }

  problem.addEventListener("input", () => {
    document.querySelector("#problemCount").textContent = `${problem.value.length.toLocaleString()} / 1,200`;
    if (problem.value.trim()) document.querySelector("#problemError").textContent = "";
  });

  exampleButton.addEventListener("click", () => {
    problem.value = "Students need an app that reminds them to drink more water during the school day.";
    stakeholders.value = "Students, teachers, school staff, and families.";
    context.value = "Some students say they forget to bring water bottles. We have not yet observed when or why this happens.";
    problem.dispatchEvent(new Event("input"));
    problem.focus();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      problem: problem.value.trim(),
      stakeholders: stakeholders.value.trim(),
      context: context.value.trim()
    };

    if (payload.problem.length < 20) {
      document.querySelector("#problemError").textContent = "Add a little more detail—at least 20 characters helps the challenger respond usefully.";
      problem.focus();
      return;
    }

    setLoading(true);
    try {
      latestResult = config.workerUrl ? await callWorker(payload) : demoChallenge(payload);
      renderResults(latestResult);
    } catch (error) {
      showToast(error.message || "The challenge could not be completed. Please try again.", 4500);
    } finally {
      setLoading(false);
    }
  });

  async function callWorker(payload) {
    const response = await fetch(config.workerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || "The challenger is temporarily unavailable.");
    return data.data;
  }

  function setLoading(isLoading) {
    analyzeButton.disabled = isLoading;
    analyzeButton.querySelector("span:first-child").textContent = isLoading ? "Examining the frame…" : "Challenge this frame";
  }

  function renderResults(result) {
    document.querySelector("#overview").textContent = result.overview;
    document.querySelector("#lensGrid").innerHTML = result.lenses.map((lens) => `
      <article class="lens-card">
        <div class="lens-card-top">
          <h3>${escapeHtml(lensNames[lens.id] || lens.id)}</h3>
          <span class="status ${escapeHtml(lens.status)}">${statusLabel(lens.status)}</span>
        </div>
        <p>${escapeHtml(lens.finding)}</p>
        ${lens.evidence ? `<span class="lens-evidence">Signal noticed: “${escapeHtml(lens.evidence)}”</span>` : ""}
      </article>`).join("");

    document.querySelector("#questionList").innerHTML = result.questions.map((item, index) => `
      <article class="question-card">
        <span class="question-number">${String(index + 1).padStart(2, "0")}</span>
        <div>
          <span class="question-lens">${escapeHtml(lensNames[item.lens] || item.lens)}</span>
          <h3>${escapeHtml(item.question)}</h3>
          <p>${escapeHtml(item.whyItMatters)}</p>
        </div>
        <button class="pin-question" type="button" aria-pressed="true" aria-label="Include question ${index + 1} when copying">✓</button>
      </article>`).join("");
    document.querySelector("#closingPrompt").textContent = result.closingPrompt;

    document.querySelectorAll(".pin-question").forEach((button) => {
      button.addEventListener("click", () => {
        const selected = button.getAttribute("aria-pressed") !== "true";
        button.setAttribute("aria-pressed", String(selected));
        button.textContent = selected ? "✓" : "+";
      });
    });

    inputPanel.hidden = true;
    resultsPanel.hidden = false;
    setStep(2);
    resultsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function demoChallenge(payload) {
    const text = payload.problem;
    const lower = text.toLowerCase();
    const solutionWords = ["app", "device", "sensor", "website", "system", "robot", "platform", "build", "design a", "create a"];
    const assumptionWords = ["need", "must", "always", "never", "should", "probably", "obviously", "everyone", "no one"];
    const solutionHit = solutionWords.find((word) => lower.includes(word));
    const assumptionHit = assumptionWords.find((word) => lower.includes(word));
    const hasStakeholders = payload.stakeholders.length > 15;
    const hasSuccess = /measure|reduce|increase|improve|within|percent|time|frequency|rate/.test(lower + " " + payload.context.toLowerCase());

    const lenses = [
      {
        id: "solution_bias",
        status: solutionHit ? "needs_attention" : "consider",
        finding: solutionHit ? "The statement names a particular solution. The team may be narrowing the design space before agreeing on the underlying need." : "The statement leaves room for more than one solution, but the underlying need could still be described more precisely.",
        evidence: solutionHit || ""
      },
      {
        id: "assumptions",
        status: assumptionHit ? "needs_attention" : "consider",
        finding: assumptionHit ? "At least one claim is presented as settled. Ask what observation or evidence supports it—and what might disprove it." : "The statement does not make its key assumptions explicit. Naming them would help the team decide what to investigate first.",
        evidence: assumptionHit || ""
      },
      {
        id: "stakeholders",
        status: hasStakeholders ? "clear" : "needs_attention",
        finding: hasStakeholders ? "The team has named affected people. Consider whether operators, maintainers, non-users, or indirectly affected groups are still missing." : "The people who experience or are affected by the problem are not yet visible in the frame.",
        evidence: hasStakeholders ? payload.stakeholders.slice(0, 80) : ""
      },
      {
        id: "success",
        status: hasSuccess ? "clear" : "needs_attention",
        finding: hasSuccess ? "The context includes language that may support a measurable definition of improvement. The team should verify that the measure reflects stakeholder value." : "The statement does not yet show what meaningful improvement would look like or how the team would recognize it.",
        evidence: ""
      }
    ];

    const questions = [
      solutionHit ? {
        id: "q1", lens: "solution_bias",
        question: `If “${solutionHit}” were unavailable, how would your team describe the need?`,
        whyItMatters: "Separating the need from a preferred solution keeps alternative concepts available."
      } : {
        id: "q1", lens: "solution_bias",
        question: "Which words in your statement describe the problem, and which quietly imply a solution?",
        whyItMatters: "The distinction helps your team preserve a wider design space."
      },
      {
        id: "q2", lens: "assumptions",
        question: "What is your team currently treating as true that you have not directly observed or verified?",
        whyItMatters: "An untested assumption can steer the entire project toward the wrong problem."
      },
      {
        id: "q3", lens: "stakeholders",
        question: "Who experiences the problem differently from the people your team has already considered?",
        whyItMatters: "Non-users, maintainers, and indirectly affected groups often reveal missing needs or constraints."
      },
      {
        id: "q4", lens: "success",
        question: "What observable change would convince a skeptical stakeholder that this problem had meaningfully improved?",
        whyItMatters: "A shared picture of success helps the team investigate the right evidence without prescribing a solution."
      },
      {
        id: "q5", lens: "assumptions",
        question: "What evidence could cause your team to reframe or abandon this problem statement?",
        whyItMatters: "A frame becomes stronger when the team knows what would challenge it."
      }
    ];

    return {
      overview: "Your statement gives the team a useful starting point, but several boundaries and claims deserve discussion before the design space narrows.",
      lenses,
      questions,
      closingPrompt: "Which question, if answered with evidence, would most change how your team understands the problem?"
    };
  }

  document.querySelector("#editButton").addEventListener("click", returnToInput);
  document.querySelector("#reviseButton").addEventListener("click", () => {
    returnToInput();
    problem.focus();
  });

  function returnToInput() {
    resultsPanel.hidden = true;
    inputPanel.hidden = false;
    setStep(1);
    inputPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  document.querySelector("#copyButton").addEventListener("click", async () => {
    if (!latestResult) return;
    const selectedButtons = [...document.querySelectorAll(".pin-question")];
    const selected = latestResult.questions.filter((_, index) => selectedButtons[index].getAttribute("aria-pressed") === "true");
    if (!selected.length) return showToast("Select at least one question to copy.");
    const copyText = ["Problem Framing Challenger — team questions", "", ...selected.map((item, index) => `${index + 1}. ${item.question}`), "", `Before revising: ${latestResult.closingPrompt}`].join("\n");
    try {
      await navigator.clipboard.writeText(copyText);
      setStep(2);
      showToast(`${selected.length} team question${selected.length === 1 ? "" : "s"} copied.`);
    } catch (_) {
      showToast("Copy was blocked by the browser. Use Print instead.");
    }
  });

  document.querySelector("#printButton").addEventListener("click", () => {
    setStep(2);
    showToast("Opening the print dialog…");
    window.setTimeout(() => window.print(), 180);
  });

  const dialog = document.querySelector("#aboutDialog");
  document.querySelector("#aboutButton").addEventListener("click", () => dialog.showModal());
  document.querySelector("#closeDialog").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });

  function setStep(number) {
    document.querySelectorAll(".step").forEach((step) => {
      step.classList.toggle("active", Number(step.dataset.step) <= number);
    });
  }

  function showToast(message, duration = 2600) {
    toast.textContent = message;
    toast.classList.add("show");
    window.setTimeout(() => toast.classList.remove("show"), duration);
  }

  function statusLabel(status) {
    return ({ needs_attention: "Needs attention", consider: "Consider", clear: "Visible" })[status] || "Consider";
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  }
})();
