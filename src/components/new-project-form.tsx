"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { discoverMarketAction } from "../app/projects/discover";
import { createProject } from "../app/projects/actions";
import { SubmitButton } from "./submit-button";

export default function NewProjectForm() {
  const [ownName, setOwnName] = useState("");
  const [ownDomain, setOwnDomain] = useState("");
  const [models, setModels] = useState(
    "nvidia/nemotron-3-ultra-550b-a55b:free",
  );
  const [competitors, setCompetitors] = useState("");
  const [prompts, setPrompts] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [finding, startFinding] = useTransition();

  function find() {
    setNote(null);
    setProblem(null);
    startFinding(async () => {
      const res = await discoverMarketAction({
        brandName: ownName,
        website: ownDomain,
        model: models.split(/\r?\n/)[0] ?? "",
      });
      if (!res.ok) {
        setProblem(res.error);
        return;
      }
      setCompetitors(
        res.competitors
          .map((c) => (c.domain ? `${c.name}, ${c.domain}` : c.name))
          .join("\n"),
      );
      setPrompts(res.prompts.join("\n"));
      setNote(
        `Found ${res.competitors.length} competitors in ${res.category}. Check them below, edit anything that is wrong, then create the project.`,
      );
    });
  }

  return (
    <form action={createProject} className="form">
      <div className="field-row">
        <div className="field">
          <label htmlFor="ownName">Your brand</label>
          <input
            id="ownName"
            name="ownName"
            required
            placeholder="Linear"
            value={ownName}
            onChange={(e) => setOwnName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="ownDomain">Your website</label>
          <input
            id="ownDomain"
            name="ownDomain"
            placeholder="linear.app"
            value={ownDomain}
            onChange={(e) => setOwnDomain(e.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="models">Models</label>
        <textarea
          id="models"
          name="models"
          rows={2}
          required
          value={models}
          onChange={(e) => setModels(e.target.value)}
        />
        <p className="hint">
          One OpenRouter model id per line. Add :online to an id to turn on live
          web search. That costs about $0.007 per run, and it makes the
          competitor list more accurate.
        </p>
      </div>

      <div className="field">
        <button
          type="button"
          className="btn btn-primary"
          onClick={find}
          disabled={finding || !ownName.trim()}
        >
          {finding ? "Finding competitors..." : "Find competitors and prompts"}
        </button>
        <p className="hint">
          Reads your website and finds the five closest competitors and
          questions customers ask. You can edit the results, or skip this and
          type your own.
        </p>
      </div>

      {note && (
        <p className="notice" role="status">
          {note}
        </p>
      )}
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}

      <div className="field">
        <label htmlFor="competitors">Competitors</label>
        <textarea
          id="competitors"
          name="competitors"
          rows={5}
          placeholder={"Asana, asana.com\nTrello, trello.com"}
          value={competitors}
          onChange={(e) => setCompetitors(e.target.value)}
        />
        <p className="hint">
          One per line, as Name, website. Models can guess wrong, so check these
          before you create the project.
        </p>
      </div>

      <div className="field">
        <label htmlFor="prompts">Prompts</label>
        <textarea
          id="prompts"
          name="prompts"
          rows={7}
          placeholder="What is the best project management tool for a startup?"
          value={prompts}
          onChange={(e) => setPrompts(e.target.value)}
        />
        <p className="hint">
          One per line, written the way a customer would ask an AI assistant.
          Prompts that name a brand are left out of that brand&apos;s score.
        </p>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="repeats">Repeats per prompt</label>
          <input
            id="repeats"
            name="repeats"
            type="number"
            min={1}
            max={10}
            defaultValue={3}
          />
        </div>
        <div className="field">
          <label htmlFor="name">Project name (optional)</label>
          <input
            id="name"
            name="name"
            placeholder="Defaults to the brand name"
          />
        </div>
      </div>
      <p className="hint">Runs per batch = prompts x models x repeats.</p>

      <div className="form-actions">
        <SubmitButton pendingText="Creating...">Create project</SubmitButton>
        <Link href="/" className="btn">
          Cancel
        </Link>
      </div>
    </form>
  );
}
