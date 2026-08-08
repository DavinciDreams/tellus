import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Leaf, PawPrint, RefreshCw, Sprout, X } from "lucide-react";
import { Badge, Button, IconButton, Panel } from "./design-system";
import {
  normalizeWildlifePopulationPolicy,
  summarizeWildlifePopulations,
} from "./tellus-nature";
import type { TellusWorldApi, WildlifeUiAnimal } from "./tellus-types";
import "./nature-panel.css";

interface NaturePanelProps {
  getWorldApi: () => TellusWorldApi | null;
  onBrowseFauna: () => void;
  onBrowseFlora: () => void;
  onClose: () => void;
}

export function NaturePanel({ getWorldApi, onBrowseFauna, onBrowseFlora, onClose }: NaturePanelProps) {
  const [animals, setAnimals] = useState<WildlifeUiAnimal[]>([]);
  const [unmanagedDeerCount, setUnmanagedDeerCount] = useState(0);
  const [count, setCount] = useState(6);
  const [radiusMeters, setRadiusMeters] = useState(48);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(() => {
    const api = getWorldApi();
    setAnimals(api?.getWildlife() ?? []);
    setUnmanagedDeerCount(api?.getUnmanagedDeerCount() ?? 0);
  }, [getWorldApi]);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 2_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const populations = useMemo(() => summarizeWildlifePopulations(animals), [animals]);
  const enabledCount = animals.filter((animal) => animal.enabled).length;

  const populate = useCallback(() => {
    const api = getWorldApi();
    if (!api) {
      setError("The world is still loading. Try again in a moment.");
      return;
    }
    const policy = normalizeWildlifePopulationPolicy(count, radiusMeters);
    setCount(policy.count);
    setRadiusMeters(policy.radiusMeters);
    setBusy("populate");
    setError(null);
    setNotice(null);
    const result = api.populateDeerHerd(policy);
    if (!result.ok) {
      setError(result.error);
    } else {
      setNotice(result.adopted > 0
        ? `${result.adopted} placed deer adopted${result.created > 0 ? ` and ${result.created} added` : ""} as managed wildlife.`
        : `${result.created} deer added as managed wildlife near you.`);
      window.setTimeout(refresh, 250);
    }
    setBusy(null);
  }, [count, getWorldApi, radiusMeters, refresh]);

  const setPopulationEnabled = useCallback((populationAnimals: WildlifeUiAnimal[], enabled: boolean) => {
    const api = getWorldApi();
    if (!api) {
      setError("The world is still loading. Try again in a moment.");
      return;
    }
    const herdId = populationAnimals[0]?.herdId ?? populationAnimals[0]?.animalId ?? "population";
    setBusy(herdId);
    setError(null);
    setNotice(null);
    for (const animal of populationAnimals) {
      const result = api.configureWildlife(animal.animalId, { enabled });
      if (!result.ok) {
        setError(result.error);
        setBusy(null);
        return;
      }
    }
    setAnimals((current) => current.map((animal) =>
      populationAnimals.some((member) => member.animalId === animal.animalId)
        ? { ...animal, enabled }
        : animal));
    setNotice(`${enabled ? "Resumed" : "Paused"} ${populationAnimals.length} managed animal${populationAnimals.length === 1 ? "" : "s"}.`);
    setBusy(null);
  }, [getWorldApi]);

  return (
    <aside className="ds-scope tool-panel nature-tool-panel" aria-labelledby="nature-panel-title">
      <Panel
        className="nature-panel"
        level="raised"
        glass
        padded={false}
        header={(
          <span className="nature-panel__heading">
            <Leaf size={18} aria-hidden="true" />
            <span><strong id="nature-panel-title">Nature</strong><small>Living world</small></span>
          </span>
        )}
        headerActions={<IconButton aria-label="Close Nature" icon={<X size={16} />} size="sm" onClick={onClose} />}
      >
        <div className="nature-panel__body">
          <section className="nature-panel__overview" aria-label="Nature overview">
            <a
              className="nature-panel__ecology"
              href="/biome-mixer.html"
              target="_blank"
              rel="noreferrer"
              aria-label="Open Biome Mixer for world ecology"
            >
              <Sprout size={16} aria-hidden="true" />
              <span><small>Biome mixer</small><strong>World ecology</strong></span>
              <ExternalLink className="nature-panel__external" size={13} aria-hidden="true" />
            </a>
            <div><PawPrint size={16} aria-hidden="true" /><span><small>Wildlife</small><strong>{enabledCount > 0 ? `${enabledCount} active` : unmanagedDeerCount > 0 ? `${unmanagedDeerCount} ready` : "0 active"}</strong></span></div>
          </section>

          <section className="nature-panel__section" aria-labelledby="nature-wildlife-title">
            <header>
              <span>
                <strong id="nature-wildlife-title">Managed wildlife</strong>
                <small>Species and population policy</small>
              </span>
              <Button size="sm" variant="ghost" leadingIcon={<RefreshCw size={13} />} onClick={refresh}>Refresh</Button>
            </header>

            <form className="nature-panel__policy" onSubmit={(event) => { event.preventDefault(); populate(); }}>
              <label>
                <span>Deer population <output>{count}</output></span>
                <input type="range" min={1} max={12} step={1} value={count} onChange={(event) => setCount(Number(event.target.value))} />
              </label>
              <label>
                <span>Home range <output>{radiusMeters} m</output></span>
                <input type="range" min={8} max={200} step={4} value={radiusMeters} onChange={(event) => setRadiusMeters(Number(event.target.value))} />
              </label>
              <Button type="submit" variant="primary" loading={busy === "populate"} leadingIcon={<PawPrint size={14} />}>
                {unmanagedDeerCount > 0 ? `Manage ${Math.min(count, unmanagedDeerCount)} placed deer` : "Add deer near me"}
              </Button>
              <small>Tellus places wildlife-ready fauna and registers it with the world’s authoritative herd system.</small>
            </form>

            <div className="nature-panel__populations" aria-live="polite">
              {populations.length === 0 ? (
                <p className="nature-panel__empty">{unmanagedDeerCount > 0
                  ? `${unmanagedDeerCount} placed deer ${unmanagedDeerCount === 1 ? "is" : "are"} ready to join a managed population without creating duplicates.`
                  : "No managed wildlife yet. Fauna assets remain ordinary placed objects until you add them as a population."}</p>
              ) : populations.map((population) => {
                const active = population.enabled > 0;
                return (
                  <article key={population.herdId} className="nature-population">
                    <div className="nature-population__title">
                      <span><strong>{population.speciesProfileId}</strong><small>{population.herdId}</small></span>
                      <Badge tone={active ? "success" : "neutral"}>{population.enabled}/{population.total} active</Badge>
                    </div>
                    <p>{population.movementMode} movement{population.states.length > 0 ? ` · ${population.states.join(", ")}` : " · awaiting state"}</p>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busy === population.herdId}
                      onClick={() => setPopulationEnabled(population.animals, !active)}
                    >
                      {active ? "Pause population" : "Resume population"}
                    </Button>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="nature-panel__library" aria-label="Nature asset library">
            <Button variant="secondary" leadingIcon={<PawPrint size={14} />} onClick={onBrowseFauna}>Browse fauna assets</Button>
            <Button variant="secondary" leadingIcon={<Sprout size={14} />} onClick={onBrowseFlora}>Browse flora assets</Button>
            <small>Assets are reusable content. Managed wildlife is world behavior.</small>
          </section>

          {error && <p className="nature-panel__message nature-panel__message--error" role="alert">{error}</p>}
          {notice && <p className="nature-panel__message" role="status">{notice}</p>}
        </div>
      </Panel>
    </aside>
  );
}
